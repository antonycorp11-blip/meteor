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
    this.sellBtn = h('button', { class: 'btn danger', onclick: () => api.sellSelected(), title: 'Revender (Delete/R)' }, icon('trash', 14), ' Vender');
    this.powerBtn = h('button', { class: 'icon-btn', onclick: () => api.toggleEnabled(), title: 'Ligar/desligar', 'aria-label': 'Ligar ou desligar' }, icon('power'));
    this.gateBtn = h('button', { class: 'btn', onclick: () => api.toggleGate(), title: 'Alternar portinhola' }, icon('gate', 14), ' Alternar');
    this.root = h(
      'div',
      { class: 'device-panel panel' },
      h('div', { class: 'dp-head' }, this.title, h('button', { class: 'icon-btn small', 'aria-label': 'Fechar', onclick: () => api.deselect() }, icon('close', 14))),
      this.desc,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'icon-btn', title: 'Girar −15° (Q) · Shift: ajuste fino', 'aria-label': 'Girar −15°', onclick: (e) => api.rotate((e as MouseEvent).shiftKey ? -2 : -15) }, icon('rotl')),
        h('button', { class: 'icon-btn', title: 'Girar −2°', 'aria-label': 'Ajuste fino −2°', onclick: () => api.rotate(-2) }, '−2°'),
        this.angle,
        h('button', { class: 'icon-btn', title: 'Girar +2°', 'aria-label': 'Ajuste fino +2°', onclick: () => api.rotate(2) }, '+2°'),
        h('button', { class: 'icon-btn', title: 'Girar +15° (E)', 'aria-label': 'Girar +15°', onclick: (e) => api.rotate((e as MouseEvent).shiftKey ? 2 : 15) }, icon('rotr')),
      ),
      this.body,
      h(
        'div',
        { class: 'row' },
        this.powerBtn,
        this.gateBtn,
        h('button', { class: 'icon-btn', title: 'Copiar (C)', 'aria-label': 'Copiar peça', onclick: () => api.copySelected() }, icon('copy')),
        this.sellBtn,
      ),
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
      this.desc.textContent = `${info.desc} Limitação: ${info.limit}`;
      clear(this.body);
      this.inputs.clear();
      for (const p of info.params) {
        const out = h('output', {}, '');
        const input = h('input', {
          type: 'range',
          min: p.min,
          max: p.max,
          step: p.step,
          value: info.values[p.key] ?? p.def,
          'aria-label': p.label,
        }) as HTMLInputElement;
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
    this.powerBtn.title = info.enabled ? 'Desligar' : 'Ligar';
    this.gateBtn.style.display = info.manualGate ? '' : 'none';
  }
}
