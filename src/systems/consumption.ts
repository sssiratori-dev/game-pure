// ===== 消費演算 =====
// 出典: docs/ゲームシステム/消費.docx
// 消費は人起点。基本速度 × 摩擦係数でストック増減。

import type { Cell } from '../core/cell';
import { POPULATION_CAP } from '../core/cell';
import { calcPhi, applyDeltaS } from '../core/formulas';

// 人口密度による消費摩擦
function densityFriction(cell: Cell): number {
  const density = cell.population / POPULATION_CAP;
  // 密度が高いほど摩擦増加（0.8 ～ 1.5）
  return 0.8 + density * 0.7;
}

// 1ターンあたりの基本消費量（人1人当たり）
const BASE_FOOD_PER_PERSON  = 0.5;
const BASE_WATER_PER_PERSON = 0.4;
const BASE_WOOD_PER_PERSON  = 0.2;

export function runConsumption(cell: Cell): void {
  const phi = calcPhi(cell);
  const friction = densityFriction(cell);
  const n = cell.population;

  // ΔS = -(base × n × friction × Φ) 消費なので負
  const deltaFood  = -(BASE_FOOD_PER_PERSON  * n * friction * phi);
  const deltaWater = -(BASE_WATER_PER_PERSON * n * friction * phi);
  const deltaWood  = -(BASE_WOOD_PER_PERSON  * n * friction * phi);

  cell.stocks.food  = applyDeltaS(cell.stocks.food,  deltaFood,  1);
  cell.stocks.water = applyDeltaS(cell.stocks.water, deltaWater, 1);
  cell.stocks.wood  = applyDeltaS(cell.stocks.wood,  deltaWood,  1);

  // 食料・水不足 → 不満度増加
  // 出典: docs/ゲームシステム/謀反・離反（都市の独立）アルゴリズム.docx
  const shortage = (
    (cell.stocks.food  < 50 ? 1 : 0) +
    (cell.stocks.water < 30 ? 1 : 0)
  );
  cell.dissatisfaction = Math.min(1, cell.dissatisfaction + shortage * 0.05);
}
