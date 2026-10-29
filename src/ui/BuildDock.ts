import type { DeviceType } from '../machines/types';
import { deviceIcon } from '../render/ProceduralArt';
import { clear, h, icon } from './dom';
import type { DockItem, GameApi } from './GameApi';

/**
 * Doca de construção vertical à esquerda. Peças bloqueadas aparecem com
 * cadeado e dizem qual nó da árvore as libera. Passar o mouse (ou tocar e
 * segurar) mostra uma ficha clara: o que faz, como usar e a limitação.
 */
export class BuildDock {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private tip: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private open = true;
  private api: GameApi;
  private icons = new Map<DeviceType, HTMLCanvasElement>();
  private items: DockItem[] = [];
  private cards = new Map<DeviceType, { el: HTMLElement; price: HTMLElement }>();
  onToggle: () => void = () => {};

  constructor(api: GameApi) {
    this.api = api;
    this.list = h('div', { class: 'dock-list', role: 'toolbar', 'aria-label': 'Peças para construir' });
    this.tip = h('div', { class: 'dock-tip px-panel' });
    this.toggleBtn = h('button', { class: 'dock-toggle px-btn', 'aria-label': 'Recolher construção', title: 'Recolher/abrir construção', onclick: () => this.setOpen(!this.open) }, icon('left', 16));
    this.root = h(
      'div',
      { class: 'dock open' },
      h('div', { class: 'dock-body px-panel' }, h('div', { class: 'dock-title' }, icon('build', 14), h('span', {}, 'Construir')), this.list),
      this.toggleBtn,
      this.tip,
    );
  }

  setOpen(v: boolean) {
    this.open = v;
    this.root.classList.toggle('open', v);
    this.toggleBtn.replaceChildren(icon(v ? 'left' : 'right', 16));
    this.hideTip();
    this.onToggle();
  }

  isOpen() {
    return this.open;
  }

  private showTip(it: DockItem, anchor: HTMLElement) {
    clear(this.tip);
    this.tip.append(
      h('div', { class: 'tip-head' }, h('b', {}, it.name), it.locked ? h('span', { class: 'tip-lock' }, icon('lock', 12), ' bloqueada') : h('span', { class: 'tip-price' }, `◆ ${it.price}`)),
      h('p', { class: 'tip-desc' }, it.desc),
      h('p', { class: 'tip-how' }, h('span', {}, 'Como usar: '), it.howTo),
      h('p', { class: 'tip-limit' }, h('span', {}, 'Limite: '), it.limit),
      it.locked ? h('p', { class: 'tip-unlock' }, `Libere na Árvore estelar: “${it.nodeName}” (◆ ${it.nodeCost}).`) : h('p', { class: 'tip-keys' }, 'Clique para posicionar · Q/E ou roda giram · clique para construir'),
    );
    const r = anchor.getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    this.tip.style.top = `${Math.max(8, r.top - root.top - 6)}px`;
    this.tip.classList.add('show');
  }

  private hideTip() {
    this.tip.classList.remove('show');
  }

  refresh(items: DockItem[]) {
    const same = items.length === this.items.length && items.every((it, i) => it.type === this.items[i].type && it.locked === this.items[i].locked);
    this.items = items;
    if (!same) {
      clear(this.list);
      this.cards.clear();
      let slot = 0;
      for (const it of items) {
        let ic = this.icons.get(it.type);
        if (!ic) {
          ic = deviceIcon(it.type, 44);
          this.icons.set(it.type, ic);
        }
        const cv = ic.cloneNode(true) as HTMLCanvasElement;
        cv.getContext('2d')!.drawImage(ic, 0, 0);
        const price = h('span', { class: 'price' }, '');
        const key = it.locked ? '' : String(++slot);
        const el = h(
          'button',
          {
            class: `dock-card ${it.locked ? 'locked' : ''}`,
            'aria-label': `${it.name}${it.locked ? ' (bloqueada)' : `, ${it.price} créditos`}`,
            onclick: () => {
              this.hideTip();
              this.api.uiSound();
              if (it.locked) this.api.openTree();
              else this.api.startGhost(it.type);
            },
            onpointerenter: (e: Event) => this.showTip(it, e.currentTarget as HTMLElement),
            onpointerleave: () => this.hideTip(),
          },
          cv,
          it.locked ? h('span', { class: 'lock' }, icon('lock', 14)) : null,
          key && Number(key) <= 9 ? h('span', { class: 'key' }, key) : null,
          price,
        );
        this.cards.set(it.type, { el, price });
        this.list.append(el);
      }
    }
    for (const it of items) {
      const c = this.cards.get(it.type);
      if (!c) continue;
      c.price.textContent = it.locked ? 'Árvore' : `◆ ${it.price}`;
      c.el.classList.toggle('poor', !it.locked && !it.affordable);
    }
  }

  slot(i: number): DeviceType | null {
    return this.items.filter((it) => !it.locked)[i]?.type ?? null;
  }
}
