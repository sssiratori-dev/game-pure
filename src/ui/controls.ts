// ===== コントロールパネル =====

import { World } from '../core/world';
import { advanceTurn } from '../core/loop';
import { Renderer } from './renderer';
import type { ViewMode } from './renderer';

export class Controls {
  private world: World;
  private renderer: Renderer;
  private autoRunInterval: ReturnType<typeof setInterval> | null = null;
  private onTurnAdvanced: () => void;

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
    container.innerHTML = `
      <div class="tab-strip">
        <button class="tab-btn active" data-tab="stats">統計</button>
        <button class="tab-btn" data-tab="map">地図</button>
        <button class="tab-btn" data-tab="actions">操作</button>
      </div>

      <div id="panel-stats" class="tab-panel active">
        <div class="controls-row">
          <button id="btn-next" class="btn-primary">▶ 次のターン</button>
          <button id="btn-auto" class="btn-secondary">⏩ 自動実行</button>
          <button id="btn-stop" class="btn-danger" disabled>⏹ 停止</button>
          <span id="turn-display" class="turn-display">ターン: 0</span>
        </div>
        <div class="controls-row player-row">
          <span>現在の支配者:</span>
          <span id="player-display" class="player-display">${this.world.getCurrentPlayer()?.icon ?? '◆'} ${this.world.getCurrentPlayer()?.name ?? '未設定'}</span>
        </div>
        <div id="player-summary" class="player-summary"></div>
      </div>

      <div id="panel-map" class="tab-panel">
        <div class="mini-panel">
          <h3>地図状況</h3>
          <div class="mini-stat">
            <span>対象セル</span>
            <strong id="selected-cell-label">未選択</strong>
          </div>
          <div class="mini-stat">
            <span>表示モード</span>
            <strong id="active-mode-label">地形</strong>
          </div>
          <div class="mini-stat">
            <span>支配者数</span>
            <strong>${this.world.players.length}</strong>
          </div>
        </div>
      </div>

      <div id="panel-actions" class="tab-panel">
        <div class="controls-row">
          <label>速度:
            <input type="range" id="speed-slider" min="100" max="2000" step="100" value="500">
            <span id="speed-label">500ms/ターン</span>
          </label>
        </div>
        <div class="controls-row action-row">
          <button class="btn-action" data-action="build">🏗 建設</button>
          <button class="btn-action" data-action="claim">🧭 占領</button>
          <button class="btn-action" data-action="attack">⚔ 攻撃</button>
        </div>
        <div id="action-notice" class="action-notice">セルを選択してアクションを実行してください。</div>
        <div class="controls-row view-modes">
          <span>表示モード:</span>
          <button class="view-btn active" data-mode="terrain">地形</button>
          <button class="view-btn" data-mode="community">コミュニティ</button>
          <button class="view-btn" data-mode="player">プレイヤー</button>
          <button class="view-btn" data-mode="population">人口</button>
          <button class="view-btn" data-mode="food">食料</button>
          <button class="view-btn" data-mode="water">水</button>
          <button class="view-btn" data-mode="dissatisfaction">不満度</button>
        </div>
      </div>
    `;

    // ターン進行
    document.getElementById('btn-next')!.addEventListener('click', () => {
      this.doTurn();
    });

    const playerDisplay = document.getElementById('player-display')!;
    const playerSummary = document.getElementById('player-summary')!;
    const updateHud = () => {
      const current = this.world.getCurrentPlayer();
      if (!current) return;
      const territoryCount = this.world.getOwnedCells(current.id).length;
      const foodTotal = this.world.getOwnedCells(current.id).reduce((sum, cell) => sum + cell.stocks.food, 0);
      const waterTotal = this.world.getOwnedCells(current.id).reduce((sum, cell) => sum + cell.stocks.water, 0);
      playerDisplay.textContent = `${current.icon} ${current.name}`;
      playerSummary.innerHTML = `
        <div class="player-summary-grid">
          <span>領域</span><strong>${territoryCount}</strong>
          <span>食料</span><strong>${Math.round(foodTotal)}</strong>
          <span>水</span><strong>${Math.round(waterTotal)}</strong>
        </div>
      `;
    };
    updateHud();

    // 自動実行
    const btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    const slider  = document.getElementById('speed-slider') as HTMLInputElement;
    const speedLabel = document.getElementById('speed-label')!;
    const actionButtons = container.querySelectorAll<HTMLButtonElement>('[data-action]');
    const tabButtons = container.querySelectorAll<HTMLButtonElement>('.tab-btn');
    const tabPanels = container.querySelectorAll<HTMLElement>('.tab-panel');

    actionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.action as 'build' | 'claim' | 'attack';
        const result = this.world.executePlayerAction(action);
        const notice = document.getElementById('action-notice');
        if (notice) {
          notice.textContent = result.message;
          notice.dataset.state = result.ok ? 'ok' : 'error';
        }
        this.renderer.draw(this.world);
        this.updateSelectedCellLabel();
      });
    });

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        tabButtons.forEach((btn) => btn.classList.toggle('active', btn === button));
        tabPanels.forEach((panel) => {
          panel.classList.toggle('active', panel.id === `panel-${tab}`);
        });
      });
    });

    btnAuto.addEventListener('click', () => {
      const ms = parseInt(slider.value);
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
        this.autoRunInterval = setInterval(() => this.doTurn(), parseInt(slider.value));
      }
    });

    // 表示モード切替
    container.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = (e.target as HTMLElement).dataset.mode as ViewMode;
        this.renderer.setViewMode(mode);
        this.renderer.draw(this.world);
        container.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        const activeModeLabel = document.getElementById('active-mode-label');
        if (activeModeLabel) {
          activeModeLabel.textContent = this.getModeLabel(mode);
        }
      });
    });

    this.updateSelectedCellLabel();
  }

  private getModeLabel(mode: ViewMode): string {
    const labels: Record<ViewMode, string> = {
      terrain: '地形',
      community: 'コミュニティ',
      player: 'プレイヤー',
      population: '人口',
      food: '食料',
      water: '水',
      dissatisfaction: '不満度',
    };
    return labels[mode];
  }

  private updateSelectedCellLabel(): void {
    const label = document.getElementById('selected-cell-label');
    if (!label) return;
    const cell = this.world.getSelectedCell();
    label.textContent = cell ? `(${cell.x}, ${cell.y})` : '未選択';
  }

  private doTurn(): void {
    advanceTurn(this.world);
    const playerIndex = this.world.players.findIndex((player) => player.id === this.world.currentPlayerId);
    const nextIndex = (playerIndex + 1) % this.world.players.length;
    this.world.setCurrentPlayer(this.world.players[nextIndex].id);
    document.getElementById('turn-display')!.textContent = `ターン: ${this.world.turn}`;
    const playerDisplay = document.getElementById('player-display');
    const playerSummary = document.getElementById('player-summary');
    if (playerDisplay) {
      playerDisplay.textContent = `${this.world.getCurrentPlayer()?.icon ?? '◆'} ${this.world.getCurrentPlayer()?.name ?? '未設定'}`;
    }
    if (playerSummary) {
      const current = this.world.getCurrentPlayer();
      if (current) {
        const territoryCount = this.world.getOwnedCells(current.id).length;
        const foodTotal = this.world.getOwnedCells(current.id).reduce((sum, cell) => sum + cell.stocks.food, 0);
        const waterTotal = this.world.getOwnedCells(current.id).reduce((sum, cell) => sum + cell.stocks.water, 0);
        playerSummary.innerHTML = `
          <div class="player-summary-grid">
            <span>領域</span><strong>${territoryCount}</strong>
            <span>食料</span><strong>${Math.round(foodTotal)}</strong>
            <span>水</span><strong>${Math.round(waterTotal)}</strong>
          </div>
        `;
      }
    }
    this.onTurnAdvanced();
  }
}
