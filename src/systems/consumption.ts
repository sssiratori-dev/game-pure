// ===== 消費演算 =====
// 出典: docs/ゲームシステム/消費.docx
// 消費は人起点。基本速度 × 摩擦係数でストック増減。

import type { Cell } from '../core/cell';
import { getEffectivePopulationCap, getOccupiedBuildingSlots } from '../core/cell';
import { calcPhi, applyDeltaS } from '../core/formulas';
import type { FormulaAdjustments } from '../core/formulas';

// 人口密度による消費摩擦
function densityFriction(cell: Cell): number {
  const density = cell.population / getEffectivePopulationCap(cell);
  // 密度が高いほど摩擦増加（0.8 ～ 1.5）
  return 0.8 + density * 0.7;
}

// 1ターンあたりの基本消費量（人1人当たり）
const BASE_FOOD_PER_PERSON  = 0.5;
const BASE_WATER_PER_PERSON = 0.4;
const BASE_WOOD_PER_PERSON  = 0.2;

export interface ConsumptionAdjustments extends FormulaAdjustments {
  baseFoodPerPerson: number;
  baseWaterPerPerson: number;
  baseWoodPerPerson: number;
}

export interface ConsumptionEstimate {
  phi: number;
  friction: number;
  infraEfficiency: number;
  demandScale: number;
  deltaFood: number;
  deltaWater: number;
  deltaWood: number;
}

function resolveConsumptionAdjustments(adjustments?: Partial<ConsumptionAdjustments>): ConsumptionAdjustments {
  return {
    phiLanguageWeight: adjustments?.phiLanguageWeight ?? 1,
    phiTerrainWeight: adjustments?.phiTerrainWeight ?? 1,
    phiCivilizationWeight: adjustments?.phiCivilizationWeight ?? 1,
    baseFoodPerPerson: adjustments?.baseFoodPerPerson ?? 1,
    baseWaterPerPerson: adjustments?.baseWaterPerPerson ?? 1,
    baseWoodPerPerson: adjustments?.baseWoodPerPerson ?? 1,
  };
}

export function estimateConsumption(cell: Cell, adjustments?: Partial<ConsumptionAdjustments>): ConsumptionEstimate {
  const tuned = resolveConsumptionAdjustments(adjustments);
  const phi = calcPhi(cell, tuned);
  const friction = densityFriction(cell);
  const n = cell.population;
  const infraEfficiency = 1 - Math.min(0.3, cell.buildingBonus * 0.18 + cell.productionBonus * 0.2 + cell.logisticsBonus * 0.06);
  const shortagePressure = cell.dissatisfaction * 0.25;
  const demandScale = 1 + shortagePressure;

  // ΔS = -(base × n × friction × Φ) 消費なので負
  const deltaFood  = -(BASE_FOOD_PER_PERSON * tuned.baseFoodPerPerson * n * friction * phi * infraEfficiency * demandScale);
  const deltaWater = -(BASE_WATER_PER_PERSON * tuned.baseWaterPerPerson * n * friction * phi * infraEfficiency * demandScale);
  const deltaWood  = -(BASE_WOOD_PER_PERSON * tuned.baseWoodPerPerson * n * friction * phi * (0.82 + cell.buildingLevel * 0.05 - cell.economicBonus * 0.04));

  return { phi, friction, infraEfficiency, demandScale, deltaFood, deltaWater, deltaWood };
}

export function runConsumption(cell: Cell, adjustments?: Partial<ConsumptionAdjustments>): void {
  const estimate = estimateConsumption(cell, adjustments);

  cell.stocks.food  = applyDeltaS(cell.stocks.food, estimate.deltaFood, 1);
  cell.stocks.water = applyDeltaS(cell.stocks.water, estimate.deltaWater, 1);
  cell.stocks.wood  = applyDeltaS(cell.stocks.wood, estimate.deltaWood, 1);

  if (getOccupiedBuildingSlots(cell) === 0) {
    const collapse = Math.max(1, Math.floor(cell.population * 0.1));
    cell.population = Math.max(0, Math.min(20, cell.population - collapse));
    cell.dissatisfaction = Math.min(1, cell.dissatisfaction + 0.03);
  }

  // 食料・水不足 → 不満度増加
  // 出典: docs/ゲームシステム/謀反・離反（都市の独立）アルゴリズム.docx
  const shortage = (
    (cell.stocks.food  < 50 ? 1 : 0) +
    (cell.stocks.water < 30 ? 1 : 0)
  );
  cell.dissatisfaction = Math.min(1, cell.dissatisfaction + shortage * 0.05);

  const effectiveCap = getEffectivePopulationCap(cell);
  const pressure = cell.population / Math.max(1, effectiveCap);
  if (shortage > 0) {
    const decline = Math.max(1, Math.floor(cell.population * (0.007 + shortage * 0.006)));
    cell.population = Math.max(0, cell.population - decline);
  } else if (pressure < 0.96 && cell.stocks.food > 120 && cell.stocks.water > 70) {
    const growthBase = 0.003 + cell.productionBonus * 0.012 + cell.populationCapacityBonus / 90000 + cell.economicBonus * 0.002;
    const growth = Math.floor(cell.population * growthBase * (1 - pressure));
    cell.population = Math.min(effectiveCap, cell.population + Math.max(0, growth));
  }
}
