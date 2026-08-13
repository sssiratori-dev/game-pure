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
      <div class="controls-row">
        <button id="btn-next" class="btn-primary">▶ 次のターン</button>
        <button id="btn-auto" class="btn-secondary">⏩ 自動実行</button>
        <button id="btn-stop" class="btn-danger" disabled>⏹ 停止</button>
        <span id="turn-display" class="turn-display">ターン: 0</span>
      </div>
      <div class="controls-row">
        <label>速度:
          <input type="range" id="speed-slider" min="100" max="2000" step="100" value="500">
          <span id="speed-label">500ms/ターン</span>
        </label>
      </div>
      <div class="controls-row view-modes">
        <span>表示モード:</span>
        <button class="view-btn active" data-mode="terrain">地形</button>
        <button class="view-btn" data-mode="community">コミュニティ</button>
        <button class="view-btn" data-mode="population">人口</button>
        <button class="view-btn" data-mode="food">食料</button>
        <button class="view-btn" data-mode="water">水</button>
        <button class="view-btn" data-mode="dissatisfaction">不満度</button>
      </div>
    `;

    // ターン進行
    document.getElementById('btn-next')!.addEventListener('click', () => {
      this.doTurn();
    });

    // 自動実行
    const btnAuto = document.getElementById('btn-auto') as HTMLButtonElement;
    const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
    const slider  = document.getElementById('speed-slider') as HTMLInputElement;
    const speedLabel = document.getElementById('speed-label')!;

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
      });
    });
  }

  private doTurn(): void {
    advanceTurn(this.world);
    document.getElementById('turn-display')!.textContent = `ターン: ${this.world.turn}`;
    this.onTurnAdvanced();
  }
}
