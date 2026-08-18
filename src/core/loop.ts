// ===== コアループ =====
// 出典: docs/ゲームシステム/ゲーム　コアループ.docx
// 消費 → 生産 → 移動 → 人文 → (ループ)

import { World } from './world';
import { runConsumption } from '../systems/consumption';
import { runProduction } from '../systems/production';
import { runMovement } from '../systems/movement';
import { runHumanities } from '../systems/humanities';

function runScaled(intensity: number, execute: () => void): void {
  if (intensity <= 0) return;
  const loops = Math.floor(intensity);
  const fraction = intensity - loops;
  for (let i = 0; i < loops; i++) execute();
  if (Math.random() < fraction) execute();
}

export function advanceTurn(world: World): void {
  const tuning = world.masterModeEnabled
    ? world.algorithmTuning
    : { consumption: 1, production: 1, movement: 1, humanities: 1 };

  // フェーズ1: 消費（人・施設が消費活動）
  runScaled(tuning.consumption, () => {
    for (const cell of world.allCells()) {
      runConsumption(cell, world.advancedTuning);
    }
  });

  // フェーズ2: 生産（人・施設・自然が生産活動）
  runScaled(tuning.production, () => {
    for (const cell of world.allCells()) {
      runProduction(cell, world.advancedTuning);
    }
  });

  // フェーズ3: 移動（人口・物資の移動）
  runScaled(tuning.movement, () => runMovement(world));

  // フェーズ4: 人文（文化・歴史・思想の変化、離反チェック）
  runScaled(tuning.humanities, () => runHumanities(world));

  world.turn++;
}
