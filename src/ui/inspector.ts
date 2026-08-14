// ===== セルインスペクター =====
// セルクリック時に詳細情報を右パネルに表示

import type { Cell } from '../core/cell';
import { POPULATION_CAP } from '../core/cell';

export class Inspector {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render(null);
  }

  update(cell: Cell | null): void {
    this.render(cell);
  }

  private render(cell: Cell | null): void {
    if (!cell) {
      this.container.innerHTML = `
        <div class="inspector-empty">
          <p>セルをクリックして詳細を表示</p>
        </div>
      `;
      return;
    }

    const civLabels: Record<number, string> = {
      1: '物々交換 (Lv.1)',
      2: '貴金属通貨 (Lv.2)',
      3: '法定通貨 (Lv.3)',
    };

    const statusColor = (v: number, max: number): string => {
      const ratio = v / max;
      if (ratio > 0.6) return '#4caf50';
      if (ratio > 0.3) return '#ff9800';
      return '#f44336';
    };

    const bar = (value: number, max: number, color?: string): string => {
      const pct = Math.min(100, (value / max) * 100);
      const c = color ?? statusColor(value, max);
      return `<div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${c}"></div></div>`;
    };

    const dissColor = cell.dissatisfaction > cell.culture.historicalContinuity
      ? '#f44336' : cell.dissatisfaction > 0.5 ? '#ff9800' : '#4caf50';
    const world = (window as any).__world as {
      getPlayer?: (id: string | null) => { id: string; name: string; color: string; icon?: string } | null;
      getOwnedCells?: (id: string) => unknown[];
    } | undefined;
    const owner = world?.getPlayer ? world.getPlayer(cell.ownerId) : null;
    const territoryCount = owner && world?.getOwnedCells ? world.getOwnedCells(owner.id).length : 0;

    this.container.innerHTML = `
      <div class="inspector-header">
        <span class="coord">座標 (${cell.x}, ${cell.y})</span>
        <span class="terrain-badge terrain-${cell.terrain}">${terrainLabel(cell.terrain)}</span>
      </div>

      <section>
        <h3>🧭 支配情報</h3>
        <div class="stat-row">
          <label>支配者</label>
          <span>${owner ? `${owner.icon ?? '◆'} <span style="color:${owner.color}">${owner.name}</span>` : '未確定'}</span>
        </div>
        <div class="stat-row">
          <label>領域数</label>
          <span>${territoryCount}</span>
        </div>
      </section>

      <section>
        <h3>👥 人口</h3>
        <div class="stat-row">
          <span>${cell.population} / ${POPULATION_CAP} 人</span>
          ${bar(cell.population, POPULATION_CAP)}
        </div>
      </section>

      <section>
        <h3>📦 資源ストック</h3>
        <div class="stat-row"><label>🌾 食料</label><span>${cell.stocks.food.toFixed(0)}</span>${bar(cell.stocks.food, 1000)}</div>
        <div class="stat-row"><label>💧 水</label><span>${cell.stocks.water.toFixed(0)}</span>${bar(cell.stocks.water, 800)}</div>
        <div class="stat-row"><label>🪵 薪</label><span>${cell.stocks.wood.toFixed(0)}</span>${bar(cell.stocks.wood, 500)}</div>
        <div class="stat-row"><label>🔧 ツール</label><span>${cell.stocks.tools.toFixed(0)}</span>${bar(cell.stocks.tools, 200)}</div>
      </section>

      <section>
        <h3>🏛️ 文明・文化</h3>
        <div class="stat-row"><label>文明レベル</label><span>${civLabels[cell.culture.civilizationLevel]}</span></div>
        <div class="stat-row"><label>言語グループ</label><span>${cell.culture.languageGroup}</span></div>
        <div class="stat-row"><label>文化ストック</label><span>${cell.culture.cultureStock.toFixed(1)}</span></div>
        <div class="stat-row"><label>文化強度</label><span>${(cell.culture.culturalStrength * 100).toFixed(1)}%</span>${bar(cell.culture.culturalStrength, 1, '#9c27b0')}</div>
        <div class="stat-row"><label>歴史継続性 φ</label><span>${(cell.culture.historicalContinuity * 100).toFixed(1)}%</span>${bar(cell.culture.historicalContinuity, 1, '#795548')}</div>
      </section>

      <section>
        <h3>⚡ 政治・社会</h3>
        <div class="stat-row"><label>不満度 U</label><span style="color:${dissColor}">${(cell.dissatisfaction * 100).toFixed(1)}%</span>${bar(cell.dissatisfaction, 1, dissColor)}</div>
        <div class="stat-row"><label>コミュニティID</label><span>${cell.communityId === -2 ? '🔴 独立勢力' : cell.communityId === -1 ? '未所属' : `#${cell.communityId}`}</span></div>
        <div class="stat-row"><label>地形抵抗 R_geo</label><span>${cell.R_geo}</span></div>
        ${cell.dissatisfaction > cell.culture.historicalContinuity
          ? '<div class="alert">⚠️ 離反リスク！不満度が歴史耐性を超えています</div>'
          : ''}
      </section>
    `;
  }
}

function terrainLabel(terrain: string): string {
  const labels: Record<string, string> = {
    flat: '平地', river: '河川', swamp: '沼地', cliff: '崖', forest: '森林',
  };
  return labels[terrain] ?? terrain;
}
