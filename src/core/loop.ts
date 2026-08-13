// ===== コアループ =====
// 出典: docs/ゲームシステム/ゲーム　コアループ.docx
// 消費 → 生産 → 移動 → 人文 → (ループ)

import { World } from './world';
import { runConsumption } from '../systems/consumption';
import { runProduction } from '../systems/production';
import { runMovement } from '../systems/movement';
import { runHumanities } from '../systems/humanities';

export function advanceTurn(world: World): void {
  // フェーズ1: 消費（人・施設が消費活動）
  for (const cell of world.allCells()) {
    runConsumption(cell);
  }

  // フェーズ2: 生産（人・施設・自然が生産活動）
  for (const cell of world.allCells()) {
    runProduction(cell);
  }

  // フェーズ3: 移動（人口・物資の移動）
  runMovement(world);

  // フェーズ4: 人文（文化・歴史・思想の変化、離反チェック）
  runHumanities(world);

  world.turn++;
}
