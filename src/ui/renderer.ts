// ===== マップ描画（Canvas）=====

import { World, MAP_SIZE } from '../core/world';
import type { Cell } from '../core/cell';
import { getEffectivePopulationCap, getOccupiedBuildingSlots, TERRAIN_COLOR } from '../core/cell';

const CELL_SIZE = 32; // px per cell
export const CANVAS_SIZE = MAP_SIZE * CELL_SIZE;
const MINI_MAP_SIZE = 160;

export type ViewMode = 'terrain' | 'population' | 'food' | 'water' | 'dissatisfaction' | 'community' | 'player' | 'facility';
export type ScaleMode = 'wide' | 'standard' | 'detail';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private miniMapCanvas: HTMLCanvasElement | null;
  private miniMapCtx: CanvasRenderingContext2D | null;
  private viewMode: ViewMode = 'terrain';
  private scaleMode: ScaleMode = 'standard';
  private hoveredCell: { x: number; y: number } | null = null;
  private selectedCell: { x: number; y: number } | null = null;
  private zoom = 1.25;
  private offsetX = 0;
  private offsetY = 0;
  private readonly minZoom = 1;
  private readonly maxZoom = 3;
  private lastWorld: World | null = null;
  private onCellClick: (cell: Cell) => void = () => {};
  private onCellHover: (cell: Cell | null) => void = () => {};

  constructor(canvas: HTMLCanvasElement, miniMapCanvas?: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.miniMapCanvas = miniMapCanvas ?? null;
    this.miniMapCtx = this.miniMapCanvas ? this.miniMapCanvas.getContext('2d') : null;
    if (this.miniMapCanvas) {
      this.miniMapCanvas.width = MINI_MAP_SIZE;
      this.miniMapCanvas.height = MINI_MAP_SIZE;
    }
    this.ensureCameraInBounds();
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

  setScaleMode(mode: ScaleMode): void {
    this.scaleMode = mode;
    if (mode === 'wide') this.zoom = 1;
    if (mode === 'standard') this.zoom = 1.25;
    if (mode === 'detail') this.zoom = 2;
    this.ensureCameraInBounds();
  }

  zoomBy(delta: number): void {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom + delta));
    this.ensureCameraInBounds();
  }

  centerOnCell(x: number, y: number): void {
    const centerX = x * CELL_SIZE + CELL_SIZE / 2;
    const centerY = y * CELL_SIZE + CELL_SIZE / 2;
    this.offsetX = centerX - this.canvas.width / (2 * this.zoom);
    this.offsetY = centerY - this.canvas.height / (2 * this.zoom);
    this.ensureCameraInBounds();
  }

  panByCells(dx: number, dy: number): void {
    this.offsetX += dx * CELL_SIZE;
    this.offsetY += dy * CELL_SIZE;
    this.ensureCameraInBounds();
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('click', (e) => {
      const { x, y } = this.getCell(e);
      const world = (window as any).__world as World;
      if (!world) return;
      const cell = world.getCell(x, y);
      if (cell) {
        this.selectedCell = { x, y };
        this.centerOnCell(x, y);
        this.onCellClick(cell);
        this.draw(world);
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

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 0.2 : -0.2);
      this.redrawFromCache();
    }, { passive: false });

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 1 && !(e.button === 0 && e.shiftKey)) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      this.canvas.style.cursor = 'crosshair';
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const rect = this.canvas.getBoundingClientRect();
      const pxToCanvasX = this.canvas.width / rect.width;
      const pxToCanvasY = this.canvas.height / rect.height;
      const dx = (e.clientX - dragStartX) * pxToCanvasX;
      const dy = (e.clientY - dragStartY) * pxToCanvasY;
      this.offsetX -= dx / this.zoom;
      this.offsetY -= dy / this.zoom;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      this.ensureCameraInBounds();
      this.redrawFromCache();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') this.panByCells(0, -1);
      else if (e.key === 'ArrowDown') this.panByCells(0, 1);
      else if (e.key === 'ArrowLeft') this.panByCells(-1, 0);
      else if (e.key === 'ArrowRight') this.panByCells(1, 0);
      else return;
      this.redrawFromCache();
    });

    this.miniMapCanvas?.addEventListener('click', (e) => {
      const world = (window as any).__world as World;
      if (!world) return;
      const rect = this.miniMapCanvas!.getBoundingClientRect();
      const rx = (e.clientX - rect.left) / rect.width;
      const ry = (e.clientY - rect.top) / rect.height;
      const cellX = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(rx * MAP_SIZE)));
      const cellY = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(ry * MAP_SIZE)));
      this.selectedCell = { x: cellX, y: cellY };
      this.centerOnCell(cellX, cellY);
      const cell = world.getCell(cellX, cellY);
      if (cell) this.onCellClick(cell);
      this.draw(world);
    });
  }

  private getCell(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const viewX = this.offsetX + (((e.clientX - rect.left) * scaleX) / this.zoom);
    const viewY = this.offsetY + (((e.clientY - rect.top)  * scaleY) / this.zoom);
    return {
      x: Math.floor(viewX / CELL_SIZE),
      y: Math.floor(viewY / CELL_SIZE),
    };
  }

  draw(world: World): void {
    this.lastWorld = world;
    this.ensureCameraInBounds();
    this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.ctx.save();
    this.ctx.setTransform(this.zoom, 0, 0, this.zoom, -this.offsetX * this.zoom, -this.offsetY * this.zoom);

    const detailVisual = this.scaleMode === 'detail';
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const cell = world.cells[y][x];
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        // セル背景
        this.ctx.fillStyle = this.getCellColor(cell, world);
        this.ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

        // 所有者の境界とアイコン位置
        if (cell.ownerId) {
          const owner = world.getPlayer(cell.ownerId);
          if (owner) {
            this.ctx.strokeStyle = owner.color;
            this.ctx.lineWidth = 1.8;
            this.ctx.strokeRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
            this.ctx.fillStyle = owner.color;
            this.ctx.fillRect(px + 4, py + 4, 7, 7);
          }
        }

        if (cell.buildingType && cell.buildingLevel > 0) {
          const marker = getBuildingShortLabel(cell.buildingType);
          const slotCount = getOccupiedBuildingSlots(cell);
          this.ctx.fillStyle = 'rgba(14, 22, 38, 0.85)';
          this.ctx.fillRect(px + CELL_SIZE - 17, py + 2, 15, 13);
          this.ctx.fillStyle = '#f7f0d5';
          this.ctx.font = '8px sans-serif';
          this.ctx.fillText(marker, px + CELL_SIZE - 15, py + 10);
          if (slotCount > 1) {
            this.ctx.fillStyle = '#ffd166';
            this.ctx.font = '7px sans-serif';
            this.ctx.fillText(`${slotCount}`, px + CELL_SIZE - 7, py + 13);
          }
        }

        // 人口ドット（地形モード時）
        if (this.viewMode === 'terrain' || this.viewMode === 'community' || this.viewMode === 'player') {
          const popRatio = cell.population / Math.max(1, getEffectivePopulationCap(cell));
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

        // 格納資源の可視化（右下に小さな塗り）
        if (cell.stocks.food > 0 || cell.stocks.water > 0) {
          const foodRatio = Math.min(1, cell.stocks.food / 500);
          const waterRatio = Math.min(1, cell.stocks.water / 400);
          this.ctx.fillStyle = `rgba(255, 183, 77, ${0.6 + foodRatio * 0.3})`;
          this.ctx.fillRect(px + CELL_SIZE - 10, py + CELL_SIZE - 12, 4, 4);
          this.ctx.fillStyle = `rgba(109, 201, 255, ${0.6 + waterRatio * 0.3})`;
          this.ctx.fillRect(px + CELL_SIZE - 16, py + CELL_SIZE - 12, 4, 4);
        }

        // グリッド線
        this.ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

        if (detailVisual) {
          this.drawTownDetail(world, cell, px, py);
        }
      }
    }

    this.drawLogistics(world);
    this.drawSelectedRegion(world);

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
    this.ctx.restore();
    this.drawMiniMap(world);
  }

  private drawLogistics(world: World): void {
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const cell = world.cells[y][x];
        if (!cell.ownerId) continue;
        const owner = world.getPlayer(cell.ownerId);
        if (!owner) continue;

        const neighbors = world.getNeighbors(x, y).filter((n) => n.ownerId === cell.ownerId);
        neighbors.forEach((neighbor) => {
          const startX = x * CELL_SIZE + CELL_SIZE / 2;
          const startY = y * CELL_SIZE + CELL_SIZE / 2;
          const endX = neighbor.x * CELL_SIZE + CELL_SIZE / 2;
          const endY = neighbor.y * CELL_SIZE + CELL_SIZE / 2;

          this.ctx.beginPath();
          this.ctx.moveTo(startX, startY);
          this.ctx.lineTo(endX, endY);
          this.ctx.strokeStyle = owner.color + '88';
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();

          this.ctx.beginPath();
          this.ctx.moveTo(endX, endY);
          this.ctx.lineTo(endX - 5, endY - 4);
          this.ctx.lineTo(endX - 5, endY + 4);
          this.ctx.closePath();
          this.ctx.fillStyle = owner.color + 'CC';
          this.ctx.fill();
        });
      }
    }
  }

  private drawSelectedRegion(world: World): void {
    if (!this.selectedCell) return;
    const selected = world.getCell(this.selectedCell.x, this.selectedCell.y);
    if (!selected) return;

    const region = world.allCells().filter((cell) => {
      if (selected.ownerId && cell.ownerId === selected.ownerId) return true;
      if (!selected.ownerId && selected.communityId >= 0 && cell.communityId === selected.communityId) return true;
      return cell.x === selected.x && cell.y === selected.y;
    });

    for (const cell of region) {
      const px = cell.x * CELL_SIZE;
      const py = cell.y * CELL_SIZE;
      this.ctx.fillStyle = 'rgba(255,255,255,0.08)';
      this.ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(px + 1.5, py + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
    }
  }

  private drawTownDetail(world: World, cell: Cell, px: number, py: number): void {
    const occupiedSlots = getOccupiedBuildingSlots(cell);
    if (occupiedSlots === 0 && cell.population < 18) return;

    const densityRatio = cell.population / Math.max(1, getEffectivePopulationCap(cell));
    const urbanLevel = densityRatio > 0.72 ? 3 : densityRatio > 0.45 ? 2 : densityRatio > 0.2 ? 1 : 0;

    if (cell.terrain === 'river') {
      this.ctx.fillStyle = 'rgba(96, 184, 255, 0.32)';
      this.ctx.fillRect(px + 1, py + 12, CELL_SIZE - 2, 8);
      if (urbanLevel >= 1) {
        this.ctx.fillStyle = 'rgba(202, 205, 198, 0.65)';
        this.ctx.fillRect(px + 1, py + 11, CELL_SIZE - 2, 1);
        this.ctx.fillRect(px + 1, py + 20, CELL_SIZE - 2, 1);
      }
      if (cell.buildings.logistics > 0 || cell.buildings.market > 0) {
        this.ctx.strokeStyle = 'rgba(246, 223, 159, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(px + 4, py + 16);
        this.ctx.lineTo(px + CELL_SIZE - 4, py + 16);
        this.ctx.stroke();
      }
    }

    if (cell.population > 24) {
      const houses = Math.min(7, Math.max(1, Math.floor(cell.population / 70) + cell.buildings.residential + urbanLevel));
      for (let i = 0; i < houses; i++) {
        const hx = px + 3 + (i % 3) * 7;
        const hy = py + 5 + Math.floor(i / 3) * 7;
        if (urbanLevel >= 2 && i % 2 === 0) {
          this.ctx.fillStyle = 'rgba(214, 203, 188, 0.94)';
          this.ctx.fillRect(hx, hy - 3, 5, 7);
          this.ctx.fillStyle = 'rgba(154, 149, 140, 0.95)';
          this.ctx.fillRect(hx + 1, hy - 5, 3, 2);
          continue;
        }
        this.ctx.fillStyle = 'rgba(241, 220, 168, 0.9)';
        this.ctx.fillRect(hx, hy, 5, 4);
        this.ctx.fillStyle = 'rgba(185, 110, 86, 0.9)';
        this.ctx.beginPath();
        this.ctx.moveTo(hx - 0.5, hy);
        this.ctx.lineTo(hx + 2.5, hy - 3);
        this.ctx.lineTo(hx + 5.5, hy);
        this.ctx.closePath();
        this.ctx.fill();
      }
    }

    if (cell.buildings.logistics > 0 || cell.buildings.market > 0) {
      const roadColor = cell.buildings.logistics > 1 ? 'rgba(242, 214, 136, 0.95)' : 'rgba(204, 186, 129, 0.9)';
      const centerX = px + CELL_SIZE / 2;
      const centerY = py + CELL_SIZE / 2;
      const right = world.getCell(cell.x + 1, cell.y);
      const down = world.getCell(cell.x, cell.y + 1);
      if (right && (right.buildings.logistics > 0 || right.buildings.market > 0)) {
        const intensity = this.estimateTrafficIntensity(cell, right);
        this.ctx.strokeStyle = roadColor;
        this.ctx.lineWidth = 1.4 + intensity * 3.6;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY);
        this.ctx.lineTo(px + CELL_SIZE + 2, centerY);
        this.ctx.stroke();
      }
      if (down && (down.buildings.logistics > 0 || down.buildings.market > 0)) {
        const intensity = this.estimateTrafficIntensity(cell, down);
        this.ctx.strokeStyle = roadColor;
        this.ctx.lineWidth = 1.4 + intensity * 3.6;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY);
        this.ctx.lineTo(centerX, py + CELL_SIZE + 2);
        this.ctx.stroke();
      }
    }

    if (cell.buildings.fortress > 0) {
      this.ctx.fillStyle = 'rgba(248, 112, 112, 0.9)';
      this.ctx.beginPath();
      this.ctx.moveTo(px + 23, py + 8);
      this.ctx.lineTo(px + 28, py + 17);
      this.ctx.lineTo(px + 18, py + 17);
      this.ctx.closePath();
      this.ctx.fill();
    }

    if (cell.buildings.production > 0) {
      this.ctx.fillStyle = 'rgba(136, 229, 124, 0.92)';
      this.ctx.fillRect(px + 18, py + 18, 9, 7);
      this.ctx.fillStyle = 'rgba(80, 172, 74, 0.95)';
      this.ctx.fillRect(px + 21, py + 14, 2, 4);
    }

    if (cell.buildings.culture > 0) {
      this.ctx.fillStyle = 'rgba(209, 170, 255, 0.95)';
      this.ctx.fillRect(px + 4, py + 20, 6, 5);
      this.ctx.fillStyle = 'rgba(180, 140, 240, 0.95)';
      this.ctx.fillRect(px + 5, py + 18, 1, 2);
      this.ctx.fillRect(px + 7, py + 18, 1, 2);
      this.ctx.fillRect(px + 9, py + 18, 1, 2);
    }

    if (cell.buildings.market > 0) {
      this.ctx.fillStyle = 'rgba(255, 228, 130, 0.95)';
      this.ctx.fillRect(px + 13, py + 19, 5, 6);
      this.ctx.fillStyle = 'rgba(240, 168, 83, 0.95)';
      this.ctx.fillRect(px + 13, py + 18, 5, 1.5);
    }
  }

  private estimateTrafficIntensity(a: Cell, b: Cell): number {
    const hub = (a.buildings.logistics + b.buildings.logistics + a.buildings.market + b.buildings.market) / 6;
    const production = (a.buildings.production + b.buildings.production) / 8;
    const pop = (a.population + b.population) / 600;
    const stockFlow = (
      Math.abs(a.stocks.food - b.stocks.food) +
      Math.abs(a.stocks.water - b.stocks.water) +
      Math.abs(a.stocks.wood - b.stocks.wood) +
      Math.abs(a.stocks.tools - b.stocks.tools)
    ) / 1800;
    return Math.max(0.1, Math.min(1, 0.25 + hub + production + pop + stockFlow));
  }

  private getCellColor(cell: Cell, world: World): string {
    switch (this.viewMode) {
      case 'terrain':
        return TERRAIN_COLOR[cell.terrain];

      case 'community': {
        if (cell.communityId === -2) return '#ff4400';
        if (cell.communityId < 0) return '#888888';
        return communityColorById(cell.communityId);
      }

      case 'player': {
        if (cell.ownerId) {
          const owner = world.getPlayer(cell.ownerId);
          if (owner) return owner.color;
        }
        return '#0f1720';
      }

      case 'facility': {
        const slots = getOccupiedBuildingSlots(cell);
        if (slots === 0) return '#11161f';
        const dominantType = cell.buildingType ?? 'residential';
        const density = Math.min(1, (cell.buildingLevel + slots * 0.8) / 10);
        if (dominantType === 'residential') return `rgba(255, 180, 120, ${0.35 + density * 0.65})`;
        if (dominantType === 'logistics') return `rgba(120, 220, 255, ${0.35 + density * 0.65})`;
        if (dominantType === 'fortress') return `rgba(255, 120, 120, ${0.35 + density * 0.65})`;
        if (dominantType === 'production') return `rgba(155, 255, 130, ${0.35 + density * 0.65})`;
        if (dominantType === 'market') return `rgba(255, 240, 130, ${0.35 + density * 0.65})`;
        return `rgba(220, 170, 255, ${0.35 + density * 0.65})`;
      }

      case 'population': {
        const ratio = cell.population / Math.max(1, getEffectivePopulationCap(cell));
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

  private drawMiniMap(world: World): void {
    if (!this.miniMapCtx || !this.miniMapCanvas) return;
    this.miniMapCtx.clearRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);
    const miniCellSize = this.miniMapCanvas.width / MAP_SIZE;
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const cell = world.cells[y][x];
        this.miniMapCtx.fillStyle = this.getCellColor(cell, world);
        this.miniMapCtx.fillRect(x * miniCellSize, y * miniCellSize, miniCellSize, miniCellSize);
      }
    }

    if (this.selectedCell) {
      this.miniMapCtx.strokeStyle = '#ffffff';
      this.miniMapCtx.lineWidth = 2;
      this.miniMapCtx.strokeRect(
        this.selectedCell.x * miniCellSize + 1,
        this.selectedCell.y * miniCellSize + 1,
        miniCellSize - 2,
        miniCellSize - 2,
      );
    }

    const viewportCellWidth = (this.canvas.width / this.zoom) / CELL_SIZE;
    const viewportCellHeight = (this.canvas.height / this.zoom) / CELL_SIZE;
    const rectX = (this.offsetX / CELL_SIZE) * miniCellSize;
    const rectY = (this.offsetY / CELL_SIZE) * miniCellSize;
    this.miniMapCtx.strokeStyle = '#ffd166';
    this.miniMapCtx.lineWidth = 2;
    this.miniMapCtx.strokeRect(rectX, rectY, viewportCellWidth * miniCellSize, viewportCellHeight * miniCellSize);
  }

  private ensureCameraInBounds(): void {
    const viewWidth = this.canvas.width / this.zoom;
    const viewHeight = this.canvas.height / this.zoom;
    const maxOffsetX = Math.max(0, CANVAS_SIZE - viewWidth);
    const maxOffsetY = Math.max(0, CANVAS_SIZE - viewHeight);
    this.offsetX = Math.max(0, Math.min(maxOffsetX, this.offsetX));
    this.offsetY = Math.max(0, Math.min(maxOffsetY, this.offsetY));
  }

  private redrawFromCache(): void {
    if (!this.lastWorld) return;
    this.draw(this.lastWorld);
  }
}

export function communityColorById(communityId: number): string {
  const hue = (communityId * 137.5) % 360;
  return `hsl(${hue}, 62%, 52%)`;
}

function getBuildingShortLabel(type: Cell['buildingType']): string {
  if (type === 'residential') return '住';
  if (type === 'logistics') return '物';
  if (type === 'fortress') return '攻';
  if (type === 'production') return '生';
  if (type === 'market') return '市';
  if (type === 'culture') return '文';
  return '';
}
