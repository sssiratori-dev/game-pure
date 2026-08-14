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
        <canvas id="game-canvas"></canvas>
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
const inspectorEl = document.getElementById('inspector')!;
const controlsEl  = document.getElementById('controls')!;

// サブシステム初期化
const renderer  = new Renderer(canvas);
const inspector = new Inspector(inspectorEl);

renderer.setOnCellClick((cell) => {
  world.setSelectedCell(cell.x, cell.y);
  inspector.update(cell);
});

renderer.setOnCellHover((cell) => {
  inspector.update(cell);
});

new Controls(world, renderer, controlsEl, () => {
  renderer.draw(world);
});

// 初期描画
renderer.draw(world);

console.log('[game-pure] ワールドシミュレーション起動完了');
console.log(`[game-pure] マップサイズ: 20×20, ターン: ${world.turn}`);
