// ===== ワールド（20×20マップ）管理 =====
// 出典: docs/ゲームシステム/座標セル.docx, グラフ理論による同一コミュニティ判定.docx

import type { BuildingType, Cell, Terrain } from './cell';
import {
  applyBuildingProfile,
  BUILDING_LABELS,
  BUILDING_SPECS,
  createCell,
  getEffectivePopulationCap,
  MAX_BUILDING_SLOTS,
  getOccupiedBuildingSlots,
} from './cell';
import type { AiBehavior, Player, PlayerId } from './player';
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

function clampTuning(value: number): number {
  return Math.max(0, Math.min(3, value));
}

export type PlayerAction = 'build' | 'claim' | 'attack' | 'logistics';
export interface PlayerAssets {
  territory: number;
  population: number;
  food: number;
  water: number;
  wood: number;
  tools: number;
}

export interface ActionAvailability {
  enabled: boolean;
  reason: string;
}

export interface AlgorithmTuning {
  consumption: number;
  production: number;
  movement: number;
  humanities: number;
}

export interface AdvancedTuning {
  phiLanguageWeight: number;
  phiTerrainWeight: number;
  phiCivilizationWeight: number;
  baseFoodPerPerson: number;
  baseWaterPerPerson: number;
  baseWoodPerPerson: number;
  naturalFoodRate: number;
  naturalWaterRate: number;
  naturalWoodRate: number;
  humanFoodRate: number;
  humanToolRate: number;
  tradeRate: number;
  migrationRate: number;
  movementCarryRate: number;
  culturalConvergenceRate: number;
  historicalContinuityRate: number;
  culturalPressureRate: number;
  dissatisfactionRecoveryRate: number;
  upkeepGoldRate: number;
  upkeepActionPointRate: number;
}

export interface GameRules {
  autoRotateControl: boolean;
  aiAutoAction: boolean;
  logisticsEnabled: boolean;
  logisticsEqualizationRate: number;
}

export class World {
  cells: Cell[][];
  players: Player[];
  currentPlayerId: PlayerId;
  selectedCell: { x: number; y: number } | null;
  selectedBuildType: BuildingType;
  selectedLogisticsResource: 'food' | 'water' | 'wood' | 'tools';
  selectedLogisticsAmount: number;
  masterModeEnabled: boolean;
  algorithmTuning: AlgorithmTuning;
  advancedTuning: AdvancedTuning;
  rules: GameRules;
  turn: number;

  constructor() {
    const terrainMap = generateTerrainMap();
    this.players = createDefaultPlayers();
    this.currentPlayerId = this.players[0].id;
    this.selectedCell = null;
    this.selectedBuildType = 'residential';
    this.selectedLogisticsResource = 'food';
    this.selectedLogisticsAmount = 40;
    this.masterModeEnabled = false;
    this.algorithmTuning = {
      consumption: 1,
      production: 1,
      movement: 1,
      humanities: 1,
    };
    this.advancedTuning = {
      phiLanguageWeight: 1,
      phiTerrainWeight: 1,
      phiCivilizationWeight: 1,
      baseFoodPerPerson: 1,
      baseWaterPerPerson: 1,
      baseWoodPerPerson: 1,
      naturalFoodRate: 1,
      naturalWaterRate: 1,
      naturalWoodRate: 1,
      humanFoodRate: 1,
      humanToolRate: 1,
      tradeRate: 1,
      migrationRate: 1,
      movementCarryRate: 1,
      culturalConvergenceRate: 1,
      historicalContinuityRate: 1,
      culturalPressureRate: 1,
      dissatisfactionRecoveryRate: 1,
      upkeepGoldRate: 1,
      upkeepActionPointRate: 1,
    };
    this.rules = {
      autoRotateControl: false,
      aiAutoAction: true,
      logisticsEnabled: true,
      logisticsEqualizationRate: 0.02,
    };
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

  switchControlPlayer(playerId: PlayerId): void {
    if (!this.getPlayer(playerId)) return;
    this.currentPlayerId = playerId;
  }

  setCurrentPlayer(playerId: PlayerId): void {
    this.currentPlayerId = playerId;
  }

  refreshPlayersForNewTurn(): void {
    for (const player of this.players) {
      player.actionPoints = player.maxActionPoints;
      const assets = this.getPlayerAssets(player.id);
      const economyBonus = this.getOwnedCells(player.id).reduce((sum, cell) => sum + cell.economicBonus, 0);
      player.gold += Math.max(3, Math.floor(assets.territory * 0.7 + economyBonus * 3.5));
      player.influence = Math.min(200, player.influence + 1);
    }
  }

  applyBuildingUpkeepForTurn(): string[] {
    const logs: string[] = [];
    for (const player of this.players) {
      const ownedCells = this.getOwnedCells(player.id);
      let totalGold = 0;
      let totalAp = 0;

      for (const cell of ownedCells) {
        for (const type of Object.keys(BUILDING_SPECS) as BuildingType[]) {
          const level = cell.buildings[type];
          if (level <= 0) continue;
          const spec = BUILDING_SPECS[type];
          totalGold += spec.upkeepGold * level * this.advancedTuning.upkeepGoldRate;
          totalAp += spec.upkeepActionPoints * level * this.advancedTuning.upkeepActionPointRate;
        }
      }

      const apCost = Math.max(0, Math.floor(totalAp));
      player.actionPoints = Math.max(0, player.actionPoints - apCost);
      player.gold -= totalGold;

      if (player.gold < 0) {
        const deficit = Math.abs(player.gold);
        player.gold = 0;
        const stress = Math.min(0.2, deficit / 500);
        for (const cell of ownedCells) {
          cell.dissatisfaction = Math.min(1, cell.dissatisfaction + stress);
        }
        logs.push(`${player.icon}${player.name}: 維持費不足で不満増加（不足${Math.round(deficit)}）`);
      } else if (totalGold > 0 || apCost > 0) {
        logs.push(`${player.icon}${player.name}: 維持費 AP-${apCost} / 金-${Math.round(totalGold)}`);
      }
    }
    return logs;
  }

  setMasterModeEnabled(enabled: boolean): void {
    this.masterModeEnabled = enabled;
  }

  setAlgorithmTuning(partial: Partial<AlgorithmTuning>): void {
    this.algorithmTuning = {
      consumption: clampTuning(partial.consumption ?? this.algorithmTuning.consumption),
      production: clampTuning(partial.production ?? this.algorithmTuning.production),
      movement: clampTuning(partial.movement ?? this.algorithmTuning.movement),
      humanities: clampTuning(partial.humanities ?? this.algorithmTuning.humanities),
    };
  }

  setAdvancedTuning(partial: Partial<AdvancedTuning>): void {
    this.advancedTuning = {
      phiLanguageWeight: clampTuning(partial.phiLanguageWeight ?? this.advancedTuning.phiLanguageWeight),
      phiTerrainWeight: clampTuning(partial.phiTerrainWeight ?? this.advancedTuning.phiTerrainWeight),
      phiCivilizationWeight: clampTuning(partial.phiCivilizationWeight ?? this.advancedTuning.phiCivilizationWeight),
      baseFoodPerPerson: clampTuning(partial.baseFoodPerPerson ?? this.advancedTuning.baseFoodPerPerson),
      baseWaterPerPerson: clampTuning(partial.baseWaterPerPerson ?? this.advancedTuning.baseWaterPerPerson),
      baseWoodPerPerson: clampTuning(partial.baseWoodPerPerson ?? this.advancedTuning.baseWoodPerPerson),
      naturalFoodRate: clampTuning(partial.naturalFoodRate ?? this.advancedTuning.naturalFoodRate),
      naturalWaterRate: clampTuning(partial.naturalWaterRate ?? this.advancedTuning.naturalWaterRate),
      naturalWoodRate: clampTuning(partial.naturalWoodRate ?? this.advancedTuning.naturalWoodRate),
      humanFoodRate: clampTuning(partial.humanFoodRate ?? this.advancedTuning.humanFoodRate),
      humanToolRate: clampTuning(partial.humanToolRate ?? this.advancedTuning.humanToolRate),
      tradeRate: clampTuning(partial.tradeRate ?? this.advancedTuning.tradeRate),
      migrationRate: clampTuning(partial.migrationRate ?? this.advancedTuning.migrationRate),
      movementCarryRate: clampTuning(partial.movementCarryRate ?? this.advancedTuning.movementCarryRate),
      culturalConvergenceRate: clampTuning(partial.culturalConvergenceRate ?? this.advancedTuning.culturalConvergenceRate),
      historicalContinuityRate: clampTuning(partial.historicalContinuityRate ?? this.advancedTuning.historicalContinuityRate),
      culturalPressureRate: clampTuning(partial.culturalPressureRate ?? this.advancedTuning.culturalPressureRate),
      dissatisfactionRecoveryRate: clampTuning(partial.dissatisfactionRecoveryRate ?? this.advancedTuning.dissatisfactionRecoveryRate),
      upkeepGoldRate: clampTuning(partial.upkeepGoldRate ?? this.advancedTuning.upkeepGoldRate),
      upkeepActionPointRate: clampTuning(partial.upkeepActionPointRate ?? this.advancedTuning.upkeepActionPointRate),
    };
  }

  updateRules(patch: Partial<GameRules>): void {
    this.rules = {
      autoRotateControl: patch.autoRotateControl ?? this.rules.autoRotateControl,
      aiAutoAction: patch.aiAutoAction ?? this.rules.aiAutoAction,
      logisticsEnabled: patch.logisticsEnabled ?? this.rules.logisticsEnabled,
      logisticsEqualizationRate: patch.logisticsEqualizationRate !== undefined
        ? Math.max(0, Math.min(0.5, patch.logisticsEqualizationRate))
        : this.rules.logisticsEqualizationRate,
    };
  }

  updatePlayerProfile(
    playerId: PlayerId,
    patch: Partial<Pick<Player, 'name' | 'icon' | 'isHuman' | 'aiBehavior'>>,
  ): void {
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (typeof patch.name === 'string') {
      player.name = patch.name.trim() || player.name;
    }
    if (typeof patch.icon === 'string') {
      player.icon = patch.icon.trim() || player.icon;
    }
    if (typeof patch.isHuman === 'boolean') {
      player.isHuman = patch.isHuman;
    }
    if (typeof patch.aiBehavior === 'string') {
      if (patch.aiBehavior === 'balanced' || patch.aiBehavior === 'aggressive' || patch.aiBehavior === 'economic') {
        player.aiBehavior = patch.aiBehavior;
      }
    }
  }

  getOwnedCells(playerId: PlayerId): Cell[] {
    return this.allCells().filter((cell) => cell.ownerId === playerId);
  }

  getPlayerAssets(playerId: PlayerId): PlayerAssets {
    const cells = this.getOwnedCells(playerId);
    return cells.reduce<PlayerAssets>((acc, cell) => {
      acc.territory += 1;
      acc.population += cell.population;
      acc.food += cell.stocks.food;
      acc.water += cell.stocks.water;
      acc.wood += cell.stocks.wood;
      acc.tools += cell.stocks.tools;
      return acc;
    }, { territory: 0, population: 0, food: 0, water: 0, wood: 0, tools: 0 });
  }

  getAllPlayerAssets(): Array<{ player: Player; assets: PlayerAssets }> {
    return this.players.map((player) => ({
      player,
      assets: this.getPlayerAssets(player.id),
    }));
  }

  setSelectedCell(x: number, y: number): void {
    this.selectedCell = { x, y };
  }

  setSelectedBuildType(type: BuildingType): void {
    this.selectedBuildType = type;
  }

  getSelectedBuildType(): BuildingType {
    return this.selectedBuildType;
  }

  setLogisticsPlan(resource: 'food' | 'water' | 'wood' | 'tools', amount: number): void {
    this.selectedLogisticsResource = resource;
    this.selectedLogisticsAmount = Math.max(10, Math.min(200, Math.floor(amount)));
  }

  getLogisticsPlan(): { resource: 'food' | 'water' | 'wood' | 'tools'; amount: number } {
    return {
      resource: this.selectedLogisticsResource,
      amount: this.selectedLogisticsAmount,
    };
  }

  getSelectedCell(): Cell | null {
    if (!this.selectedCell) return null;
    return this.getCell(this.selectedCell.x, this.selectedCell.y);
  }

  getActionAvailability(action: PlayerAction): ActionAvailability {
    const current = this.getCurrentPlayer();
    const cell = this.getSelectedCell();
    if (!current) {
      return { enabled: false, reason: 'プレイヤーが選択されていません。' };
    }
    if (!cell) {
      return { enabled: false, reason: 'セルを選択してください。' };
    }
    if (current.actionPoints <= 0) {
      return { enabled: false, reason: '行動力がありません。次のターンへ進んでください。' };
    }

    if (action === 'build') {
      if (cell.ownerId !== current.id && cell.ownerId !== null) {
        return { enabled: false, reason: '建設は自勢力または無所属セルでのみ可能です。' };
      }
      const currentTypeLevel = cell.buildings[this.selectedBuildType];
      if (currentTypeLevel === 0 && getOccupiedBuildingSlots(cell) >= MAX_BUILDING_SLOTS) {
        return { enabled: false, reason: `このセルの建設スロットは満杯です（最大${MAX_BUILDING_SLOTS}種）。` };
      }
      if (currentTypeLevel >= 5) {
        return { enabled: false, reason: `${BUILDING_LABELS[this.selectedBuildType]}は最大レベルです。` };
      }

      const cost = this.getBuildCost(cell, this.selectedBuildType);
      if (current.actionPoints < cost.actionPoints) return { enabled: false, reason: `行動力が不足しています（必要:${cost.actionPoints}）。` };
      if (current.gold < cost.gold) return { enabled: false, reason: `建設に必要なゴールド(${cost.gold})が不足しています。` };
      if (current.influence < cost.influence) return { enabled: false, reason: `建設に必要な影響力(${cost.influence})が不足しています。` };
      return { enabled: true, reason: `${BUILDING_LABELS[this.selectedBuildType]}を建設可能です（AP:${cost.actionPoints} / 金:${cost.gold} / 影響:${cost.influence}）。` };
    }

    if (action === 'claim') {
      const adjacentOwned = this.getNeighbors(cell.x, cell.y).some((neighbor) => neighbor.ownerId === current.id);
      if (cell.ownerId === current.id) {
        return { enabled: false, reason: 'このセルはすでにあなたの支配下です。' };
      }
      if (!adjacentOwned) {
        return { enabled: false, reason: '隣接する自分の支配地が必要です。' };
      }
      if (current.influence < 8) return { enabled: false, reason: '占領に必要な影響力(8)が不足しています。' };
      return { enabled: true, reason: '占領可能です。' };
    }

    if (action === 'attack') {
      const targetOwner = cell.ownerId;
      if (!targetOwner || targetOwner === current.id) {
        return { enabled: false, reason: '攻撃対象がいません。' };
      }
      const adjacentOwned = this.getNeighbors(cell.x, cell.y).some((neighbor) => neighbor.ownerId === current.id);
      if (!adjacentOwned) {
        return { enabled: false, reason: '攻撃には隣接する自勢力セルが必要です。' };
      }
      if (current.gold < 10) return { enabled: false, reason: '攻撃に必要なゴールド(10)が不足しています。' };
      if (current.military < 8) return { enabled: false, reason: '軍事力が不足しています。' };
      return { enabled: true, reason: '攻撃可能です。' };
    }

    if (action === 'logistics') {
      if (!this.rules.logisticsEnabled) {
        return { enabled: false, reason: '物流はルール設定で無効です。' };
      }
      if (cell.ownerId !== current.id) {
        return { enabled: false, reason: '物流移送は自勢力セルのみ実行できます。' };
      }
      const friendlyNeighbors = this.getNeighbors(cell.x, cell.y).filter((neighbor) => neighbor.ownerId === current.id);
      if (friendlyNeighbors.length === 0) {
        return { enabled: false, reason: '隣接する自勢力セルが必要です。' };
      }
      const planAmount = this.selectedLogisticsAmount;
      const resourceStock = cell.stocks[this.selectedLogisticsResource];
      const resourceLabel = logisticsStockLabel(this.selectedLogisticsResource);
      if (resourceStock < planAmount * 0.6) {
        return { enabled: false, reason: `移送元の${resourceLabel}が不足しています（必要目安:${Math.round(planAmount * 0.6)}）。` };
      }
      return { enabled: true, reason: `物流移送可能です（${resourceLabel} を ${planAmount} 目安で移送）。` };
    }

    return { enabled: false, reason: '不明なアクションです。' };
  }

  executePlayerAction(action: PlayerAction): { ok: boolean; message: string } {
    const current = this.getCurrentPlayer();
    const cell = this.getSelectedCell();
    if (!current || !cell) {
      return { ok: false, message: 'セルとプレイヤーの状態を確認してください。' };
    }
    const availability = this.getActionAvailability(action);
    if (!availability.enabled) {
      return { ok: false, message: availability.reason };
    }

    if (action === 'build') {
      const type = this.selectedBuildType;
      const spec = BUILDING_SPECS[type];
      const cost = this.getBuildCost(cell, type);
      current.actionPoints -= cost.actionPoints;
      current.gold -= cost.gold;
      current.influence = Math.max(0, current.influence - cost.influence);
      cell.ownerId = current.id;
      cell.buildings[type] += 1;
      applyBuildingProfile(cell);
      const level = cell.buildings[type];
      const gainScale = 0.75 + level * 0.18;
      cell.population = Math.min(getEffectivePopulationCap(cell), cell.population + Math.floor((spec.populationBoost + level * 8) * gainScale));
      cell.stocks.food += spec.foodBoost * gainScale;
      cell.stocks.water += spec.waterBoost * gainScale;
      cell.stocks.wood += spec.woodBoost * gainScale;
      cell.stocks.tools += spec.toolBoost * gainScale;
      current.military += spec.militaryBoost;
      cell.culture.cultureStock += spec.cultureBoost + cell.humanitiesBonus * 8;
      cell.dissatisfaction = Math.max(0, cell.dissatisfaction - spec.dissatisfactionRelief);
      const usedSlots = getOccupiedBuildingSlots(cell);
      return {
        ok: true,
        message: `${current.icon} ${current.name} が ${cell.x},${cell.y} に${spec.label} Lv.${level}を建設（${usedSlots}/${MAX_BUILDING_SLOTS}スロット, AP-${cost.actionPoints}, 金-${cost.gold}）。`,
      };
    }

    if (action === 'claim') {
      current.actionPoints -= 1;
      current.influence = Math.max(0, current.influence - 8);
      cell.ownerId = current.id;
      cell.population = Math.max(cell.population, 20);
      cell.dissatisfaction = Math.max(0, cell.dissatisfaction - 0.08);
      return { ok: true, message: `${current.icon} ${current.name} が ${cell.x},${cell.y} を外交的に編入しました。` };
    }

    if (action === 'logistics') {
      const targets = this.getNeighbors(cell.x, cell.y).filter((neighbor) => neighbor.ownerId === current.id);
      const stockKey = this.selectedLogisticsResource;
      targets.sort((a, b) => a.stocks[stockKey] - b.stocks[stockKey]);
      const target = targets[0];
      if (!target) {
        return { ok: false, message: '物流移送先が見つかりません。' };
      }
      const moved = Math.min(this.selectedLogisticsAmount, cell.stocks[stockKey] * 0.4);
      if (moved <= 0) {
        return { ok: false, message: '移送可能な在庫がありません。' };
      }
      cell.stocks[stockKey] -= moved;
      target.stocks[stockKey] += moved;
      current.actionPoints -= 1;
      return {
        ok: true,
        message: `🚚 ${current.name} が (${cell.x},${cell.y}) から (${target.x},${target.y}) へ ${logisticsStockLabel(stockKey)} を ${Math.round(moved)} 移送しました。`,
      };
    }

    const defender = this.getPlayer(cell.ownerId);
    if (!defender) {
      return { ok: false, message: '防衛側データの取得に失敗しました。' };
    }
    current.actionPoints -= 1;
    current.gold -= 10;
    const support = this.getNeighbors(cell.x, cell.y).filter((neighbor) => neighbor.ownerId === current.id).length;
    const attackPower = current.military + support * 4 + current.influence * 0.4 + Math.random() * 12;
    const defensePower = defender.military + (cell.population / 40) + cell.defenseBonus * 35 + Math.random() * 12;

    if (attackPower > defensePower) {
      cell.ownerId = current.id;
      cell.population = Math.max(30, Math.floor(cell.population * 0.72));
      cell.dissatisfaction = Math.min(1, cell.dissatisfaction + 0.2);
      current.military = Math.max(1, current.military - 1);
      defender.military = Math.max(1, defender.military - Math.max(1, Math.floor(2 + cell.defenseBonus * 3)));
      return { ok: true, message: `⚔️ ${current.name} が ${cell.x},${cell.y} を制圧しました。` };
    }

    cell.population = Math.max(0, cell.population - 25);
    current.military = Math.max(1, current.military - 2);
    return { ok: true, message: `🛡️ ${defender.name} が防衛成功。${current.name} の攻撃は退けられました。` };
  }

  runAiActionsForTurn(): string[] {
    if (!this.rules.aiAutoAction) return [];
    const logs: string[] = [];
    const previousPlayer = this.currentPlayerId;
    const previousSelection = this.selectedCell ? { ...this.selectedCell } : null;
    const previousBuildType = this.selectedBuildType;

    for (const player of this.players) {
      if (player.isHuman) continue;
      if (player.actionPoints <= 0) continue;

      this.currentPlayerId = player.id;
      const priorities = this.getAiActionPriorities(player.aiBehavior);
      while (player.actionPoints > 0) {
        let acted = false;
        const ownedCells = this.getOwnedCells(player.id);
        for (const action of priorities) {
          const result = this.tryExecuteAiAction(player, action, ownedCells, player.aiBehavior);
          if (result.ok) {
            logs.push(`AI(${this.getAiBehaviorLabel(player.aiBehavior)}) ${player.icon}${player.name}: ${result.message}`);
            acted = true;
            break;
          }
        }
        if (!acted) {
          break;
        }
      }
    }

    this.currentPlayerId = previousPlayer;
    this.selectedCell = previousSelection;
    this.selectedBuildType = previousBuildType;
    return logs;
  }

  private getAiActionPriorities(behavior: AiBehavior): PlayerAction[] {
    if (behavior === 'aggressive') {
      return ['attack', 'claim', 'build', 'logistics'];
    }
    if (behavior === 'economic') {
      return ['build', 'logistics', 'claim', 'attack'];
    }
    return ['claim', 'build', 'attack', 'logistics'];
  }

  private getAiBehaviorLabel(behavior: AiBehavior): string {
    if (behavior === 'aggressive') return '好戦型';
    if (behavior === 'economic') return '内政型';
    return '標準型';
  }

  private tryExecuteAiAction(player: Player, action: PlayerAction, ownedCells: Cell[], behavior: AiBehavior): { ok: boolean; message: string } {
    if (ownedCells.length === 0) {
      return { ok: false, message: '保有セルなし' };
    }

    if (action === 'attack') {
      for (const base of ownedCells) {
        const enemies = this.getNeighbors(base.x, base.y).filter((n) => n.ownerId !== null && n.ownerId !== player.id);
        if (enemies.length > 0) {
          this.selectedCell = { x: enemies[0].x, y: enemies[0].y };
          return this.executePlayerAction('attack');
        }
      }
      return { ok: false, message: '攻撃対象なし' };
    }

    if (action === 'claim') {
      for (const base of ownedCells) {
        const claimable = this.getNeighbors(base.x, base.y).filter((n) => n.ownerId !== player.id);
        if (claimable.length > 0) {
          this.selectedCell = { x: claimable[0].x, y: claimable[0].y };
          return this.executePlayerAction('claim');
        }
      }
      return { ok: false, message: '編入対象なし' };
    }

    if (action === 'build') {
      const developmentCell = this.selectAiBuildCell(ownedCells, behavior);
      this.selectedCell = { x: developmentCell.x, y: developmentCell.y };
      this.selectedBuildType = this.selectAiBuildType(developmentCell, behavior);
      return this.executePlayerAction('build');
    }

    const supplyCell = [...ownedCells].sort((a, b) => (b.stocks.food + b.stocks.water) - (a.stocks.food + a.stocks.water))[0];
    this.selectedCell = { x: supplyCell.x, y: supplyCell.y };
    return this.executePlayerAction('logistics');
  }

  private getBuildCost(cell: Cell, type: BuildingType): { gold: number; influence: number; actionPoints: number } {
    const base = BUILDING_SPECS[type];
    const currentTypeLevel = cell.buildings[type];
    const occupiedSlots = getOccupiedBuildingSlots(cell);
    const openingNewSlot = currentTypeLevel === 0;
    const levelScale = 1 + currentTypeLevel * 0.45;
    const slotScale = openingNewSlot ? (1 + Math.max(0, occupiedSlots - 1) * 0.2) : 1;
    const benefitScore =
      base.populationBoost / 75 +
      base.foodBoost / 26 +
      base.waterBoost / 24 +
      base.woodBoost / 20 +
      base.toolBoost / 16 +
      base.militaryBoost * 0.5 +
      base.cultureBoost / 14 +
      base.dissatisfactionRelief * 20;
    const benefitScale = 0.78 + benefitScore * 0.08;
    const actionPointScale = 1 + currentTypeLevel * 0.25 + (openingNewSlot ? 0.2 : 0);
    return {
      gold: Math.ceil(base.goldCost * levelScale * slotScale * benefitScale),
      influence: Math.ceil(base.influenceCost * levelScale * slotScale * benefitScale),
      actionPoints: Math.max(1, Math.min(4, Math.ceil(base.actionPointCost * actionPointScale))),
    };
  }

  private selectAiBuildType(cell: Cell, behavior: AiBehavior): BuildingType {
    if (behavior === 'aggressive') return 'fortress';
    if (behavior === 'economic') {
      const capRatio = cell.population / Math.max(1, getEffectivePopulationCap(cell));
      if (capRatio > 0.82) return 'residential';
      if (cell.logisticsBonus < 0.5) return 'logistics';
      if (cell.economicBonus < 0.6) return 'market';
      return 'production';
    }
    if (cell.population > getEffectivePopulationCap(cell) * 0.76) return 'residential';
    if (cell.humanitiesBonus < 0.3 && cell.dissatisfaction > 0.25) return 'culture';
    if (cell.logisticsBonus < 0.45) return 'logistics';
    if (cell.economicBonus < 0.55) return 'market';
    return 'production';
  }

  private selectAiBuildCell(ownedCells: Cell[], behavior: AiBehavior): Cell {
    if (behavior === 'aggressive') {
      return [...ownedCells].sort((a, b) => this.countEnemyNeighbors(b) - this.countEnemyNeighbors(a))[0];
    }
    if (behavior === 'economic') {
      return [...ownedCells].sort((a, b) => {
        const ar = a.population / Math.max(1, getEffectivePopulationCap(a));
        const br = b.population / Math.max(1, getEffectivePopulationCap(b));
        return br - ar;
      })[0];
    }
    return [...ownedCells].sort((a, b) => a.buildingLevel - b.buildingLevel)[0];
  }

  private countEnemyNeighbors(cell: Cell): number {
    return this.getNeighbors(cell.x, cell.y).filter((n) => n.ownerId !== null && n.ownerId !== cell.ownerId).length;
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
            if (distance <= 1 && cell.buildings.residential === 0) {
              cell.buildings.residential = 1;
              if (distance === 0) {
                cell.buildings.production = 1;
                cell.buildings.market = 1;
              }
              applyBuildingProfile(cell);
              cell.population = Math.max(cell.population, distance === 0 ? 180 : 70);
              cell.stocks.food += distance === 0 ? 90 : 35;
              cell.stocks.water += distance === 0 ? 70 : 28;
              cell.stocks.wood += distance === 0 ? 55 : 22;
              cell.stocks.tools += distance === 0 ? 30 : 12;
            }
          }
        }
      }
      const center = this.getCell(seed.x, seed.y);
      if (center) {
        center.ownerId = player.id;
        center.buildings.residential = Math.max(1, center.buildings.residential);
        center.buildings.production = Math.max(1, center.buildings.production);
        center.buildings.market = Math.max(1, center.buildings.market);
        applyBuildingProfile(center);
        center.population = Math.max(center.population, 200);
        center.stocks.food = Math.max(center.stocks.food, 120);
        center.stocks.water = Math.max(center.stocks.water, 90);
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

function logisticsStockLabel(stock: 'food' | 'water' | 'wood' | 'tools'): string {
  if (stock === 'food') return '食料';
  if (stock === 'water') return '水';
  if (stock === 'wood') return '木材';
  return '工具';
}
