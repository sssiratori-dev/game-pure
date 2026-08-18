// ===== コントロールパネル =====

import { World } from '../core/world';
import type { AdvancedTuning, AlgorithmTuning, PlayerAction, PlayerAssets } from '../core/world';
import { BUILDING_LABELS, BUILDING_SPECS } from '../core/cell';
import { advanceTurn } from '../core/loop';
import { Renderer, communityColorById } from './renderer';
import type { ViewMode } from './renderer';
import { estimateConsumption } from '../systems/consumption';
import { estimateProduction } from '../systems/production';

interface FactionSnapshot {
  id: string;
  name: string;
  icon: string;
  territory: number;
  food: number;
  water: number;
  wood: number;
  tools: number;
  gold: number;
}

export class Controls {
  private world: World;
  private renderer: Renderer;
  private autoRunInterval: ReturnType<typeof setInterval> | null = null;
  private onTurnAdvanced: () => void;
  private container: HTMLElement | null = null;
  private currentMode: ViewMode = 'terrain';
  private turnDiffLogs: string[] = [];
  private actionHistory: string[] = [];
  private coordinateLogs: string[] = [];

  constructor(
    world: World,
    renderer: Renderer,
    container: HTMLElement,
    onTurnAdvanced: () => void,
  ) {
    this.world = world;
    this.renderer = renderer;
    this.onTurnAdvanced = onTurnAdvanced;
    this.buildUI(container);
  }

  private buildUI(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = `
      <div class="tab-strip">
        <button class="tab-btn active" data-tab="stats">統計</button>
        <button class="tab-btn" data-tab="map">地図</button>
        <button class="tab-btn" data-tab="actions">操作</button>
        <button class="tab-btn" data-tab="settings">設定</button>
      </div>

      <div id="panel-stats" class="tab-panel active">
        <div class="controls-row">
          <button id="btn-next" class="btn-primary">▶ 次のターン</button>
          <button id="btn-auto" class="btn-secondary">⏩ 自動実行</button>
          <button id="btn-stop" class="btn-danger" disabled>⏹ 停止</button>
          <span id="turn-display" class="turn-display">ターン: 0</span>
        </div>
        <div class="controls-row player-row">
          <span>現在の操作勢力:</span>
          <span id="player-display" class="player-display">-</span>
        </div>
        <div id="player-summary" class="player-summary"></div>
        <div class="ap-visual">
          <label>行動力</label>
          <div id="action-points-bar" class="ap-segments"></div>
        </div>
        <div class="mini-panel">
          <h3>現在勢力の資産グラフ</h3>
          <div id="asset-chart"></div>
        </div>
        <div class="mini-panel">
          <h3>勢力別資産</h3>
          <div id="faction-assets"></div>
        </div>
        <div class="mini-panel">
          <h3>資産の増減ログ（ターン差分）</h3>
          <div id="asset-diff-log" class="asset-diff-log"></div>
        </div>
      </div>

      <div id="panel-map" class="tab-panel">
        <div class="mini-panel">
          <h3>地図状況</h3>
          <div class="mini-stat"><span>対象セル</span><strong id="selected-cell-label">未選択</strong></div>
          <div class="mini-stat"><span>表示モード</span><strong id="active-mode-label">地形</strong></div>
          <div class="mini-stat"><span>支配勢力数</span><strong>${this.world.players.length}</strong></div>
          <div class="mini-stat"><span>アクティブ地域</span><strong id="active-region-label">未選択</strong></div>
        </div>
        <div class="mini-panel">
          <h3>表示モード凡例</h3>
          <div id="mode-legend" class="mode-legend"></div>
        </div>
        <div class="mini-panel">
          <h3>施設凡例</h3>
          <div id="building-legend" class="mode-legend"></div>
        </div>
        <div class="mini-panel">
          <h3>用語・指標の詳細</h3>
          <div id="mode-detail" class="mode-detail"></div>
        </div>
        <div class="mini-panel">
          <h3>計算理論サマリ</h3>
          <div id="algorithm-summary" class="mode-detail"></div>
        </div>
        <div class="mini-panel">
          <h3>選択セルの計算ビジュアライズ</h3>
          <div id="calc-visualization" class="mode-detail"></div>
        </div>
        <div class="mini-panel">
          <h3>座標ログ</h3>
          <div id="coordinate-log" class="asset-diff-log"></div>
        </div>
      </div>

      <div id="panel-actions" class="tab-panel">
        <div class="controls-row">
          <label>速度:
            <input type="range" id="speed-slider" min="100" max="2000" step="100" value="500">
            <span id="speed-label">500ms/ターン</span>
          </label>
        </div>
        <div class="controls-row">
          <label for="build-type-select">建設種別:</label>
          <select id="build-type-select" class="build-type-select">
            <option value="residential">🏘️ 居住区</option>
            <option value="logistics">🛤️ 物流路</option>
            <option value="fortress">🏰 攻撃拠点</option>
            <option value="production">🏭 生産設備</option>
            <option value="market">🏪 マーケット</option>
            <option value="culture">🏛️ 文化施設</option>
          </select>
        </div>
        <div class="controls-row action-row">
          <button class="btn-action" data-action="build">🏗 建設</button>
          <button class="btn-action" data-action="claim">🧭 編入</button>
          <button class="btn-action" data-action="attack">⚔ 攻撃</button>
          <button class="btn-action" data-action="logistics">🚚 物流移送</button>
        </div>
        <div class="controls-row">
          <label for="logistics-resource-select">物流資源:</label>
          <select id="logistics-resource-select" class="build-type-select">
            <option value="food">食料</option>
            <option value="water">水</option>
            <option value="wood">木材</option>
            <option value="tools">工具</option>
          </select>
          <label for="logistics-amount-range">移送量:</label>
          <input id="logistics-amount-range" type="range" min="10" max="200" step="10" value="40">
          <span id="logistics-amount-label">40</span>
        </div>
        <div class="mini-panel">
          <h3>建設コスト（基準）</h3>
          <div id="build-cost-table" class="asset-diff-log"></div>
        </div>
        <div id="action-state" class="mini-panel action-state"></div>
        <div id="action-notice" class="action-notice">セルを選択してアクションを実行してください。</div>
        <div class="mini-panel">
          <h3>行動履歴</h3>
          <div id="action-history" class="asset-diff-log"></div>
        </div>
        <div class="controls-row view-modes">
          <span>表示モード:</span>
          <button class="view-btn active" data-mode="terrain">地形</button>
          <button class="view-btn" data-mode="community">コミュニティ</button>
          <button class="view-btn" data-mode="player">プレイヤー</button>
          <button class="view-btn" data-mode="facility">施設</button>
          <button class="view-btn" data-mode="population">人口</button>
          <button class="view-btn" data-mode="food">食料</button>
          <button class="view-btn" data-mode="water">水</button>
          <button class="view-btn" data-mode="dissatisfaction">不満度</button>
        </div>
      </div>

      <div id="panel-settings" class="tab-panel">
        <div class="mini-panel">
          <h3>プレイヤー設定</h3>
          <div class="settings-row">
            <label for="control-faction-select">操作勢力</label>
            <select id="control-faction-select"></select>
          </div>
          <div id="faction-settings-list"></div>
        </div>
        <div class="mini-panel">
          <h3>進行ルール</h3>
          <div class="settings-row settings-row-inline">
            <label for="rule-auto-rotate">ターンごとに操作勢力を自動ローテーション</label>
            <input id="rule-auto-rotate" type="checkbox">
          </div>
          <div class="settings-row settings-row-inline">
            <label for="rule-ai-action">AI勢力の自動アクション</label>
            <input id="rule-ai-action" type="checkbox">
          </div>
          <div class="settings-row settings-row-inline">
            <label for="rule-logistics-enabled">自然物流を有効化</label>
            <input id="rule-logistics-enabled" type="checkbox">
          </div>
          <div class="settings-row">
            <label for="rule-logistics-rate">自然物流レート</label>
            <div class="settings-row-inline">
              <input id="rule-logistics-rate" type="range" min="0" max="20" step="1">
              <span id="rule-logistics-rate-label">2%</span>
            </div>
          </div>
        </div>
        <div class="mini-panel">
          <h3>マスターモード（アルゴリズム調整）</h3>
          <div class="settings-row settings-row-inline">
            <label for="master-mode-toggle">マスターモード有効化</label>
            <input id="master-mode-toggle" type="checkbox">
          </div>
          ${this.renderTuningControl('consumption', '消費係数')}
          ${this.renderTuningControl('production', '生産係数')}
          ${this.renderTuningControl('movement', '移動係数')}
          ${this.renderTuningControl('humanities', '人文係数')}
        </div>
        <div class="mini-panel">
          <h3>詳細パラメータ調整（補正）</h3>
          ${this.renderAdvancedTuningControl('phiLanguageWeight', '言語補正 Φ_lang')}
          ${this.renderAdvancedTuningControl('phiTerrainWeight', '地形補正 Φ_terrain')}
          ${this.renderAdvancedTuningControl('phiCivilizationWeight', '文明補正 Φ_civ')}
          ${this.renderAdvancedTuningControl('baseFoodPerPerson', '食料消費係数')}
          ${this.renderAdvancedTuningControl('baseWaterPerPerson', '水消費係数')}
          ${this.renderAdvancedTuningControl('baseWoodPerPerson', '木材消費係数')}
          ${this.renderAdvancedTuningControl('naturalFoodRate', '自然食料生産係数')}
          ${this.renderAdvancedTuningControl('naturalWaterRate', '自然水生産係数')}
          ${this.renderAdvancedTuningControl('naturalWoodRate', '自然木材生産係数')}
          ${this.renderAdvancedTuningControl('humanFoodRate', '人口食料生産係数')}
          ${this.renderAdvancedTuningControl('humanToolRate', '人口工具生産係数')}
          ${this.renderAdvancedTuningControl('tradeRate', '自然物流レート補正')}
          ${this.renderAdvancedTuningControl('migrationRate', '移住レート補正')}
          ${this.renderAdvancedTuningControl('movementCarryRate', '移住時持参率補正')}
          ${this.renderAdvancedTuningControl('culturalConvergenceRate', '文化収斂補正')}
          ${this.renderAdvancedTuningControl('historicalContinuityRate', '歴史継続性補正')}
          ${this.renderAdvancedTuningControl('culturalPressureRate', '異文化圧力補正')}
          ${this.renderAdvancedTuningControl('dissatisfactionRecoveryRate', '不満回復補正')}
          ${this.renderAdvancedTuningControl('upkeepGoldRate', '維持費(金)補正')}
          ${this.renderAdvancedTuningControl('upkeepActionPointRate', '維持費(AP)補正')}
        </div>
      </div>
    `;

    document.getElementById('btn-next')!.addEventListener('click', () => this.doTurn());
    const btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    const slider = document.getElementById('speed-slider') as HTMLInputElement;
    const speedLabel = document.getElementById('speed-label')!;

    btnAuto.addEventListener('click', () => {
      const ms = parseInt(slider.value, 10);
      this.autoRunInterval = setInterval(() => this.doTurn(), ms);
      btnAuto.disabled = true;
      btnStop.disabled = false;
    });

    btnStop.addEventListener('click', () => {
      if (this.autoRunInterval !== null) clearInterval(this.autoRunInterval);
      this.autoRunInterval = null;
      btnAuto.disabled = false;
      btnStop.disabled = true;
    });

    slider.addEventListener('input', () => {
      speedLabel.textContent = `${slider.value}ms/ターン`;
      if (this.autoRunInterval !== null) {
        clearInterval(this.autoRunInterval);
        this.autoRunInterval = setInterval(() => this.doTurn(), parseInt(slider.value, 10));
      }
    });

    container.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.action as PlayerAction;
        const actor = this.world.getCurrentPlayer();
        const selected = this.world.getSelectedCell();
        const result = this.world.executePlayerAction(action);
        const notice = document.getElementById('action-notice');
        if (notice) {
          notice.textContent = result.message;
          notice.dataset.state = result.ok ? 'ok' : 'error';
        }
        this.pushActionHistory(actor ? `${actor.icon} ${actor.name}` : '不明勢力', action, selected ? `(${selected.x},${selected.y})` : '(未選択)', result.message);
        this.refreshPanel();
        this.renderer.draw(this.world);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        container.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        button.classList.add('active');
        container.querySelectorAll('.tab-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.id === `panel-${tab}`);
        });
      });
    });

    container.querySelectorAll<HTMLButtonElement>('.view-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.mode as ViewMode;
        this.currentMode = mode;
        this.renderer.setViewMode(mode);
        this.renderer.draw(this.world);
        container.querySelectorAll('.view-btn').forEach((b) => b.classList.remove('active'));
        button.classList.add('active');
        const modeLabel = document.getElementById('active-mode-label');
        if (modeLabel) modeLabel.textContent = this.getModeLabel(mode);
        this.renderMapStatus();
      });
    });

    const controlFactionSelect = document.getElementById('control-faction-select') as HTMLSelectElement;
    controlFactionSelect.addEventListener('change', () => {
      this.world.switchControlPlayer(controlFactionSelect.value);
      this.pushActionHistory('システム', 'claim', '-', `操作勢力を変更: ${this.world.getCurrentPlayer()?.name ?? '不明'}`);
      this.refreshPanel();
      this.renderer.draw(this.world);
    });

    const masterModeToggle = document.getElementById('master-mode-toggle') as HTMLInputElement;
    masterModeToggle.addEventListener('change', () => {
      this.world.setMasterModeEnabled(masterModeToggle.checked);
      this.refreshPanel();
    });

    const ruleAutoRotate = document.getElementById('rule-auto-rotate') as HTMLInputElement;
    ruleAutoRotate.addEventListener('change', () => {
      this.world.updateRules({ autoRotateControl: ruleAutoRotate.checked });
      this.refreshPanel();
    });

    const ruleAiAction = document.getElementById('rule-ai-action') as HTMLInputElement;
    ruleAiAction.addEventListener('change', () => {
      this.world.updateRules({ aiAutoAction: ruleAiAction.checked });
      this.refreshPanel();
    });

    const ruleLogisticsEnabled = document.getElementById('rule-logistics-enabled') as HTMLInputElement;
    ruleLogisticsEnabled.addEventListener('change', () => {
      this.world.updateRules({ logisticsEnabled: ruleLogisticsEnabled.checked });
      this.refreshPanel();
    });

    const ruleLogisticsRate = document.getElementById('rule-logistics-rate') as HTMLInputElement;
    const ruleLogisticsRateLabel = document.getElementById('rule-logistics-rate-label');
    ruleLogisticsRate.addEventListener('input', () => {
      const value = parseInt(ruleLogisticsRate.value, 10) / 100;
      this.world.updateRules({ logisticsEqualizationRate: value });
      if (ruleLogisticsRateLabel) {
        ruleLogisticsRateLabel.textContent = `${Math.round(value * 100)}%`;
      }
      this.refreshPanel();
    });

    const buildTypeSelect = document.getElementById('build-type-select') as HTMLSelectElement;
    buildTypeSelect.addEventListener('change', () => {
      if (
        buildTypeSelect.value === 'residential' ||
        buildTypeSelect.value === 'logistics' ||
        buildTypeSelect.value === 'fortress' ||
        buildTypeSelect.value === 'production' ||
        buildTypeSelect.value === 'market' ||
        buildTypeSelect.value === 'culture'
      ) {
        this.world.setSelectedBuildType(buildTypeSelect.value);
      }
      this.refreshPanel();
    });

    const logisticsResourceSelect = document.getElementById('logistics-resource-select') as HTMLSelectElement;
    const logisticsAmountRange = document.getElementById('logistics-amount-range') as HTMLInputElement;
    const updateLogisticsPlan = () => {
      const amount = parseInt(logisticsAmountRange.value, 10);
      if (
        logisticsResourceSelect.value === 'food' ||
        logisticsResourceSelect.value === 'water' ||
        logisticsResourceSelect.value === 'wood' ||
        logisticsResourceSelect.value === 'tools'
      ) {
        this.world.setLogisticsPlan(logisticsResourceSelect.value, amount);
      }
      const label = document.getElementById('logistics-amount-label');
      if (label) label.textContent = `${amount}`;
      this.refreshPanel();
    };
    logisticsResourceSelect.addEventListener('change', updateLogisticsPlan);
    logisticsAmountRange.addEventListener('input', updateLogisticsPlan);

    this.bindTuningSlider('consumption');
    this.bindTuningSlider('production');
    this.bindTuningSlider('movement');
    this.bindTuningSlider('humanities');
    this.bindAdvancedTuningSlider('phiLanguageWeight');
    this.bindAdvancedTuningSlider('phiTerrainWeight');
    this.bindAdvancedTuningSlider('phiCivilizationWeight');
    this.bindAdvancedTuningSlider('baseFoodPerPerson');
    this.bindAdvancedTuningSlider('baseWaterPerPerson');
    this.bindAdvancedTuningSlider('baseWoodPerPerson');
    this.bindAdvancedTuningSlider('naturalFoodRate');
    this.bindAdvancedTuningSlider('naturalWaterRate');
    this.bindAdvancedTuningSlider('naturalWoodRate');
    this.bindAdvancedTuningSlider('humanFoodRate');
    this.bindAdvancedTuningSlider('humanToolRate');
    this.bindAdvancedTuningSlider('tradeRate');
    this.bindAdvancedTuningSlider('migrationRate');
    this.bindAdvancedTuningSlider('movementCarryRate');
    this.bindAdvancedTuningSlider('culturalConvergenceRate');
    this.bindAdvancedTuningSlider('historicalContinuityRate');
    this.bindAdvancedTuningSlider('culturalPressureRate');
    this.bindAdvancedTuningSlider('dissatisfactionRecoveryRate');
    this.bindAdvancedTuningSlider('upkeepGoldRate');
    this.bindAdvancedTuningSlider('upkeepActionPointRate');

    const factionSettings = document.getElementById('faction-settings-list');
    factionSettings?.addEventListener('change', (event) => {
      const target = event.target as HTMLElement;
      const playerId = target.getAttribute('data-player-id');
      if (!playerId) return;

      if (target instanceof HTMLInputElement && target.dataset.field === 'icon') {
        this.world.updatePlayerProfile(playerId, { icon: target.value });
      }
      if (target instanceof HTMLSelectElement && target.dataset.field === 'mode') {
        this.world.updatePlayerProfile(playerId, { isHuman: target.value === 'human' });
      }
      if (target instanceof HTMLSelectElement && target.dataset.field === 'ai-behavior') {
        if (target.value === 'balanced' || target.value === 'aggressive' || target.value === 'economic') {
          this.world.updatePlayerProfile(playerId, { aiBehavior: target.value });
        }
      }
      if (target instanceof HTMLInputElement && target.dataset.field === 'name') {
        this.world.updatePlayerProfile(playerId, { name: target.value });
      }
      this.refreshPanel();
      this.renderer.draw(this.world);
    });

    window.addEventListener('world:selected-cell', () => {
      const selected = this.world.getSelectedCell();
      if (selected) {
        this.coordinateLogs.unshift(`T${this.world.turn} (${selected.x}, ${selected.y})`);
        this.coordinateLogs = this.coordinateLogs.slice(0, 30);
      }
      this.refreshPanel();
    });

    this.refreshPanel();
  }

  private renderTuningControl(key: keyof AlgorithmTuning, label: string): string {
    return `
      <div class="settings-row">
        <label for="tuning-${key}">${label}</label>
        <div class="settings-row-inline">
          <input id="tuning-${key}" data-tuning="${key}" type="range" min="0" max="300" step="10" value="100">
          <span id="tuning-${key}-label">1.0x</span>
        </div>
      </div>
    `;
  }

  private renderAdvancedTuningControl(key: keyof AdvancedTuning, label: string): string {
    return `
      <div class="settings-row">
        <label for="advanced-${key}">${label}</label>
        <div class="settings-row-inline">
          <input id="advanced-${key}" data-advanced-tuning="${key}" type="range" min="20" max="300" step="5" value="100">
          <span id="advanced-${key}-label">1.00x</span>
        </div>
      </div>
    `;
  }

  private bindTuningSlider(key: keyof AlgorithmTuning): void {
    const slider = document.getElementById(`tuning-${key}`) as HTMLInputElement | null;
    const label = document.getElementById(`tuning-${key}-label`) as HTMLElement | null;
    if (!slider || !label) return;
    slider.addEventListener('input', () => {
      const value = parseInt(slider.value, 10) / 100;
      this.world.setAlgorithmTuning({ [key]: value });
      label.textContent = `${value.toFixed(1)}x`;
      this.refreshPanel();
    });
  }

  private bindAdvancedTuningSlider(key: keyof AdvancedTuning): void {
    const slider = document.getElementById(`advanced-${key}`) as HTMLInputElement | null;
    const label = document.getElementById(`advanced-${key}-label`) as HTMLElement | null;
    if (!slider || !label) return;
    slider.addEventListener('input', () => {
      const value = parseInt(slider.value, 10) / 100;
      this.world.setAdvancedTuning({ [key]: value });
      label.textContent = `${value.toFixed(2)}x`;
      this.refreshPanel();
      this.renderer.draw(this.world);
    });
  }

  private getModeLabel(mode: ViewMode): string {
    const labels: Record<ViewMode, string> = {
      terrain: '地形',
      community: 'コミュニティ',
      player: 'プレイヤー',
      facility: '施設',
      population: '人口',
      food: '食料',
      water: '水',
      dissatisfaction: '不満度',
    };
    return labels[mode];
  }

  private getAiBehaviorLabel(behavior: 'balanced' | 'aggressive' | 'economic'): string {
    if (behavior === 'aggressive') return '好戦型';
    if (behavior === 'economic') return '内政型';
    return '標準型';
  }

  private refreshPanel(): void {
    const current = this.world.getCurrentPlayer();
    if (!current) return;

    const turnLabel = document.getElementById('turn-display');
    if (turnLabel) turnLabel.textContent = `ターン: ${this.world.turn}`;

    const playerDisplay = document.getElementById('player-display');
    if (playerDisplay) {
      const modeLabel = current.isHuman ? '人間' : `AI-${this.getAiBehaviorLabel(current.aiBehavior)}`;
      playerDisplay.textContent = `${current.icon} ${current.name} (${modeLabel})`;
    }

    const currentAssets = this.world.getPlayerAssets(current.id);
    this.renderPlayerSummary(currentAssets);
    this.renderCurrentPlayerAssetChart(currentAssets);
    this.renderActionPoints(current.actionPoints, current.maxActionPoints);
    this.renderFactionAssets();
    this.renderDiffLog();
    this.renderActionHistory();
    this.renderMapStatus();
    this.renderAlgorithmSummary();
    this.renderCalculationVisualization();
    this.renderActionAvailability();
    this.renderSettingsPanel();
  }

  private renderPlayerSummary(currentAssets: PlayerAssets): void {
    const current = this.world.getCurrentPlayer();
    const playerSummary = document.getElementById('player-summary');
    if (!playerSummary || !current) return;
    playerSummary.innerHTML = `
      <div class="player-summary-grid">
        <span>領域</span><strong>${currentAssets.territory}</strong>
        <span>人口</span><strong>${Math.round(currentAssets.population)}</strong>
        <span>食料</span><strong>${Math.round(currentAssets.food)}</strong>
        <span>水</span><strong>${Math.round(currentAssets.water)}</strong>
        <span>木材</span><strong>${Math.round(currentAssets.wood)}</strong>
        <span>工具</span><strong>${Math.round(currentAssets.tools)}</strong>
        <span>金</span><strong>${Math.round(current.gold)}</strong>
        <span>軍事</span><strong>${Math.round(current.military)}</strong>
      </div>
    `;
  }

  private renderCurrentPlayerAssetChart(currentAssets: PlayerAssets): void {
    const current = this.world.getCurrentPlayer();
    const chart = document.getElementById('asset-chart');
    if (!chart || !current) return;
    const allAssets = this.world.getAllPlayerAssets();
    const maxFood = Math.max(1, ...allAssets.map((x) => x.assets.food));
    const maxWater = Math.max(1, ...allAssets.map((x) => x.assets.water));
    const maxWood = Math.max(1, ...allAssets.map((x) => x.assets.wood));
    const maxTools = Math.max(1, ...allAssets.map((x) => x.assets.tools));
    const maxGold = Math.max(1, ...this.world.players.map((x) => x.gold));
    const maxMilitary = Math.max(1, ...this.world.players.map((x) => x.military));

    const bars = [
      { label: '食料', value: currentAssets.food, max: maxFood },
      { label: '水', value: currentAssets.water, max: maxWater },
      { label: '木材', value: currentAssets.wood, max: maxWood },
      { label: '工具', value: currentAssets.tools, max: maxTools },
      { label: '資金', value: current.gold, max: maxGold },
      { label: '軍事', value: current.military, max: maxMilitary },
    ];

    chart.innerHTML = bars.map((bar) => {
      const pct = Math.max(4, Math.min(100, (bar.value / bar.max) * 100));
      return `
        <div class="asset-bar-row">
          <span class="asset-bar-label">${bar.label}</span>
          <div class="asset-bar-track"><div class="asset-bar-fill" style="width:${pct}%"></div></div>
          <strong class="asset-bar-value">${Math.round(bar.value)}</strong>
        </div>
      `;
    }).join('');
  }

  private renderActionPoints(actionPoints: number, maxActionPoints: number): void {
    const apBar = document.getElementById('action-points-bar');
    if (!apBar) return;
    const segments: string[] = [];
    for (let i = 0; i < maxActionPoints; i++) {
      segments.push(`<span class="ap-segment ${i < actionPoints ? 'active' : ''}"></span>`);
    }
    apBar.innerHTML = segments.join('');
  }

  private renderFactionAssets(): void {
    const assetsList = document.getElementById('faction-assets');
    if (!assetsList) return;
    assetsList.innerHTML = this.world.getAllPlayerAssets().map(({ player, assets }) => `
      <div class="faction-asset-row">
        <span class="faction-name" style="color:${player.color}">${player.icon} ${player.name}</span>
        <span>領:${assets.territory}</span>
        <span>食:${Math.round(assets.food)}</span>
        <span>水:${Math.round(assets.water)}</span>
        <span>資金:${Math.round(player.gold)}</span>
      </div>
    `).join('');
  }

  private renderDiffLog(): void {
    const diffLogEl = document.getElementById('asset-diff-log');
    if (!diffLogEl) return;
    if (this.turnDiffLogs.length === 0) {
      diffLogEl.innerHTML = '<div class="diff-log-entry empty">まだターン差分ログはありません。</div>';
      return;
    }
    diffLogEl.innerHTML = this.turnDiffLogs.map((entry) => `<div class="diff-log-entry">${entry}</div>`).join('');
  }

  private renderActionHistory(): void {
    const historyEl = document.getElementById('action-history');
    if (!historyEl) return;
    if (this.actionHistory.length === 0) {
      historyEl.innerHTML = '<div class="diff-log-entry empty">まだ行動履歴はありません。</div>';
      return;
    }
    historyEl.innerHTML = this.actionHistory.map((entry) => `<div class="diff-log-entry">${entry}</div>`).join('');
  }

  private renderMapStatus(): void {
    const selectedCell = this.world.getSelectedCell();
    const selectedCellLabel = document.getElementById('selected-cell-label');
    if (selectedCellLabel) {
      selectedCellLabel.textContent = selectedCell ? `(${selectedCell.x}, ${selectedCell.y})` : '未選択';
    }
    const activeModeLabel = document.getElementById('active-mode-label');
    if (activeModeLabel) {
      activeModeLabel.textContent = this.getModeLabel(this.currentMode);
    }

    const activeRegionLabel = document.getElementById('active-region-label');
    if (activeRegionLabel) {
      if (!selectedCell) {
        activeRegionLabel.textContent = '未選択';
      } else if (selectedCell.ownerId) {
        const owner = this.world.getPlayer(selectedCell.ownerId);
        const count = this.world.getOwnedCells(selectedCell.ownerId).length;
        activeRegionLabel.textContent = owner ? `${owner.icon} ${owner.name} (${count}セル)` : `${count}セル`;
      } else if (selectedCell.communityId >= 0) {
        const count = this.world.allCells().filter((cell) => cell.communityId === selectedCell.communityId).length;
        activeRegionLabel.textContent = `コミュニティ #${selectedCell.communityId} (${count}セル)`;
      } else {
        activeRegionLabel.textContent = '単独セル';
      }
    }

    const modeLegend = document.getElementById('mode-legend');
    if (modeLegend) {
      modeLegend.innerHTML = this.getModeLegendHtml(this.currentMode);
    }
    const modeDetail = document.getElementById('mode-detail');
    if (modeDetail) {
      modeDetail.innerHTML = this.getModeDetailHtml(this.currentMode);
    }
    const buildingLegend = document.getElementById('building-legend');
    if (buildingLegend) {
      buildingLegend.innerHTML = this.getBuildingLegendHtml();
    }
    const coordinateLog = document.getElementById('coordinate-log');
    if (coordinateLog) {
      coordinateLog.innerHTML = this.coordinateLogs.length === 0
        ? '<div class="diff-log-entry empty">セル選択で座標ログが追加されます。</div>'
        : this.coordinateLogs.map((entry) => `<div class="diff-log-entry">${entry}</div>`).join('');
    }
  }

  private renderAlgorithmSummary(): void {
    const target = document.getElementById('algorithm-summary');
    if (!target) return;
    const adv = this.world.advancedTuning;
    target.innerHTML = `
      <div class="detail-card">
        <strong>コアループ</strong>
        <p>1ターンは 消費→生産→移動→人文 の順に計算。マスターモード係数で各フェーズの実行強度を調整します。</p>
      </div>
      <div class="detail-card">
        <strong>基本式</strong>
        <p>資源更新: S' = max(0, S + ΔS)。統合補正: Φ = clamp(Φ_lang × Φ_terrain × Φ_civ)。</p>
      </div>
      <div class="detail-card">
        <strong>現在の主要補正</strong>
        <p>Φ(lang/terrain/civ)= ${adv.phiLanguageWeight.toFixed(2)} / ${adv.phiTerrainWeight.toFixed(2)} / ${adv.phiCivilizationWeight.toFixed(2)}</p>
        <p>消費(food/water/wood)= ${adv.baseFoodPerPerson.toFixed(2)} / ${adv.baseWaterPerPerson.toFixed(2)} / ${adv.baseWoodPerPerson.toFixed(2)}</p>
        <p>生産(natural food/water/wood)= ${adv.naturalFoodRate.toFixed(2)} / ${adv.naturalWaterRate.toFixed(2)} / ${adv.naturalWoodRate.toFixed(2)}</p>
      </div>
    `;
  }

  private renderCalculationVisualization(): void {
    const target = document.getElementById('calc-visualization');
    if (!target) return;
    const selected = this.world.getSelectedCell();
    if (!selected) {
      target.innerHTML = '<div class="detail-card"><p>セル選択で、食料/水/木材の増減計算を数式ベースで表示します。</p></div>';
      return;
    }
    const adv = this.world.advancedTuning;
    const consumption = estimateConsumption(selected, adv);
    const production = estimateProduction(selected, adv);
    const netFood = production.naturalFood + production.humanFood + consumption.deltaFood - production.foodSpoilage;
    const netWater = production.naturalWater + consumption.deltaWater - production.waterLeak;
    const netWood = production.naturalWood + consumption.deltaWood;
    target.innerHTML = `
      <div class="detail-card">
        <strong>対象セル (${selected.x}, ${selected.y}) の試算</strong>
        <p>Φ=${consumption.phi.toFixed(3)} / 摩擦=${consumption.friction.toFixed(3)} / 需要係数=${consumption.demandScale.toFixed(3)}</p>
      </div>
      <div class="detail-card">
        <strong>食料</strong>
        <p>生産(自然+人口)= ${(production.naturalFood + production.humanFood).toFixed(1)} / 消費= ${(-consumption.deltaFood).toFixed(1)} / ロス= ${production.foodSpoilage.toFixed(1)}</p>
        <p class="${netFood >= 0 ? 'calc-positive' : 'calc-negative'}">純増減: ${netFood >= 0 ? '+' : ''}${netFood.toFixed(1)}</p>
      </div>
      <div class="detail-card">
        <strong>水</strong>
        <p>生産= ${production.naturalWater.toFixed(1)} / 消費= ${(-consumption.deltaWater).toFixed(1)} / ロス= ${production.waterLeak.toFixed(1)}</p>
        <p class="${netWater >= 0 ? 'calc-positive' : 'calc-negative'}">純増減: ${netWater >= 0 ? '+' : ''}${netWater.toFixed(1)}</p>
      </div>
      <div class="detail-card">
        <strong>木材</strong>
        <p>生産= ${production.naturalWood.toFixed(1)} / 消費= ${(-consumption.deltaWood).toFixed(1)}</p>
        <p class="${netWood >= 0 ? 'calc-positive' : 'calc-negative'}">純増減: ${netWood >= 0 ? '+' : ''}${netWood.toFixed(1)}</p>
      </div>
    `;
  }

  private renderActionAvailability(): void {
    const selectedBuildType = this.world.getSelectedBuildType();
    const costTable = document.getElementById('build-cost-table');
    if (costTable) {
      costTable.innerHTML = (Object.keys(BUILDING_SPECS) as Array<keyof typeof BUILDING_SPECS>).map((type) => {
        const spec = BUILDING_SPECS[type];
        const selected = type === selectedBuildType ? ' selected' : '';
        return `<div class="diff-log-entry${selected}">${spec.label}: 建設 AP${spec.actionPointCost} / 金${spec.goldCost} / 影響${spec.influenceCost} ｜ 維持 AP${spec.upkeepActionPoints.toFixed(1)} / 金${spec.upkeepGold}</div>`;
      }).join('') + '<div class="legend-note">同種レベルアップや空きスロット残数に応じて実コストは上昇します。維持費は毎ターン自動徴収されます。</div>';
    }

    const actionState = document.getElementById('action-state');
    if (actionState) {
      actionState.innerHTML = `
        <h3>選択アクション状態</h3>
        <div class="legend-note">物流設定: ${this.getStockLabel(this.world.getLogisticsPlan().resource)} / ${this.world.getLogisticsPlan().amount}</div>
        ${this.renderActionStateRow(`🏗 建設(${BUILDING_LABELS[selectedBuildType]})`, 'build')}
        ${this.renderActionStateRow('🧭 編入', 'claim')}
        ${this.renderActionStateRow('⚔ 攻撃', 'attack')}
        ${this.renderActionStateRow('🚚 物流移送', 'logistics')}
      `;
    }
    if (this.container) {
      this.container.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
        const action = button.dataset.action as PlayerAction;
        const status = this.world.getActionAvailability(action);
        button.disabled = !status.enabled;
        button.title = status.reason;
      });
    }
  }

  private renderSettingsPanel(): void {
    const buildTypeSelect = document.getElementById('build-type-select') as HTMLSelectElement | null;
    if (buildTypeSelect) {
      buildTypeSelect.value = this.world.getSelectedBuildType();
    }
    const logisticsResourceSelect = document.getElementById('logistics-resource-select') as HTMLSelectElement | null;
    const logisticsAmountRange = document.getElementById('logistics-amount-range') as HTMLInputElement | null;
    const logisticsAmountLabel = document.getElementById('logistics-amount-label');
    const logisticsPlan = this.world.getLogisticsPlan();
    if (logisticsResourceSelect) logisticsResourceSelect.value = logisticsPlan.resource;
    if (logisticsAmountRange) logisticsAmountRange.value = `${logisticsPlan.amount}`;
    if (logisticsAmountLabel) logisticsAmountLabel.textContent = `${logisticsPlan.amount}`;

    const controlSelect = document.getElementById('control-faction-select') as HTMLSelectElement | null;
    if (controlSelect) {
      controlSelect.innerHTML = this.world.players.map((player) => `
        <option value="${player.id}" ${player.id === this.world.currentPlayerId ? 'selected' : ''}>
          ${player.icon} ${player.name}
        </option>
      `).join('');
    }

    const settingsList = document.getElementById('faction-settings-list');
    if (settingsList) {
      settingsList.innerHTML = this.world.players.map((player) => `
        <div class="settings-player-row">
          <input data-field="icon" data-player-id="${player.id}" value="${player.icon}" maxlength="2" class="settings-icon-input">
          <input data-field="name" data-player-id="${player.id}" value="${player.name}" class="settings-name-input">
          <select data-field="mode" data-player-id="${player.id}">
            <option value="human" ${player.isHuman ? 'selected' : ''}>人間操作</option>
            <option value="ai" ${player.isHuman ? '' : 'selected'}>AI操作</option>
          </select>
          <select data-field="ai-behavior" data-player-id="${player.id}" ${player.isHuman ? 'disabled' : ''}>
            <option value="balanced" ${player.aiBehavior === 'balanced' ? 'selected' : ''}>標準型</option>
            <option value="aggressive" ${player.aiBehavior === 'aggressive' ? 'selected' : ''}>好戦型</option>
            <option value="economic" ${player.aiBehavior === 'economic' ? 'selected' : ''}>内政型</option>
          </select>
        </div>
      `).join('');
    }

    const masterModeToggle = document.getElementById('master-mode-toggle') as HTMLInputElement | null;
    if (masterModeToggle) {
      masterModeToggle.checked = this.world.masterModeEnabled;
    }

    const ruleAutoRotate = document.getElementById('rule-auto-rotate') as HTMLInputElement | null;
    if (ruleAutoRotate) {
      ruleAutoRotate.checked = this.world.rules.autoRotateControl;
    }
    const ruleAiAction = document.getElementById('rule-ai-action') as HTMLInputElement | null;
    if (ruleAiAction) {
      ruleAiAction.checked = this.world.rules.aiAutoAction;
    }
    const ruleLogisticsEnabled = document.getElementById('rule-logistics-enabled') as HTMLInputElement | null;
    if (ruleLogisticsEnabled) {
      ruleLogisticsEnabled.checked = this.world.rules.logisticsEnabled;
    }
    const ruleLogisticsRate = document.getElementById('rule-logistics-rate') as HTMLInputElement | null;
    if (ruleLogisticsRate) {
      ruleLogisticsRate.value = `${Math.round(this.world.rules.logisticsEqualizationRate * 100)}`;
      ruleLogisticsRate.disabled = !this.world.rules.logisticsEnabled;
    }
    const ruleLogisticsRateLabel = document.getElementById('rule-logistics-rate-label');
    if (ruleLogisticsRateLabel) {
      ruleLogisticsRateLabel.textContent = `${Math.round(this.world.rules.logisticsEqualizationRate * 100)}%`;
    }

    this.updateTuningLabel('consumption', this.world.algorithmTuning.consumption);
    this.updateTuningLabel('production', this.world.algorithmTuning.production);
    this.updateTuningLabel('movement', this.world.algorithmTuning.movement);
    this.updateTuningLabel('humanities', this.world.algorithmTuning.humanities);
    this.updateAdvancedTuningLabel('phiLanguageWeight', this.world.advancedTuning.phiLanguageWeight);
    this.updateAdvancedTuningLabel('phiTerrainWeight', this.world.advancedTuning.phiTerrainWeight);
    this.updateAdvancedTuningLabel('phiCivilizationWeight', this.world.advancedTuning.phiCivilizationWeight);
    this.updateAdvancedTuningLabel('baseFoodPerPerson', this.world.advancedTuning.baseFoodPerPerson);
    this.updateAdvancedTuningLabel('baseWaterPerPerson', this.world.advancedTuning.baseWaterPerPerson);
    this.updateAdvancedTuningLabel('baseWoodPerPerson', this.world.advancedTuning.baseWoodPerPerson);
    this.updateAdvancedTuningLabel('naturalFoodRate', this.world.advancedTuning.naturalFoodRate);
    this.updateAdvancedTuningLabel('naturalWaterRate', this.world.advancedTuning.naturalWaterRate);
    this.updateAdvancedTuningLabel('naturalWoodRate', this.world.advancedTuning.naturalWoodRate);
    this.updateAdvancedTuningLabel('humanFoodRate', this.world.advancedTuning.humanFoodRate);
    this.updateAdvancedTuningLabel('humanToolRate', this.world.advancedTuning.humanToolRate);
    this.updateAdvancedTuningLabel('tradeRate', this.world.advancedTuning.tradeRate);
    this.updateAdvancedTuningLabel('migrationRate', this.world.advancedTuning.migrationRate);
    this.updateAdvancedTuningLabel('movementCarryRate', this.world.advancedTuning.movementCarryRate);
    this.updateAdvancedTuningLabel('culturalConvergenceRate', this.world.advancedTuning.culturalConvergenceRate);
    this.updateAdvancedTuningLabel('historicalContinuityRate', this.world.advancedTuning.historicalContinuityRate);
    this.updateAdvancedTuningLabel('culturalPressureRate', this.world.advancedTuning.culturalPressureRate);
    this.updateAdvancedTuningLabel('dissatisfactionRecoveryRate', this.world.advancedTuning.dissatisfactionRecoveryRate);
    this.updateAdvancedTuningLabel('upkeepGoldRate', this.world.advancedTuning.upkeepGoldRate);
    this.updateAdvancedTuningLabel('upkeepActionPointRate', this.world.advancedTuning.upkeepActionPointRate);
  }

  private updateTuningLabel(key: keyof AlgorithmTuning, value: number): void {
    const slider = document.getElementById(`tuning-${key}`) as HTMLInputElement | null;
    const label = document.getElementById(`tuning-${key}-label`);
    if (slider) slider.value = `${Math.round(value * 100)}`;
    if (label) label.textContent = `${value.toFixed(1)}x`;
  }

  private updateAdvancedTuningLabel(key: keyof AdvancedTuning, value: number): void {
    const slider = document.getElementById(`advanced-${key}`) as HTMLInputElement | null;
    const label = document.getElementById(`advanced-${key}-label`);
    if (slider) slider.value = `${Math.round(value * 100)}`;
    if (label) label.textContent = `${value.toFixed(2)}x`;
  }

  private renderActionStateRow(label: string, action: PlayerAction): string {
    const status = this.world.getActionAvailability(action);
    return `
      <div class="mini-stat action-status ${status.enabled ? 'ready' : 'blocked'}">
        <span>${label}</span>
        <strong>${status.enabled ? '可能' : status.reason}</strong>
      </div>
    `;
  }

  private getBuildingLegendHtml(): string {
    return `
      <div class="legend-row"><span class="legend-chip">🏘️</span><span>居住区: 人口・収容</span></div>
      <div class="legend-row"><span class="legend-chip">🛤️</span><span>物流路: 輸送効率</span></div>
      <div class="legend-row"><span class="legend-chip">🏰</span><span>攻撃拠点: 防衛・軍事</span></div>
      <div class="legend-row"><span class="legend-chip">🏭</span><span>生産設備: 資源生産</span></div>
      <div class="legend-row"><span class="legend-chip">🏪</span><span>マーケット: 経済・物流</span></div>
      <div class="legend-row"><span class="legend-chip">🏛️</span><span>文化施設: 人文補正</span></div>
      <div class="legend-note">地図上のセル右上マーカーで種別を識別できます</div>
    `;
  }

  private getModeLegendHtml(mode: ViewMode): string {
    if (mode === 'terrain') {
      return `
        <div class="legend-row"><span class="legend-chip" style="background:#a8c880"></span><span>平地</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:#6aabff"></span><span>河川</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:#7aaa88"></span><span>沼地</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:#a09080"></span><span>崖</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:#3d7a3d"></span><span>森林</span></div>
      `;
    }
    if (mode === 'community') {
      const counts = new Map<number, number>();
      for (const cell of this.world.allCells()) {
        if (cell.communityId >= 0) {
          counts.set(cell.communityId, (counts.get(cell.communityId) ?? 0) + 1);
        }
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      return `
        <div class="legend-row"><span class="legend-chip" style="background:#ff4400"></span><span>独立勢力</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:#888888"></span><span>未所属/境界外</span></div>
        ${top.map(([id, count]) => `<div class="legend-row"><span class="legend-chip" style="background:${communityColorById(id)}"></span><span>#${id}: ${count}セル</span></div>`).join('')}
        <div class="legend-note">同一色は同一コミュニティです（上位8件を表示）</div>
      `;
    }
    if (mode === 'player') {
      return this.world.players.map((player) => `
        <div class="legend-row">
          <span class="legend-chip" style="background:${player.color}"></span>
          <span>${player.icon} ${player.name}</span>
        </div>
      `).join('');
    }
    if (mode === 'facility') {
      return `
        <div class="legend-row"><span class="legend-chip" style="background:#11161f"></span><span>施設なし</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:rgba(255,180,120,0.95)"></span><span>居住区優勢</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:rgba(120,220,255,0.95)"></span><span>物流路優勢</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:rgba(255,120,120,0.95)"></span><span>攻撃拠点優勢</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:rgba(155,255,130,0.95)"></span><span>生産設備優勢</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:rgba(255,240,130,0.95)"></span><span>マーケット優勢</span></div>
        <div class="legend-row"><span class="legend-chip" style="background:rgba(220,170,255,0.95)"></span><span>文化施設優勢</span></div>
        <div class="legend-note">色の濃さは施設密度（レベル合計）を示します。</div>
      `;
    }
    if (mode === 'population') {
      return this.renderGradientLegend('低人口', '高人口', 'linear-gradient(90deg, rgb(0,100,50), rgb(255,0,50))');
    }
    if (mode === 'food') {
      return this.renderGradientLegend('食料不足', '食料豊富', 'linear-gradient(90deg, rgb(255,50,50), rgb(50,200,50))');
    }
    if (mode === 'water') {
      return this.renderGradientLegend('水不足', '水豊富', 'linear-gradient(90deg, rgb(50,50,120), rgb(80,220,255))');
    }
    return this.renderGradientLegend('不満低', '不満高', 'linear-gradient(90deg, rgb(60,180,80), rgb(255,60,60))');
  }

  private renderGradientLegend(left: string, right: string, gradient: string): string {
    return `
      <div class="legend-gradient" style="background:${gradient}"></div>
      <div class="legend-scale">
        <span>${left}</span>
        <span>${right}</span>
      </div>
    `;
  }

  private getModeDetailHtml(mode: ViewMode): string {
    if (mode === 'terrain') {
      return `
        <div class="detail-card">
          <strong>地形</strong>
          <p>セルの地形タイプです。平地は開発しやすく、河川は水資源が多く、森林は木材が豊富です。崖・沼地は地形抵抗が高く、生活・生産効率が下がります。</p>
        </div>
        <div class="detail-card">
          <strong>地形抵抗 (R_geo)</strong>
          <p>移動・生産・消費計算の摩擦要素です。値が高いほど不利で、建設による bonus で一部緩和されます。</p>
        </div>
      `;
    }
    if (mode === 'community') {
      return `
        <div class="detail-card">
          <strong>コミュニティ</strong>
          <p>言語・文化距離に基づく連結集団です。色が同じセルは文化的に近い可能性が高く、物流や社会変動に影響します。</p>
        </div>
        <div class="detail-card">
          <strong>独立勢力</strong>
          <p>不満度が歴史継続性を上回ると離反が起き、独立勢力として表示されます。</p>
        </div>
      `;
    }
    if (mode === 'player') {
      return `
        <div class="detail-card">
          <strong>プレイヤー勢力</strong>
          <p>セルの支配者を示します。地形色と混同しにくい専用色を使用し、アクティブ地域は選択セルと同じ勢力（または同コミュニティ）を強調表示します。</p>
        </div>
      `;
    }
    if (mode === 'facility') {
      return `
        <div class="detail-card">
          <strong>施設モード</strong>
          <p>セル内で優勢な施設種別を色で表示します。濃い色ほど施設密度が高く、右上マーカーで種別、数字でスロット使用数を確認できます。</p>
        </div>
      `;
    }
    if (mode === 'population') {
      return `
        <div class="detail-card">
          <strong>人口</strong>
          <p>1セルあたりの住民数です。人口が高いほど労働力は増えますが、消費増・密度摩擦・不満増のリスクが上がります。</p>
        </div>
      `;
    }
    if (mode === 'food') {
      return `
        <div class="detail-card">
          <strong>食料</strong>
          <p>人口維持の最重要資源です。居住区/生産設備/マーケットなどの施設がないセルでは、食料はほぼ生産されません。</p>
        </div>
      `;
    }
    if (mode === 'water') {
      return `
        <div class="detail-card">
          <strong>水</strong>
          <p>生活基盤資源です。河川地形で増えやすく、枯渇時は不満増加と社会不安を引き起こします。</p>
        </div>
      `;
    }
    return `
      <div class="detail-card">
        <strong>不満度</strong>
        <p>社会不安の指標です。資源不足・異文化圧力で上がり、歴史継続性を超えると独立イベントが発生しやすくなります。</p>
      </div>
    `;
  }

  private getStockLabel(stock: 'food' | 'water' | 'wood' | 'tools'): string {
    if (stock === 'food') return '食料';
    if (stock === 'water') return '水';
    if (stock === 'wood') return '木材';
    return '工具';
  }

  private pushActionHistory(actor: string, action: PlayerAction, target: string, message: string): void {
    const actionLabel: Record<PlayerAction, string> = {
      build: '建設',
      claim: '編入',
      attack: '攻撃',
      logistics: '物流移送',
    };
    this.actionHistory.unshift(`T${this.world.turn} ${actor} ${actionLabel[action]} ${target} -> ${message}`);
    this.actionHistory = this.actionHistory.slice(0, 12);
  }

  private doTurn(): void {
    const before = this.captureFactionSnapshot();
    advanceTurn(this.world);
    this.world.refreshPlayersForNewTurn();
    const upkeepLogs = this.world.applyBuildingUpkeepForTurn();
    if (this.world.rules.autoRotateControl) {
      const playerIndex = this.world.players.findIndex((player) => player.id === this.world.currentPlayerId);
      const nextIndex = (playerIndex + 1) % this.world.players.length;
      this.world.setCurrentPlayer(this.world.players[nextIndex].id);
    }
    const aiLogs = this.world.runAiActionsForTurn();
    for (const log of aiLogs) {
      this.actionHistory.unshift(`T${this.world.turn} ${log}`);
    }
    for (const log of upkeepLogs) {
      this.actionHistory.unshift(`T${this.world.turn} ${log}`);
    }
    this.actionHistory = this.actionHistory.slice(0, 12);
    const after = this.captureFactionSnapshot();
    this.appendTurnDiffLog(before, after, this.world.turn);
    const actor = this.world.getCurrentPlayer();
    if (actor) {
      this.actionHistory.unshift(`T${this.world.turn} システム: ターン開始 -> ${actor.icon} ${actor.name} の操作フェーズ`);
      this.actionHistory = this.actionHistory.slice(0, 12);
    }
    const notice = document.getElementById('action-notice');
    if (notice && (aiLogs.length > 0 || upkeepLogs.length > 0)) {
      notice.textContent = `維持費:${upkeepLogs.length}件 / AI行動:${aiLogs.length}件`;
      notice.dataset.state = 'ok';
    }
    this.refreshPanel();
    this.onTurnAdvanced();
  }

  private captureFactionSnapshot(): FactionSnapshot[] {
    return this.world.getAllPlayerAssets().map(({ player, assets }) => ({
      id: player.id,
      name: player.name,
      icon: player.icon,
      territory: assets.territory,
      food: Math.round(assets.food),
      water: Math.round(assets.water),
      wood: Math.round(assets.wood),
      tools: Math.round(assets.tools),
      gold: Math.round(player.gold),
    }));
  }

  private appendTurnDiffLog(before: FactionSnapshot[], after: FactionSnapshot[], turn: number): void {
    const beforeMap = new Map(before.map((item) => [item.id, item]));
    const rows: string[] = [];
    for (const next of after) {
      const prev = beforeMap.get(next.id);
      if (!prev) continue;
      rows.push(
        `${next.icon}${next.name} ` +
        `領${this.formatDiff(next.territory - prev.territory)} ` +
        `食${this.formatDiff(next.food - prev.food)} ` +
        `水${this.formatDiff(next.water - prev.water)} ` +
        `木${this.formatDiff(next.wood - prev.wood)} ` +
        `工${this.formatDiff(next.tools - prev.tools)} ` +
        `金${this.formatDiff(next.gold - prev.gold)}`,
      );
    }
    this.turnDiffLogs.unshift(`T${turn}: ${rows.join(' | ')}`);
    this.turnDiffLogs = this.turnDiffLogs.slice(0, 10);
  }

  private formatDiff(value: number): string {
    if (value > 0) return `+${value}`;
    if (value < 0) return `${value}`;
    return '±0';
  }
}
