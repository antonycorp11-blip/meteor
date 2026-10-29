import { pixelTitle } from '../render/PixelFont';
import { PAL } from '../render/palette';
import { fmt, h, icon } from './dom';
import type { GameApi, HudData } from './GameApi';

/** HUD minimalista: créditos, uma linha de objetivo e botões recolhíveis. */
export class Hud {
  readonly root: HTMLElement;
  private credits: HTMLElement;
  private zoneName: HTMLElement;
  private objective: HTMLElement;
  private objBar: HTMLElement;
  private eff: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private researchBadge: HTMLElement;
  private toasts: HTMLElement;
  private fps: HTMLElement;
  private ghostBar: HTMLElement;
  private ghostInfo: HTMLElement;
  private ghostOk: HTMLButtonElement;
  private hidden = false;
  private pausedTag: HTMLElement;
  private combo: HTMLElement;
  onObjective: () => void = () => {};
  onResearch: () => void = () => {};
  onMenu: () => void = () => {};
  onStats: () => void = () => {};

  constructor(api: GameApi) {
    const btn = (name: string, title: string, fn: () => void) =>
      h('button', { class: 'icon-btn', title, 'aria-label': title, onclick: () => (api.uiSound(), fn()) }, icon(name));

    this.credits = h('span', { class: 'credits-val' }, '0');
    this.zoneName = h('span', { class: 'zone-name' }, '');
    this.combo = h('span', { class: 'combo' }, '');
    const left = h(
      'div',
      { class: 'hud-left panel' },
      h('div', { class: 'credits' }, h('span', { class: 'gem' }, '◆'), this.credits, this.combo),
      this.zoneName,
    );

    this.objective = h('span', { class: 'obj-text' }, '');
    this.objBar = h('span', { class: 'obj-bar-fill' });
    this.eff = h('span', { class: 'obj-eff' }, '');
    const center = h(
      'button',
      { class: 'hud-center panel', title: 'Objetivos da zona', onclick: () => this.onObjective() },
      this.objective,
      h('span', { class: 'obj-bar' }, this.objBar),
      this.eff,
    );

    this.pauseBtn = btn('pause', 'Pausar simulação (Espaço)', () => api.togglePause());
    this.researchBadge = h('span', { class: 'badge' }, '');
    const research = h(
      'button',
      { class: 'icon-btn', title: 'Pesquisa estelar', 'aria-label': 'Pesquisa estelar', onclick: () => (api.uiSound(), this.onResearch()) },
      icon('star'),
      this.researchBadge,
    );
    const right = h(
      'div',
      { class: 'hud-right' },
      this.pauseBtn,
      btn('overview', 'Visão geral (F)', () => api.overview()),
      btn('home', 'Voltar à fonte (H)', () => api.home()),
      btn('undo', 'Desfazer construção (Ctrl+Z)', () => api.undo()),
      btn('stats', 'Estatísticas', () => this.onStats()),
      research,
      btn('eye', 'Esconder HUD (U)', () => this.toggleHidden()),
      btn('menu', 'Menu', () => this.onMenu()),
    );

    this.pausedTag = h('div', { class: 'paused-tag' }, 'PAUSADO — edição livre');
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.fps = h('div', { class: 'fps' }, '');

    this.ghostInfo = h('div', { class: 'ghost-info' }, '');
    this.ghostOk = h('button', { class: 'btn ok', 'aria-label': 'Confirmar posição', onclick: () => api.confirmGhost() }, icon('check'), ' Construir');
    this.ghostBar = h(
      'div',
      { class: 'ghost-bar panel' },
      this.ghostInfo,
      h('div', { class: 'row' },
        h('button', { class: 'icon-btn', 'aria-label': 'Girar −15°', title: 'Girar −15° (Q)', onclick: () => api.rotate(-15) }, icon('rotl')),
        h('button', { class: 'icon-btn', 'aria-label': 'Girar +15°', title: 'Girar +15° (E)', onclick: () => api.rotate(15) }, icon('rotr')),
        this.ghostOk,
        h('button', { class: 'icon-btn', 'aria-label': 'Cancelar', title: 'Cancelar (Esc)', onclick: () => api.cancelGhost() }, icon('close')),
      ),
    );

    const showBtn = h('button', { class: 'icon-btn show-hud', title: 'Mostrar HUD (U)', 'aria-label': 'Mostrar HUD', onclick: () => this.toggleHidden() }, icon('eye'));

    this.root = h('div', { class: 'hud' }, left, center, right, this.pausedTag, this.toasts, this.fps, this.ghostBar, showBtn);
  }

  toggleHidden() {
    this.hidden = !this.hidden;
    document.body.classList.toggle('hud-hidden', this.hidden);
  }

  update(d: HudData, showFps: boolean) {
    this.credits.textContent = fmt(d.credits);
    this.zoneName.textContent = `${String(d.zoneId).padStart(2, '0')} · ${d.zoneName}`;
    this.combo.textContent = d.combo >= 3 ? ` ×${d.combo}` : '';
    this.objective.textContent = d.objective;
    this.objBar.style.width = `${Math.round(d.objectiveProgress * 100)}%`;
    this.eff.textContent = d.efficiency;
    this.pauseBtn.replaceChildren(icon(d.paused ? 'play' : 'pause'));
    this.pauseBtn.title = d.paused ? 'Retomar simulação (Espaço)' : 'Pausar simulação (Espaço)';
    this.pausedTag.style.display = d.paused ? 'block' : 'none';
    this.researchBadge.textContent = d.research > 0 ? String(d.research) : '';
    this.fps.textContent = showFps ? `${d.fps} fps · ${d.active}/${d.maxActive} corpos` : '';
    this.ghostBar.classList.toggle('show', d.ghostActive);
    if (d.ghostActive) {
      this.ghostInfo.textContent = d.ghostValid ? `Custo ◆ ${d.ghostPrice}` : d.ghostReason;
      this.ghostInfo.classList.toggle('bad', !d.ghostValid);
      this.ghostOk.disabled = !d.ghostValid;
    }
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'goal' = 'info', ms = 2600) {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.toasts.prepend(el);
    while (this.toasts.children.length > 4) this.toasts.lastElementChild?.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 500);
  }

  /** Cartão curto de nova zona/conquista, sem cortar o jogo. */
  banner(title: string, sub: string) {
    const el = h('div', { class: 'banner' }, pixelTitle(title, 3, PAL.core), h('div', { class: 'banner-sub' }, sub));
    this.root.append(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }
}
