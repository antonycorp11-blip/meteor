import { MUSIC_INFO } from '../audio/MusicEngine';
import { Config } from '../core/Config';
import { FRAGMENT_TYPES } from '../physics/fragmentTypes';
import { BRANCHES, RESEARCH, canBuy } from '../progression/Research';
import type { GoalProgress } from '../progression/Goals';
import type { Settings } from '../save/SaveManager';
import { clear, fmt, h, icon } from './dom';
import type { GameApi } from './GameApi';

type Screen = 'title' | 'zones' | 'research' | 'settings' | 'stats' | 'goals' | 'help' | 'complete' | 'confirm';

/** Telas sobrepostas: título, zonas, pesquisa, ajustes, estatísticas… */
export class Menus {
  readonly root: HTMLElement;
  private api: GameApi;
  private card: HTMLElement;
  screen: Screen | null = null;
  private goalsHints: string[] = [];
  onClose: () => void = () => {};

  constructor(api: GameApi) {
    this.api = api;
    this.card = h('div', { class: 'menu-card panel' });
    this.root = h('div', { class: 'menu-overlay', onclick: (e) => e.target === this.root && this.screen !== 'title' && this.close() }, this.card);
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
    this.card.className = `menu-card panel screen-${s}`;
    for (const c of content) if (c) this.card.append(c);
    this.root.classList.add('show');
  }

  private header(title: string, back: Screen | 'close' = 'close') {
    return h(
      'div',
      { class: 'menu-head' },
      h('h2', {}, title),
      h(
        'button',
        {
          class: 'icon-btn',
          'aria-label': 'Fechar',
          onclick: () => {
            this.api.uiSound();
            if (back === 'close') this.close();
            else this.show(back);
          },
        },
        icon('close'),
      ),
    );
  }

  show(s: Screen) {
    switch (s) {
      case 'title':
        return this.title();
      case 'zones':
        return this.zones();
      case 'research':
        return this.research();
      case 'settings':
        return this.settings();
      case 'stats':
        return this.stats();
      case 'help':
        return this.help();
      default:
        return;
    }
  }

  title() {
    const started = this.api.save.unlockedZone > 1 || Object.values(this.api.save.zones).some((z) => z.stats.generated > 0);
    const logo = h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-kicker' }, 'ATHG · CONCEITO ORIGINAL'),
      h('div', { class: 'logo-meteor' }, 'METEOR'),
      h('div', { class: 'logo-mill' }, 'MILL'),
      h('div', { class: 'logo-sub' }, 'FÍSICA LIVRE · ENGENHARIA · ESPAÇO ACONCHEGANTE'),
    );
    const btn = (label: string, fn: () => void, primary = false) =>
      h('button', { class: `btn big ${primary ? 'primary' : ''}`, onclick: () => (this.api.uiSound(), fn()) }, label);
    this.open(
      'title',
      logo,
      h('p', { class: 'tagline' }, 'Uma pedreira cósmica relaxante em que cada pedra é física, cada parede é um problema e cada engenhoca é uma resposta sua.'),
      h(
        'div',
        { class: 'menu-buttons' },
        btn(started ? 'Continuar' : 'Jogar', () => this.api.play(), true),
        btn('Zonas', () => this.zones()),
        btn('Pesquisa', () => this.research()),
        btn('Ajustes', () => this.settings()),
        btn('Como jogar', () => this.help()),
      ),
      h('p', { class: 'fineprint' }, `Física livre · Engenharia · Espaço aconchegante — trilha original procedural (${MUSIC_INFO.bpm} BPM, ${Math.floor(MUSIC_INFO.seconds / 60)} min ${Math.round(MUSIC_INFO.seconds % 60)} s por volta).`),
    );
  }

  zones() {
    const cards = this.api.zoneCards().map((z) =>
      h(
        'button',
        {
          class: `zone-card ${z.unlocked ? '' : 'locked'} ${z.complete ? 'complete' : ''} ${z.current ? 'current' : ''}`,
          disabled: !z.unlocked,
          onclick: () => {
            this.api.uiSound();
            this.api.openZone(z.id);
          },
        },
        h('div', { class: 'zc-num' }, String(z.id).padStart(2, '0')),
        h('div', { class: 'zc-name' }, z.name),
        h('div', { class: 'zc-sub' }, z.unlocked ? z.subtitle : 'Conclua a zona anterior'),
        h('div', { class: 'zc-meta' }, z.unlocked ? `${z.goalsDone}/${z.goalsTotal} objetivos · ◆ ${fmt(z.credits)}` : '—'),
      ),
    );
    this.open('zones', this.header('Campanha'), h('div', { class: 'zone-grid' }, ...cards), h('p', { class: 'fineprint' }, 'Cada zona tem carteira e instalação próprias, salvas automaticamente. Pesquisa e conquistas são globais.'));
  }

  research() {
    const avail = this.api.researchAvailable();
    const levels = this.api.save.research.levels;
    const cols = BRANCHES.map((b) => {
      const nodes = RESEARCH.filter((n) => n.branch === b.id).map((n) => {
        const lvl = levels[n.id] ?? 0;
        const c = canBuy(levels, avail, n.id);
        const pips = h('span', { class: 'pips' }, ...Array.from({ length: n.max }, (_, i) => h('i', { class: i < lvl ? 'on' : '' })));
        return h(
          'div',
          { class: `rnode ${lvl >= n.max ? 'max' : ''}` },
          h('div', { class: 'rn-name' }, n.name, pips),
          h('div', { class: 'rn-desc' }, n.desc),
          h(
            'button',
            {
              class: 'btn small',
              disabled: !c.ok,
              title: c.reason ?? '',
              onclick: () => {
                this.api.buyResearch(n.id);
                this.research();
              },
            },
            lvl >= n.max ? 'Completo' : c.ok ? `Pesquisar ✦ ${c.cost}` : c.reason === 'Pesquisa insuficiente' ? `✦ ${c.cost}` : c.reason ?? '',
          ),
        );
      });
      return h('div', { class: 'rcol' }, h('h3', {}, b.name), h('p', { class: 'rc-desc' }, b.desc), ...nodes);
    });
    const conv = this.api.conversionInfo().map((c) =>
      h(
        'button',
        {
          class: 'btn small',
          disabled: c.remaining <= 0 || c.credits < c.cost,
          onclick: () => {
            this.api.convertCredits(c.zoneId);
            this.research();
          },
        },
        `${c.name}: ◆ ${c.cost} → ✦ 1 (${c.remaining} rest.)`,
      ),
    );
    this.open(
      'research',
      this.header('Pesquisa estelar'),
      h(
        'div',
        { class: 'research-top' },
        h('span', { class: 'rp' }, `✦ ${avail} disponível`),
        h('button', { class: 'btn small', onclick: () => (this.api.respec(), this.research()) }, 'Redistribuir tudo (grátis)'),
      ),
      h('div', { class: 'research-grid' }, ...cols),
      conv.length ? h('div', { class: 'conv' }, h('span', {}, 'Créditos excedentes de zonas concluídas:'), ...conv) : null,
      h('p', { class: 'fineprint' }, 'Pesquisa vem de objetivos e conclusões de zona. Melhorias criam opções; a geometria de cada região continua sendo o desafio.'),
    );
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
      this.header('Ajustes'),
      h(
        'div',
        { class: 'settings-grid' },
        h('div', {}, h('h3', {}, 'Áudio'), slider('master', 'Master'), slider('music', 'Música'), slider('sfx', 'Efeitos'), toggle('muted', 'Mudo')),
        h(
          'div',
          {},
          h('h3', {}, 'Interface e acessibilidade'),
          h('label', { class: 'set-row' }, h('span', {}, 'Escala da UI'), scale),
          toggle('reduceParticles', 'Reduzir brilhos e partículas'),
          toggle('noShake', 'Sem tremor de câmera'),
          toggle('highContrast', 'Contraste reforçado'),
          toggle('snap', 'Encaixe opcional (grade 4 px / 5°)'),
          toggle('showFps', 'Mostrar FPS e corpos ativos'),
        ),
      ),
      h(
        'div',
        { class: 'row end' },
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () =>
              this.confirm('Apagar todo o progresso salvo? Isso não pode ser desfeito.', () => {
                this.api.resetSave();
              }),
          },
          'Apagar progresso',
        ),
      ),
    );
  }

  stats() {
    const st = this.api.stats();
    const s = st.stats;
    const row = (k: string, v: string) => h('tr', {}, h('th', {}, k), h('td', {}, v));
    const mins = Math.floor(s.timePlayed / 60);
    this.open(
      'stats',
      this.header('Estatísticas da zona'),
      h(
        'table',
        { class: 'stats' },
        row('Eficiência atual', st.considered >= st.window ? `${Math.round(st.efficiencyPct)}% (${st.delivered}/${st.window})` : `amostra ${st.considered}/${st.window}`),
        row('Fragmentos pendentes', `${st.pending} (ativos há menos de ${Config.pendingGrace} s)`),
        row('Entregas por minuto', String(st.perMinute)),
        row('Massa entregue', s.massDelivered.toFixed(1)),
        row('Entregas (automáticas)', `${s.delivered} (${s.autoDelivered})`),
        row('Fragmentos gerados', String(s.generated)),
        row('Perdidos / recolhidos', `${s.lost} / ${s.recycled}`),
        row('Maior combo', String(s.bestCombo)),
        row('Maior sequência sem perda', String(s.bestStreak)),
        row('Maior tempo sem intervenção', `${Math.floor(s.longestHandsOff)} s`),
        row('Créditos ganhos', fmt(s.creditsEarned)),
        row('Peças instaladas', String(st.devices)),
        row('Corpos ativos', String(st.active)),
        row('Tempo na zona', `${mins} min`),
      ),
      h(
        'p',
        { class: 'fineprint' },
        `Metodologia: a eficiência considera os últimos ${st.window} fragmentos gerados. Fragmentos ainda ativos com menos de ${Config.pendingGrace} s ficam fora da janela; mais antigos contam como não entregues até chegarem ao buraco negro. Fragmentos parados por mais de ${Config.restRecycleSeconds} s ou fora do mapa são recolhidos sem crédito. Entrega automática = recebida sem você ter aplicado força manual após a extração.`,
      ),
    );
  }

  goals(goals: GoalProgress[], hints: string[]) {
    this.goalsHints = hints;
    const tierName = { basic: 'Básico', engineering: 'Engenharia', extra: 'Extra' };
    const cards = goals.map((g) =>
      h(
        'div',
        { class: `goal ${g.done ? 'done' : ''}` },
        h('div', { class: 'goal-head' }, h('span', { class: `tier ${g.def.tier}` }, tierName[g.def.tier]), h('span', {}, g.def.title), h('span', { class: 'rp' }, g.done ? '✓' : `✦ ${g.def.research}`)),
        ...g.reqs.map((r) => h('div', { class: 'req' }, h('span', {}, r.label), h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(r.value * 100)}%` })))),
      ),
    );
    const hint = this.goalsHints.length ? this.goalsHints[Math.floor(Math.random() * this.goalsHints.length)] : '';
    this.open('goals', this.header('Objetivos'), ...cards, hint ? h('p', { class: 'hint' }, `Conceito: ${hint}`) : null);
  }

  help() {
    const types = Object.values(FRAGMENT_TYPES)
      .filter((t) => t.id !== 'shard')
      .map((t) => h('li', {}, h('b', {}, t.name), ` — ${t.desc}`));
    this.open(
      'help',
      this.header('Como jogar'),
      h(
        'div',
        { class: 'help-grid' },
        h(
          'div',
          {},
          h('h3', {}, 'Objetivo'),
          h('p', {}, 'Quebre o asteroide e leve os fragmentos até o centro do buraco negro. Rochas são indestrutíveis: construa rampas, defletores e máquinas para criar o caminho.'),
          h('h3', {}, 'PC'),
          h(
            'ul',
            {},
            h('li', {}, 'Clique no asteroide: extrai um fragmento (segure para repetir).'),
            h('li', {}, 'Segure e arraste um fragmento: feixe de força limitada.'),
            h('li', {}, 'Arraste o fundo: move a câmera · Roda: zoom.'),
            h('li', {}, 'Peça: clique na loja, posicione e clique · Q/E ou roda giram · Shift = ajuste fino.'),
            h('li', {}, 'Clique numa peça para selecionar; arraste para mover; alça amarela gira.'),
            h('li', {}, 'Espaço pausa · Delete/R revende · Ctrl+Z desfaz · F visão geral · H fonte · U esconde HUD.'),
          ),
        ),
        h(
          'div',
          {},
          h('h3', {}, 'Toque (paisagem)'),
          h(
            'ul',
            {},
            h('li', {}, 'Toque no asteroide: extrai.'),
            h('li', {}, 'Pressão longa num fragmento: segura e move.'),
            h('li', {}, 'Um dedo no fundo: move · Dois dedos: pan e zoom.'),
            h('li', {}, 'Loja: toque na peça, arraste-a, gire pela alça ou botões e confirme ✓.'),
          ),
          h('h3', {}, 'Fragmentos'),
          h('ul', {}, ...types),
        ),
      ),
    );
  }

  complete(zoneName: string, next: { id: number; name: string } | null, campaign: boolean) {
    const btns: Node[] = [];
    if (next)
      btns.push(
        h('button', { class: 'btn big primary', onclick: () => (this.api.uiSound(), this.api.openZone(next.id)) }, `Ir para ${String(next.id).padStart(2, '0')} · ${next.name}`),
      );
    btns.push(h('button', { class: 'btn big', onclick: () => (this.api.uiSound(), this.close()) }, 'Continuar otimizando aqui'));
    this.open(
      'complete',
      h('div', { class: 'complete-title' }, 'ZONA CONCLUÍDA'),
      h('p', { class: 'tagline' }, campaign ? `${zoneName} concluída — a campanha base está completa! O Sensor + acionador foi liberado e todas as zonas seguem abertas para otimização livre.` : `${zoneName} concluída. Sua instalação continua salva aqui.`),
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
        h('button', { class: 'btn', onclick: () => (prev && prev !== 'confirm' ? this.show(prev) : this.close()) }, 'Cancelar'),
        h('button', { class: 'btn danger', onclick: () => (yes(), this.close()) }, 'Confirmar'),
      ),
    );
  }
}
