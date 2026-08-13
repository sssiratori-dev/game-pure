// ===== 生産演算 =====
// 出典: docs/ゲームシステム/生産.docx
// 生産は人・施設・自然が起点。自然サイクルも含む。

import type { Cell, Terrain } from '../core/cell';
import { calcPhi, applyDeltaS } from '../core/formulas';

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

export function runProduction(cell: Cell): void {
  const phi = calcPhi(cell);
  const humanBonus = humanProductionBonus(cell);

  // 自然生産（自然サイクル）
  const naturalFood  = NATURAL_FOOD_BY_TERRAIN[cell.terrain]  * phi;
  const naturalWater = NATURAL_WATER_BY_TERRAIN[cell.terrain] * phi;
  const naturalWood  = NATURAL_WOOD_BY_TERRAIN[cell.terrain]  * phi;

  // 人口による追加生産
  const humanFood  = cell.population * 0.3 * humanBonus * phi;
  const humanTools = cell.population * 0.01 * phi;

  cell.stocks.food  = applyDeltaS(cell.stocks.food,  naturalFood + humanFood,  1);
  cell.stocks.water = applyDeltaS(cell.stocks.water, naturalWater,             1);
  cell.stocks.wood  = applyDeltaS(cell.stocks.wood,  naturalWood,              1);
  cell.stocks.tools = applyDeltaS(cell.stocks.tools, humanTools,               1);

  // 文化ストック蓄積（人口・文明レベルに応じて）
  const cultureGain = cell.population * 0.01 * cell.culture.civilizationLevel * phi;
  cell.culture.cultureStock += cultureGain;
}
