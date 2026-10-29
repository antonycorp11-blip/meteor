import { pointInPoly, type Poly } from '../core/geometry';
import { hexToRgb } from './palette';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** posição da origem local dentro do canvas */
  ox: number;
  oy: number;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/**
 * Tela de pixels endereçável (sem anti-aliasing) para desenhar sprites
 * proceduralmente e depois virar canvas.
 */
export class PixelGrid {
  readonly w: number;
  readonly h: number;
  readonly ox: number;
  readonly oy: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number, ox = 0, oy = 0) {
    this.w = Math.ceil(w);
    this.h = Math.ceil(h);
    this.ox = ox;
    this.oy = oy;
    this.data = new Uint8ClampedArray(this.w * this.h * 4);
  }

  set(x: number, y: number, color: string | [number, number, number], a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const c = typeof color === 'string' ? hexToRgb(color) : color;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  alpha(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  /** Preenche um polígono em coordenadas locais (origem em ox,oy). */
  poly(poly: Poly, color: string | ((x: number, y: number) => string | null)) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    for (let y = Math.floor(minY + this.oy); y <= Math.ceil(maxY + this.oy); y++) {
      for (let x = Math.floor(minX + this.ox); x <= Math.ceil(maxX + this.ox); x++) {
        const lx = x + 0.5 - this.ox;
        const ly = y + 0.5 - this.oy;
        if (pointInPoly({ x: lx, y: ly }, poly)) {
          const c = typeof color === 'string' ? color : color(lx, ly);
          if (c) this.set(x, y, c);
        }
      }
    }
  }

  rect(x: number, y: number, w: number, h: number, color: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + this.ox + i, y + this.oy + j, color);
  }

  circle(cx: number, cy: number, r: number, color: string | ((x: number, y: number) => string | null)) {
    for (let y = Math.floor(cy - r + this.oy); y <= Math.ceil(cy + r + this.oy); y++) {
      for (let x = Math.floor(cx - r + this.ox); x <= Math.ceil(cx + r + this.ox); x++) {
        const lx = x + 0.5 - this.ox;
        const ly = y + 0.5 - this.oy;
        if ((lx - cx) ** 2 + (ly - cy) ** 2 <= r * r) {
          const c = typeof color === 'string' ? color : color(lx, ly);
          if (c) this.set(x, y, c);
        }
      }
    }
  }

  /** Linha de 1px (Bresenham) em coordenadas locais. */
  line(x0: number, y0: number, x1: number, y1: number, color: string) {
    x0 = Math.round(x0 + this.ox);
    y0 = Math.round(y0 + this.oy);
    x1 = Math.round(x1 + this.ox);
    y1 = Math.round(y1 + this.oy);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Contorno de 1px em volta dos pixels opacos. */
  outline(color: string) {
    const c = hexToRgb(color);
    const marks: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 0) continue;
        if (this.alpha(x - 1, y) || this.alpha(x + 1, y) || this.alpha(x, y - 1) || this.alpha(x, y + 1)) marks.push(x, y);
      }
    }
    for (let i = 0; i < marks.length; i += 2) this.set(marks[i], marks[i + 1], c);
  }

  /** Escurece pixels opacos na borda (contorno interno). */
  innerEdge(color: string) {
    const c = hexToRgb(color);
    const marks: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.alpha(x, y)) continue;
        if (!this.alpha(x - 1, y) || !this.alpha(x + 1, y) || !this.alpha(x, y - 1) || !this.alpha(x, y + 1)) marks.push(x, y);
      }
    }
    for (let i = 0; i < marks.length; i += 2) this.set(marks[i], marks[i + 1], c);
  }

  toSprite(): Sprite {
    const canvas = makeCanvas(this.w, this.h);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return { canvas, ox: this.ox, oy: this.oy };
  }
}
