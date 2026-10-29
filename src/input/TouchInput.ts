import type { Vec } from '../core/geometry';

export interface PointerInfo {
  id: number;
  /** coordenadas no buffer de render */
  b: Vec;
  /** coordenadas CSS relativas ao canvas */
  css: Vec;
  touch: boolean;
  button: number;
  shift: boolean;
}

export interface PointerHandlers {
  down(p: PointerInfo): void;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
  hover(p: PointerInfo): void;
  cancel(): void;
  /** gesto de dois dedos: deslocamento (buffer px) e zoom em torno de um ponto */
  gesture(dx: number, dy: number, factor: number, center: Vec): void;
}

/**
 * Normaliza mouse e toque via Pointer Events. Um dedo/ponteiro vira
 * down/move/up; dois dedos viram pan + pinça e cancelam a ação de um dedo.
 */
export class TouchInput {
  private el: HTMLElement;
  private h: PointerHandlers;
  private toBuffer: (css: Vec) => Vec;
  private active = new Map<number, { css: Vec; touch: boolean }>();
  private primary: number | null = null;
  private gestureLast: { mid: Vec; dist: number } | null = null;

  constructor(el: HTMLElement, handlers: PointerHandlers, toBuffer: (css: Vec) => Vec) {
    this.el = el;
    this.h = handlers;
    this.toBuffer = toBuffer;
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private info(e: PointerEvent): PointerInfo {
    const r = this.el.getBoundingClientRect();
    const css = { x: e.clientX - r.left, y: e.clientY - r.top };
    return {
      id: e.pointerId,
      css,
      b: this.toBuffer(css),
      touch: e.pointerType !== 'mouse',
      button: e.button,
      shift: e.shiftKey,
    };
  }

  private midDist() {
    const pts = [...this.active.values()].slice(0, 2).map((a) => a.css);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    return { mid, dist };
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    const p = this.info(e);
    this.active.set(e.pointerId, { css: p.css, touch: p.touch });
    if (this.active.size === 2) {
      // começa gesto: cancela ação de um dedo
      if (this.primary !== null) this.h.cancel();
      this.primary = null;
      this.gestureLast = this.midDist();
      return;
    }
    if (this.active.size > 2) return;
    if (!p.touch && e.button === 2) {
      // botão direito = cancelar / soltar
      this.h.cancel();
      return;
    }
    this.primary = e.pointerId;
    this.h.down(p);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.info(e);
    const a = this.active.get(e.pointerId);
    if (!a) {
      if (!p.touch) this.h.hover(p);
      return;
    }
    a.css = p.css;
    if (this.active.size >= 2 && this.gestureLast) {
      e.preventDefault();
      const now = this.midDist();
      const k = now.dist / Math.max(1, this.gestureLast.dist);
      const b0 = this.toBuffer(this.gestureLast.mid);
      const b1 = this.toBuffer(now.mid);
      this.h.gesture(b1.x - b0.x, b1.y - b0.y, k, b1);
      this.gestureLast = now;
      return;
    }
    if (this.primary === e.pointerId) {
      e.preventDefault();
      this.h.move(p);
    }
  };

  private onUp = (e: PointerEvent) => {
    const had = this.active.delete(e.pointerId);
    if (!had) return;
    if (this.active.size < 2) this.gestureLast = null;
    if (this.primary === e.pointerId) {
      this.primary = null;
      this.h.up(this.info(e));
    }
  };

  private onCancel = (e: PointerEvent) => {
    this.active.delete(e.pointerId);
    if (this.primary === e.pointerId) {
      this.primary = null;
      this.h.cancel();
    }
    if (this.active.size < 2) this.gestureLast = null;
  };
}
