// ===== 人文演算 =====
// 出典: docs/ゲームシステム/人文.docx
// 言語・文化・歴史・思想の変化を演算し、摩擦補正・カルマ・離反判定を更新

import type { Cell } from '../core/cell';
import { World, culturalDistance } from '../core/world';
import { updateCivilizationLevel } from '../core/formulas';

// 謀反・離反アルゴリズム
// 出典: docs/ゲームシステム/謀反・離反（都市の独立）アルゴリズム.docx
// U > φ_history に達した瞬間、ノードが切断され新興勢力として独立
function checkRebellion(cell: Cell, world: World): void {
  const phi_history = cell.culture.historicalContinuity;
  if (cell.dissatisfaction > phi_history) {
    // 独立：コミュニティから切断
    cell.communityId = -2; // -2 = 独立勢力
    cell.dissatisfaction = 0;
    cell.culture.historicalContinuity = Math.max(0.1, phi_history - 0.1);
    console.log(`[謀反] セル(${cell.x},${cell.y}) が独立しました！`);
    // コミュニティ再検出
    world.detectCommunities();
  }
}

// 文化伝播と収斂（隣接セルとの相互影響）
// 出典: docs/ゲームシステム/人文.docx「言語が同一の場合、自然と文化ステータスが近似する」
function culturalConvergence(cell: Cell, neighbors: Cell[]): void {
  const sameLanguageNeighbors = neighbors.filter(
    n => n.culture.languageGroup === cell.culture.languageGroup
  );

  if (sameLanguageNeighbors.length > 0) {
    // 同言語圏では文化強度が自然収斂
    const avgStrength = sameLanguageNeighbors.reduce(
      (sum, n) => sum + n.culture.culturalStrength, 0
    ) / sameLanguageNeighbors.length;

    cell.culture.culturalStrength +=
      (avgStrength - cell.culture.culturalStrength) * 0.01;
  }
}

// 歴史継続性の更新
// 出典: docs/ゲームシステム/人文.docx「同一文化が継続すると文化変化への耐性が高まる」
function updateHistoricalContinuity(cell: Cell, neighbors: Cell[]): void {
  const avgCulturalDist = neighbors.reduce(
    (sum, n) => sum + culturalDistance(cell, n), 0
  ) / Math.max(1, neighbors.length);

  if (avgCulturalDist < 0.2) {
    // 文化的に近い隣接セルに囲まれている → 歴史継続性が増加
    cell.culture.historicalContinuity = Math.min(
      1.0,
      cell.culture.historicalContinuity + 0.002
    );
  } else if (avgCulturalDist > 0.6) {
    // 異文化圧力 → カルマ蓄積、不満度上昇
    // 出典: docs/ゲームシステム/人文.docx「文化の差が大きく距離が近いとカルマが溜まる」
    cell.dissatisfaction = Math.min(1, cell.dissatisfaction + 0.01);
  }
}

// 不満度の自然回復（満足できている時は不満が下がる）
function dissatisfactionRecovery(cell: Cell): void {
  if (cell.stocks.food > 100 && cell.stocks.water > 50) {
    cell.dissatisfaction = Math.max(0, cell.dissatisfaction - 0.02);
  }
}

export function runHumanities(world: World): void {
  for (const cell of world.allCells()) {
    const neighbors = world.getNeighbors(cell.x, cell.y);

    // 文明レベルの閾値チェック
    updateCivilizationLevel(cell);

    // 文化収斂
    culturalConvergence(cell, neighbors);

    // 歴史継続性更新
    updateHistoricalContinuity(cell, neighbors);

    // 不満度回復
    dissatisfactionRecovery(cell);

    // 謀反・離反チェック
    checkRebellion(cell, world);
  }
}
