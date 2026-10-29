import { clamp, type Vec } from '../core/geometry';

/** Câmera 2D com zoom e limites definidos pelos bounds da zona. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  minZoom = 0.4;
  maxZoom = 2.5;
  private target: { x: number; y: number; zoom: number } | null = null;
  worldW = 1;
  worldH = 1;
  viewW = 640;
  viewH = 360;
  /** áreas cobertas pela interface (px de buffer) */
  insetTop = 0;
  insetBottom = 0;
  insetLeft = 0;

  setWorld(w: number, h: number) {
    this.worldW = w;
    this.worldH = h;
  }

  setView(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
    this.minZoom = Math.min(1, this.fitZoom() * 0.92);
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.clampPos();
  }

  setInsets(top: number, bottom: number, left = 0) {
    this.insetTop = top;
    this.insetBottom = bottom;
    this.insetLeft = left;
    this.minZoom = Math.min(1, this.fitZoom() * 0.92);
    this.clampPos();
  }

  fitZoom() {
    return Math.min((this.viewW - this.insetLeft) / (this.worldW + 30), (this.viewH - this.insetTop - this.insetBottom) / (this.worldH + 20));
  }

  /** Centro da câmera que enquadra o mundo inteiro na área livre. */
  overviewCenter(zoom = this.fitZoom()) {
    const shift = (this.insetBottom - this.insetTop) / 2 / zoom;
    return { x: this.worldW / 2 - this.insetLeft / 2 / zoom, y: this.worldH / 2 + shift };
  }

  /** Converte ponto do buffer (px) para mundo. */
  toWorld(bx: number, by: number): Vec {
    return { x: (bx - this.viewW / 2) / this.zoom + this.x, y: (by - this.viewH / 2) / this.zoom + this.y };
  }

  toBuffer(wx: number, wy: number): Vec {
    return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 };
  }

  panBy(dbx: number, dby: number) {
    this.target = null;
    this.x -= dbx / this.zoom;
    this.y -= dby / this.zoom;
    this.clampPos();
  }

  zoomAt(factor: number, bx: number, by: number) {
    this.target = null;
    const before = this.toWorld(bx, by);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.toWorld(bx, by);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clampPos();
  }

  flyTo(x: number, y: number, zoom: number) {
    this.target = { x, y, zoom: clamp(zoom, this.minZoom, this.maxZoom) };
  }

  overview() {
    const z = this.fitZoom();
    const c = this.overviewCenter(z);
    this.flyTo(c.x, c.y, z);
  }

  snap(x: number, y: number, zoom: number) {
    this.target = null;
    this.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    this.x = x;
    this.y = y;
    this.clampPos();
  }

  update(dt: number) {
    if (!this.target) return;
    const k = 1 - Math.pow(0.0015, dt);
    this.x += (this.target.x - this.x) * k;
    this.y += (this.target.y - this.y) * k;
    this.zoom += (this.target.zoom - this.zoom) * k;
    this.clampPos();
    if (Math.abs(this.target.x - this.x) < 0.5 && Math.abs(this.target.y - this.y) < 0.5 && Math.abs(this.target.zoom - this.zoom) < 0.002) {
      this.zoom = this.target.zoom;
      this.target = null;
    }
  }

  clampPos() {
    const vw = this.viewW / this.zoom;
    const vh = this.viewH / this.zoom;
    const m = 40;
    const left = this.insetLeft / this.zoom;
    const lox = vw / 2 - m - left;
    const hix = this.worldW - vw / 2 + m;
    if (lox > hix) this.x = (lox + hix) / 2;
    else this.x = clamp(this.x, lox, hix);
    const top = this.insetTop / this.zoom;
    const bot = this.insetBottom / this.zoom;
    const lo = vh / 2 - m - top;
    const hi = this.worldH - vh / 2 + m + bot;
    if (lo > hi) this.y = (lo + hi) / 2;
    else this.y = clamp(this.y, lo, hi);
  }
}
