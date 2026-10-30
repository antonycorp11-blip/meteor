import Matter from 'matter-js';
import { Config } from '../core/Config';
import { Emitter } from '../core/Emitter';
import {
  circleOverlapsPoly,
  convexOverlap,
  dist,
  distPointPoly,
  distPointSeg,
  lineOfSight,
  makeShape,
  pointInPoly,
  polyCentroid,
  rot,
  transformPoly,
  type Poly,
  type PolyShape,
  type Vec,
} from '../core/geometry';
import { Rng } from '../core/rng';
import { ARM_LENGTH, DEVICES, LAUNCHER_CUP, LIFT_HEIGHT, SENSOR_SIZE, footprint } from '../machines/catalog';
import type { DeviceSave, DeviceType } from '../machines/types';
import { makeFragmentShape, type Fragment } from '../physics/Fragment';
import {
  FRAGMENT_TYPES,
  SHATTER_SPEED,
  UNSTABLE_PULSE_ACCEL,
  UNSTABLE_PULSE_RADIUS,
  UNSTABLE_PULSE_SPEED,
  type FragmentTypeId,
} from '../physics/fragmentTypes';
import { terrainPolys } from '../world/Terrain';
import type { AmbientFieldData, MoverData, ZoneData } from '../world/types';
import { DEFAULT_MODS, type SimMods } from './mods';

const { Engine, Body, Composite, Events, Sleeping, Vertices, Bodies } = Matter;

// O limiar padrão (√6 px/passo) é calibrado para mundos com corpos grandes.
// Na nossa escala (detritos de ~10 px) ele trava todo contato lento como se
// fosse atrito estático infinito; reduzimos para que pedras deslizem e rolem.
(Matter.Resolver as unknown as { _restingThreshTangent: number })._restingThreshTangent = 0.05;

export interface DeviceRuntime {
  flash: number;
  phase: number;
  timer: number;
  /** portinhola: 0 fechada … 1 aberta */
  open: number;
  manualOpen: boolean;
  sensorUntil: number;
  holdId: number;
  holdTime: number;
  nextReady: number;
  /** braço: giro atual em rad e velocidade angular (rad/s) */
  swing: number;
  swingVel: number;
  lastHit: Map<number, number>;
  passes: number;
  seen: Set<number>;
}

export interface Device extends DeviceSave {
  bodies: Matter.Body[];
  /** sólidos em coordenadas de mundo (estado de repouso) */
  worldSolids: Poly[];
  rt: DeviceRuntime;
  /** centróide da parte móvel relativo ao pivô (ângulo de repouso) */
  movingOffset: Vec | null;
  pivotWorld: Vec | null;
}

export type ImpactSurface = 'terrain' | 'device' | 'fragment' | 'asteroid';

export interface AbsorbInfo {
  frag: Fragment;
  value: number;
  mass: number;
  auto: boolean;
  launchDistance: number;
  fieldCurve: boolean;
}

export type SimEvents = {
  extract: { frag: Fragment; auto: boolean; x: number; y: number };
  extractFail: { reason: string };
  absorb: AbsorbInfo;
  lost: { frag: Fragment; reason: 'bounds' | 'rest' | 'shatter' };
  impact: { x: number; y: number; speed: number; mass: number; surface: ImpactSurface; type: FragmentTypeId };
  device: { dev: Device; kind: 'spring' | 'booster' | 'launch' | 'gate' | 'arm' | 'damper' | 'sensor' };
  shatter: { x: number; y: number; parent: Fragment; shards: Fragment[] };
  pulse: { x: number; y: number };
  grabBreak: { x: number; y: number };
};

export interface Placement {
  ok: boolean;
  reason?: string;
}

interface SimOptions {
  mods?: SimMods;
  maxFragments?: number;
  seed?: number;
}

type Plugin = { kind: 'frag'; id: number } | { kind: 'dev'; id: number } | { kind: 'terrain' } | { kind: 'asteroid' };

const toMs2 = (pxPerS2: number) => pxPerS2 / 1e6;

export class Sim {
  readonly zone: ZoneData;
  readonly engine: Matter.Engine;
  readonly rng: Rng;
  readonly events = new Emitter<SimEvents>();
  mods: SimMods;
  maxFragments: number;
  time = 0;
  frame = 0;
  terrain: Poly[];
  terrainShapes: PolyShape[];
  asteroidBody: Matter.Body;
  fragments = new Map<number, Fragment>();
  devices = new Map<number, Device>();
  nextFragId = 1;
  nextDeviceId = 1;
  lastManualExtract = -99;
  grab: { fragId: number; target: Vec } | null = null;
  generated = 0;
  /** 0..1: quanto o buraco negro já cresceu (aumenta raio e força) */
  holeGrowth = 0;
  /** colapso final: o buraco negro engole tudo, sem oclusão */
  collapsing = false;
  /** direção em que a mineração automática bate (último clique manual) */
  mineAim: Vec;
  private autoMineTimer = 0;
  private bodyR = 0;
  moverBodies: Matter.Body[] = [];
  private queue: (() => void)[] = [];
  private g: number;

  constructor(zone: ZoneData, opts: SimOptions = {}) {
    this.zone = zone;
    this.mods = opts.mods ?? { ...DEFAULT_MODS };
    this.maxFragments = opts.maxFragments ?? Config.maxActiveFragments.desktop;
    this.rng = new Rng(opts.seed ?? zone.id * 7919 + 17);
    this.g = Config.gravity;
    this.mineAim = zone.solutions[0]?.aim ?? { x: zone.asteroid.x + 100, y: zone.asteroid.y - 30 };
    this.engine = Engine.create({
      // Sem "sleeping": pilhas adormecidas travavam em encostas; o repouso
      // prolongado é tratado pela regra de recolhimento (Config.restRecycleSeconds).
      enableSleeping: false,
      positionIterations: 8,
      velocityIterations: 6,
    });
    this.engine.gravity.x = zone.gravity.x;
    this.engine.gravity.y = zone.gravity.y;
    this.engine.gravity.scale = toMs2(Config.gravity);

    this.terrain = terrainPolys(zone);
    this.terrainShapes = this.terrain.map(makeShape);
    const tb = this.terrain.map((poly) => this.staticBody(poly, { kind: 'terrain' }, 0.05, 0.12));
    Composite.add(this.engine.world, tb);

    const a = zone.asteroid;
    this.asteroidBody = Bodies.circle(a.x, a.y, a.r, {
      isStatic: true,
      friction: 0.01,
      restitution: 0.15,
      plugin: { kind: 'asteroid' } satisfies Plugin,
    });
    Composite.add(this.engine.world, this.asteroidBody);
    this.bodyR = a.r;
    for (const m of zone.movers ?? []) {
      const poly = m.poly.map(([x, y]) => ({ x, y }));
      const body = this.staticBody(poly, { kind: 'terrain' }, 0.05, 0.15);
      // o pivô do obstáculo é a origem local do polígono
      Body.setCentre(body, { x: 0, y: 0 }, false);
      this.moverBodies.push(body);
    }
    if (this.moverBodies.length) Composite.add(this.engine.world, this.moverBodies);
    this.updateMovers();

    Events.on(this.engine, 'collisionStart', (e) => this.onCollision(e.pairs, true));
    Events.on(this.engine, 'collisionActive', (e) => this.onCollision(e.pairs, false));
  }

  private staticBody(poly: Poly, plugin: Plugin, friction: number, restitution: number) {
    return Body.create({
      position: Vertices.centre(poly),
      vertices: poly,
      isStatic: true,
      friction,
      frictionStatic: 0.5,
      restitution,
      plugin,
    });
  }

  holeAbsorb() {
    return this.zone.blackHole.absorbRadius * (1 + 2.2 * this.holeGrowth);
  }

  holeAttract() {
    return this.zone.blackHole.attractRadius * (1 + 0.8 * this.holeGrowth) * this.mods.holeRadiusMul;
  }

  holeStrength() {
    return this.zone.blackHole.strength * (1 + 0.5 * this.holeGrowth);
  }

  /** Raio atual do planeta: encolhe conforme a semente cresce. */
  planetR() {
    const a = this.zone.asteroid;
    return a.r * (1 - (this.zone.planetShrink ?? 0.6) * this.holeGrowth);
  }

  /** Mantém o corpo físico do planeta do tamanho do desenho. */
  private syncPlanet() {
    const r = this.planetR();
    if (Math.abs(r - this.bodyR) < 0.5) return;
    Body.scale(this.asteroidBody, r / this.bodyR, r / this.bodyR);
    this.bodyR = r;
  }

  /** Fator de um campo ambiental agora (−1..1 para campos que invertem). */
  fieldFactor(af: AmbientFieldData) {
    if (!af.period) return 1;
    const v = Math.sin((this.time / af.period) * Math.PI * 2 + (af.phase ?? 0));
    return Math.max(-1, Math.min(1, v * 3));
  }

  /** Posição e ângulo de um obstáculo móvel num instante. */
  moverPose(m: MoverData, t = this.time) {
    const a = m.phase + m.speed * t;
    return { x: m.cx + Math.cos(a) * m.orbit, y: m.cy + Math.sin(a) * m.orbit, angle: (m.spin ?? 0) * t + (m.orbit > 0 ? a : 0) };
  }

  private updateMovers() {
    const ms = this.zone.movers ?? [];
    ms.forEach((m, i) => {
      const b = this.moverBodies[i];
      const p = this.moverPose(m);
      // matter 0.20 aceita updateVelocity: o obstáculo transmite seu movimento às pedras
      (Body.setPosition as (b: Matter.Body, p: Vec, u: boolean) => void)(b, { x: p.x, y: p.y }, true);
      (Body.setAngle as (b: Matter.Body, a: number, u: boolean) => void)(b, p.angle, true);
    });
  }

  // ------------------------------------------------------------------
  // Fragmentos
  // ------------------------------------------------------------------

  activeCount() {
    return this.fragments.size;
  }

  private pickType(): FragmentTypeId {
    const table = this.zone.fragmentTable;
    let total = 0;
    const w = (t: { type: FragmentTypeId; weight: number }) => (FRAGMENT_TYPES[t.type].value >= 1.5 ? t.weight * this.mods.valuableWeightMul : t.weight);
    for (const t of table) total += w(t);
    let r = this.rng.next() * total;
    for (const t of table) {
      r -= w(t);
      if (r <= 0) return t.type;
    }
    return table[0].type;
  }

  spawnFragment(type: FragmentTypeId, pos: Vec, vel: Vec, extra: Partial<Fragment> = {}): Fragment {
    const def = FRAGMENT_TYPES[type];
    const shape = makeFragmentShape(type, this.rng);
    const id = this.nextFragId++;
    const verts = shape.poly.map((p) => ({ x: p.x + pos.x, y: p.y + pos.y }));
    const body = Body.create({
      position: Vertices.centre(verts),
      vertices: verts,
      friction: def.friction,
      frictionStatic: 0.3,
      frictionAir: def.frictionAir,
      restitution: def.restitution,
      slop: 0.03,
      plugin: { kind: 'frag', id } satisfies Plugin,
    });
    Body.setMass(body, def.mass);
    Body.setVelocity(body, vel);
    Body.setAngularVelocity(body, this.rng.range(-0.12, 0.12));
    const local = body.vertices.map((q) => ({ x: q.x - body.position.x, y: q.y - body.position.y }));
    const frag: Fragment = {
      id,
      type,
      body,
      local,
      radius: shape.radius,
      born: this.time,
      manual: false,
      autoExtracted: false,
      launchedFrom: null,
      launcherTouched: false,
      fieldTouched: false,
      regions: new Set(),
      restTime: 0,
      lastPulse: -99,
      parentId: 0,
      generation: 0,
      prevX: body.position.x,
      prevY: body.position.y,
      prevA: body.angle,
      alive: true,
      ...extra,
    };
    this.fragments.set(id, frag);
    Composite.add(this.engine.world, body);
    return frag;
  }

  private spawnValid(p: Vec, r: number): boolean {
    for (const poly of this.terrain) if (distPointPoly(p, poly) < r) return false;
    for (const d of this.devices.values()) for (const poly of d.worldSolids) if (distPointPoly(p, poly) < r) return false;
    return p.x > 4 && p.x < this.zone.width - 4 && p.y > 4 && p.y < this.zone.height - 4;
  }

  canExtract(): boolean {
    return this.time - this.lastManualExtract >= Config.extractCooldown * this.mods.extractCooldownMul;
  }

  /** Extrai um fragmento real na superfície do asteroide, na direção do ponto. */
  extract(target: Vec | null, auto = false): Fragment[] {
    if (!auto && !this.canExtract()) return [];
    if (this.fragments.size >= this.maxFragments) {
      this.events.emit('extractFail', { reason: 'Muitos detritos ativos — entregue alguns antes.' });
      return [];
    }
    const a = this.zone.asteroid;
    const pr = this.planetR();
    const base = target ? Math.atan2(target.y - a.y, target.x - a.x) : -Math.PI / 2 + this.rng.range(-0.6, 0.6);
    const out: Fragment[] = [];
    const ch = this.mods.multiExtractChance;
    const count = 1 + Math.floor(ch) + (this.rng.chance(ch - Math.floor(ch)) ? 1 : 0);
    for (let k = 0; k < count; k++) {
      let ang = base + k * 0.32;
      let found = false;
      for (let i = 0; i < 24; i++) {
        const off = ((i + 1) >> 1) * (i % 2 ? 1 : -1) * 0.18;
        const t = ang + off;
        const p = { x: a.x + Math.cos(t) * (pr + 7.5), y: a.y + Math.sin(t) * (pr + 7.5) };
        if (this.spawnValid(p, 6.5)) {
          ang = t;
          found = true;
          break;
        }
      }
      if (!found) {
        if (!out.length) this.events.emit('extractFail', { reason: 'Sem espaço livre na superfície.' });
        break;
      }
      const n = { x: Math.cos(ang), y: Math.sin(ang) };
      const p = { x: a.x + n.x * (pr + 7.5), y: a.y + n.y * (pr + 7.5) };
      const spread = this.rng.range(-Config.extractSpread, Config.extractSpread);
      const sp = Config.extractSpeed * this.rng.range(0.9, 1.1);
      const vel = { x: n.x * sp - n.y * spread, y: n.y * sp + n.x * spread };
      const frag = this.spawnFragment(this.pickType(), p, vel, { autoExtracted: auto });
      this.generated++;
      out.push(frag);
      this.events.emit('extract', { frag, auto, x: p.x, y: p.y });
    }
    if (!auto && out.length) {
      this.lastManualExtract = this.time;
      if (target) this.mineAim = { ...target };
    }
    return out;
  }

  removeFragment(frag: Fragment) {
    if (!frag.alive) return;
    frag.alive = false;
    Composite.remove(this.engine.world, frag.body);
    this.fragments.delete(frag.id);
    if (this.grab?.fragId === frag.id) this.grab = null;
  }

  // ------------------------------------------------------------------
  // Feixe manual
  // ------------------------------------------------------------------

  startGrab(fragId: number, target: Vec): boolean {
    const f = this.fragments.get(fragId);
    if (!f) return false;
    this.grab = { fragId, target: { ...target } };
    f.manual = true;
    Sleeping.set(f.body, false);
    return true;
  }

  updateGrab(target: Vec) {
    if (this.grab) this.grab.target = { ...target };
  }

  endGrab() {
    this.grab = null;
  }

  grabReach() {
    return Config.grabReach * this.mods.grabReachMul;
  }

  // ------------------------------------------------------------------
  // Dispositivos
  // ------------------------------------------------------------------

  private worldSolidsFor(type: DeviceType, x: number, y: number, angle: number, params: Record<string, number>) {
    return DEVICES[type].solids(params).map((p) => transformPoly(p, { x, y }, angle));
  }

  countType(type: DeviceType) {
    let n = 0;
    for (const d of this.devices.values()) if (d.type === type) n++;
    return n;
  }

  validatePlacement(
    type: DeviceType,
    x: number,
    y: number,
    angle: number,
    params: Record<string, number>,
    ignoreId = -1,
  ): Placement {
    const def = DEVICES[type];
    const polys = footprint(type, params).map((p) => transformPoly(p, { x, y }, angle));
    const W = this.zone.width;
    const H = this.zone.height;
    for (const p of polys)
      for (const q of p)
        if (q.x < 6 || q.y < 6 || q.x > W - 6 || q.y > H - 6) return { ok: false, reason: 'Fora dos limites do mapa' };
    for (const p of polys)
      for (const t of this.terrain) if (convexOverlap(p, t, 0.5)) return { ok: false, reason: 'Dentro da rocha' };
    const a = this.zone.asteroid;
    const h = this.zone.blackHole;
    for (const p of polys) {
      // o planeta encolhe: nada pode ser construído dentro do raio original
      if (circleOverlapsPoly(a, a.r + 18, p)) return { ok: false, reason: 'Muito perto do planeta' };
      if (circleOverlapsPoly(h, this.holeAbsorb() + 26, p)) return { ok: false, reason: 'Não pode tapar o buraco negro' };
      for (const nb of this.zone.noBuild) if (circleOverlapsPoly(nb, nb.r, p)) return { ok: false, reason: 'Área proibida' };
    }
    const anchors = this.zone.anchors ?? [];
    if (anchors.length && !anchors.some((an) => polys.every((p) => p.every((q) => Math.hypot(q.x - an.x, q.y - an.y) <= an.r))))
      return { ok: false, reason: 'Fora das ancoragens' };
    for (const m of this.zone.movers ?? []) {
      const local = m.poly.map(([px, py]) => ({ x: px, y: py }));
      // checa a trajetória inteira do obstáculo (uma volta)
      const period = Math.abs(m.speed) > 1e-4 ? (Math.PI * 2) / Math.abs(m.speed) : Math.abs(m.spin ?? 0) > 1e-4 ? (Math.PI * 2) / Math.abs(m.spin!) : 1;
      for (let k = 0; k < 36; k++) {
        const pose = this.moverPose(m, (k / 36) * period);
        const world = transformPoly(local, pose, pose.angle);
        for (const p of polys) if (convexOverlap(p, world, 2)) return { ok: false, reason: 'No caminho de um obstáculo em movimento' };
      }
    }
    for (const d of this.devices.values()) {
      if (d.id === ignoreId) continue;
      const other = d.worldSolids.length ? d.worldSolids : footprint(d.type, d.params).map((p) => transformPoly(p, d, d.angle));
      for (const p of polys) for (const o of other) if (convexOverlap(p, o, 0.5)) return { ok: false, reason: 'Sobreposto a outra peça' };
    }
    if (def.maxPerZone !== undefined && ignoreId < 0 && this.countType(type) >= def.maxPerZone)
      return { ok: false, reason: `Limite de ${def.maxPerZone} por zona` };
    return { ok: true };
  }

  /** Mantém parâmetros dentro dos limites do catálogo. */
  private clampParams(type: DeviceType, params: Record<string, number>) {
    const out = { ...params };
    for (const p of DEVICES[type].params) {
      const v = out[p.key];
      if (typeof v === 'number') out[p.key] = Math.min(p.max, Math.max(p.min, v));
    }
    return out;
  }

  addDevice(save: Omit<DeviceSave, 'id'> & { id?: number }): Device {
    save = { ...save, params: this.clampParams(save.type, save.params) };
    const id = save.id ?? this.nextDeviceId;
    this.nextDeviceId = Math.max(this.nextDeviceId, id + 1);
    const dev: Device = {
      ...save,
      id,
      params: { ...save.params },
      bodies: [],
      worldSolids: [],
      rt: {
        flash: 0,
        phase: this.rng.next(),
        timer: 0,
        open: 0,
        manualOpen: false,
        sensorUntil: -1,
        holdId: 0,
        holdTime: 0,
        nextReady: 0,
        swing: 0,
        swingVel: 0,
        lastHit: new Map(),
        passes: 0,
        seen: new Set(),
      },
      movingOffset: null,
      pivotWorld: null,
    };
    this.buildDeviceBodies(dev);
    this.devices.set(id, dev);
    return dev;
  }

  private buildDeviceBodies(dev: Device) {
    const def = DEVICES[dev.type];
    dev.worldSolids = this.worldSolidsFor(dev.type, dev.x, dev.y, dev.angle, dev.params);
    dev.bodies = dev.worldSolids.map((poly) =>
      this.staticBody(poly, { kind: 'dev', id: dev.id }, def.friction, def.restitution),
    );
    if (def.movingSolid !== undefined && def.pivot) {
      const pivotWorld = transformPoly([def.pivot], dev, dev.angle)[0];
      const c = Vertices.centre(dev.worldSolids[def.movingSolid]);
      dev.pivotWorld = pivotWorld;
      dev.movingOffset = { x: c.x - pivotWorld.x, y: c.y - pivotWorld.y };
    } else {
      dev.pivotWorld = null;
      dev.movingOffset = null;
    }
    Composite.add(this.engine.world, dev.bodies);
    this.nudgeFragmentsOut(dev.worldSolids);
    this.wakeNear({ x: dev.x, y: dev.y }, def.hitRadius + 40);
    this.applyMovingPart(dev);
  }

  private removeDeviceBodies(dev: Device) {
    Composite.remove(this.engine.world, dev.bodies);
    dev.bodies = [];
    this.wakeNear({ x: dev.x, y: dev.y }, DEVICES[dev.type].hitRadius + 60);
  }

  moveDevice(dev: Device, x: number, y: number, angle: number) {
    this.removeDeviceBodies(dev);
    dev.x = x;
    dev.y = y;
    dev.angle = angle;
    this.buildDeviceBodies(dev);
  }

  removeDevice(dev: Device) {
    this.removeDeviceBodies(dev);
    this.devices.delete(dev.id);
  }

  setDeviceParams(dev: Device, params: Record<string, number>) {
    dev.params = this.clampParams(dev.type, { ...dev.params, ...params });
  }

  private nudgeFragmentsOut(polys: Poly[]) {
    for (const f of this.fragments.values()) {
      const p = f.body.position;
      for (const poly of polys) {
        if (distPointPoly(p, poly) >= f.radius) continue;
        const c = polyCentroid(poly);
        let dir = { x: p.x - c.x, y: p.y - c.y };
        const l = Math.hypot(dir.x, dir.y);
        dir = l > 0.01 ? { x: dir.x / l, y: dir.y / l } : { x: 0, y: -1 };
        let q = { ...p };
        for (let i = 0; i < 40 && distPointPoly(q, poly) < f.radius + 0.5; i++) q = { x: q.x + dir.x * 1.5, y: q.y + dir.y * 1.5 };
        Body.setPosition(f.body, q);
        Body.setVelocity(f.body, { x: 0, y: 0 });
      }
    }
  }

  wakeNear(p: Vec, r: number) {
    for (const f of this.fragments.values()) {
      if (f.body.isSleeping && dist(f.body.position, p) < r) Sleeping.set(f.body, false);
    }
  }

  private applyMovingPart(dev: Device) {
    const def = DEVICES[dev.type];
    if (def.movingSolid === undefined || !dev.pivotWorld || !dev.movingOffset) return;
    const body = dev.bodies[def.movingSolid];
    if (!body) return;
    let delta = 0;
    if (dev.type === 'gate') delta = (-85 * Math.PI * dev.rt.open) / 180;
    if (dev.type === 'arm') delta = dev.rt.swing;
    const off = rot(dev.movingOffset, delta);
    Body.setAngle(body, delta);
    Body.setPosition(body, { x: dev.pivotWorld.x + off.x, y: dev.pivotWorld.y + off.y });
  }

  toggleGate(dev: Device) {
    if (dev.type !== 'gate') return;
    dev.rt.manualOpen = !dev.rt.manualOpen;
  }

  // ------------------------------------------------------------------
  // Colisões
  // ------------------------------------------------------------------

  private onCollision(pairs: Matter.Pair[], start: boolean) {
    for (const pair of pairs) {
      const pa = pair.bodyA.plugin as Plugin;
      const pb = pair.bodyB.plugin as Plugin;
      let fragBody = pair.bodyA;
      let other = pair.bodyB;
      let op = pb;
      if (pa?.kind !== 'frag') {
        if (pb?.kind !== 'frag') continue;
        fragBody = pair.bodyB;
        other = pair.bodyA;
        op = pa;
      }
      const frag = this.fragments.get((fragBody.plugin as { id: number }).id);
      if (!frag) continue;
      const n = pair.collision.normal;
      const va = Body.getVelocity(fragBody);
      const vb = other.isStatic ? { x: 0, y: 0 } : Body.getVelocity(other);
      const rel = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);

      if (start) {
        const surface: ImpactSurface =
          op?.kind === 'terrain' ? 'terrain' : op?.kind === 'dev' ? 'device' : op?.kind === 'asteroid' ? 'asteroid' : 'fragment';
        if (rel > 1.1) {
          const cp = pair.collision.supports?.[0] ?? fragBody.position;
          this.events.emit('impact', { x: cp.x, y: cp.y, speed: rel, mass: fragBody.mass, surface, type: frag.type });
        }
        if (frag.type === 'glass' && frag.generation === 0 && rel > SHATTER_SPEED) this.queue.push(() => this.shatter(frag));
        if (frag.type === 'unstable' && rel > UNSTABLE_PULSE_SPEED && this.time - frag.lastPulse > 1.2) {
          frag.lastPulse = this.time;
          this.queue.push(() => this.pulse(frag));
        }
      }
      if (op?.kind === 'dev') {
        const dev = this.devices.get(op.id);
        if (dev && dev.enabled) this.deviceContact(dev, frag, start);
      }
    }
  }

  private deviceContact(dev: Device, frag: Fragment, start: boolean) {
    const t = this.time;
    switch (dev.type) {
      case 'spring': {
        // só arremessa quem encosta do lado da seta
        const n = { x: Math.sin(dev.angle), y: -Math.cos(dev.angle) };
        const side = (frag.body.position.x - dev.x) * n.x + (frag.body.position.y - dev.y) * n.y;
        if (side < 0) return;
        const last = dev.rt.lastHit.get(frag.id) ?? -9;
        if (t - last < 0.3) return;
        dev.rt.lastHit.set(frag.id, t);
        this.queue.push(() => {
          if (!frag.alive) return;
          const vel = Body.getVelocity(frag.body);
          const tx = { x: -n.y, y: n.x };
          const vt = vel.x * tx.x + vel.y * tx.y;
          // pedras pesadas sobem menos: o pulso entrega impulso, não velocidade
          const power = ((dev.params.power ?? 7) * this.mods.springMul) / Math.pow(Math.max(0.5, frag.body.mass), this.mods.springMassExp);
          Body.setVelocity(frag.body, { x: n.x * power + tx.x * vt * 0.35, y: n.y * power + tx.y * vt * 0.35 });
          Body.setAngularVelocity(frag.body, (this.rng.next() - 0.5) * 0.25);
          dev.rt.flash = 1;
          this.events.emit('device', { dev, kind: 'spring' });
        });
        return;
      }
      case 'booster': {
        const last = dev.rt.lastHit.get(frag.id) ?? -9;
        if (t - last < 0.45 || t < dev.rt.nextReady) return;
        dev.rt.lastHit.set(frag.id, t);
        dev.rt.nextReady = t + 0.08;
        this.queue.push(() => {
          if (!frag.alive) return;
          const d = { x: Math.cos(dev.angle), y: Math.sin(dev.angle) };
          const vel = Body.getVelocity(frag.body);
          const along = vel.x * d.x + vel.y * d.y;
          const power = (dev.params.power ?? 4.5) * this.mods.boosterMul;
          const add = Math.max(0, power - Math.max(0, along) * 0.35);
          Body.setVelocity(frag.body, { x: vel.x + d.x * add, y: vel.y + d.y * add });
          dev.rt.flash = 1;
          this.events.emit('device', { dev, kind: 'booster' });
        });
        return;
      }
      case 'conveyor': {
        this.queue.push(() => {
          if (!frag.alive) return;
          const d = { x: Math.cos(dev.angle), y: Math.sin(dev.angle) };
          const vel = Body.getVelocity(frag.body);
          const along = vel.x * d.x + vel.y * d.y;
          const dv = ((dev.params.speed ?? 3) * this.mods.conveyorMul - along) * 0.16;
          Body.setVelocity(frag.body, { x: vel.x + d.x * dv, y: vel.y + d.y * dv });
        });
        return;
      }
      case 'damper': {
        if (!start) return;
        this.queue.push(() => {
          if (!frag.alive) return;
          const vel = Body.getVelocity(frag.body);
          Body.setVelocity(frag.body, { x: vel.x * 0.3, y: vel.y * 0.3 });
          Body.setAngularVelocity(frag.body, frag.body.angularVelocity * 0.4);
          dev.rt.flash = 1;
          this.events.emit('device', { dev, kind: 'damper' });
        });
        return;
      }
      default:
        return;
    }
  }

  private shatter(frag: Fragment) {
    if (!frag.alive) return;
    const p = { ...frag.body.position };
    const vel = Body.getVelocity(frag.body);
    this.removeFragment(frag);
    const n = this.rng.int(2, 3);
    const shards: Fragment[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng.next();
      const sp = { x: p.x + Math.cos(a) * 3, y: p.y + Math.sin(a) * 3 };
      if (!this.spawnValid(sp, 2.5)) continue;
      shards.push(
        this.spawnFragment('shard', sp, { x: vel.x * 0.6 + Math.cos(a) * 1.2, y: vel.y * 0.6 + Math.sin(a) * 1.2 }, {
          parentId: frag.parentId || frag.id,
          generation: 1,
          manual: frag.manual,
          autoExtracted: frag.autoExtracted,
          launchedFrom: frag.launchedFrom,
          launcherTouched: frag.launcherTouched,
          fieldTouched: frag.fieldTouched,
          born: frag.born,
        }),
      );
    }
    this.events.emit('shatter', { x: p.x, y: p.y, parent: frag, shards });
    this.events.emit('lost', { frag, reason: 'shatter' });
  }

  private pulse(frag: Fragment) {
    if (!frag.alive) return;
    const p = frag.body.position;
    for (const o of this.fragments.values()) {
      if (o === frag) continue;
      const d = dist(o.body.position, p);
      if (d > UNSTABLE_PULSE_RADIUS || d < 0.01) continue;
      if (!lineOfSight(p, o.body.position, this.terrainShapes)) continue;
      const k = (1 - d / UNSTABLE_PULSE_RADIUS) * UNSTABLE_PULSE_ACCEL / Math.sqrt(o.body.mass);
      const vel = Body.getVelocity(o.body);
      Sleeping.set(o.body, false);
      Body.setVelocity(o.body, {
        x: vel.x + ((o.body.position.x - p.x) / d) * k,
        y: vel.y + ((o.body.position.y - p.y) / d) * k,
      });
    }
    this.events.emit('pulse', { x: p.x, y: p.y });
  }

  // ------------------------------------------------------------------
  // Passo de simulação
  // ------------------------------------------------------------------

  step() {
    for (const f of this.fragments.values()) {
      f.prevX = f.body.position.x;
      f.prevY = f.body.position.y;
      f.prevA = f.body.angle;
    }
    const sub = Config.substeps;
    const dtMs = Config.stepMs / sub;
    for (let s = 0; s < sub; s++) {
      if (this.moverBodies.length) {
        this.time += dtMs / 1000;
        this.updateMovers();
        this.time -= dtMs / 1000;
      }
      this.applyForces();
      Engine.update(this.engine, dtMs);
      const q = this.queue;
      this.queue = [];
      for (const fn of q) fn();
    }
    const dt = Config.stepMs / 1000;
    this.time += dt;
    this.frame++;
    this.syncPlanet();
    this.updateDevices(dt);
    this.updateAutoMine(dt);
    this.postStep(dt);
  }

  private applyForces() {
    const h = this.zone.blackHole;
    const g = this.g;
    const fieldDevs: Device[] = [];
    for (const d of this.devices.values()) {
      if (!d.enabled) continue;
      if (d.type === 'fan' || d.type === 'attractor' || d.type === 'repulsor' || d.type === 'lift') fieldDevs.push(d);
    }
    const grab = this.grab;
    for (const f of this.fragments.values()) {
      const b = f.body;
      const p = b.position;
      let ax = 0;
      let ay = 0;
      const mass = b.mass;
      const tdef = FRAGMENT_TYPES[f.type];

      // buraco negro: atração curta, com oclusão por rocha
      const dx = h.x - p.x;
      const dy = h.y - p.y;
      const d = Math.hypot(dx, dy);
      const hr = this.holeAttract();
      if (this.collapsing && d > 0.5) {
        const k = 2600;
        ax += (dx / d) * k;
        ay += (dy / d) * k;
      } else if (d < hr && d > 0.5 && lineOfSight(p, h, this.terrainShapes)) {
        const k = this.holeStrength() * (0.3 + 0.7 * (1 - d / hr));
        const nx = dx / d;
        const ny = dy / d;
        ax += (nx - ny * Config.blackHoleSwirl) * k;
        ay += (ny + nx * Config.blackHoleSwirl) * k;
      }

      for (const dev of fieldDevs) {
        const ox = p.x - dev.x;
        const oy = p.y - dev.y;
        if (dev.type === 'attractor' || dev.type === 'repulsor') {
          const R = 110 * this.mods.fieldRadiusMul;
          const dd = Math.hypot(ox, oy);
          if (dd > R || dd < 4) continue;
          if (!lineOfSight(dev, p, this.terrainShapes)) continue;
          const s = (dev.params.strength ?? 0.8) * this.mods.fieldStrengthMul;
          const k = (s * 1000 * (1 - dd / R) ** 1.2 * tdef.magnetic) / Math.max(1, mass * 0.8);
          const sign = dev.type === 'attractor' ? -1 : 1;
          ax += ((sign * ox) / dd) * k;
          ay += ((sign * oy) / dd) * k;
          if (k > 120) f.fieldTouched = true;
          continue;
        }
        const c = Math.cos(dev.angle);
        const sn = Math.sin(dev.angle);
        const lx = ox * c + oy * sn;
        const ly = -ox * sn + oy * c;
        if (dev.type === 'fan') {
          const L = 150 * this.mods.fieldRadiusMul;
          if (lx < 7 || lx > 7 + L || Math.abs(ly) > 18) continue;
          if (!lineOfSight(dev, p, this.terrainShapes)) continue;
          const s = (dev.params.strength ?? 0.8) * this.mods.fieldStrengthMul;
          const k = (s * 1250 * (1 - 0.55 * ((lx - 7) / L))) / mass;
          ax += c * k;
          ay += sn * k;
        } else if (dev.type === 'lift') {
          const Hh = LIFT_HEIGHT * this.mods.fieldRadiusMul;
          if (ly > -4 || ly < -4 - Hh || Math.abs(lx) > 15) continue;
          const base = { x: dev.x - sn * -4, y: dev.y + c * -4 };
          if (!lineOfSight(base, p, this.terrainShapes)) continue;
          const s = (dev.params.strength ?? 0.9) * Math.min(1.25, this.mods.fieldStrengthMul);
          const vel = Body.getVelocity(b);
          // velocidade ao longo do feixe (para cima = -y local)
          const up = { x: sn, y: -c };
          const vUp = vel.x * up.x + vel.y * up.y;
          const k = vUp > 2.4 ? g * 1.0 : g * (1.0 + 0.5 * s);
          ax += up.x * k;
          ay += up.y * k;
          // leve centralização lateral para não grudar nas bordas
          ax += -c * lx * 6;
          ay += -sn * lx * 6;
        }
      }

      // campos ambientais agem como força: corpos densos sentem menos
      for (const af of this.zone.fields) {
        if (p.x >= af.x && p.x <= af.x + af.w && p.y >= af.y && p.y <= af.y + af.h) {
          const k = this.fieldFactor(af) / (af.gravity ? 1 : mass);
          ax += af.ax * k;
          ay += af.ay * k;
        }
      }

      if (grab && grab.fragId === f.id) {
        const vel = Body.getVelocity(b);
        const tx = grab.target.x - p.x;
        const ty = grab.target.y - p.y;
        let vdx = tx * 0.12;
        let vdy = ty * 0.12;
        const vl = Math.hypot(vdx, vdy);
        const vmax = Config.grabMaxSpeed;
        if (vl > vmax) {
          vdx *= vmax / vl;
          vdy *= vmax / vl;
        }
        let gx = (vdx - vel.x) * 60 * Config.grabDamping;
        let gy = (vdy - vel.y) * 60 * Config.grabDamping;
        // compensação parcial da gravidade, limitada pela força máxima
        gy -= g * this.zone.gravity.y;
        gx -= g * this.zone.gravity.x;
        const cap = (Config.grabMaxAccel * g * this.mods.grabForceMul) / Math.sqrt(mass);
        const gl = Math.hypot(gx, gy);
        if (gl > cap) {
          gx *= cap / gl;
          gy *= cap / gl;
        }
        ax += gx;
        ay += gy;
      }

      if (ax !== 0 || ay !== 0) {
        if (b.isSleeping && Math.hypot(ax, ay) > 30) Sleeping.set(b, false);
        b.force.x += mass * toMs2(ax);
        b.force.y += mass * toMs2(ay);
      }
    }
  }

  private updateDevices(dt: number) {
    const t = this.time;
    for (const dev of this.devices.values()) {
      dev.rt.flash = Math.max(0, dev.rt.flash - dt * 3);
      dev.rt.phase += dt;
      switch (dev.type) {
        case 'launcher':
          this.updateLauncher(dev, dt);
          break;
        case 'gate': {
          const mode = dev.params.mode ?? 0;
          let open = false;
          if (!dev.enabled) open = false;
          else if (mode === 0) {
            const o = dev.params.open ?? 1.5;
            const c = dev.params.closed ?? 1.5;
            dev.rt.timer = (dev.rt.timer + dt) % (o + c);
            open = dev.rt.timer < o;
          } else if (mode === 1) open = dev.rt.manualOpen;
          else open = t < dev.rt.sensorUntil;
          const target = open ? 1 : 0;
          const prev = dev.rt.open;
          dev.rt.open += Math.sign(target - dev.rt.open) * Math.min(Math.abs(target - dev.rt.open), dt * 5);
          if (prev !== dev.rt.open) {
            this.applyMovingPart(dev);
            this.wakeNear(dev, 50);
            if ((prev === 0 || prev === 1) && prev !== target) this.events.emit('device', { dev, kind: 'gate' });
          }
          break;
        }
        case 'arm':
          this.updateArm(dev, dt);
          break;
        case 'sensor': {
          if (!dev.enabled) break;
          const c = Math.cos(dev.angle);
          const s = Math.sin(dev.angle);
          const half = SENSOR_SIZE / 2;
          const inside = new Set<number>();
          for (const f of this.fragments.values()) {
            const ox = f.body.position.x - dev.x;
            const oy = f.body.position.y - dev.y;
            const lx = ox * c + oy * s;
            const ly = -ox * s + oy * c;
            if (Math.abs(lx) <= half && Math.abs(ly) <= half) inside.add(f.id);
          }
          for (const id of inside) {
            if (!dev.rt.seen.has(id)) {
              dev.rt.passes++;
              dev.rt.flash = 1;
              for (const g of this.devices.values()) {
                if (g.type === 'gate' && (g.params.mode ?? 0) === 2 && dist(g, dev) < 180)
                  g.rt.sensorUntil = t + (dev.params.hold ?? 1.25);
              }
              this.events.emit('device', { dev, kind: 'sensor' });
            }
          }
          dev.rt.seen = inside;
          break;
        }
        case 'conveyor':
        case 'booster':
        case 'fan':
        case 'lift':
          if (dev.enabled && this.frame % 20 === 0) this.wakeNear(dev, DEVICES[dev.type].hitRadius + 16);
          break;
        default:
          break;
      }
    }
  }

  /** Mineração automática (árvore estelar): o asteroide solta pedras sozinho. */
  private updateAutoMine(dt: number) {
    const iv = this.mods.autoMineInterval;
    if (!Number.isFinite(iv) || iv <= 0 || this.collapsing) return;
    this.autoMineTimer += dt;
    if (this.autoMineTimer >= iv) {
      this.autoMineTimer = 0;
      this.extract(this.mineAim, true);
      // drones extras disparam em ângulos vizinhos
      const a = this.zone.asteroid;
      const base = this.mineAim ? Math.atan2(this.mineAim.y - a.y, this.mineAim.x - a.x) : -Math.PI / 2;
      for (let k = 1; k <= this.mods.extraDrones; k++) {
        const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
        this.extract({ x: a.x + Math.cos(ang) * 100, y: a.y + Math.sin(ang) * 100 }, true);
      }
    }
  }

  autoMineProgress() {
    const iv = this.mods.autoMineInterval;
    return Number.isFinite(iv) ? Math.min(1, this.autoMineTimer / iv) : 0;
  }

  private updateLauncher(dev: Device, dt: number) {
    if (!dev.enabled) return;
    const c = Math.cos(dev.angle);
    const s = Math.sin(dev.angle);
    let best: Fragment | null = null;
    let bestSpeed = Infinity;
    for (const f of this.fragments.values()) {
      const ox = f.body.position.x - dev.x;
      const oy = f.body.position.y - dev.y;
      if (Math.abs(ox) > 24 || Math.abs(oy) > 24) continue;
      const lx = ox * c + oy * s;
      const ly = -ox * s + oy * c;
      if (lx < LAUNCHER_CUP.x0 || lx > LAUNCHER_CUP.x1 || ly < LAUNCHER_CUP.y0 || ly > LAUNCHER_CUP.y1) continue;
      const sp = Body.getSpeed(f.body);
      if (sp < bestSpeed) {
        bestSpeed = sp;
        best = f;
      }
    }
    if (!best || bestSpeed > 2.2) {
      dev.rt.holdTime = 0;
      dev.rt.holdId = 0;
      return;
    }
    if (dev.rt.holdId !== best.id) {
      dev.rt.holdId = best.id;
      dev.rt.holdTime = 0;
    }
    dev.rt.holdTime += dt;
    if (dev.rt.holdTime < 0.1 || this.time < dev.rt.nextReady) return;
    // erro de mira determinístico, pequeno
    const err = (this.rng.next() - 0.5) * 0.045 * this.mods.launcherErrMul;
    const a = dev.angle - Math.PI / 2 + err;
    const power = (dev.params.power ?? 10) * this.rng.range(0.985, 1.015);
    Sleeping.set(best.body, false);
    Body.setPosition(best.body, {
      x: best.body.position.x + Math.cos(dev.angle - Math.PI / 2) * 1.5,
      y: best.body.position.y + Math.sin(dev.angle - Math.PI / 2) * 1.5,
    });
    Body.setVelocity(best.body, { x: Math.cos(a) * power, y: Math.sin(a) * power });
    Body.setAngularVelocity(best.body, (this.rng.next() - 0.5) * 0.3);
    best.launchedFrom = { x: dev.x, y: dev.y };
    best.launcherTouched = true;
    dev.rt.nextReady = this.time + 0.85 * this.mods.launcherCadenceMul;
    dev.rt.holdTime = 0;
    dev.rt.holdId = 0;
    dev.rt.flash = 1;
    this.events.emit('device', { dev, kind: 'launch' });
  }

  private updateArm(dev: Device, dt: number) {
    const rt = dev.rt;
    const period = dev.params.period ?? 1.6;
    const maxSwing = ((dev.params.swing ?? 60) * Math.PI) / 180;
    const prev = rt.swing;
    if (dev.enabled) rt.timer += dt;
    const up = 0.16;
    const hold = 0.12;
    const down = 0.5;
    let target = 0;
    const tt = rt.timer;
    if (tt >= period) {
      const k = tt - period;
      if (k < up) target = -maxSwing * (k / up);
      else if (k < up + hold) target = -maxSwing;
      else if (k < up + hold + down) target = -maxSwing * (1 - (k - up - hold) / down);
      else {
        target = 0;
        rt.timer = 0;
      }
      if (k < dt) this.events.emit('device', { dev, kind: 'arm' });
    }
    rt.swing = target;
    rt.swingVel = (rt.swing - prev) / dt;
    if (rt.swing !== prev) {
      this.applyMovingPart(dev);
      // transfere impulso ao que encosta no braço enquanto ele sobe
      if (rt.swingVel < -0.5) {
        const a = dev.angle + rt.swing;
        const tip = { x: dev.x + Math.cos(a) * ARM_LENGTH, y: dev.y + Math.sin(a) * ARM_LENGTH };
        const n = { x: Math.sin(a), y: -Math.cos(a) }; // normal do lado que sobe
        for (const f of this.fragments.values()) {
          const p = f.body.position;
          if (Math.abs(p.x - dev.x) > ARM_LENGTH + 12 || Math.abs(p.y - dev.y) > ARM_LENGTH + 12) continue;
          if (distPointSeg(p, dev, tip) > f.radius + 5) continue;
          const side = (p.x - dev.x) * n.x + (p.y - dev.y) * n.y;
          if (side < -2) continue;
          const r = Math.hypot(p.x - dev.x, p.y - dev.y);
          const sp = Math.min(9, (Math.abs(rt.swingVel) * r) / 60);
          const vel = Body.getVelocity(f.body);
          const vn = vel.x * n.x + vel.y * n.y;
          if (vn < sp) {
            Sleeping.set(f.body, false);
            Body.setVelocity(f.body, { x: vel.x + n.x * (sp - vn), y: vel.y + n.y * (sp - vn) });
          }
        }
      }
    }
  }

  private postStep(dt: number) {
    const h = this.zone.blackHole;
    const W = this.zone.width;
    const H = this.zone.height;
    const m = Config.outOfBoundsMargin;
    const maxS = Config.maxFragmentSpeed;
    const toAbsorb: Fragment[] = [];
    const toLose: [Fragment, 'bounds' | 'rest'][] = [];
    for (const f of this.fragments.values()) {
      const b = f.body;
      const sp = Body.getSpeed(b);
      if (sp > maxS) {
        const vel = Body.getVelocity(b);
        Body.setVelocity(b, { x: (vel.x * maxS) / sp, y: (vel.y * maxS) / sp });
      }
      const p = b.position;
      const d = Math.hypot(p.x - h.x, p.y - h.y);
      const ar = this.holeAbsorb();
      if (d < ar) {
        if (this.collapsing || lineOfSight(p, h, this.terrainShapes)) {
          toAbsorb.push(f);
          continue;
        }
      } else if (d < ar * 2.4) {
        // amortece a órbita perto do centro
        const vel = Body.getVelocity(b);
        Body.setVelocity(b, { x: vel.x * 0.985, y: vel.y * 0.985 });
      }
      if (p.x < -m || p.x > W + m || p.y > H + m || p.y < -m * 4) {
        toLose.push([f, 'bounds']);
        continue;
      }
      const grabbed = this.grab?.fragId === f.id;
      if (!grabbed && (sp < Config.restSpeed || b.isSleeping)) {
        f.restTime += dt;
        if (f.restTime > Config.restRecycleSeconds) toLose.push([f, 'rest']);
      } else f.restTime = 0;
      for (const r of this.zone.regions) {
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) f.regions.add(r.id);
      }
    }
    for (const f of toAbsorb) this.absorb(f);
    for (const [f, reason] of toLose) {
      this.removeFragment(f);
      this.events.emit('lost', { frag: f, reason });
    }
    if (this.grab) {
      const f = this.fragments.get(this.grab.fragId);
      if (!f) this.grab = null;
      else if (dist(f.body.position, this.grab.target) > this.grabReach()) {
        this.events.emit('grabBreak', { x: f.body.position.x, y: f.body.position.y });
        this.grab = null;
      }
    }
  }

  private absorb(f: Fragment) {
    const def = FRAGMENT_TYPES[f.type];
    const p = { ...f.body.position };
    this.removeFragment(f);
    const launchDistance = f.launchedFrom ? Math.abs(p.x - f.launchedFrom.x) : 0;
    this.events.emit('absorb', {
      frag: f,
      value: def.value * this.mods.fragmentValueMul * (this.mods.typeValueMul[f.type] ?? 1),
      mass: def.mass,
      auto: !f.manual,
      launchDistance,
      fieldCurve: f.fieldTouched && !f.launcherTouched && !f.manual,
    });
  }

  /** Maior aglomerado de fragmentos parados (gargalo). */
  largestStalledCluster(radius = 15): number {
    const slow: Vec[] = [];
    for (const f of this.fragments.values()) if (f.body.isSleeping || Body.getSpeed(f.body) < 0.5) slow.push(f.body.position);
    const n = slow.length;
    if (n === 0) return 0;
    const seen = new Uint8Array(n);
    let best = 0;
    const r2 = radius * radius;
    for (let i = 0; i < n; i++) {
      if (seen[i]) continue;
      let size = 0;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const k = stack.pop()!;
        size++;
        for (let j = 0; j < n; j++) {
          if (seen[j]) continue;
          const dx = slow[j].x - slow[k].x;
          const dy = slow[j].y - slow[k].y;
          if (dx * dx + dy * dy <= r2) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      best = Math.max(best, size);
    }
    return best;
  }

  fragmentAt(p: Vec, extra = 4): Fragment | null {
    let best: Fragment | null = null;
    let bd = Infinity;
    for (const f of this.fragments.values()) {
      const d = dist(f.body.position, p);
      if (d < f.radius + extra && d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  deviceAt(p: Vec, extra = 3): Device | null {
    let best: Device | null = null;
    let bd = Infinity;
    for (const d of this.devices.values()) {
      const polys = d.worldSolids.length ? d.worldSolids : footprint(d.type, d.params).map((q) => transformPoly(q, d, d.angle));
      for (const poly of polys) {
        const dd = pointInPoly(p, poly) ? 0 : distPointPoly(p, poly);
        if (dd < extra && dd < bd) {
          bd = dd;
          best = d;
        }
      }
    }
    return best;
  }

  isOnAsteroid(p: Vec): boolean {
    const a = this.zone.asteroid;
    return Math.hypot(p.x - a.x, p.y - a.y) <= this.planetR() + 2;
  }

  destroy() {
    (this.engine as unknown as { events: Record<string, unknown> }).events = {};
    Composite.clear(this.engine.world, false, true);
    Engine.clear(this.engine);
    this.events.clear();
    this.fragments.clear();
    this.devices.clear();
  }
}
