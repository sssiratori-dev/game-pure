// ===== セルデータ構造 =====
// 座標セル仕様: 1,000m²単位、収容上限1,000人
// 出典: docs/ゲームシステム/座標セル.docx

export type Terrain = 'flat' | 'river' | 'swamp' | 'cliff' | 'forest';
export type BuildingType = 'residential' | 'logistics' | 'fortress' | 'production' | 'market' | 'culture';
export const MAX_BUILDING_SLOTS = 3;

export const TERRAIN_RESISTANCE: Record<Terrain, number> = {
  flat:   0.1,
  river:  0.7,
  swamp:  0.8,
  cliff:  0.9,
  forest: 0.4,
};

export const TERRAIN_COLOR: Record<Terrain, string> = {
  flat:   '#a8c880',
  river:  '#6aabff',
  swamp:  '#7aaa88',
  cliff:  '#a09080',
  forest: '#3d7a3d',
};

export const POPULATION_CAP = 1000;

export const BUILDING_LABELS: Record<BuildingType, string> = {
  residential: '居住区',
  logistics: '物流路',
  fortress: '攻撃拠点',
  production: '生産設備',
  market: 'マーケット',
  culture: '文化施設',
};

export interface BuildingSpec {
  label: string;
  goldCost: number;
  influenceCost: number;
  actionPointCost: number;
  populationBoost: number;
  foodBoost: number;
  waterBoost: number;
  woodBoost: number;
  toolBoost: number;
  militaryBoost: number;
  cultureBoost: number;
  dissatisfactionRelief: number;
  upkeepGold: number;
  upkeepActionPoints: number;
}

export const BUILDING_SPECS: Record<BuildingType, BuildingSpec> = {
  residential: {
    label: '居住区',
    goldCost: 18,
    influenceCost: 3,
    actionPointCost: 1,
    populationBoost: 90,
    foodBoost: 30,
    waterBoost: 20,
    woodBoost: 8,
    toolBoost: 6,
    militaryBoost: 0,
    cultureBoost: 6,
    dissatisfactionRelief: 0.04,
    upkeepGold: 2,
    upkeepActionPoints: 0.3,
  },
  logistics: {
    label: '物流路',
    goldCost: 14,
    influenceCost: 2,
    actionPointCost: 1,
    populationBoost: 25,
    foodBoost: 15,
    waterBoost: 15,
    woodBoost: 12,
    toolBoost: 14,
    militaryBoost: 0,
    cultureBoost: 4,
    dissatisfactionRelief: 0.02,
    upkeepGold: 1,
    upkeepActionPoints: 0.2,
  },
  fortress: {
    label: '攻撃拠点',
    goldCost: 24,
    influenceCost: 5,
    actionPointCost: 2,
    populationBoost: 25,
    foodBoost: 15,
    waterBoost: 10,
    woodBoost: 10,
    toolBoost: 8,
    militaryBoost: 4,
    cultureBoost: 2,
    dissatisfactionRelief: 0.01,
    upkeepGold: 4,
    upkeepActionPoints: 0.8,
  },
  production: {
    label: '生産設備',
    goldCost: 20,
    influenceCost: 4,
    actionPointCost: 2,
    populationBoost: 35,
    foodBoost: 35,
    waterBoost: 22,
    woodBoost: 26,
    toolBoost: 18,
    militaryBoost: 0,
    cultureBoost: 5,
    dissatisfactionRelief: 0.02,
    upkeepGold: 3,
    upkeepActionPoints: 0.6,
  },
  market: {
    label: 'マーケット',
    goldCost: 22,
    influenceCost: 4,
    actionPointCost: 2,
    populationBoost: 40,
    foodBoost: 22,
    waterBoost: 18,
    woodBoost: 10,
    toolBoost: 20,
    militaryBoost: 1,
    cultureBoost: 8,
    dissatisfactionRelief: 0.03,
    upkeepGold: 3,
    upkeepActionPoints: 0.5,
  },
  culture: {
    label: '文化施設',
    goldCost: 16,
    influenceCost: 6,
    actionPointCost: 1,
    populationBoost: 30,
    foodBoost: 10,
    waterBoost: 12,
    woodBoost: 8,
    toolBoost: 10,
    militaryBoost: 0,
    cultureBoost: 18,
    dissatisfactionRelief: 0.06,
    upkeepGold: 2,
    upkeepActionPoints: 0.4,
  },
};

// 資源ストック（docs/ゲームシステム/資源.docx）
export interface Stocks {
  food:   number; // 食料（麦・肉・野菜）
  water:  number; // 飲料水
  wood:   number; // 薪
  tools:  number; // ツール
}

// 人口階層（docs/ゲームシステム/人口階層.docx）
export interface PopulationLayer {
  count:      number;  // 人口数 n
  militaryPow: number; // 武力 P_military
  wealthPow:   number; // 財力 P_wealth
  authorityPow: number; // 権威 P_authority
  // 思想ベクトル（簡略: 好戦性 0-1）
  belligerence: number;
  // 不満度
  dissatisfaction: number;
}

// 文化・人文パラメータ（docs/ゲームシステム/人文.docx）
export interface Culture {
  languageGroup: string;  // 'A'|'B'|'C' など
  culturalStrength: number; // 文化強度（0-1）
  historicalContinuity: number; // 歴史継続性 φ_history（0-1）
  civilizationLevel: 1 | 2 | 3; // 文明レベル（閾値スイッチ）
  cultureStock: number; // 累積文化ストック
}

// セルの完全データ構造
import type { PlayerId } from './player';

export interface Cell {
  x: number;
  y: number;
  terrain: Terrain;
  R_geo: number;          // 地形抵抗値
  population: number;    // 総人口
  populationLayers: PopulationLayer[];
  stocks: Stocks;
  culture: Culture;
  dissatisfaction: number; // 総不満度 U
  communityId: number;    // 所属コミュニティID（-1 = 独立/未所属）
  ownerId: PlayerId | null; // 支配プレイヤーID
  buildings: Record<BuildingType, number>;
  buildingBonus: number;  // 建設による抵抗軽減値
  buildingType: BuildingType | null;
  buildingLevel: number;
  defenseBonus: number;
  mobilityBonus: number;
  productionBonus: number;
  populationCapacityBonus: number;
  logisticsBonus: number;
  economicBonus: number;
  humanitiesBonus: number;
}

export function createCell(x: number, y: number, terrain: Terrain): Cell {
  const pop = Math.floor(Math.random() * 20);
  return {
    x,
    y,
    terrain,
    R_geo: TERRAIN_RESISTANCE[terrain],
    population: pop,
    populationLayers: [
      {
        count: Math.floor(pop * 0.8),
        militaryPow: Math.random() * 0.3,
        wealthPow: Math.random() * 0.3,
        authorityPow: Math.random() * 0.2,
        belligerence: Math.random() * 0.3,
        dissatisfaction: 0,
      },
      {
        count: Math.floor(pop * 0.2),
        militaryPow: Math.random() * 0.8 + 0.2,
        wealthPow: Math.random() * 0.8 + 0.2,
        authorityPow: Math.random() * 0.8 + 0.2,
        belligerence: Math.random() * 0.5,
        dissatisfaction: 0,
      },
    ],
    stocks: {
      food:  Math.random() * 80 + 20,
      water: Math.random() * 120 + 40,
      wood:  Math.random() * 180 + 60,
      tools: Math.random() * 25 + 5,
    },
    culture: {
      languageGroup: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
      culturalStrength: Math.random() * 0.5 + 0.3,
      historicalContinuity: Math.random() * 0.5 + 0.2,
      civilizationLevel: 1,
      cultureStock: Math.random() * 200,
    },
    dissatisfaction: 0,
    communityId: -1,
    ownerId: null,
    buildings: {
      residential: 0,
      logistics: 0,
      fortress: 0,
      production: 0,
      market: 0,
      culture: 0,
    },
    buildingBonus: 0,
    buildingType: null,
    buildingLevel: 0,
    defenseBonus: 0,
    mobilityBonus: 0,
    productionBonus: 0,
    populationCapacityBonus: 0,
    logisticsBonus: 0,
    economicBonus: 0,
    humanitiesBonus: 0,
  };
}

export function applyBuildingProfile(cell: Cell): void {
  const levels = cell.buildings;
  const totalLevel = getTotalBuildingLevel(cell);
  if (totalLevel === 0) {
    cell.buildingType = null;
    cell.buildingLevel = 0;
    cell.buildingBonus = 0;
    cell.defenseBonus = 0;
    cell.mobilityBonus = 0;
    cell.productionBonus = 0;
    cell.populationCapacityBonus = 0;
    cell.logisticsBonus = 0;
    cell.economicBonus = 0;
    cell.humanitiesBonus = 0;
    return;
  }

  cell.buildingType = getDominantBuildingType(cell);
  cell.buildingLevel = totalLevel;

  const res = levels.residential;
  const log = levels.logistics;
  const fort = levels.fortress;
  const prod = levels.production;
  const market = levels.market;
  const culture = levels.culture;

  cell.buildingBonus = Math.min(0.95, 0.05 * res + 0.06 * log + 0.03 * fort + 0.06 * prod + 0.04 * market + 0.03 * culture);
  cell.defenseBonus = Math.min(1.2, 0.02 * res + 0.02 * log + 0.2 * fort + 0.03 * prod + 0.03 * market + 0.03 * culture);
  cell.mobilityBonus = Math.min(1.4, 0.03 * res + 0.24 * log + 0.02 * fort + 0.04 * prod + 0.07 * market + 0.03 * culture);
  cell.productionBonus = Math.min(1.65, 0.08 * res + 0.05 * log + 0.02 * fort + 0.26 * prod + 0.09 * market + 0.05 * culture);
  cell.populationCapacityBonus = 220 * res + 90 * log + 80 * fort + 120 * prod + 140 * market + 100 * culture;
  cell.logisticsBonus = Math.min(1.8, 0.02 * res + 0.28 * log + 0.02 * fort + 0.08 * prod + 0.2 * market + 0.05 * culture);
  cell.economicBonus = Math.min(1.6, 0.03 * res + 0.04 * log + 0.02 * fort + 0.08 * prod + 0.24 * market + 0.05 * culture);
  cell.humanitiesBonus = Math.min(1.8, 0.04 * res + 0.02 * log + 0.015 * fort + 0.02 * prod + 0.05 * market + 0.3 * culture);
}

export function getEffectivePopulationCap(cell: Cell): number {
  return POPULATION_CAP + Math.max(0, cell.populationCapacityBonus);
}

export function getTotalBuildingLevel(cell: Cell): number {
  return Object.values(cell.buildings).reduce((sum, level) => sum + level, 0);
}

export function getOccupiedBuildingSlots(cell: Cell): number {
  return Object.values(cell.buildings).filter((level) => level > 0).length;
}

export function getDominantBuildingType(cell: Cell): BuildingType | null {
  const entries = Object.entries(cell.buildings) as Array<[BuildingType, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length === 0 || entries[0][1] <= 0) return null;
  return entries[0][0];
}
