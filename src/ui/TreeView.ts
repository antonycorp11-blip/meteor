import { DEVICES } from '../machines/catalog';
import { BRANCH_INFO, ROMAN, TREE, TREE_BY_ID, canBuyNode, levelCap, levelCost, maxLevel, nodeState, type Levels, type TreeNode } from '../progression/SkillTree';
import { deviceIcon } from '../render/ProceduralArt';
import { clear, fmt, h, icon } from './dom';
import type { GameApi } from './GameApi';

const CELL_X = 112;
const CELL_Y = 100;
const NODE = 60;

/** Árvore estelar: grafo navegável (arrastar para mover), nós ligados por linhas. */
export class TreeView {
  readonly root: HTMLElement;
  private api: GameApi;
  private viewport: HTMLElement;
  private canvas: HTMLElement;
  private svg: SVGSVGElement;
  private detail: HTMLElement;
  private creditsEl: HTMLElement;
  private selected = 'core';
  private pan = { x: 0, y: 0 };
  private drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
  private bounds = { minX: 0, minY: 0, w: 0, h: 0 };
  onClose: () => void = () => {};

  constructor(api: GameApi) {
    this.api = api;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('tree-edges');
    this.canvas = h('div', { class: 'tree-canvas' });
    this.canvas.append(this.svg);
    this.viewport = h('div', { class: 'tree-viewport' }, this.canvas);
    this.detail = h('div', { class: 'tree-detail px-panel' });
    this.creditsEl = h('span', { class: 'tree-credits' }, '');
    const legend = h(
      'div',
      { class: 'tree-legend' },
      ...Object.entries(BRANCH_INFO)
        .filter(([k]) => k !== 'core')
        .map(([, b]) => h('span', {}, h('i', { style: `background:${b.color}` }), b.name)),
    );
    this.root = h(
      'div',
      { class: 'tree-overlay' },
      h(
        'div',
        { class: 'tree-head' },
        h('div', { class: 'tree-title' }, icon('tree', 22), h('span', {}, 'Árvore estelar')),
        legend,
        this.creditsEl,
        h('button', { class: 'px-btn icon', 'aria-label': 'Fechar', onclick: () => this.close() }, icon('close', 20)),
      ),
      this.viewport,
      this.detail,
      h('div', { class: 'tree-help' }, 'Arraste para navegar · clique num nó para ver detalhes'),
    );
    this.viewport.addEventListener('pointerdown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, px: this.pan.x, py: this.pan.y, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
      this.pan = { x: this.drag.px + dx, y: this.drag.py + dy };
      this.applyPan();
    });
    window.addEventListener('pointerup', () => {
      setTimeout(() => (this.drag = null), 0);
    });
    this.viewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.pan = { x: this.pan.x - e.deltaX, y: this.pan.y - e.deltaY };
        this.applyPan();
      },
      { passive: false },
    );
  }

  isOpen() {
    return this.root.classList.contains('show');
  }

  open() {
    this.root.classList.add('show');
    this.render();
    const vr = this.viewport.getBoundingClientRect();
    const core = this.nodePos(TREE_BY_ID.get('core')!);
    this.pan = { x: vr.width / 2 - core.x - NODE / 2 - 60, y: vr.height / 2 - core.y - NODE / 2 };
    this.applyPan();
  }

  close() {
    this.root.classList.remove('show');
    this.onClose();
  }

  private applyPan() {
    this.canvas.style.transform = `translate(${Math.round(this.pan.x)}px, ${Math.round(this.pan.y)}px)`;
  }

  private nodePos(n: TreeNode) {
    return { x: (n.x - this.bounds.minX) * CELL_X + 40, y: (n.y - this.bounds.minY) * CELL_Y + 40 };
  }

  render() {
    const owned = this.api.save.tree.levels;
    const credits = this.api.save.credits;
    const reached = this.api.reachedZone();
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    for (const n of TREE) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    this.bounds = { minX, minY, w: (maxX - minX) * CELL_X + NODE + 80, h: (maxY - minY) * CELL_Y + NODE + 80 };
    this.canvas.style.width = `${this.bounds.w}px`;
    this.canvas.style.height = `${this.bounds.h}px`;
    this.svg.setAttribute('width', String(this.bounds.w));
    this.svg.setAttribute('height', String(this.bounds.h));
    this.creditsEl.textContent = `◆ ${fmt(credits)}`;
    // linhas
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    for (const n of TREE) {
      for (const pid of n.parents) {
        const p = TREE_BY_ID.get(pid)!;
        const a = this.nodePos(p);
        const b = this.nodePos(n);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(a.x + NODE / 2));
        line.setAttribute('y1', String(a.y + NODE / 2));
        line.setAttribute('x2', String(b.x + NODE / 2));
        line.setAttribute('y2', String(b.y + NODE / 2));
        const st = (owned[n.id] ?? 0) > 0 ? 'owned' : (owned[pid] ?? 0) > 0 ? 'available' : 'locked';
        line.setAttribute('class', `edge ${st}`);
        line.style.setProperty('--branch', BRANCH_INFO[n.branch].color);
        this.svg.append(line);
      }
    }
    // nós
    for (const el of [...this.canvas.querySelectorAll('.tree-node')]) el.remove();
    for (const n of TREE) {
      const st = nodeState(owned, n.id);
      const can = canBuyNode(owned, credits, reached, n.id);
      const zoneLocked = st === 'available' && !!n.requiresZone && reached < n.requiresZone;
      const pos = this.nodePos(n);
      let iconEl: Node;
      if (n.unlock) {
        const c = deviceIcon(n.unlock, 44);
        const cv = c.cloneNode(true) as HTMLCanvasElement;
        cv.getContext('2d')!.drawImage(c, 0, 0);
        iconEl = cv;
      } else iconEl = icon(n.icon ?? 'star', 30);
      const el = h(
        'button',
        {
          class: `tree-node ${st} ${zoneLocked ? 'zonelock' : ''} ${can.ok ? 'buyable' : ''} ${this.selected === n.id ? 'sel' : ''} ${n.unlock ? 'piece' : ''}`,
          style: `left:${pos.x}px; top:${pos.y}px; --branch:${BRANCH_INFO[n.branch].color}`,
          'aria-label': n.name,
          onclick: () => {
            if (this.drag?.moved) return;
            this.selected = n.id;
            this.api.uiSound();
            this.render();
          },
        },
        iconEl,
        st === 'locked' ? h('span', { class: 'n-lock' }, icon('lock', 12)) : null,
        h('span', { class: 'n-name' }, n.name),
        maxLevel(n) > 1 ? h('span', { class: `n-level ${(owned[n.id] ?? 0) > 0 ? 'on' : ''}` }, `${owned[n.id] ?? 0}/${maxLevel(n)}`) : null,
        st !== 'owned' && n.cost > 0
          ? h('span', { class: 'n-cost' }, zoneLocked ? `Planeta ${ROMAN[Math.min(5, n.requiresZone!)]}` : (owned[n.id] ?? 0) >= levelCap(n, reached) ? 'teto' : `◆ ${fmt(levelCost(n, owned[n.id] ?? 0))}`)
          : null,
      );
      this.canvas.append(el);
    }
    this.renderDetail(owned, credits, reached);
  }

  private renderDetail(owned: Levels, credits: number, reached: number) {
    const n = TREE_BY_ID.get(this.selected)!;
    const st = nodeState(owned, n.id);
    const can = canBuyNode(owned, credits, reached, n.id);
    clear(this.detail);
    const piece = n.unlock ? DEVICES[n.unlock] : null;
    const parts: (Node | null)[] = [
      h('div', { class: 'td-branch', style: `color:${BRANCH_INFO[n.branch].color}` }, BRANCH_INFO[n.branch].name.toUpperCase()),
      h('div', { class: 'td-name' }, n.name),
      h('p', { class: 'td-desc' }, n.desc),
      maxLevel(n) > 1 ? this.levelInfo(n, owned[n.id] ?? 0, reached) : null,
      piece ? h('p', { class: 'td-piece' }, piece.desc) : null,
      piece ? h('p', { class: 'td-how' }, `Como usar: ${piece.howTo}`) : null,
      n.parents.length ? h('p', { class: 'td-req' }, `Requer: ${n.parents.map((p) => TREE_BY_ID.get(p)!.name).join(', ')}${n.requiresZone ? ` · planeta ${ROMAN[Math.min(5, n.requiresZone)]}` : ''}`) : null,
      st === 'owned'
        ? h('div', { class: 'td-owned' }, maxLevel(n) > 1 ? '✓ Nível máximo' : '✓ Desbloqueado')
        : h(
            'button',
            {
              class: `px-btn ${can.ok ? 'amber' : ''}`,
              disabled: !can.ok,
              onclick: () => {
                if (this.api.buyNode(n.id)) this.render();
              },
            },
            can.ok ? `${(owned[n.id] ?? 0) > 0 ? `Nível ${(owned[n.id] ?? 0) + 1}` : maxLevel(n) > 1 ? 'Nível 1' : 'Desbloquear'} · ◆ ${fmt(can.cost ?? n.cost)}` : can.reason ?? '',
          ),
    ];
    for (const p of parts) if (p) this.detail.append(p);
  }

  private levelInfo(n: TreeNode, lvl: number, reached: number) {
    const max = maxLevel(n);
    const cap = levelCap(n, reached);
    const pips = h('div', { class: 'td-pips' });
    for (let i = 1; i <= max; i++) pips.append(h('i', { class: i <= lvl ? 'on' : i <= cap ? '' : 'capped' }));
    return h(
      'div',
      { class: 'td-levels' },
      h('div', { class: 'td-lv' }, `Nível ${lvl}/${max}`, cap < max ? h('span', {}, ` · teto ${cap} neste planeta`) : null),
      pips,
      n.effect ? h('p', { class: 'td-effect' }, lvl > 0 ? `Agora: ${n.effect(lvl)}` : 'Ainda não comprado') : null,
      n.effect && lvl < max ? h('p', { class: 'td-effect next' }, `Próximo: ${n.effect(lvl + 1)}`) : null,
    );
  }
}
