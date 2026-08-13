// ===== セルデータ構造 =====
// 座標セル仕様: 1,000m²単位、収容上限1,000人
// 出典: docs/ゲームシステム/座標セル.docx

export type Terrain = 'flat' | 'river' | 'swamp' | 'cliff' | 'forest';

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
  buildingBonus: number;  // 建設による抵抗軽減値
}

export function createCell(x: number, y: number, terrain: Terrain): Cell {
  const pop = Math.floor(Math.random() * 300) + 50;
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
      food:  Math.random() * 500 + 200,
      water: Math.random() * 400 + 100,
      wood:  Math.random() * 300 + 50,
      tools: Math.random() * 100 + 10,
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
    buildingBonus: 0,
  };
}
