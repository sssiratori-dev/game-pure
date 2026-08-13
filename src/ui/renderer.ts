// ===== マップ描画（Canvas）=====

import { World, MAP_SIZE } from '../core/world';
import type { Cell } from '../core/cell';
import { TERRAIN_COLOR, POPULATION_CAP } from '../core/cell';

const CELL_SIZE = 32; // px per cell
export const CANVAS_SIZE = MAP_SIZE * CELL_SIZE;

export type ViewMode = 'terrain' | 'population' | 'food' | 'water' | 'dissatisfaction' | 'community';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private viewMode: ViewMode = 'terrain';
  private hoveredCell: { x: number; y: number } | null = null;
  private selectedCell: { x: number; y: number } | null = null;
  private onCellClick: (cell: Cell) => void = () => {};
  private onCellHover: (cell: Cell | null) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.setupEventListeners();
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  setOnCellClick(cb: (cell: Cell) => void): void {
    this.onCellClick = cb;
  }

  setOnCellHover(cb: (cell: Cell | null) => void): void {
    this.onCellHover = cb;
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('click', (e) => {
      const { x, y } = this.getCell(e);
      const world = (window as any).__world as World;
      if (!world) return;
      const cell = world.getCell(x, y);
      if (cell) {
        this.selectedCell = { x, y };
        this.onCellClick(cell);
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const { x, y } = this.getCell(e);
      if (this.hoveredCell?.x !== x || this.hoveredCell?.y !== y) {
        this.hoveredCell = { x, y };
        const world = (window as any).__world as World;
        if (!world) return;
        const cell = world.getCell(x, y);
        this.onCellHover(cell ?? null);
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredCell = null;
      this.onCellHover(null);
    });
  }

  private getCell(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: Math.floor(((e.clientX - rect.left) * scaleX) / CELL_SIZE),
      y: Math.floor(((e.clientY - rect.top)  * scaleY) / CELL_SIZE),
    };
  }

  draw(world: World): void {
    this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // コミュニティカラーパレット（最大20コミュニティ）
    const communityColors = generateCommunityColors(30);

    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const cell = world.cells[y][x];
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        // セル背景
        this.ctx.fillStyle = this.getCellColor(cell, communityColors);
        this.ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

        // 人口ドット（地形モード時）
        if (this.viewMode === 'terrain' || this.viewMode === 'community') {
          const popRatio = cell.population / POPULATION_CAP;
          if (popRatio > 0) {
            this.ctx.fillStyle = `rgba(40,20,0,${Math.min(0.8, popRatio * 0.6)})`;
            const r = Math.max(2, popRatio * 8);
            this.ctx.beginPath();
            this.ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, r, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }

        // 独立勢力マーカー
        if (cell.communityId === -2) {
          this.ctx.strokeStyle = '#ff2200';
          this.ctx.lineWidth = 2;
          this.ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        }

        // グリッド線
        this.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
      }
    }

    // 選択セルのハイライト
    if (this.selectedCell) {
      const { x, y } = this.selectedCell;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }

    // ホバーセルのハイライト
    if (this.hoveredCell && (this.hoveredCell.x !== this.selectedCell?.x || this.hoveredCell.y !== this.selectedCell?.y)) {
      const { x, y } = this.hoveredCell;
      this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
  }

  private getCellColor(cell: Cell, communityColors: string[]): string {
    switch (this.viewMode) {
      case 'terrain':
        return TERRAIN_COLOR[cell.terrain];

      case 'community': {
        if (cell.communityId === -2) return '#ff4400'; // 独立
        if (cell.communityId < 0)  return '#888888';
        return communityColors[cell.communityId % communityColors.length];
      }

      case 'population': {
        const ratio = cell.population / POPULATION_CAP;
        return `rgb(${Math.floor(255 * ratio)}, ${Math.floor(100 * (1 - ratio))}, 50)`;
      }

      case 'food': {
        const v = Math.min(1, cell.stocks.food / 1000);
        return `rgb(${Math.floor(255 * (1 - v))}, ${Math.floor(200 * v)}, 50)`;
      }

      case 'water': {
        const v = Math.min(1, cell.stocks.water / 800);
        return `rgb(50, ${Math.floor(150 * v)}, ${Math.floor(255 * v)})`;
      }

      case 'dissatisfaction': {
        const v = Math.min(1, cell.dissatisfaction);
        return `rgb(${Math.floor(255 * v)}, ${Math.floor(80 * (1 - v))}, ${Math.floor(80 * (1 - v))})`;
      }

      default:
        return TERRAIN_COLOR[cell.terrain];
    }
  }
}

// コミュニティカラーパレット生成
function generateCommunityColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (i * 137.5) % 360; // 黄金角で分散
    colors.push(`hsl(${hue}, 60%, 55%)`);
  }
  return colors;
}
