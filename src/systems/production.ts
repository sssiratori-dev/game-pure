// ===== 生産演算 =====
// 出典: docs/ゲームシステム/生産.docx
// 生産は人・施設・自然が起点。自然サイクルも含む。

import type { Cell, Terrain } from '../core/cell';
import { getEffectivePopulationCap, getTotalBuildingLevel } from '../core/cell';
import { calcPhi, applyDeltaS } from '../core/formulas';
import type { FormulaAdjustments } from '../core/formulas';

// 地形ごとの自然生産量（自然サイクル）
// 出典: docs/ゲームシステム/生産.docx「自然のサイクルでの生産も行う」
const NATURAL_FOOD_BY_TERRAIN: Record<Terrain, number> = {
  flat:   20,
  river:  35, // 河川: 漁・農業に優れる
  swamp:  10,
  cliff:   2,
  forest: 25, // 森林: 狩猟・採取
};

const NATURAL_WOOD_BY_TERRAIN: Record<Terrain, number> = {
  flat:    5,
  river:   5,
  swamp:   8,
  cliff:   2,
  forest: 40,
};

const NATURAL_WATER_BY_TERRAIN: Record<Terrain, number> = {
  flat:    5,
  river:  60,
  swamp:  20,
  cliff:   2,
  forest: 10,
};

// 人口による生産補正（人が起点の生産活動）
function humanProductionBonus(cell: Cell): number {
  // 人口が多いほど生産量増加（対数スケール）
  return 1 + Math.log10(Math.max(1, cell.population)) * 0.3;
}

export interface ProductionAdjustments extends FormulaAdjustments {
  naturalFoodRate: number;
  naturalWaterRate: number;
  naturalWoodRate: number;
  humanFoodRate: number;
  humanToolRate: number;
}

export interface ProductionEstimate {
  phi: number;
  foodActivation: number;
  productionScale: number;
  naturalFood: number;
  naturalWater: number;
  naturalWood: number;
  humanFood: number;
  humanTools: number;
  foodSpoilage: number;
  waterLeak: number;
  toolWear: number;
  cultureGain: number;
}

function resolveProductionAdjustments(adjustments?: Partial<ProductionAdjustments>): ProductionAdjustments {
  return {
    phiLanguageWeight: adjustments?.phiLanguageWeight ?? 1,
    phiTerrainWeight: adjustments?.phiTerrainWeight ?? 1,
    phiCivilizationWeight: adjustments?.phiCivilizationWeight ?? 1,
    naturalFoodRate: adjustments?.naturalFoodRate ?? 1,
    naturalWaterRate: adjustments?.naturalWaterRate ?? 1,
    naturalWoodRate: adjustments?.naturalWoodRate ?? 1,
    humanFoodRate: adjustments?.humanFoodRate ?? 1,
    humanToolRate: adjustments?.humanToolRate ?? 1,
  };
}

export function estimateProduction(cell: Cell, adjustments?: Partial<ProductionAdjustments>): ProductionEstimate {
  const tuned = resolveProductionAdjustments(adjustments);
  const phi = calcPhi(cell, tuned);
  const humanBonus = humanProductionBonus(cell);
  const productionScale = 1 + cell.productionBonus + cell.economicBonus * 0.3;
  const capPressure = cell.population / Math.max(1, getEffectivePopulationCap(cell));
  const foodFacilityLevel = (cell.buildings.production * 1.2) + (cell.buildings.residential * 0.6) + (cell.buildings.market * 0.5);
  const foodActivation = Math.min(1.8, foodFacilityLevel * 0.35);
  const facilityScale = 0.55 + Math.min(1.5, getTotalBuildingLevel(cell) * 0.08);

  // 自然生産（自然サイクル）
  const naturalFood  = NATURAL_FOOD_BY_TERRAIN[cell.terrain]  * phi * foodActivation * tuned.naturalFoodRate;
  const naturalWater = NATURAL_WATER_BY_TERRAIN[cell.terrain] * phi * (0.78 + cell.logisticsBonus * 0.12 + facilityScale * 0.08) * tuned.naturalWaterRate;
  const naturalWood  = NATURAL_WOOD_BY_TERRAIN[cell.terrain]  * phi * (0.7 + cell.productionBonus * 0.35 + facilityScale * 0.08) * tuned.naturalWoodRate;

  // 人口による追加生産
  const humanFood  = cell.population * 0.12 * humanBonus * phi * productionScale * foodActivation * tuned.humanFoodRate;
  const humanTools = cell.population * 0.008 * phi * (0.85 + cell.productionBonus * 0.7 + cell.economicBonus * 0.25) * tuned.humanToolRate;

  // 貯蔵ロス: 備蓄が多いほど損耗し、偏った増加を抑える
  const foodSpoilage = cell.stocks.food * (0.012 + Math.max(0, capPressure - 0.75) * 0.02);
  const waterLeak = cell.stocks.water * (0.009 + Math.max(0, capPressure - 0.75) * 0.015);
  const toolWear = Math.max(0, cell.population * 0.0015 - cell.stocks.wood * 0.0004 - cell.economicBonus * 0.25);

  // 文化ストック蓄積（人口・文明レベルに応じて）
  const cultureGain = cell.population * 0.01 * cell.culture.civilizationLevel * phi;

  return {
    phi,
    foodActivation,
    productionScale,
    naturalFood,
    naturalWater,
    naturalWood,
    humanFood,
    humanTools,
    foodSpoilage,
    waterLeak,
    toolWear,
    cultureGain,
  };
}

export function runProduction(cell: Cell, adjustments?: Partial<ProductionAdjustments>): void {
  const estimate = estimateProduction(cell, adjustments);
  cell.stocks.food  = applyDeltaS(cell.stocks.food, estimate.naturalFood + estimate.humanFood, 1);
  cell.stocks.water = applyDeltaS(cell.stocks.water, estimate.naturalWater, 1);
  cell.stocks.wood  = applyDeltaS(cell.stocks.wood, estimate.naturalWood, 1);
  cell.stocks.tools = applyDeltaS(cell.stocks.tools, estimate.humanTools, 1);
  cell.stocks.food = applyDeltaS(cell.stocks.food, -estimate.foodSpoilage, 1);
  cell.stocks.water = applyDeltaS(cell.stocks.water, -estimate.waterLeak, 1);
  cell.stocks.tools = applyDeltaS(cell.stocks.tools, -estimate.toolWear, 1);
  cell.culture.cultureStock += estimate.cultureGain;
}
