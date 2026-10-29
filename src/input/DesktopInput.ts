import type { Vec } from '../core/geometry';

export interface DesktopActions {
  rotate(deg: number): void;
  togglePause(): void;
  escape(): void;
  sell(): void;
  undo(): void;
  copy(): void;
  overview(): void;
  home(): void;
  toggleHud(): void;
  shopSlot(i: number): void;
  wheel(deltaY: number, at: Vec, shift: boolean): void;
  panKeys(dx: number, dy: number): void;
}

/** Teclado e roda do mouse (PC). Nada é obrigatório para jogar. */
export class DesktopInput {
  private a: DesktopActions;
  private keys = new Set<string>();

  constructor(canvas: HTMLElement, actions: DesktopActions, toBuffer: (css: Vec) => Vec) {
    this.a = actions;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const b = toBuffer({ x: e.clientX - r.left, y: e.clientY - r.top });
        const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
        this.a.wheel(dy, b, e.shiftKey);
      },
      { passive: false },
    );
  }

  /** Pan contínuo pelas setas, chamado a cada quadro. */
  update(dt: number) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft')) dx += 1;
    if (this.keys.has('ArrowRight')) dx -= 1;
    if (this.keys.has('ArrowUp')) dy += 1;
    if (this.keys.has('ArrowDown')) dy -= 1;
    if (dx || dy) this.a.panKeys(dx * 360 * dt, dy * 360 * dt);
  }

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key;
    this.keys.add(k);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (k === 'z' || k === 'Z')) {
      e.preventDefault();
      this.a.undo();
      return;
    }
    if (mod) return;
    switch (k) {
      case 'q':
      case 'Q':
        this.a.rotate(e.shiftKey ? -2 : -15);
        break;
      case 'e':
      case 'E':
        this.a.rotate(e.shiftKey ? 2 : 15);
        break;
      case ' ':
      case 'p':
      case 'P':
        e.preventDefault();
        this.a.togglePause();
        break;
      case 'Escape':
        this.a.escape();
        break;
      case 'Delete':
      case 'Backspace':
      case 'r':
      case 'R':
        this.a.sell();
        break;
      case 'c':
      case 'C':
        this.a.copy();
        break;
      case 'f':
      case 'F':
        this.a.overview();
        break;
      case 'h':
      case 'H':
      case 'Home':
        this.a.home();
        break;
      case 'u':
      case 'U':
        this.a.toggleHud();
        break;
      default:
        if (k >= '1' && k <= '9') this.a.shopSlot(Number(k) - 1);
        if (k.startsWith('Arrow')) e.preventDefault();
    }
  };
}
