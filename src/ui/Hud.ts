import { fmt, h, icon } from './dom';
import type { GameApi, HudData } from './GameApi';

/**
 * HUD: créditos (esq.), barra de crescimento do buraco negro com o medidor de
 * calor (centro), atalhos (dir.) e controles de câmera (canto inferior dir.).
 */
export class Hud {
  readonly root: HTMLElement;
  private credits: HTMLElement;
  private zoneName: HTMLElement;
  private growthFill: HTMLElement;
  private growthPct: HTMLElement;
  private growthLabel: HTMLElement;
  private heatFill: HTMLElement;
  private heatMult: HTMLElement;
  private heatBox: HTMLElement;
  private heatTip: HTMLElement;
  private autoMine: HTMLElement;
  private pauseBtn: HTMLButtonElement;
  private treeBadge: HTMLElement;
  private chalBadge: HTMLElement;
  private toasts: HTMLElement;
  private fps: HTMLElement;
  private ghostBar: HTMLElement;
  private ghostInfo: HTMLElement;
  private ghostOk: HTMLButtonElement;
  private hidden = false;
  private pausedTag: HTMLElement;
  onTree: () => void = () => {};
  onChallenges: () => void = () => {};
  onMenu: () => void = () => {};
  onStats: () => void = () => {};

  constructor(api: GameApi) {
    const btn = (name: string, title: string, fn: () => void, extra?: HTMLElement, label?: string) =>
      h(
        'button',
        { class: `px-btn icon ${label ? 'labeled' : ''}`, title, 'aria-label': title, onclick: () => (api.uiSound(), fn()) },
        icon(name, 20),
        label ? h('span', { class: 'lbl' }, label) : null,
        extra ?? null,
      );

    this.credits = h('span', { class: 'credits-val' }, '0');
    this.zoneName = h('div', { class: 'zone-name' }, '');
    const left = h('div', { class: 'hud-left px-panel' }, h('div', { class: 'credits' }, h('span', { class: 'gem' }), this.credits), this.zoneName);

    // --- buraco negro + calor
    this.growthFill = h('span', { class: 'grow-fill' });
    this.growthPct = h('span', { class: 'grow-pct' }, '0%');
    this.growthLabel = h('span', { class: 'grow-label' }, 'ALIMENTE O BURACO NEGRO');
    this.heatFill = h('span', { class: 'heat-fill' });
    this.heatMult = h('span', { class: 'heat-mult' }, '×1.0');
    this.heatTip = h(
      'div',
      { class: 'heat-tip px-panel' },
      h('b', {}, 'Calor'),
      h('p', {}, 'Cada pedra entregue esquenta o buraco negro. Quanto mais quente, mais massa e créditos cada entrega rende (até o multiplicador máximo).'),
      h('p', {}, 'Ele esfria sozinho: entregas uma a uma quase não aquecem; um fluxo contínuo de pedras (automação!) mantém o calor no máximo.'),
    );
    this.heatBox = h(
      'button',
      { class: 'heat', title: 'Calor — toque para entender', onclick: () => this.heatTip.classList.toggle('show') },
      icon('flame', 18),
      h('span', { class: 'heat-bar' }, this.heatFill),
      this.heatMult,
    );
    this.autoMine = h('span', { class: 'auto-mine', title: 'Mineração automática' }, '');
    const center = h(
      'div',
      { class: 'hud-center px-panel' },
      h('div', { class: 'grow-row' }, this.growthLabel, this.growthPct),
      h('div', { class: 'grow-bar' }, this.growthFill),
      h('div', { class: 'heat-row' }, this.heatBox, this.autoMine),
      this.heatTip,
    );

    this.pauseBtn = btn('pause', 'Pausar (Espaço)', () => api.togglePause());
    this.treeBadge = h('span', { class: 'badge' }, '');
    this.chalBadge = h('span', { class: 'badge soft' }, '');
    const right = h(
      'div',
      { class: 'hud-right' },
      btn('tree', 'Árvore estelar (T)', () => this.onTree(), this.treeBadge, 'Árvore'),
      btn('trophy', 'Desafios', () => this.onChallenges(), this.chalBadge, 'Desafios'),
      this.pauseBtn,
      btn('menu', 'Menu (Esc)', () => this.onMenu()),
    );
    const cam = h(
      'div',
      { class: 'hud-cam' },
      btn('overview', 'Visão geral (F)', () => api.overview()),
      btn('home', 'Ir até o asteroide (H)', () => api.home()),
      btn('undo', 'Desfazer construção (Ctrl+Z)', () => api.undo()),
      btn('stats', 'Estatísticas', () => this.onStats()),
      btn('eye', 'Esconder interface (U)', () => this.toggleHidden()),
    );

    this.pausedTag = h('div', { class: 'paused-tag' }, 'PAUSADO — construa com calma');
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.fps = h('div', { class: 'fps' }, '');

    this.ghostInfo = h('div', { class: 'ghost-info' }, '');
    this.ghostOk = h('button', { class: 'px-btn green', 'aria-label': 'Construir aqui', onclick: () => api.confirmGhost() }, icon('check', 16), h('span', {}, 'Construir'));
    this.ghostBar = h(
      'div',
      { class: 'ghost-bar px-panel' },
      this.ghostInfo,
      h('button', { class: 'px-btn icon', 'aria-label': 'Girar −15°', title: 'Girar −15° (Q)', onclick: () => api.rotate(-15) }, icon('rotl', 18)),
      h('button', { class: 'px-btn icon', 'aria-label': 'Girar +15°', title: 'Girar +15° (E)', onclick: () => api.rotate(15) }, icon('rotr', 18)),
      this.ghostOk,
      h('button', { class: 'px-btn icon', 'aria-label': 'Cancelar', title: 'Cancelar (Esc)', onclick: () => api.cancelGhost() }, icon('close', 18)),
    );

    const showBtn = h('button', { class: 'px-btn icon show-hud', title: 'Mostrar interface (U)', 'aria-label': 'Mostrar interface', onclick: () => this.toggleHidden() }, icon('eye', 20));
    this.root = h('div', { class: 'hud' }, left, center, right, cam, this.pausedTag, this.toasts, this.fps, this.ghostBar, showBtn);
  }

  toggleHidden() {
    this.hidden = !this.hidden;
    document.body.classList.toggle('hud-hidden', this.hidden);
  }

  update(d: HudData, showFps: boolean) {
    this.credits.textContent = fmt(d.credits);
    this.zoneName.textContent = `Zona ${d.zoneId} · ${d.zoneName}`;
    this.growthFill.style.width = `${(d.growth * 100).toFixed(1)}%`;
    this.growthPct.textContent = `${Math.floor(d.growth * 100)}%`;
    this.growthLabel.textContent = d.growthLabel;
    const heatFrac = d.heat;
    this.heatFill.style.width = `${Math.round(heatFrac * 100)}%`;
    this.heatMult.textContent = `×${d.heatMult.toFixed(1)}`;
    this.heatBox.classList.toggle('hot', heatFrac > 0.66);
    this.heatBox.classList.toggle('warm', heatFrac > 0.25 && heatFrac <= 0.66);
    this.heatBox.title = `Calor: multiplicador ×${d.heatMult.toFixed(2)} (máximo ×${d.heatMax}). Toque para entender.`;
    this.autoMine.textContent = d.autoMine > 0 ? `Mineração auto: 1 pedra / ${d.autoMine.toFixed(1)} s` : '';
    this.pauseBtn.replaceChildren(icon(d.paused ? 'play' : 'pause', 20));
    this.pauseBtn.title = d.paused ? 'Retomar (Espaço)' : 'Pausar (Espaço)';
    this.pausedTag.style.display = d.paused ? 'block' : 'none';
    this.treeBadge.textContent = d.affordableNodes > 0 ? String(d.affordableNodes) : '';
    this.chalBadge.textContent = `${d.challengesDone}/${d.challengesTotal}`;
    this.fps.textContent = showFps ? `${d.fps} fps · ${d.active}/${d.maxActive} corpos` : '';
    this.ghostBar.classList.toggle('show', d.ghostActive);
    if (d.ghostActive) {
      this.ghostInfo.textContent = d.ghostValid ? `◆ ${d.ghostPrice}` : d.ghostReason;
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

  showHeatTip() {
    this.heatTip.classList.add('show');
    setTimeout(() => this.heatTip.classList.remove('show'), 9000);
  }

  banner(title: string, sub: string) {
    const el = h('div', { class: 'banner' }, h('div', { class: 'banner-title' }, title), h('div', { class: 'banner-sub' }, sub));
    this.root.append(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }
}
