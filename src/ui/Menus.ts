import { MUSIC_INFO } from '../audio/MusicEngine';
import { Config } from '../core/Config';
import { FRAGMENT_TYPES } from '../physics/fragmentTypes';
import type { Settings } from '../save/SaveManager';
import { clear, fmt, h, icon } from './dom';
import type { GameApi } from './GameApi';

type Screen = 'title' | 'zones' | 'settings' | 'stats' | 'goals' | 'help' | 'complete' | 'confirm';

/** Telas sobrepostas: título, zonas, desafios, ajustes, estatísticas… */
export class Menus {
  readonly root: HTMLElement;
  private api: GameApi;
  private card: HTMLElement;
  screen: Screen | null = null;
  onClose: () => void = () => {};

  constructor(api: GameApi) {
    this.api = api;
    this.card = h('div', { class: 'menu-card' });
    this.root = h('div', { class: 'menu-overlay', onclick: (e) => e.target === this.root && this.screen !== 'title' && this.screen !== 'complete' && this.close() }, this.card);
  }

  isOpen() {
    return this.screen !== null;
  }

  close() {
    this.screen = null;
    this.root.classList.remove('show');
    document.body.classList.remove('on-title');
    this.onClose();
  }

  private open(s: Screen, ...content: (Node | null)[]) {
    this.screen = s;
    document.body.classList.toggle('on-title', s === 'title');
    clear(this.card);
    this.card.className = `menu-card ${s === 'title' ? '' : 'px-panel'} screen-${s}`;
    for (const c of content) if (c) this.card.append(c);
    this.root.classList.add('show');
  }

  private header(title: string, ic: string) {
    return h(
      'div',
      { class: 'menu-head' },
      h('h2', {}, icon(ic, 22), h('span', {}, title)),
      h('button', { class: 'px-btn icon', 'aria-label': 'Fechar', onclick: () => (this.api.uiSound(), this.close()) }, icon('close', 18)),
    );
  }

  show(s: Screen) {
    if (s === 'title') this.title();
    else if (s === 'zones') this.zones();
    else if (s === 'settings') this.settings();
    else if (s === 'stats') this.stats();
    else if (s === 'help') this.help();
    else if (s === 'goals') this.goals();
  }

  title() {
    const sv = this.api.save;
    const started = sv.unlockedZone > 1 || Object.values(sv.zones).some((z) => z.stats.generated > 0);
    const item = (label: string, fn: () => void, primary = false) =>
      h('button', { class: `title-item ${primary ? 'primary' : ''}`, onclick: () => (this.api.uiSound(), fn()) }, h('span', { class: 'ti-arrow' }, '▶'), h('span', {}, label));
    this.open(
      'title',
      h(
        'div',
        { class: 'title-layout' },
        h(
          'div',
          { class: 'logo' },
          h('div', { class: 'logo-meteor' }, 'METEOR'),
          h('div', { class: 'logo-mill' }, 'MILL'),
          h('div', { class: 'logo-sub' }, 'QUEBRE O ASTEROIDE · ALIMENTE O BURACO NEGRO'),
        ),
        h(
          'nav',
          { class: 'title-menu' },
          item(started ? 'Continuar' : 'Jogar', () => this.api.play(), true),
          item('Zonas', () => this.zones()),
          item('Árvore estelar', () => this.api.openTree()),
          item('Como jogar', () => this.help()),
          item('Ajustes', () => this.settings()),
        ),
        h('div', { class: 'title-foot' }, started ? `◆ ${fmt(sv.credits)} · Zona ${sv.unlockedZone} de 5` : `Trilha original procedural · ${MUSIC_INFO.bpm} BPM`),
      ),
    );
  }

  zones() {
    const cards = this.api.zoneCards().map((z) =>
      h(
        'button',
        {
          class: `zone-card ${z.unlocked ? '' : 'locked'} ${z.complete ? 'complete' : ''} ${z.current ? 'current' : ''}`,
          disabled: !z.unlocked,
          onclick: () => (this.api.uiSound(), this.api.openZone(z.id)),
        },
        h('div', { class: 'zc-num' }, `ZONA ${z.id}`),
        h('div', { class: 'zc-name' }, z.name),
        h('div', { class: 'zc-sub' }, z.unlocked ? z.subtitle : 'O buraco negro anterior ainda não engoliu o mapa'),
        h('div', { class: 'zc-bar' }, h('i', { style: `width:${Math.round(z.growth * 100)}%` })),
        h('div', { class: 'zc-meta' }, z.complete ? 'Buraco negro supermassivo ✓' : z.unlocked ? `Buraco negro ${Math.floor(z.growth * 100)}%` : '—'),
      ),
    );
    this.open('zones', this.header('Zonas', 'overview'), h('div', { class: 'zone-grid' }, ...cards), h('p', { class: 'fineprint' }, 'Cada zona guarda as peças que você construiu. Créditos e a Árvore estelar valem para todas.'));
  }

  goals() {
    const goals = this.api.challenges();
    const cards = goals.map((g) =>
      h(
        'div',
        { class: `goal ${g.done ? 'done' : ''}` },
        h('div', { class: 'goal-head' }, icon('trophy', 16), h('span', {}, g.def.title), h('span', { class: 'reward' }, g.done ? '✓' : `◆ ${g.def.reward}`)),
        ...g.reqs.map((r) => h('div', { class: 'req' }, h('span', {}, r.label), h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(r.value * 100)}%` })))),
      ),
    );
    const hints = this.api.zoneHints();
    const hint = hints.length ? hints[Math.floor(Math.random() * hints.length)] : '';
    this.open('goals', this.header('Desafios da zona', 'trophy'), h('p', { class: 'fineprint' }, 'Opcionais: cada desafio cumprido paga um bônus em créditos.'), ...cards, hint ? h('p', { class: 'hint' }, `Dica: ${hint}`) : null);
  }

  settings() {
    const s = this.api.save.settings;
    const slider = (key: 'master' | 'music' | 'sfx', label: string) => {
      const input = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key], 'aria-label': label }) as HTMLInputElement;
      input.addEventListener('input', () => this.api.setSetting(key, Number(input.value)));
      return h('label', { class: 'set-row' }, h('span', {}, label), input);
    };
    const toggle = (key: keyof Settings, label: string) => {
      const input = h('input', { type: 'checkbox', checked: Boolean(s[key]) }) as HTMLInputElement;
      input.addEventListener('change', () => this.api.setSetting(key, input.checked as never));
      return h('label', { class: 'set-row check' }, input, h('span', {}, label));
    };
    const scale = h('select', { 'aria-label': 'Escala da interface' }) as HTMLSelectElement;
    for (const v of [0.85, 1, 1.15, 1.3, 1.5]) scale.append(h('option', { value: v, selected: s.uiScale === v }, `${Math.round(v * 100)}%`));
    scale.addEventListener('change', () => this.api.setSetting('uiScale', Number(scale.value)));
    this.open(
      'settings',
      this.header('Ajustes', 'menu'),
      h(
        'div',
        { class: 'settings-grid' },
        h('div', {}, h('h3', {}, 'Áudio'), slider('master', 'Geral'), slider('music', 'Música'), slider('sfx', 'Efeitos'), toggle('muted', 'Mudo')),
        h(
          'div',
          {},
          h('h3', {}, 'Interface'),
          h('label', { class: 'set-row' }, h('span', {}, 'Escala'), scale),
          toggle('reduceParticles', 'Menos brilho e partículas'),
          toggle('noShake', 'Sem tremor de câmera'),
          toggle('highContrast', 'Contraste reforçado'),
          toggle('snap', 'Encaixe em grade (4 px / 5°)'),
          toggle('showFps', 'Mostrar FPS'),
        ),
      ),
      h('div', { class: 'row end' }, h('button', { class: 'px-btn red', onclick: () => this.confirm('Apagar todo o progresso salvo? Isso não pode ser desfeito.', () => this.api.resetSave()) }, 'Apagar progresso')),
    );
  }

  stats() {
    const st = this.api.stats();
    const s = st.stats;
    const row = (k: string, v: string) => h('tr', {}, h('th', {}, k), h('td', {}, v));
    this.open(
      'stats',
      this.header('Estatísticas da zona', 'stats'),
      h(
        'table',
        { class: 'stats' },
        row('Energia entregue ao buraco negro', fmt(s.energyFed)),
        row('Maior multiplicador de calor', `×${s.bestHeatMult.toFixed(2)}`),
        row('Entregas por minuto', String(st.perMinute)),
        row('Eficiência', st.considered >= st.window ? `${Math.round(st.efficiencyPct)}% (${st.delivered}/${st.window})` : `amostra ${st.considered}/${st.window}`),
        row('Entregas (automáticas)', `${s.delivered} (${s.autoDelivered})`),
        row('Pedras geradas', String(s.generated)),
        row('Perdidas / recolhidas', `${s.lost} / ${s.recycled}`),
        row('Créditos ganhos aqui', fmt(s.creditsEarned)),
        row('Peças instaladas', String(st.devices)),
        row('Tempo na zona', `${Math.floor(s.timePlayed / 60)} min`),
      ),
      h('p', { class: 'fineprint' }, `Pedras paradas por mais de ${Config.restRecycleSeconds} s ou fora do mapa são recolhidas sem crédito. Entrega automática = chegou sem você puxá-la com o feixe.`),
    );
  }

  help() {
    const types = Object.values(FRAGMENT_TYPES)
      .filter((t) => t.id !== 'shard')
      .map((t) => h('li', {}, h('b', {}, t.name), ` — ${t.desc}`));
    this.open(
      'help',
      this.header('Como jogar', 'info'),
      h(
        'div',
        { class: 'help-grid' },
        h(
          'div',
          {},
          h('h3', {}, 'Objetivo'),
          h('p', {}, 'Quebre o asteroide e leve as pedras até o buraco negro. A cada entrega ele cresce; quando a barra do topo enche, ele engole o mapa inteiro e você segue para um buraco negro maior.'),
          h('h3', {}, 'Calor ×'),
          h('p', {}, 'Entregas seguidas esquentam o buraco negro e multiplicam massa e créditos. Ele esfria sozinho: monte um fluxo contínuo para manter o calor alto.'),
          h('h3', {}, 'Automação'),
          h('p', {}, 'Na Árvore estelar, libere a Mineração automática: o asteroide passa a soltar pedras sozinho na direção do seu último golpe. Peças novas também são liberadas na árvore.'),
        ),
        h(
          'div',
          {},
          h('h3', {}, 'Controles'),
          h(
            'ul',
            {},
            h('li', {}, 'Clique no asteroide: minera (segure para repetir).'),
            h('li', {}, 'Segure e arraste uma pedra: feixe de força limitada.'),
            h('li', {}, 'Arraste o fundo: move a câmera · roda/pinça: zoom.'),
            h('li', {}, 'Peças: escolha na barra à esquerda, posicione, gire (Q/E, roda ou alça amarela) e clique.'),
            h('li', {}, 'A linha pontilhada mostra para onde placas de pulso e canhões mandam as pedras.'),
            h('li', {}, 'Espaço pausa · Delete revende · Ctrl+Z desfaz · T árvore · F visão geral.'),
          ),
          h('h3', {}, 'Pedras'),
          h('ul', {}, ...types),
        ),
      ),
    );
  }

  complete(zoneName: string, next: { id: number; name: string } | null, campaign: boolean, earned: number) {
    const btns: Node[] = [];
    if (next) btns.push(h('button', { class: 'px-btn amber big', onclick: () => (this.api.uiSound(), this.api.openZone(next.id)) }, `Seguir para a Zona ${next.id} · ${next.name}`));
    btns.push(h('button', { class: 'px-btn big', onclick: () => (this.api.uiSound(), this.close()) }, next ? 'Ficar e continuar minerando' : 'Continuar'));
    this.open(
      'complete',
      h('div', { class: 'complete-title' }, 'SUPERMASSIVO!'),
      h('p', { class: 'tagline' }, campaign ? `O buraco negro de ${zoneName} engoliu o mapa — a campanha está completa! O Sensor foi liberado na Árvore estelar.` : `O buraco negro de ${zoneName} cresceu até engolir o mapa inteiro.`),
      h('p', { class: 'complete-reward' }, `Bônus: ◆ ${fmt(earned)}`),
      h('div', { class: 'menu-buttons' }, ...btns),
    );
  }

  confirm(text: string, yes: () => void) {
    const prev = this.screen;
    this.open(
      'confirm',
      h('p', { class: 'tagline' }, text),
      h(
        'div',
        { class: 'row end' },
        h('button', { class: 'px-btn', onclick: () => (prev && prev !== 'confirm' ? this.show(prev) : this.close()) }, 'Cancelar'),
        h('button', { class: 'px-btn red', onclick: () => (yes(), this.close()) }, 'Confirmar'),
      ),
    );
  }
}
