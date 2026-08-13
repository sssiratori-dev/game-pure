// ===== 移動演算 =====
// 出典: docs/ゲームシステム/移動.docx
// 人口の移動：収容超過時に最も住みやすい隣接セルへ流出
// 出典: docs/ゲームシステム/座標セル.docx「収容限界を超えると隣接する最も住みやすいセルへ流出」

import type { Cell } from '../core/cell';
import { POPULATION_CAP } from '../core/cell';
import { World } from '../core/world';

// セルの「住みやすさスコア」（低いほど住みやすい）
function habitabilityScore(cell: Cell): number {
  const popPressure = cell.population / POPULATION_CAP;
  const terrainPenalty = cell.R_geo - cell.buildingBonus;
  const stockScore = -(cell.stocks.food / 500 + cell.stocks.water / 300) * 0.1;
  return popPressure + terrainPenalty + stockScore;
}

export function runMovement(world: World): void {
  // 人口超過セルを収集
  const overflowCells = world.allCells().filter(c => c.population > POPULATION_CAP);

  for (const cell of overflowCells) {
    const excess = cell.population - POPULATION_CAP;
    if (excess <= 0) continue;

    const neighbors = world.getNeighbors(cell.x, cell.y)
      .filter(n => n.population < POPULATION_CAP);

    if (neighbors.length === 0) continue;

    // 最も住みやすい（スコアが最小）隣接セルへ流出
    neighbors.sort((a, b) => habitabilityScore(a) - habitabilityScore(b));
    const target = neighbors[0];

    const moving = Math.min(excess, Math.floor(excess * 0.5) + 1);
    cell.population  -= moving;
    target.population += moving;

    // 物資の一部も移動に伴い持参（移動コスト差し引き）
    // 出典: docs/ゲームシステム/移動.docx「重量・容積により速度と消費エネルギーが変わる」
    const carryRate = 0.1; // 10%の所持品を持参
    const moveFraction = moving / (cell.population + moving);
    const moved = Math.min(moveFraction * carryRate, 0.05);

    target.stocks.food  += cell.stocks.food  * moved;
    cell.stocks.food    *= (1 - moved);
    target.stocks.tools += cell.stocks.tools * moved;
    cell.stocks.tools   *= (1 - moved);
  }

  // 物流（ストック移動）: 隣接セルとの均衡化（簡略版）
  runTradeEqualization(world);
}

// 隣接セル間の食料・水の自然均衡（取引・流通）
// 出典: docs/ゲームシステム/移動.docx「物流（取引や単なる運搬）」
function runTradeEqualization(world: World): void {
  const EQUALIZATION_RATE = 0.02; // 2%/ターンの均衡化

  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const cell = world.cells[y][x];
      const neighbors = world.getNeighbors(x, y);

      for (const neighbor of neighbors) {
        // 同一コミュニティの場合のみ取引（摩擦低）
        if (cell.communityId !== neighbor.communityId) continue;

        const foodDiff = cell.stocks.food - neighbor.stocks.food;
        if (foodDiff > 20) {
          const transfer = foodDiff * EQUALIZATION_RATE;
          cell.stocks.food     -= transfer;
          neighbor.stocks.food += transfer;
        }

        const waterDiff = cell.stocks.water - neighbor.stocks.water;
        if (waterDiff > 10) {
          const transfer = waterDiff * EQUALIZATION_RATE;
          cell.stocks.water     -= transfer;
          neighbor.stocks.water += transfer;
        }
      }
    }
  }
}
