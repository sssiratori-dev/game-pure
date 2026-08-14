// ===== ワールド（20×20マップ）管理 =====
// 出典: docs/ゲームシステム/座標セル.docx, グラフ理論による同一コミュニティ判定.docx

import type { Cell, Terrain } from './cell';
import { createCell } from './cell';
import type { Player, PlayerId } from './player';
import { createDefaultPlayers } from './player';

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

export type PlayerAction = 'build' | 'claim' | 'attack';

export class World {
  cells: Cell[][];
  players: Player[];
  currentPlayerId: PlayerId;
  selectedCell: { x: number; y: number } | null;
  turn: number;

  constructor() {
    const terrainMap = generateTerrainMap();
    this.players = createDefaultPlayers();
    this.currentPlayerId = this.players[0].id;
    this.selectedCell = null;
    this.cells = [];
    for (let y = 0; y < MAP_SIZE; y++) {
      this.cells[y] = [];
      for (let x = 0; x < MAP_SIZE; x++) {
        this.cells[y][x] = createCell(x, y, terrainMap[y][x]);
      }
    }
    this.claimStartingTerritory();
    this.turn = 0;
    this.detectCommunities();
  }

  getPlayer(playerId: PlayerId | null): Player | null {
    if (!playerId) return null;
    return this.players.find((player) => player.id === playerId) ?? null;
  }

  getCurrentPlayer(): Player | null {
    return this.getPlayer(this.currentPlayerId);
  }

  setCurrentPlayer(playerId: PlayerId): void {
    this.currentPlayerId = playerId;
  }

  getOwnedCells(playerId: PlayerId): Cell[] {
    return this.allCells().filter((cell) => cell.ownerId === playerId);
  }

  setSelectedCell(x: number, y: number): void {
    this.selectedCell = { x, y };
  }

  getSelectedCell(): Cell | null {
    if (!this.selectedCell) return null;
    return this.getCell(this.selectedCell.x, this.selectedCell.y);
  }

  executePlayerAction(action: PlayerAction): { ok: boolean; message: string } {
    const current = this.getCurrentPlayer();
    const cell = this.getSelectedCell();
    if (!current) {
      return { ok: false, message: 'プレイヤーが選択されていません。' };
    }
    if (!cell) {
      return { ok: false, message: 'セルを選択してください。' };
    }

    if (action === 'build') {
      if (cell.ownerId === current.id || cell.ownerId === null) {
        cell.ownerId = current.id;
        cell.buildingBonus = Math.min(1, cell.buildingBonus + 0.1);
        cell.population = Math.min(1000, cell.population + 25);
        cell.stocks.food += 30;
        cell.stocks.water += 20;
        return { ok: true, message: `${current.name} が ${cell.x},${cell.y} に建設を行いました。` };
      }
      return { ok: false, message: 'このセルは他プレイヤーの支配地です。' };
    }

    if (action === 'claim') {
      const adjacentOwned = this.getNeighbors(cell.x, cell.y).some((neighbor) => neighbor.ownerId === current.id);
      if (cell.ownerId === current.id) {
        return { ok: false, message: 'このセルはすでにあなたの支配下です。' };
      }
      if (!adjacentOwned) {
        return { ok: false, message: '隣接する自分の支配地が必要です。' };
      }
      cell.ownerId = current.id;
      cell.population = Math.max(cell.population, 20);
      return { ok: true, message: `${current.name} が ${cell.x},${cell.y} を占領しました。` };
    }

    if (action === 'attack') {
      const targetOwner = cell.ownerId;
      if (!targetOwner || targetOwner === current.id) {
        return { ok: false, message: '攻撃対象がいません。' };
      }
      const attackPower = current.influence + cell.population / 120;
      const defensePower = (this.getPlayer(targetOwner)?.influence ?? 0) + (cell.population / 100);
      if (attackPower > defensePower) {
        cell.ownerId = current.id;
        cell.population = Math.max(30, Math.floor(cell.population * 0.7));
        cell.dissatisfaction = Math.min(1, cell.dissatisfaction + 0.2);
        return { ok: true, message: `${current.name} が ${cell.x},${cell.y} を制圧しました。` };
      }
      cell.population = Math.max(0, cell.population - 20);
      return { ok: true, message: `${current.name} の攻撃は失敗し、敵勢力が防衛しました。` };
    }

    return { ok: false, message: '不明なアクションです。' };
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

  private claimStartingTerritory(): void {
    const startingCells = [
      { x: 3, y: 3 },
      { x: 15, y: 5 },
      { x: 11, y: 15 },
    ];

    startingCells.forEach((seed, index) => {
      const player = this.players[index];
      if (!player) return;
      const radius = 2;
      for (let y = seed.y - radius; y <= seed.y + radius; y++) {
        for (let x = seed.x - radius; x <= seed.x + radius; x++) {
          const cell = this.getCell(x, y);
          if (!cell) continue;
          const distance = Math.abs(x - seed.x) + Math.abs(y - seed.y);
          if (distance <= radius + 1 && Math.random() > 0.15) {
            cell.ownerId = player.id;
          }
        }
      }
      const center = this.getCell(seed.x, seed.y);
      if (center) {
        center.ownerId = player.id;
      }
    });
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
