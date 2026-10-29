import { deviceIcon } from '../render/ProceduralArt';
import type { DeviceType } from '../machines/types';
import { clear, h, icon } from './dom';
import type { GameApi, ShopItem } from './GameApi';

/** Loja recolhível no rodapé: ícones grandes, preço e descrição curta. */
export class Shop {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private tip: HTMLElement;
  private open = true;
  private toggleBtn: HTMLButtonElement;
  private api: GameApi;
  private icons = new Map<DeviceType, HTMLCanvasElement>();
  private items: ShopItem[] = [];
  private cards = new Map<DeviceType, { el: HTMLElement; price: HTMLElement }>();
  onToggle: () => void = () => {};

  constructor(api: GameApi) {
    this.api = api;
    this.list = h('div', { class: 'shop-list', role: 'toolbar', 'aria-label': 'Peças' });
    this.tip = h('div', { class: 'shop-tip' }, '');
    this.toggleBtn = h('button', { class: 'shop-toggle', 'aria-label': 'Recolher loja', onclick: () => this.setOpen(!this.open) }, icon('build', 16), h('span', {}, 'Construir'));
    this.root = h('div', { class: 'shop open' }, this.toggleBtn, h('div', { class: 'shop-body panel' }, this.list, this.tip));
  }

  setOpen(v: boolean) {
    this.open = v;
    this.root.classList.toggle('open', v);
    this.toggleBtn.setAttribute('aria-label', v ? 'Recolher loja' : 'Abrir loja');
    this.onToggle();
  }

  isOpen() {
    return this.open;
  }

  /** Reconstrói os cartões só quando a lista de peças muda. */
  refresh(items: ShopItem[]) {
    const sameSet = items.length === this.items.length && items.every((it, i) => it.type === this.items[i].type);
    this.items = items;
    if (!sameSet) {
      clear(this.list);
      this.cards.clear();
      items.forEach((it, i) => {
        let ic = this.icons.get(it.type);
        if (!ic) {
          ic = deviceIcon(it.type, 40);
          this.icons.set(it.type, ic);
        }
        const price = h('span', { class: 'price' }, '');
        const el = h(
          'button',
          {
            class: 'shop-card',
            title: `${it.name} — ${it.desc} Limite: ${it.limit} ${i < 9 ? `(tecla ${i + 1})` : ''}`,
            'aria-label': `${it.name}, ${it.price} créditos`,
            onclick: () => {
              this.api.uiSound();
              this.api.startGhost(it.type);
              this.tip.textContent = `${it.name}: ${it.desc} Limitação: ${it.limit}`;
            },
            onpointerenter: () => (this.tip.textContent = `${it.name}: ${it.desc} Limitação: ${it.limit}`),
          },
          ic.cloneNode(true) as HTMLCanvasElement,
          h('span', { class: 'name' }, it.name),
          price,
        );
        // canvas clonado perde o desenho; redesenha
        const cv = el.querySelector('canvas')!;
        cv.getContext('2d')!.drawImage(ic, 0, 0);
        this.cards.set(it.type, { el, price });
        this.list.append(el);
      });
    }
    for (const it of items) {
      const c = this.cards.get(it.type);
      if (!c) continue;
      c.price.textContent = `◆ ${it.price}`;
      c.el.classList.toggle('poor', !it.affordable);
      c.el.classList.toggle('new', it.isNew);
    }
  }

  slot(i: number): DeviceType | null {
    return this.items[i]?.type ?? null;
  }
}
