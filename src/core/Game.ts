import { planet } from '../story/Story';
import { AudioBus } from '../audio/AudioBus';
import { MusicEngine } from '../audio/MusicEngine';
import { SfxEngine } from '../audio/SfxEngine';
import { Config } from './Config';
import { dist, rot, type Vec } from './geometry';
import { Wallet, priceFor, refundFor } from '../economy/Economy';
import { DesktopInput } from '../input/DesktopInput';
import { TouchInput, type PointerInfo } from '../input/TouchInput';
import { DEVICES, DEVICE_ORDER, defaultParams } from '../machines/catalog';
import type { DeviceSave, DeviceType } from '../machines/types';
import { FRAGMENT_TYPES } from '../physics/fragmentTypes';
import { ZoneProgress, type GoalProgress } from '../progression/Goals';
import { TREE, buildMods, canBuyNode, nodeState, unlockedDevices } from '../progression/SkillTree';
import { PAL } from '../render/palette';
import { Renderer, type CursorKind, type CursorState, type Floater, type Handle } from '../render/Renderer';
import { SaveManager, type SaveData, type Settings, type ZoneSave } from '../save/SaveManager';
import type { SimMods } from '../sim/mods';
import { Sim, type Device } from '../sim/Sim';
import { BuildDock } from '../ui/BuildDock';
import { DevicePanel } from '../ui/DevicePanel';
import { installFrames } from '../ui/frame';
import type { DockItem, GameApi, HudData, SelectedInfo, StatsInfo, ZoneCard } from '../ui/GameApi';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/Menus';
import { TreeView } from '../ui/TreeView';
import { ZONES, loadZone } from '../world/ZoneLoader';
import type { ZoneData } from '../world/types';

interface GhostState {
  type: DeviceType;
  x: number;
  y: number;
  angle: number;
  params: Record<string, number>;
  editingId: number;
  valid: boolean;
  reason: string;
  price: number;
}

type PtrState =
  | { kind: 'none' }
  | { kind: 'pending'; startB: Vec; target: 'fragment' | 'device' | 'empty'; fragId: number; devId: number; touch: boolean; timer: number }
  | { kind: 'pan'; last: Vec }
  | { kind: 'grab' }
  | { kind: 'extract'; last: number; world: Vec }
  | { kind: 'ghostDrag'; offset: Vec; touch: boolean }
  | { kind: 'ghostRotate'; touch: boolean }
  | { kind: 'devDrag'; offset: Vec; startB: Vec }
  | { kind: 'devRotate' };

type UndoEntry =
  | { kind: 'place'; id: number; paid: number }
  | { kind: 'move'; id: number; from: { x: number; y: number; angle: number } }
  | { kind: 'sell'; save: DeviceSave; refund: number }
  | { kind: 'params'; id: number; from: Record<string, number>; enabled: boolean };

const DEG = Math.PI / 180;
const COLLAPSE_SECONDS = 4.5;

export class Game implements GameApi {
  private saveMgr = new SaveManager();
  readonly renderer: Renderer;
  private bus = new AudioBus();
  private music = new MusicEngine(this.bus);
  private sfx = new SfxEngine(this.bus);
  private hud: Hud;
  private dock: BuildDock;
  private panel: DevicePanel;
  private menus: Menus;
  private tree: TreeView;
  private desktop: DesktopInput;

  zone!: ZoneData;
  sim!: Sim;
  progress!: ZoneProgress;
  readonly wallet: Wallet;
  private zsave!: ZoneSave;
  private mods: SimMods;
  private paused = false;
  private ghost: GhostState | null = null;
  private selectedId = -1;
  private ptr: PtrState = { kind: 'none' };
  private pointerWorld: Vec | null = null;
  private hoverAsteroid = false;
  private hoverFragment = -1;
  private hoverDevice = false;
  private cursor: CursorState = { x: 0, y: 0, kind: 'arrow', swing: 0, visible: false };
  private cursorTouchUntil = 0;
  private floaters: Floater[] = [];
  private crack = 0;
  private shake = 0;
  private undoStack: UndoEntry[] = [];
  private acc = 0;
  private last = 0;
  private realTime = 0;
  private hudTimer = 0;
  private goalTimer = 0;
  private saveTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 60;
  private lastFailToast = -99;
  private isTouchDevice: boolean;
  private lastWasTouch = false;
  private paramEditStart: Record<string, number> | null = null;
  private collapseT = 0;
  private visualGrowth = 0;
  private treeHintShown = false;
  private perf = { sim: 0, render: 0, frames: 0 };

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    installFrames();
    this.renderer = new Renderer(canvas);
    this.isTouchDevice = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    document.body.classList.toggle('touch', this.isTouchDevice);
    this.mods = buildMods(this.save.tree.levels);
    this.wallet = new Wallet(this.save.credits);
    this.hud = new Hud(this);
    this.dock = new BuildDock(this);
    this.panel = new DevicePanel(this);
    this.menus = new Menus(this);
    this.tree = new TreeView(this);
    uiRoot.append(this.hud.root, this.dock.root, this.panel.root, this.menus.root, this.tree.root);
    this.hud.onTree = () => this.openTree();
    this.hud.onChallenges = () => this.menus.goals();
    this.hud.onMenu = () => this.menus.title();
    this.hud.onStats = () => this.menus.stats();
    this.dock.onToggle = () => this.updateInsets();
    this.tree.onClose = () => this.refreshDock();

    new TouchInput(
      canvas,
      {
        down: (p) => this.onDown(p),
        move: (p) => this.onMove(p),
        up: (p) => this.onUp(p),
        hover: (p) => this.onHover(p),
        cancel: () => this.cancelPointer(),
        gesture: (dx, dy, k, c) => {
          this.renderer.camera.panBy(dx, dy);
          if (Math.abs(k - 1) > 0.001) this.renderer.camera.zoomAt(k, c.x, c.y);
        },
      },
      (css) => this.renderer.cssToBuffer(css.x, css.y),
    );
    canvas.addEventListener('pointerleave', () => (this.cursor.visible = false));
    this.desktop = new DesktopInput(
      canvas,
      {
        rotate: (d) => this.rotate(d),
        togglePause: () => this.togglePause(),
        escape: () => this.escape(),
        sell: () => this.sellSelected(),
        undo: () => this.undo(),
        copy: () => this.copySelected(),
        overview: () => this.overview(),
        home: () => this.home(),
        toggleHud: () => this.hud.toggleHidden(),
        tree: () => (this.tree.isOpen() ? this.tree.close() : this.openTree()),
        shopSlot: (i) => {
          const t = this.dock.slot(i);
          if (t && !this.menus.isOpen() && !this.tree.isOpen()) this.startGhost(t);
        },
        wheel: (dy, at, shift) => this.onWheel(dy, at, shift),
        panKeys: (dx, dy) => this.renderer.camera.panBy(dx, dy),
      },
      (css) => this.renderer.cssToBuffer(css.x, css.y),
    );

    const unlockAudio = () => {
      if (this.bus.init()) {
        this.applySettings();
        if (!this.music.isPlaying) this.music.start();
      }
    };
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.persist(true);
        this.bus.suspend();
      } else {
        this.bus.resume();
        this.music.resync();
        this.last = performance.now();
      }
    });
    window.addEventListener('pagehide', () => this.persist(true));
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));

    if (window.innerHeight < 480) this.dock.setOpen(false);
    this.openZoneInternal(Math.min(this.save.currentZone, this.save.unlockedZone), true);
    this.applySettings();
    this.onResize();
    if (this.saveMgr.lastError) this.hud.toast(this.saveMgr.lastError, 'bad', 5000);
    this.menus.title();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  get save(): SaveData {
    return this.saveMgr.data;
  }

  // ------------------------------------------------------------------
  // Zonas
  // ------------------------------------------------------------------

  private openZoneInternal(id: number, initial = false) {
    if (this.sim) {
      this.persist(true);
      this.sim.destroy();
    }
    this.sfx.humStop();
    const zone = loadZone(id);
    this.zone = zone;
    this.save.currentZone = id;
    const zs = this.saveMgr.zone(id, 0);
    this.zsave = zs;
    const maxF = this.isTouchDevice ? Config.maxActiveFragments.mobile : Config.maxActiveFragments.desktop;
    this.sim = new Sim(zone, { mods: this.mods, maxFragments: maxF });
    for (const d of zs.devices) {
      if (!DEVICES[d.type]) continue;
      this.sim.addDevice({ ...d, params: { ...defaultParams(d.type), ...d.params } });
    }
    this.sim.nextDeviceId = Math.max(this.sim.nextDeviceId, zs.nextDeviceId);
    this.progress = new ZoneProgress(zone, zs.stats, zs.goals);
    this.progress.mods = this.mods;
    this.visualGrowth = this.progress.growth();
    this.sim.holeGrowth = this.visualGrowth;
    this.collapseT = 0;
    this.wireSim();
    this.ghost = null;
    this.selectedId = -1;
    this.ptr = { kind: 'none' };
    this.undoStack = [];
    this.floaters = [];
    this.acc = 0;
    this.renderer.setZone(zone, this.save.settings.highContrast);
    const cam = this.renderer.camera;
    this.updateInsets();
    const fz = cam.fitZoom();
    const oc = cam.overviewCenter(fz);
    cam.snap(oc.x, oc.y, fz);
    zs.visited = true;
    this.refreshDock();
    this.persist();
  }

  private wireSim() {
    const sim = this.sim;
    const ps = this.renderer.particles;
    sim.events.on('extract', (e) => {
      this.progress.onExtract(e.frag.id, sim.time);
      this.renderer.laserShot(e.x, e.y, e.auto);
      if (!e.auto) {
        this.crack = 1;
        this.sfx.crack();
        if (!this.save.tutorial.extracted) {
          this.save.tutorial.extracted = true;
          this.persist();
        }
        ps.burst(e.x, e.y, this.save.settings.reduceParticles ? 4 : 12, ['#ffe08a', '#ff9a3a', '#ffffff', '#8a7a8e'], 70, 0.45, 80);
      } else ps.burst(e.x, e.y, 4, ['#ff9a3a', '#8a7a8e'], 40, 0.4, 60);
    });
    sim.events.on('absorb', (info) => {
      const r = this.progress.onAbsorb(info, sim.time);
      this.renderer.forgetFragment(info.frag.id);
      if (r.credits <= 0) return;
      this.wallet.earn(r.credits);
      const h = this.zone.blackHole;
      const shown = r.credits >= 10 ? Math.round(r.credits) : Math.round(r.credits * 10) / 10;
      const hot = r.mult >= 1.5;
      this.floaters.push({ x: h.x + (Math.random() - 0.5) * 20, y: h.y - 16, text: hot ? `+${shown} ×${r.mult.toFixed(1)}` : `+${shown}`, color: hot ? '#ffb070' : PAL.core, life: 1.2, max: 1.2 });
      if (this.floaters.length > 8) this.floaters.shift();
      const n = this.save.settings.reduceParticles ? 4 : 10;
      const col = FRAGMENT_TYPES[info.frag.type].colors;
      const p = info.frag.body.position;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(p.y - h.y, p.x - h.x) + (Math.random() - 0.5) * 1.5;
        ps.spawn({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.7, color: i % 2 ? col[0] : PAL.vortex, size: 1, gravity: 0, spiral: { cx: h.x, cy: h.y, a, r: Math.hypot(p.x - h.x, p.y - h.y) + Math.random() * 4, w: 7 } });
      }
      this.sfx.absorb(info.value);
      if (!this.save.tutorial.delivered) {
        this.save.tutorial.delivered = true;
        this.persist();
      }
    });
    sim.events.on('lost', (e) => {
      this.progress.onLost(e.frag.id, e.reason);
      this.renderer.forgetFragment(e.frag.id);
      if (e.reason === 'rest') ps.burst(e.frag.body.position.x, e.frag.body.position.y, 5, ['#5A4E88', '#8A7A8E'], 12, 0.6, -20);
    });
    sim.events.on('impact', (e) => {
      if (e.speed > 1.6) this.sfx.impact(e.speed, e.mass, e.surface, e.type === 'glass' || e.type === 'shard');
      if (e.speed > 4.5 && !this.save.settings.reduceParticles) ps.burst(e.x, e.y, 3, ['#6D7596', '#454A61'], 25, 0.3, 80);
    });
    sim.events.on('device', (e) => {
      switch (e.kind) {
        case 'spring':
          this.sfx.bumper();
          ps.burst(e.dev.x, e.dev.y - 4, 4, [PAL.cyan, '#E8FFFF'], 30, 0.25, 0);
          break;
        case 'booster':
          this.sfx.booster();
          ps.burst(e.dev.x, e.dev.y, 3, [PAL.cyan, '#E8FFFF'], 30, 0.25, 0);
          break;
        case 'launch':
          this.sfx.launch();
          ps.burst(e.dev.x, e.dev.y - 6, 5, [PAL.cyan, PAL.core], 40, 0.35, 40);
          break;
        case 'gate':
          this.sfx.gate();
          break;
        case 'arm':
          this.sfx.arm();
          break;
        default:
          break;
      }
    });
    sim.events.on('shatter', (e) => {
      this.progress.onShatter(e.parent.id, e.shards.map((s) => s.id));
      this.sfx.shatter();
      ps.burst(e.x, e.y, 8, ['#7FE6E0', '#E8FFFF'], 50, 0.4, 100);
    });
    sim.events.on('pulse', (e) => {
      this.sfx.pulse();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ps.spawn({ x: e.x, y: e.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.35, color: '#FF7A5A', size: 1, gravity: 0 });
      }
    });
    sim.events.on('grabBreak', () => {
      this.sfx.snap();
      this.sfx.humStop();
      if (this.ptr.kind === 'grab') this.ptr = { kind: 'none' };
    });
    sim.events.on('extractFail', (e) => {
      if (this.realTime - this.lastFailToast > 3) {
        this.lastFailToast = this.realTime;
        this.hud.toast(e.reason, 'bad');
      }
    });
  }

  openZone(id: number) {
    if (id > this.save.unlockedZone) return;
    this.menus.close();
    if (id !== this.zone.id) this.openZoneInternal(id);
    this.storyThen(() => this.zoneBanner());
  }

  play() {
    this.menus.close();
    this.storyThen(() => this.zoneBanner());
  }

  private zoneBanner() {
    const p = planet(this.zone.id);
    this.hud.banner(`PLANETA ${p.numeral} · ${this.zone.name.toUpperCase()}`, this.zone.intro);
  }

  /** Mostra os memorandos pendentes (contrato, briefing do planeta) e depois segue. */
  private storyThen(done: () => void) {
    const st = this.save.story;
    if (!st.intro) {
      st.intro = true;
      this.persist();
      this.menus.intro(() => this.storyThen(done));
      return;
    }
    const zid = this.zone.id;
    if (!st.briefed.includes(zid)) {
      st.briefed.push(zid);
      this.persist();
      this.menus.memo(planet(zid).briefing, 'Iniciar operação', () => this.storyThen(done));
      return;
    }
    this.menus.close();
    done();
  }

  reachedZone() {
    return this.save.campaignDone ? 6 : this.save.unlockedZone;
  }

  // ------------------------------------------------------------------
  // Persistência
  // ------------------------------------------------------------------

  private persist(now = false) {
    if (!this.sim) return;
    this.save.credits = this.wallet.credits;
    const zs = this.zsave;
    zs.devices = [...this.sim.devices.values()].map((d) => ({
      id: d.id,
      type: d.type,
      x: Math.round(d.x * 100) / 100,
      y: Math.round(d.y * 100) / 100,
      angle: Math.round(d.angle * 10000) / 10000,
      params: { ...d.params },
      enabled: d.enabled,
      paid: d.paid,
    }));
    zs.nextDeviceId = this.sim.nextDeviceId;
    zs.stats = { ...this.progress.stats };
    zs.goals = [...this.progress.goalsDone];
    if (now) this.saveMgr.flush();
    else this.saveMgr.save();
  }

  // ------------------------------------------------------------------
  // Loop
  // ------------------------------------------------------------------

  private frame(t: number) {
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.25);
    this.realTime += dt;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 1) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.cursor.swing = Math.max(0, this.cursor.swing - dt * 5);
    if (this.lastWasTouch && this.realTime > this.cursorTouchUntil) this.cursor.visible = false;

    if (this.menus.screen === 'title') {
      this.renderer.renderTitle(this.realTime, dt, this.cursor);
      return;
    }

    const stepSec = Config.stepMs / 1000;
    const tSim = performance.now();
    if (!this.paused && !document.hidden) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= stepSec && steps < Config.maxCatchUpSteps) {
        this.sim.step();
        this.acc -= stepSec;
        steps++;
      }
      if (steps >= Config.maxCatchUpSteps) this.acc = 0;
      this.progress.coolDown(dt);
    }
    // crescimento visual suave do buraco negro
    const target = this.progress.growth();
    this.visualGrowth += (target - this.visualGrowth) * Math.min(1, dt * 2);
    this.sim.holeGrowth = this.visualGrowth;
    this.updateCollapse(dt);
    this.perf.sim += performance.now() - tSim;

    this.updateHold();
    this.desktop.update(dt);
    this.renderer.camera.update(dt);
    this.crack = Math.max(0, this.crack - dt * 3);
    this.shake = Math.max(0, this.shake - dt * 4);
    for (const f of this.floaters) f.life -= dt;
    this.floaters = this.floaters.filter((f) => f.life > 0);

    this.goalTimer += dt;
    if (this.goalTimer >= 0.5) {
      const cluster = this.sim.largestStalledCluster();
      this.progress.tick(this.sim.time, this.goalTimer, cluster, this.sim.devices.size);
      this.goalTimer = 0;
      this.checkGoals();
      this.music.setActivity(this.progress.massPerMinute() / 30);
      this.tutorialNudges();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 12) {
      this.saveTimer = 0;
      this.persist();
    }
    this.hudTimer += dt;
    if (this.hudTimer > 0.15) {
      this.hudTimer = 0;
      this.updateHud();
    }
    if (this.sim.grab) {
      const f = this.sim.fragments.get(this.sim.grab.fragId);
      if (f) this.sfx.humUpdate(Math.min(1, dist(f.body.position, this.sim.grab.target) / this.sim.grabReach()));
    }
    this.updateCursorKind();

    const tRender = performance.now();
    const sel = this.selectedDevice();
    const shakeAmt = this.save.settings.noShake ? 0 : this.shake;
    this.renderer.render(
      {
        sim: this.sim,
        alpha: this.paused ? 1 : this.acc / stepSec,
        time: this.realTime,
        ghost: this.ghost,
        selected: this.ghost && sel && this.ghost.editingId === sel.id ? null : sel,
        handles: this.handles(),
        grabPointer: this.sim.grab ? this.sim.grab.target : null,
        floaters: this.floaters,
        buildMode: !!this.ghost || !!sel,
        crack: this.crack,
        shake: { x: (Math.random() - 0.5) * shakeAmt * 2, y: (Math.random() - 0.5) * shakeAmt * 2 },
        trajectory: this.trajectory(),
        highContrast: this.save.settings.highContrast,
        reduceGlow: this.save.settings.reduceParticles,
        hoverAsteroid: this.hoverAsteroid,
        hoverFragment: this.hoverFragment,
        hint: this.tutorialHint(),
        heat: this.progress.heat.value / 100,
        collapse: this.collapseT > 0 ? Math.min(1, this.collapseT / COLLAPSE_SECONDS) : 0,
        cursor: this.cursor,
      },
      dt,
    );
    this.perf.render += performance.now() - tRender;
    this.perf.frames++;
  }

  /** Médias de tempo por quadro (ms) desde a última leitura — usado em testes de desempenho. */
  perfSample() {
    const f = Math.max(1, this.perf.frames);
    const out = { sim: this.perf.sim / f, render: this.perf.render / f, frames: this.perf.frames, fps: this.fps };
    this.perf = { sim: 0, render: 0, frames: 0 };
    return out;
  }

  /** Quando a barra enche, o buraco negro engole o mapa e a zona termina. */
  private updateCollapse(dt: number) {
    if (this.zsave.complete) return;
    if (this.collapseT === 0 && this.progress.zoneComplete()) {
      this.collapseT = 0.0001;
      this.sim.collapsing = true;
      this.ghost = null;
      this.selectedId = -1;
      this.sfx.goal();
      this.hud.toast('O buraco negro está engolindo o mapa!', 'goal', 3500);
      this.renderer.camera.overview();
    }
    if (this.collapseT > 0) {
      this.collapseT += dt;
      this.shake = Math.max(this.shake, Math.min(3, this.collapseT));
      if (this.collapseT >= COLLAPSE_SECONDS) this.finishZone();
    }
  }

  private finishZone() {
    this.collapseT = 0;
    this.sim.collapsing = false;
    this.zsave.complete = true;
    const zid = this.zone.id;
    const bonus = Math.round(this.zone.growthTarget * 0.25);
    // as peças instaladas são recuperadas antes do planeta cair em Ônix
    let paid = 0;
    for (const d of this.sim.devices.values()) {
      paid += d.paid;
      d.paid = 0;
    }
    const recovered = Math.round(paid * this.mods.recoverRate);
    this.wallet.earn(bonus + recovered);
    let next: { id: number; name: string } | null = null;
    let campaign = false;
    if (zid < ZONES.length) {
      this.save.unlockedZone = Math.max(this.save.unlockedZone, zid + 1);
      const nz = loadZone(zid + 1);
      next = { id: nz.id, name: nz.name };
    } else if (!this.save.campaignDone) {
      this.save.campaignDone = true;
      campaign = true;
    }
    this.persist(true);
    this.refreshDock();
    this.menus.complete(zid, next, campaign, bonus, recovered);
  }

  private updateHold() {
    if (this.ptr.kind !== 'extract') return;
    const cd = Config.extractCooldown * this.mods.extractCooldownMul * 1.6;
    if (this.realTime - this.ptr.last >= cd && !this.paused) {
      this.ptr.last = this.realTime;
      if (this.sim.extract(this.ptr.world).length) this.cursor.swing = 1;
    }
  }

  private trajectory(): Vec[] | null {
    if (!this.mods.trajectoryPreview || !this.sim.grab) return null;
    const f = this.sim.fragments.get(this.sim.grab.fragId);
    if (!f) return null;
    const pts: Vec[] = [];
    let x = f.body.position.x;
    let y = f.body.position.y;
    const vel = { x: f.body.velocity.x * 2, y: f.body.velocity.y * 2 };
    const g = Config.gravity / 3600;
    for (let i = 0; i < 40; i++) {
      vel.x += g * this.zone.gravity.x;
      vel.y += g * this.zone.gravity.y;
      x += vel.x;
      y += vel.y;
      pts.push({ x, y });
    }
    return pts;
  }

  private tutorialHint() {
    if (this.zone.id !== 1 || this.menus.isOpen()) return null;
    const t = this.save.tutorial;
    const a = this.zone.asteroid;
    if (!t.extracted) return { x: a.x, y: a.y - a.r - 22, text: this.isTouchDevice ? 'TOQUE NO ASTEROIDE' : 'CLIQUE NO ASTEROIDE' };
    if (!t.grabbed) {
      let newest: { x: number; y: number } | null = null;
      for (const f of this.sim.fragments.values()) newest = f.body.position;
      if (newest) return { x: newest.x, y: newest.y - 24, text: this.isTouchDevice ? 'SEGURE A PEDRA' : 'SEGURE E ARRASTE' };
    }
    return null;
  }

  private tutorialNudges() {
    const t = this.save.tutorial;
    if (!t.heat && this.progress.heat.value > 18) {
      t.heat = true;
      this.hud.showHeatTip();
    }
    if (!t.tree && !this.treeHintShown && this.wallet.credits >= 40) {
      this.treeHintShown = true;
      this.hud.toast('Abra a Árvore estelar (T) e libere o Drone autônomo: ele minera sozinho.', 'goal', 7000);
    }
  }

  private checkGoals() {
    const newly = this.progress.checkGoals();
    for (const g of newly) {
      const reward = Math.round(g.reward * this.mods.goalRewardMul);
      this.wallet.earn(reward);
      this.hud.toast(`Desafio cumprido: ${g.title} (+◆ ${reward})`, 'goal', 4200);
      this.sfx.goal();
    }
    if (newly.length) this.persist();
  }

  // ------------------------------------------------------------------
  // HUD e doca
  // ------------------------------------------------------------------

  private updateHud() {
    const goals = this.progress.goalProgress();
    const levels = this.save.tree.levels;
    let affordable = 0;
    for (const n of TREE) if (canBuyNode(levels, this.wallet.credits, this.reachedZone(), n.id).ok) affordable++;
    const growth = this.progress.growth();
    const data: HudData = {
      zoneId: this.zone.id,
      zoneName: this.zone.name,
      credits: this.wallet.credits,
      growth,
      growthLabel: this.zsave.complete ? 'BURACO NEGRO SUPERMASSIVO' : 'ALIMENTE O BURACO NEGRO',
      heat: this.progress.heat.value / 100,
      heatMult: this.progress.heat.mult(this.mods),
      heatMax: this.mods.heatMaxMult,
      paused: this.paused,
      affordableNodes: affordable,
      challengesDone: goals.filter((g) => g.done).length,
      challengesTotal: goals.length,
      active: this.sim.fragments.size,
      maxActive: this.sim.maxFragments,
      fps: this.fps,
      ghostActive: !!this.ghost,
      ghostValid: (this.ghost?.valid ?? false) && (this.ghost ? this.ghost.editingId >= 0 || this.wallet.canAfford(this.ghost.price) : false),
      ghostReason: this.ghost ? this.ghostReason(this.ghost) : '',
      ghostPrice: this.ghost?.price ?? 0,
      autoMine: Number.isFinite(this.mods.autoMineInterval) ? this.mods.autoMineInterval : 0,
      drones: 1 + this.mods.extraDrones,
    };
    this.hud.update(data, this.save.settings.showFps);
    this.refreshDock();
    this.panel.show(this.selectedInfo());
  }

  private ghostReason(g: GhostState) {
    if (!g.valid) return g.reason;
    if (g.editingId < 0 && !this.wallet.canAfford(g.price)) return `Faltam créditos (◆ ${g.price})`;
    return '';
  }

  private refreshDock() {
    this.dock.refresh(this.dockItems());
  }

  dockChanged() {
    this.refreshDock();
  }

  dockItems(): DockItem[] {
    const levels = this.save.tree.levels;
    const unlocked = unlockedDevices(levels);
    const out: DockItem[] = [];
    let lockedShown = 0;
    for (const type of DEVICE_ORDER) {
      const def = DEVICES[type];
      if (unlocked.has(type)) {
        const price = this.priceOf(type);
        out.push({ type, name: def.name, desc: def.desc, howTo: def.howTo, limit: def.limit, price, affordable: this.wallet.canAfford(price), locked: false });
      } else {
        const node = TREE.find((n) => n.unlock === type);
        if (!node || nodeState(levels, node.id) !== 'available' || lockedShown >= 3) continue;
        lockedShown++;
        out.push({ type, name: def.name, desc: def.desc, howTo: def.howTo, limit: def.limit, price: 0, affordable: false, locked: true, nodeName: node.name, nodeCost: node.cost });
      }
    }
    return out;
  }

  private priceOf(type: DeviceType) {
    return priceFor(type, this.sim.countType(type), this.zone.priceMult, this.mods.priceDiscount);
  }

  zoneCards(): ZoneCard[] {
    return ZONES.map((z) => {
      const zs = this.save.zones[String(z.id)];
      const energy = z.id === this.zone.id ? this.progress.stats.energyFed : zs?.stats.energyFed ?? 0;
      return {
        id: z.id,
        name: z.name,
        subtitle: z.subtitle,
        unlocked: z.id <= this.save.unlockedZone,
        complete: !!zs?.complete,
        growth: Math.min(1, energy / z.growthTarget),
        current: z.id === this.zone.id,
      };
    });
  }

  challenges(): GoalProgress[] {
    return this.progress.goalProgress();
  }

  zoneHints(): string[] {
    return this.zone.hints;
  }

  stats(): StatsInfo {
    const e = this.progress.efficiency();
    return {
      stats: this.progress.stats,
      efficiencyPct: e.pct,
      considered: e.considered,
      window: this.zone.efficiencyWindow,
      pending: e.pending,
      delivered: e.delivered,
      perMinute: this.progress.massPerMinute(),
      active: this.sim.fragments.size,
      devices: this.sim.devices.size,
    };
  }

  // ------------------------------------------------------------------
  // Árvore estelar
  // ------------------------------------------------------------------

  openTree() {
    if (this.menus.isOpen()) this.menus.close();
    this.cancelGhost();
    this.save.tutorial.tree = true;
    this.tree.open();
  }

  buyNode(id: string): boolean {
    const levels = this.save.tree.levels;
    const can = canBuyNode(levels, this.wallet.credits, this.reachedZone(), id);
    if (!can.ok || can.cost === undefined) return false;
    const node = TREE.find((n) => n.id === id)!;
    if (!this.wallet.spend(can.cost)) return false;
    levels[id] = (levels[id] ?? 0) + 1;
    this.mods = buildMods(this.save.tree.levels);
    this.sim.mods = this.mods;
    this.progress.mods = this.mods;
    this.sfx.goal();
    this.hud.toast(node.unlock ? `Nova peça: ${DEVICES[node.unlock].name}` : (node.maxLevel ?? 1) > 1 ? `${node.name} · nível ${levels[id]}` : `Desbloqueado: ${node.name}`, 'good');
    this.persist(true);
    this.refreshDock();
    return true;
  }

  // ------------------------------------------------------------------
  // Construção
  // ------------------------------------------------------------------

  private selectedDevice(): Device | null {
    return this.selectedId >= 0 ? this.sim.devices.get(this.selectedId) ?? null : null;
  }

  private selectedInfo(): SelectedInfo | null {
    const d = this.selectedDevice();
    if (!d || (this.ghost && this.ghost.editingId !== d.id)) return null;
    const def = DEVICES[d.type];
    return {
      id: d.id,
      type: d.type,
      name: def.name,
      desc: def.desc,
      howTo: def.howTo,
      params: def.params,
      values: d.params,
      enabled: d.enabled,
      refund: refundFor(d.paid, this.mods.refundRate),
      manualGate: d.type === 'gate' && (d.params.mode ?? 0) === 1,
      angleDeg: (((d.angle / DEG) % 360) + 360) % 360,
    };
  }

  private snapPos(p: Vec): Vec {
    if (!this.save.settings.snap) return p;
    const g = Config.snapGrid;
    return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
  }

  private snapAngle(a: number) {
    if (!this.save.settings.snap) return a;
    const s = Config.snapAngleDeg * DEG;
    return Math.round(a / s) * s;
  }

  private revalidateGhost() {
    const g = this.ghost;
    if (!g) return;
    const v = this.sim.validatePlacement(g.type, g.x, g.y, g.angle, g.params, g.editingId);
    g.valid = v.ok;
    g.reason = v.reason ?? '';
    if (g.editingId < 0) g.price = this.priceOf(g.type);
  }

  startGhost(type: DeviceType, params?: Record<string, number>, angle = 0, at?: Vec) {
    if (this.menus.isOpen()) this.menus.close();
    if (this.collapseT > 0) return;
    this.cancelGhost();
    const cam = this.renderer.camera;
    const pos = at ?? (!this.lastWasTouch && this.pointerWorld ? this.pointerWorld : { x: cam.x, y: cam.y });
    const p = this.snapPos(pos);
    this.ghost = { type, x: p.x, y: p.y, angle, params: params ?? defaultParams(type), editingId: -1, valid: false, reason: '', price: 0 };
    this.revalidateGhost();
    if (!this.ghost.valid && (this.lastWasTouch || !at)) {
      for (let r = 12; r <= 240 && !this.ghost.valid; r += 12) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2 - Math.PI / 2;
          const q = this.snapPos({ x: pos.x + Math.cos(a) * r, y: pos.y + Math.sin(a) * r });
          if (this.sim.validatePlacement(type, q.x, q.y, angle, this.ghost.params).ok) {
            this.ghost.x = q.x;
            this.ghost.y = q.y;
            this.revalidateGhost();
            break;
          }
        }
      }
    }
    this.selectedId = -1;
  }

  cancelGhost() {
    this.ghost = null;
    if (this.ptr.kind === 'ghostDrag' || this.ptr.kind === 'ghostRotate' || this.ptr.kind === 'devDrag' || this.ptr.kind === 'devRotate') this.ptr = { kind: 'none' };
  }

  confirmGhost(keep = false) {
    const g = this.ghost;
    if (!g) return;
    this.revalidateGhost();
    if (!g.valid) {
      this.sfx.invalid();
      this.hud.toast(g.reason || 'Posição inválida', 'bad');
      return;
    }
    if (g.editingId >= 0) {
      const d = this.sim.devices.get(g.editingId);
      if (d) {
        this.pushUndo({ kind: 'move', id: d.id, from: { x: d.x, y: d.y, angle: d.angle } });
        this.sim.moveDevice(d, g.x, g.y, g.angle);
        this.progress.onInstallationChanged();
        this.sfx.place();
        this.persist();
      }
      this.ghost = null;
      return;
    }
    const price = this.priceOf(g.type);
    if (!this.wallet.spend(price)) {
      this.sfx.invalid();
      this.hud.toast(`Faltam créditos: ◆ ${price}`, 'bad');
      return;
    }
    const dev = this.sim.addDevice({ type: g.type, x: g.x, y: g.y, angle: g.angle, params: { ...g.params }, enabled: true, paid: price });
    this.pushUndo({ kind: 'place', id: dev.id, paid: price });
    this.progress.onInstallationChanged();
    this.sfx.place();
    this.renderer.particles.burst(g.x, g.y, 8, [PAL.cyan, PAL.steelLight], 30, 0.3, 0);
    if (!this.save.tutorial.built) this.save.tutorial.built = true;
    this.persist();
    if (keep) this.revalidateGhost();
    else {
      this.ghost = null;
      this.selectedId = dev.id;
    }
  }

  rotate(deg: number) {
    const g = this.ghost;
    if (g) {
      g.angle = this.snapAngle(g.angle + deg * DEG);
      this.revalidateGhost();
      return;
    }
    const d = this.selectedDevice();
    if (!d) return;
    const na = d.angle + deg * DEG;
    const v = this.sim.validatePlacement(d.type, d.x, d.y, na, d.params, d.id);
    if (!v.ok) {
      this.sfx.invalid();
      this.hud.toast(v.reason ?? 'Rotação inválida', 'bad');
      return;
    }
    this.pushUndo({ kind: 'move', id: d.id, from: { x: d.x, y: d.y, angle: d.angle } });
    this.sim.moveDevice(d, d.x, d.y, na);
    this.progress.onInstallationChanged();
    this.persist();
  }

  setParam(key: string, v: number) {
    const d = this.selectedDevice();
    if (!d) return;
    if (!this.paramEditStart) {
      this.paramEditStart = { ...d.params };
      this.pushUndo({ kind: 'params', id: d.id, from: { ...d.params }, enabled: d.enabled });
      setTimeout(() => (this.paramEditStart = null), 800);
    }
    this.sim.setDeviceParams(d, { [key]: v });
    this.progress.onInstallationChanged();
    this.persist();
  }

  toggleEnabled() {
    const d = this.selectedDevice();
    if (!d) return;
    this.pushUndo({ kind: 'params', id: d.id, from: { ...d.params }, enabled: d.enabled });
    d.enabled = !d.enabled;
    this.sim.wakeNear(d, 80);
    this.progress.onInstallationChanged();
    this.persist();
  }

  toggleGate() {
    const d = this.selectedDevice();
    if (d) this.sim.toggleGate(d);
  }

  copySelected() {
    const d = this.selectedDevice();
    if (!d) return;
    this.startGhost(d.type, { ...d.params }, d.angle, { x: d.x + 16, y: d.y - 24 });
  }

  sellSelected() {
    const d = this.selectedDevice();
    if (!d) return;
    const refund = refundFor(d.paid, this.mods.refundRate);
    const save: DeviceSave = { id: d.id, type: d.type, x: d.x, y: d.y, angle: d.angle, params: { ...d.params }, enabled: d.enabled, paid: d.paid };
    this.sim.removeDevice(d);
    this.wallet.earn(refund);
    this.pushUndo({ kind: 'sell', save, refund });
    this.progress.onInstallationChanged();
    this.selectedId = -1;
    this.ghost = null;
    this.sfx.sell();
    this.renderer.particles.burst(save.x, save.y, 8, [PAL.steelLight, PAL.core], 35, 0.4, 60);
    this.persist();
  }

  deselect() {
    this.selectedId = -1;
    if (this.ghost && this.ghost.editingId >= 0) this.ghost = null;
  }

  private pushUndo(e: UndoEntry) {
    this.undoStack.push(e);
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) {
      this.hud.toast('Nada para desfazer');
      return;
    }
    switch (e.kind) {
      case 'place': {
        const d = this.sim.devices.get(e.id);
        if (d) {
          this.sim.removeDevice(d);
          this.wallet.earn(e.paid);
          if (this.selectedId === e.id) this.selectedId = -1;
        }
        break;
      }
      case 'move': {
        const d = this.sim.devices.get(e.id);
        if (d) {
          const v = this.sim.validatePlacement(d.type, e.from.x, e.from.y, e.from.angle, d.params, d.id);
          if (v.ok) this.sim.moveDevice(d, e.from.x, e.from.y, e.from.angle);
          else this.hud.toast('Não dá para desfazer: posição antiga ocupada', 'bad');
        }
        break;
      }
      case 'sell': {
        const s = e.save;
        const v = this.sim.validatePlacement(s.type, s.x, s.y, s.angle, s.params);
        if (!v.ok) {
          this.hud.toast('Não dá para desfazer: espaço ocupado', 'bad');
          break;
        }
        if (!this.wallet.spend(e.refund)) {
          this.hud.toast('Faltam créditos para desfazer a venda', 'bad');
          this.undoStack.push(e);
          return;
        }
        this.sim.addDevice({ ...s, id: undefined });
        break;
      }
      case 'params': {
        const d = this.sim.devices.get(e.id);
        if (d) {
          this.sim.setDeviceParams(d, e.from);
          d.enabled = e.enabled;
        }
        break;
      }
    }
    this.progress.onInstallationChanged();
    this.sfx.ui();
    this.persist();
  }

  // ------------------------------------------------------------------
  // Entrada
  // ------------------------------------------------------------------

  private worldOf(p: PointerInfo): Vec {
    return this.renderer.camera.toWorld(p.b.x, p.b.y);
  }

  private cssToWorld(px: number) {
    return (px * this.renderer.bufferPerCss()) / this.renderer.camera.zoom;
  }

  private handles(): Handle[] {
    const g = this.ghost;
    const d = this.selectedDevice();
    const target = g ?? (d ? { type: d.type, x: d.x, y: d.y, angle: d.angle } : null);
    if (!target) return [];
    const r = DEVICES[target.type].hitRadius + 14;
    const off = rot({ x: r, y: 0 }, target.angle);
    return [{ kind: 'rotate', x: target.x + off.x, y: target.y + off.y, r: 5 }];
  }

  private hitHandle(w: Vec, touch: boolean): boolean {
    const tol = Math.max(7, this.cssToWorld(touch ? 24 : 12));
    return this.handles().some((h) => dist(h, w) <= tol);
  }

  private moveCursor(p: PointerInfo) {
    this.cursor.x = p.b.x;
    this.cursor.y = p.b.y;
    if (p.touch) {
      this.cursorTouchUntil = this.realTime + 0.5;
      this.cursor.visible = true;
    } else this.cursor.visible = true;
  }

  private updateCursorKind() {
    let k: CursorKind = 'arrow';
    if (this.ptr.kind === 'grab') k = 'clawClosed';
    else if (this.ghost) k = 'arrow';
    else if (this.ptr.kind === 'extract' || this.hoverAsteroid) k = 'reticle';
    else if (this.hoverFragment >= 0) k = 'clawOpen';
    else if (this.hoverDevice) k = 'hand';
    if (this.lastWasTouch && k === 'arrow') k = 'none';
    this.cursor.kind = k;
  }

  private onDown(p: PointerInfo) {
    if (this.menus.isOpen() || this.tree.isOpen() || this.collapseT > 0) return;
    this.lastWasTouch = p.touch;
    this.moveCursor(p);
    const w = this.worldOf(p);
    this.pointerWorld = w;
    const touchTol = p.touch ? this.cssToWorld(10) : 0;

    if (this.ghost) {
      if (this.hitHandle(w, p.touch)) {
        this.ptr = { kind: 'ghostRotate', touch: p.touch };
        return;
      }
      const near = dist(w, this.ghost) <= DEVICES[this.ghost.type].hitRadius + 4 + touchTol;
      if (near || p.touch) {
        const offset = near ? { x: this.ghost.x - w.x, y: this.ghost.y - w.y } : { x: 0, y: 0 };
        this.ptr = { kind: 'ghostDrag', offset, touch: p.touch };
        if (!near) {
          const s = this.snapPos(w);
          this.ghost.x = s.x;
          this.ghost.y = s.y;
          this.revalidateGhost();
        }
        return;
      }
      this.confirmGhost(p.shift);
      return;
    }

    const sel = this.selectedDevice();
    if (sel) {
      if (this.hitHandle(w, p.touch)) {
        this.beginEdit(sel);
        this.ptr = { kind: 'devRotate' };
        return;
      }
      if (this.sim.deviceAt(w, 3 + touchTol) === sel) {
        this.beginEdit(sel);
        this.ptr = { kind: 'devDrag', offset: { x: sel.x - w.x, y: sel.y - w.y }, startB: p.b };
        return;
      }
    }

    if (this.sim.isOnAsteroid(w)) {
      if (this.sim.extract(w).length) this.cursor.swing = 1;
      this.shake = Math.max(this.shake, 0.6);
      this.ptr = { kind: 'extract', last: this.realTime, world: w };
      return;
    }

    const frag = this.sim.fragmentAt(w, p.touch ? Math.max(6, this.cssToWorld(14)) : Math.max(3, this.cssToWorld(6)));
    if (frag) {
      if (!p.touch) {
        this.beginGrab(frag.id, w);
        return;
      }
      const id = window.setTimeout(() => {
        if (this.ptr.kind === 'pending' && this.ptr.target === 'fragment' && this.sim.fragments.has(frag.id)) {
          this.beginGrab(frag.id, this.pointerWorld ?? w);
          if (navigator.vibrate) navigator.vibrate(8);
        }
      }, 170);
      this.ptr = { kind: 'pending', startB: p.b, target: 'fragment', fragId: frag.id, devId: -1, touch: true, timer: id };
      return;
    }

    const dev = this.sim.deviceAt(w, 2 + touchTol);
    this.ptr = { kind: 'pending', startB: p.b, target: dev ? 'device' : 'empty', fragId: -1, devId: dev?.id ?? -1, touch: p.touch, timer: 0 };
  }

  private beginGrab(id: number, w: Vec) {
    if (this.sim.startGrab(id, w)) {
      this.ptr = { kind: 'grab' };
      this.progress.onManualGrab(this.sim.time);
      this.sfx.humStart();
      if (!this.save.tutorial.grabbed) {
        this.save.tutorial.grabbed = true;
        this.persist();
      }
    }
  }

  private beginEdit(d: Device) {
    this.ghost = { type: d.type, x: d.x, y: d.y, angle: d.angle, params: { ...d.params }, editingId: d.id, valid: true, reason: '', price: 0 };
  }

  private onMove(p: PointerInfo) {
    this.moveCursor(p);
    const w = this.worldOf(p);
    this.pointerWorld = w;
    const st = this.ptr;
    const moveTol = (p.touch ? 9 : 5) * this.renderer.bufferPerCss();
    switch (st.kind) {
      case 'grab':
        this.sim.updateGrab(w);
        break;
      case 'extract':
        st.world = w;
        if (!this.sim.isOnAsteroid(w)) this.ptr = { kind: 'none' };
        break;
      case 'pan':
        this.renderer.camera.panBy(p.b.x - st.last.x, p.b.y - st.last.y);
        st.last = p.b;
        break;
      case 'pending':
        if (Math.hypot(p.b.x - st.startB.x, p.b.y - st.startB.y) > moveTol) {
          if (st.timer) clearTimeout(st.timer);
          this.renderer.camera.panBy(p.b.x - st.startB.x, p.b.y - st.startB.y);
          this.ptr = { kind: 'pan', last: p.b };
        }
        break;
      case 'ghostDrag':
      case 'devDrag': {
        if (!this.ghost) break;
        const s = this.snapPos({ x: w.x + st.offset.x, y: w.y + st.offset.y });
        this.ghost.x = s.x;
        this.ghost.y = s.y;
        this.revalidateGhost();
        break;
      }
      case 'ghostRotate':
      case 'devRotate': {
        if (!this.ghost) break;
        this.ghost.angle = this.snapAngle(Math.atan2(w.y - this.ghost.y, w.x - this.ghost.x));
        this.revalidateGhost();
        break;
      }
      default:
        break;
    }
  }

  private onHover(p: PointerInfo) {
    this.lastWasTouch = false;
    this.moveCursor(p);
    if (this.menus.isOpen() || this.tree.isOpen()) return;
    const w = this.worldOf(p);
    this.pointerWorld = w;
    if (this.ghost && this.ghost.editingId < 0 && this.ptr.kind === 'none') {
      const s = this.snapPos(w);
      this.ghost.x = s.x;
      this.ghost.y = s.y;
      this.revalidateGhost();
    }
    this.hoverAsteroid = this.sim.isOnAsteroid(w);
    const f = this.hoverAsteroid ? null : this.sim.fragmentAt(w, Math.max(3, this.cssToWorld(6)));
    this.hoverFragment = f?.id ?? -1;
    this.hoverDevice = !f && !!this.sim.deviceAt(w, 2);
  }

  private onUp(p: PointerInfo) {
    const st = this.ptr;
    this.ptr = { kind: 'none' };
    switch (st.kind) {
      case 'grab':
        this.sim.endGrab();
        this.sfx.humStop();
        break;
      case 'pending':
        if (st.timer) clearTimeout(st.timer);
        if (st.target === 'device') {
          this.selectedId = st.devId;
          this.sfx.ui();
        } else if (st.target === 'empty') this.selectedId = -1;
        break;
      case 'devDrag':
      case 'devRotate':
        if (this.ghost && this.ghost.editingId >= 0) {
          const d = this.sim.devices.get(this.ghost.editingId);
          const moved = d && (Math.abs(d.x - this.ghost.x) > 0.01 || Math.abs(d.y - this.ghost.y) > 0.01 || Math.abs(d.angle - this.ghost.angle) > 1e-4);
          if (moved) this.confirmGhost();
          this.ghost = null;
        }
        break;
      case 'ghostDrag':
        if (!st.touch) this.confirmGhost(p.shift);
        break;
      default:
        break;
    }
  }

  private cancelPointer() {
    const st = this.ptr;
    if (st.kind === 'grab') {
      this.sim.endGrab();
      this.sfx.humStop();
    }
    if (st.kind === 'pending' && st.timer) clearTimeout(st.timer);
    if ((st.kind === 'devDrag' || st.kind === 'devRotate') && this.ghost && this.ghost.editingId >= 0) this.ghost = null;
    if (st.kind === 'none' && this.ghost && !this.lastWasTouch) this.cancelGhost();
    this.ptr = { kind: 'none' };
  }

  private onWheel(dy: number, at: Vec, shift: boolean) {
    if (this.menus.isOpen() || this.tree.isOpen()) return;
    if (this.ghost && (this.ptr.kind === 'none' || this.ptr.kind === 'ghostDrag' || this.ptr.kind === 'devDrag')) {
      this.rotate(Math.sign(dy) * (shift ? 1 : 5));
      return;
    }
    this.renderer.camera.zoomAt(Math.pow(1.0015, -dy), at.x, at.y);
  }

  private escape() {
    if (this.tree.isOpen()) {
      this.tree.close();
      return;
    }
    if (this.menus.isOpen()) {
      if (this.menus.screen !== 'title' && this.menus.screen !== 'complete') this.menus.close();
      return;
    }
    if (this.ghost) {
      this.cancelGhost();
      return;
    }
    if (this.selectedId >= 0) {
      this.selectedId = -1;
      return;
    }
    this.menus.title();
  }

  togglePause() {
    this.paused = !this.paused;
    this.updateHud();
  }

  overview() {
    this.renderer.camera.overview();
  }

  home() {
    const a = this.zone.asteroid;
    this.renderer.camera.flyTo(a.x + 60, a.y + 20, Math.max(1, this.renderer.camera.zoom));
  }

  // ------------------------------------------------------------------
  // Ajustes
  // ------------------------------------------------------------------

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.save.settings[key] = value;
    if (key === 'highContrast') this.renderer.rebuildTerrain(Boolean(value));
    this.applySettings();
    this.persist();
  }

  private applySettings() {
    const s = this.save.settings;
    this.bus.setVolumes(s.master, s.music, s.sfx, s.muted);
    document.documentElement.style.setProperty('--ui', String(s.uiScale));
    if (this.sim) this.updateInsets();
    document.body.classList.toggle('high-contrast', s.highContrast);
    this.renderer.particles.setCap(s.reduceParticles ? 180 : 700);
  }

  resetSave() {
    this.saveMgr.reset();
    this.mods = buildMods(this.save.tree.levels);
    this.wallet.credits = this.save.credits;
    this.sim.destroy();
    (this as unknown as { sim: Sim | undefined }).sim = undefined;
    this.openZoneInternal(1, true);
    this.applySettings();
    this.menus.title();
  }

  uiSound() {
    this.sfx.ui();
  }

  /** Informa à câmera quanto da tela o HUD e a doca ocupam. */
  updateInsets() {
    const compact = window.innerHeight < 480;
    const u = this.save.settings.uiScale;
    const top = (compact ? 70 : 92) * u;
    const left = this.dock.isOpen() ? (compact ? 78 : 100) * u : 24;
    this.renderer.setInsetsCss(top, 12, left);
    this.renderer.resize();
  }

  private onResize() {
    this.updateInsets();
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    document.body.classList.toggle('portrait', portrait && this.isTouchDevice);
    document.body.classList.toggle('compact', window.innerHeight < 480);
  }
}
