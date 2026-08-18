// ===== 基本更新式とΦ（統合補正係数）=====
// 出典: docs/ゲームシステム/基本更新式.docx
//       docs/ゲームシステム/統合補正係数 Φ の掛け合わせ構造.docx
//       docs/ゲームシステム/言語・文化特性による基本補正.docx

import type { Cell } from './cell';

export interface FormulaAdjustments {
  phiLanguageWeight: number;
  phiTerrainWeight: number;
  phiCivilizationWeight: number;
}

// シグモイド緩和関数（計算カオス回避）
// 出典: docs/ゲームシステム/統合補正係数 Φ の掛け合わせ構造.docx
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// Φの各部分補正をシグモイド経由でクランプ
// 最小: 0.05、最大: 2.0
const PHI_MIN = 0.05;
const PHI_MAX = 2.0;

export function clampPhi(raw: number): number {
  const smoothed = sigmoid(raw - 1) * 2; // シグモイド出力を[0,2]にスケール
  return Math.max(PHI_MIN, Math.min(PHI_MAX, smoothed));
}

// 言語・文化特性による基本補正
// 出典: docs/ゲームシステム/言語・文化特性による基本補正.docx
function languageCorrectionFactor(cell: Cell): number {
  switch (cell.culture.languageGroup) {
    case 'A': return 1.2;  // 英語系: 生産・移動速度UP
    case 'B': return 1.0;  // フランス語系: 中立（文化強度が強固）
    case 'C': return 0.9;  // 日本語系: 異文化受容摩擦HIGH（基本補正やや低め）
    default:  return 1.0;
  }
}

// 地形抵抗補正
function terrainCorrectionFactor(cell: Cell): number {
  const effectiveResistance = Math.max(0.01, cell.R_geo - cell.buildingBonus);
  return 1.0 - effectiveResistance * 0.5;
}

// 文明レベル補正（取引・移動摩擦の段階的低下）
// 出典: docs/ゲームシステム/文明レベルと経済の進化（閾値スイッチ）.docx
function civilizationCorrectionFactor(cell: Cell): number {
  switch (cell.culture.civilizationLevel) {
    case 1: return 0.6;  // 物々交換: 摩擦極高
    case 2: return 0.85; // 貴金属: 摩擦中
    case 3: return 1.1;  // 法定通貨/信用: 摩擦低
    default: return 0.6;
  }
}

// 統合補正係数 Φ = ∏(各補正)
// 出典: docs/ゲームシステム/基本更新式.docx
export function calcPhi(cell: Cell, adjustments?: FormulaAdjustments): number {
  const tuning = adjustments ?? { phiLanguageWeight: 1, phiTerrainWeight: 1, phiCivilizationWeight: 1 };
  const phi_lang = languageCorrectionFactor(cell) * tuning.phiLanguageWeight;
  const phi_terrain = terrainCorrectionFactor(cell) * tuning.phiTerrainWeight;
  const phi_civ = civilizationCorrectionFactor(cell) * tuning.phiCivilizationWeight;
  const raw = phi_lang * phi_terrain * phi_civ;
  return clampPhi(raw);
}

// 基本更新式: S_n = S_{n-1} + ΔS
// ΔS = base × Φ
// 出典: docs/ゲームシステム/基本更新式.docx
export function applyDeltaS(current: number, base: number, phi: number): number {
  const delta = base * phi;
  return Math.max(0, current + delta);
}

// 文明レベル閾値チェック（スイッチ）
// 出典: docs/ゲームシステム/文明レベルと経済の進化（閾値スイッチ）.docx
const CIV_LEVEL_THRESHOLDS = {
  2: 300,  // 物々交換 → 貴金属
  3: 1000, // 貴金属 → 法定通貨
};

export function updateCivilizationLevel(cell: Cell): void {
  if (cell.culture.cultureStock >= CIV_LEVEL_THRESHOLDS[3]) {
    cell.culture.civilizationLevel = 3;
  } else if (cell.culture.cultureStock >= CIV_LEVEL_THRESHOLDS[2]) {
    cell.culture.civilizationLevel = 2;
  } else {
    cell.culture.civilizationLevel = 1;
  }
}
