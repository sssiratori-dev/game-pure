// ===== ワールド（20×20マップ）管理 =====
// 出典: docs/ゲームシステム/座標セル.docx, グラフ理論による同一コミュニティ判定.docx

import type { Cell, Terrain } from './cell';
import { createCell } from './cell';

export const MAP_SIZE = 20;

// 地形分布の生成（パーリン風の簡易アルゴリズム）
function generateTerrainMap(): Terrain[][] {
  const map: Terrain[][] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
      const r = Math.random();
      let terrain: Terrain;
      // 川は縦スジ状に配置
      if (x === 5 || x === 14 || (y === 10 && x >= 5 && x <= 14)) {
        terrain = 'river';
      } else if (r < 0.05) {
        terrain = 'swamp';
      } else if (r < 0.12) {
        terrain = 'cliff';
      } else if (r < 0.30) {
        terrain = 'forest';
      } else {
        terrain = 'flat';
      }
      map[y][x] = terrain;
    }
  }
  return map;
}

export class World {
  cells: Cell[][];
  turn: number;

  constructor() {
    const terrainMap = generateTerrainMap();
    this.cells = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      this.cells[y] = [];
      for (let x = 0; x < MAP_SIZE; x++) {
        this.cells[y][x] = createCell(x, y, terrainMap[y][x]);
      }
    }
    this.turn = 0;
    this.detectCommunities();
  }

  getCell(x: number, y: number): Cell | null {
    if (x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) return null;
    return this.cells[y][x];
  }

  getNeighbors(x: number, y: number): Cell[] {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    return dirs
      .map(([dx, dy]) => this.getCell(x + dx, y + dy))
      .filter((c): c is Cell => c !== null);
  }

  allCells(): Cell[] {
    return this.cells.flat();
  }

  // グラフ理論によるコミュニティ検出（BFS連結成分）
  // 出典: docs/ゲームシステム/グラフ理論による同一コミュニティ判定.docx
  detectCommunities(): void {
    const CULTURAL_DISTANCE_THRESHOLD = 0.4;

    // コミュニティIDをリセット
    for (const cell of this.allCells()) {
      cell.communityId = -1;
    }

    let communityId = 0;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const cell = this.cells[y][x];
        if (cell.communityId !== -1) continue;

        // BFS
        const queue: Cell[] = [cell];
        cell.communityId = communityId;
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const neighbor of this.getNeighbors(current.x, current.y)) {
            if (neighbor.communityId !== -1) continue;
            const dist = culturalDistance(current, neighbor);
            if (dist < CULTURAL_DISTANCE_THRESHOLD) {
              neighbor.communityId = communityId;
              queue.push(neighbor);
            }
          }
        }
        communityId++;
      }
    }
  }
}

// 文化距離の計算
// 出典: docs/ゲームシステム/グラフ理論による同一コミュニティ判定.docx
export function culturalDistance(a: Cell, b: Cell): number {
  const langDiff = a.culture.languageGroup === b.culture.languageGroup ? 0 : 0.5;
  const strengthDiff = Math.abs(a.culture.culturalStrength - b.culture.culturalStrength) * 0.3;
  const civDiff = Math.abs(a.culture.civilizationLevel - b.culture.civilizationLevel) * 0.2;
  return langDiff + strengthDiff + civDiff;
}
