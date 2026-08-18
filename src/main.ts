import './style.css';
import { World } from './core/world';
import { Renderer } from './ui/renderer';
import { Inspector } from './ui/inspector';
import { Controls } from './ui/controls';

// グローバルワールド（Renderer内のイベントから参照）
const world = new World();
(window as any).__world = world;

// ゲームUIをDOMに挿入
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div id="game-root">
    <header id="game-header">
      <h1>🌍 game-pure</h1>
      <p class="subtitle">世界シミュレーション — 20×20 メッシュマップ</p>
    </header>
    <div id="game-body">
      <div id="map-panel">
        <div id="map-toolbar">
          <button id="btn-zoom-out" class="btn-secondary" type="button">➖ ズームアウト</button>
          <button id="btn-zoom-in" class="btn-secondary" type="button">➕ ズームイン</button>
          <button id="btn-focus-selected" class="btn-primary" type="button">🎯 選択へフォーカス</button>
          <select id="map-scale-select" aria-label="マップ表示倍率">
            <option value="wide">広域マップ</option>
            <option value="standard" selected>標準マップ</option>
            <option value="detail">詳細マップ</option>
          </select>
        </div>
        <div id="map-canvas-wrap">
          <canvas id="game-canvas"></canvas>
          <canvas id="mini-map" aria-label="ミニマップ"></canvas>
        </div>
      </div>
      <aside id="side-panel">
        <div id="controls"></div>
        <div id="inspector"></div>
      </aside>
    </div>
  </div>
`;

// DOM要素取得
const canvas      = document.getElementById('game-canvas') as HTMLCanvasElement;
const miniMapCanvas = document.getElementById('mini-map') as HTMLCanvasElement;
const inspectorEl = document.getElementById('inspector')!;
const controlsEl  = document.getElementById('controls')!;

// サブシステム初期化
const renderer  = new Renderer(canvas, miniMapCanvas);
const inspector = new Inspector(inspectorEl);

renderer.setOnCellClick((cell) => {
  world.setSelectedCell(cell.x, cell.y);
  window.dispatchEvent(new CustomEvent('world:selected-cell'));
  inspector.update(cell);
});

renderer.setOnCellHover((cell) => {
  const selected = world.getSelectedCell();
  if (selected) {
    inspector.update(selected);
    return;
  }
  inspector.update(cell);
});

new Controls(world, renderer, controlsEl, () => {
  renderer.draw(world);
});

const mapScaleSelect = document.getElementById('map-scale-select') as HTMLSelectElement;
mapScaleSelect.addEventListener('change', () => {
  if (mapScaleSelect.value === 'wide' || mapScaleSelect.value === 'standard' || mapScaleSelect.value === 'detail') {
    renderer.setScaleMode(mapScaleSelect.value);
    renderer.draw(world);
  }
});

const zoomInBtn = document.getElementById('btn-zoom-in');
zoomInBtn?.addEventListener('click', () => {
  renderer.zoomBy(0.25);
  renderer.draw(world);
});

const zoomOutBtn = document.getElementById('btn-zoom-out');
zoomOutBtn?.addEventListener('click', () => {
  renderer.zoomBy(-0.25);
  renderer.draw(world);
});

const focusBtn = document.getElementById('btn-focus-selected');
focusBtn?.addEventListener('click', () => {
  const selected = world.getSelectedCell();
  if (!selected) return;
  renderer.centerOnCell(selected.x, selected.y);
  renderer.draw(world);
});

// 初期描画
renderer.draw(world);

console.log('[game-pure] ワールドシミュレーション起動完了');
console.log(`[game-pure] マップサイズ: 20×20, ターン: ${world.turn}`);
