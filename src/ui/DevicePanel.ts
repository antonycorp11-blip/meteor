import { clear, h, icon } from './dom';
import type { GameApi, SelectedInfo } from './GameApi';

/** Painel compacto da peça selecionada. */
export class DevicePanel {
  readonly root: HTMLElement;
  private api: GameApi;
  private currentId = -1;
  private body: HTMLElement;
  private title: HTMLElement;
  private desc: HTMLElement;
  private sellBtn: HTMLButtonElement;
  private powerBtn: HTMLButtonElement;
  private gateBtn: HTMLButtonElement;
  private angle: HTMLElement;
  private inputs = new Map<string, { input: HTMLInputElement; out: HTMLElement; labels?: string[] }>();

  constructor(api: GameApi) {
    this.api = api;
    this.title = h('div', { class: 'dp-title' }, '');
    this.desc = h('div', { class: 'dp-desc' }, '');
    this.body = h('div', { class: 'dp-params' });
    this.angle = h('span', { class: 'dp-angle' }, '');
    const b = (ic: string, title: string, fn: (e: MouseEvent) => void, label?: string) =>
      h('button', { class: `px-btn icon ${label ? 'labeled' : ''}`, title, 'aria-label': title, onclick: (e: Event) => fn(e as MouseEvent) }, icon(ic, 16), label ? h('span', { class: 'lbl' }, label) : null);
    this.sellBtn = h('button', { class: 'px-btn red', onclick: () => api.sellSelected(), title: 'Revender (Delete)' }, icon('trash', 14), ' Vender');
    this.powerBtn = b('power', 'Ligar/desligar', () => api.toggleEnabled());
    this.gateBtn = h('button', { class: 'px-btn', onclick: () => api.toggleGate(), title: 'Abrir/fechar portinhola' }, icon('gate', 14), ' Alternar');
    this.root = h(
      'div',
      { class: 'device-panel px-panel' },
      h('div', { class: 'dp-head' }, this.title, h('button', { class: 'px-btn icon small', 'aria-label': 'Fechar', onclick: () => api.deselect() }, icon('close', 14))),
      this.desc,
      h(
        'div',
        { class: 'dp-rotate' },
        b('rotl', 'Girar −15° (Q)', (e) => api.rotate(e.shiftKey ? -2 : -15)),
        h('button', { class: 'px-btn fine', title: 'Ajuste fino −2°', onclick: () => api.rotate(-2) }, '−2°'),
        this.angle,
        h('button', { class: 'px-btn fine', title: 'Ajuste fino +2°', onclick: () => api.rotate(2) }, '+2°'),
        b('rotr', 'Girar +15° (E)', (e) => api.rotate(e.shiftKey ? 2 : 15)),
      ),
      this.body,
      h('div', { class: 'row' }, this.powerBtn, this.gateBtn, b('copy', 'Copiar (C)', () => api.copySelected()), this.sellBtn),
      h('div', { class: 'dp-hint' }, 'Arraste a peça para mover · alça amarela gira'),
    );
  }

  show(info: SelectedInfo | null) {
    this.root.classList.toggle('show', !!info);
    if (!info) {
      this.currentId = -1;
      return;
    }
    if (info.id !== this.currentId) {
      this.currentId = info.id;
      this.title.textContent = info.name;
      this.desc.textContent = `${info.desc} ${info.howTo}`;
      clear(this.body);
      this.inputs.clear();
      for (const p of info.params) {
        const out = h('output', {}, '');
        const input = h('input', { type: 'range', min: p.min, max: p.max, step: p.step, value: info.values[p.key] ?? p.def, 'aria-label': p.label }) as HTMLInputElement;
        input.addEventListener('input', () => this.api.setParam(p.key, Number(input.value)));
        this.inputs.set(p.key, { input, out, labels: p.labels });
        this.body.append(h('label', { class: 'dp-param' }, h('span', {}, p.label), input, out));
      }
    }
    for (const [k, r] of this.inputs) {
      const v = info.values[k];
      if (document.activeElement !== r.input) r.input.value = String(v);
      r.out.textContent = r.labels ? r.labels[Math.round(v)] : String(Math.round(v * 100) / 100);
    }
    this.angle.textContent = `${Math.round(info.angleDeg)}°`;
    this.sellBtn.replaceChildren(icon('trash', 14), ` Vender +${info.refund}`);
    this.powerBtn.classList.toggle('off', !info.enabled);
    this.gateBtn.style.display = info.manualGate ? '' : 'none';
  }
}
