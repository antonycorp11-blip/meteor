import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { defaultParams } from '../src/machines/catalog';
import { Sim } from '../src/sim/Sim';
import { loadZone } from '../src/world/ZoneLoader';
import { testZone } from './helpers';

const step = (sim: Sim, n: number) => {
  for (let i = 0; i < n; i++) sim.step();
};

describe('asteroide-fonte', () => {
  it('clicar cria fragmento físico independente e o asteroide permanece', () => {
    const sim = new Sim(loadZone(1));
    const a = sim.zone.asteroid;
    const got = sim.extract({ x: a.x + 50, y: a.y - 20 });
    expect(got).toHaveLength(1);
    const f = got[0];
    expect(f.body.isStatic).toBe(false);
    expect(Matter.Composite.allBodies(sim.engine.world)).toContain(f.body);
    expect(Matter.Composite.allBodies(sim.engine.world)).toContain(sim.asteroidBody);
    // o fragmento nasce fora do asteroide, com impulso para longe dele
    expect(Math.hypot(f.body.position.x - a.x, f.body.position.y - a.y)).toBeGreaterThan(a.r);
    step(sim, 30);
    expect(f.body.position.x).not.toBeCloseTo(a.x + a.r, 0);
  });

  it('respeita intervalo entre extrações manuais', () => {
    const sim = new Sim(loadZone(1));
    const a = sim.zone.asteroid;
    expect(sim.extract({ x: a.x, y: a.y - 60 })).toHaveLength(1);
    expect(sim.extract({ x: a.x, y: a.y - 60 })).toHaveLength(0);
    step(sim, 30);
    expect(sim.extract({ x: a.x, y: a.y - 60 })).toHaveLength(1);
  });

  it('não acumula corpos sem limite', () => {
    const sim = new Sim(loadZone(1), { maxFragments: 20 });
    let fails = 0;
    sim.events.on('extractFail', () => fails++);
    for (let i = 0; i < 60; i++) {
      sim.extract(null, true);
      sim.step();
    }
    expect(sim.fragments.size).toBeLessThanOrEqual(20);
    expect(fails).toBeGreaterThan(0);
  });
});

describe('colisões e terreno', () => {
  it('fragmento rápido não atravessa o terreno', () => {
    const sim = new Sim(testZone());
    const f = sim.spawnFragment('dense', { x: 400, y: 100 }, { x: 0, y: 13 });
    step(sim, 240);
    expect(f.alive).toBe(true);
    expect(f.body.position.y).toBeLessThan(500);
    expect(f.body.position.y).toBeGreaterThan(470);
  });

  it('fragmentos giram e quicam (corpos rígidos livres)', () => {
    const sim = new Sim(testZone());
    const f = sim.spawnFragment('porous', { x: 400, y: 300 }, { x: 2, y: 0 });
    let maxSpin = 0;
    let bounced = false;
    let prevVy = 0;
    for (let i = 0; i < 200; i++) {
      sim.step();
      const v = Matter.Body.getVelocity(f.body);
      if (prevVy > 1 && v.y < 0) bounced = true;
      prevVy = v.y;
      maxSpin = Math.max(maxSpin, Math.abs(f.body.angularVelocity));
    }
    expect(bounced).toBe(true);
    expect(maxSpin).toBeGreaterThan(0.005);
  });

  it('fragmento parado não treme indefinidamente', () => {
    const sim = new Sim(testZone());
    const f = sim.spawnFragment('common', { x: 400, y: 480 }, { x: 0, y: 0 });
    step(sim, 400);
    expect(Matter.Body.getSpeed(f.body)).toBeLessThan(0.1);
    expect(Math.abs(f.body.angularVelocity)).toBeLessThan(0.01);
  });

  it('fragmentos fora dos limites são removidos sem pagar', () => {
    const sim = new Sim(testZone({ terrain: [] }));
    let lost = 0;
    let paid = 0;
    sim.events.on('lost', (e) => e.reason === 'bounds' && lost++);
    sim.events.on('absorb', () => paid++);
    sim.spawnFragment('common', { x: 300, y: 300 }, { x: 0, y: 5 });
    step(sim, 300);
    expect(lost).toBe(1);
    expect(paid).toBe(0);
    expect(sim.fragments.size).toBe(0);
  });

  it('terreno natural é imutável (nenhuma API o modifica)', () => {
    const z = loadZone(3);
    const before = JSON.stringify(z.terrain);
    const sim = new Sim(z);
    for (let i = 0; i < 50; i++) {
      sim.extract(null, true);
      sim.step();
    }
    sim.addDevice({ type: 'plank', x: 600, y: 300, angle: 0, params: {}, enabled: true, paid: 0 });
    expect(JSON.stringify(z.terrain)).toBe(before);
    expect(sim.terrain.length).toBe(z.terrain.length);
  });
});

describe('feixe manual', () => {
  it('aplica força limitada e não atravessa parede', () => {
    // parede vertical entre o fragmento e o alvo
    const sim = new Sim(testZone({ terrain: [[[0, 500], [800, 500], [800, 600], [0, 600]], [[380, 0], [420, 0], [420, 500], [380, 500]]] }));
    const f = sim.spawnFragment('common', { x: 330, y: 470 }, { x: 0, y: 0 });
    step(sim, 30);
    sim.startGrab(f.id, { x: 470, y: 470 });
    for (let i = 0; i < 240; i++) {
      sim.updateGrab({ x: 460, y: 470 });
      sim.step();
    }
    expect(f.body.position.x).toBeLessThan(380);
    expect(f.manual).toBe(true);
  });

  it('é uma mola com velocidade limitada (não teleporta)', () => {
    const sim = new Sim(testZone());
    const f = sim.spawnFragment('common', { x: 300, y: 480 }, { x: 0, y: 0 });
    step(sim, 60);
    const x0 = f.body.position.x;
    const y0 = f.body.position.y;
    sim.startGrab(f.id, { x: 400, y: 440 });
    sim.step();
    const moved = Math.hypot(f.body.position.x - x0, f.body.position.y - y0);
    expect(moved).toBeLessThan(10);
  });

  it('solta quando o ponteiro passa do alcance', () => {
    const sim = new Sim(testZone());
    const f = sim.spawnFragment('common', { x: 300, y: 480 }, { x: 0, y: 0 });
    sim.startGrab(f.id, { x: 300, y: 470 });
    let broke = false;
    sim.events.on('grabBreak', () => (broke = true));
    sim.updateGrab({ x: 300 + sim.grabReach() + 80, y: 470 });
    sim.step();
    expect(broke).toBe(true);
    expect(sim.grab).toBeNull();
  });
});

describe('buraco negro', () => {
  it('atrai perto do destino e absorve com entrega única', () => {
    const sim = new Sim(testZone({ gravity: { x: 0, y: 0 } }));
    let absorbed = 0;
    sim.events.on('absorb', () => absorbed++);
    sim.spawnFragment('common', { x: 650, y: 400 }, { x: 0, y: 0 });
    step(sim, 240);
    expect(absorbed).toBe(1);
  });

  it('não atrai fora do raio configurado', () => {
    const sim = new Sim(testZone({ gravity: { x: 0, y: 0 } }));
    const f = sim.spawnFragment('common', { x: 500, y: 400 }, { x: 0, y: 0 });
    step(sim, 120);
    expect(f.body.position.x).toBeCloseTo(500, 0);
  });

  it('respeita oclusão por rocha', () => {
    const wall = [[640, 300], [660, 300], [660, 480], [640, 480]] as [number, number][];
    const sim = new Sim(testZone({ gravity: { x: 0, y: 0 }, terrain: [[[0, 500], [800, 500], [800, 600], [0, 600]], wall] }));
    const f = sim.spawnFragment('common', { x: 625, y: 400 }, { x: 0, y: 0 });
    step(sim, 180);
    expect(f.alive).toBe(true);
    expect(f.body.position.x).toBeCloseTo(625, 0);
  });
});

describe('peças', () => {
  it('não podem ser colocadas dentro da rocha nem tapar o buraco negro', () => {
    const sim = new Sim(loadZone(1));
    expect(sim.validatePlacement('plank', 470, 200, 0, {}).ok).toBe(false);
    const h = sim.zone.blackHole;
    expect(sim.validatePlacement('plank', h.x, h.y, 0, {}).ok).toBe(false);
    expect(sim.validatePlacement('plank', 470, 420, 0.2, {}).ok).toBe(true);
  });

  it('rampas não capturam: o fragmento desliza e cai da ponta', () => {
    const sim = new Sim(testZone());
    sim.addDevice({ type: 'plank', x: 300, y: 300, angle: 0.35, params: {}, enabled: true, paid: 0 });
    const f = sim.spawnFragment('common', { x: 280, y: 280 }, { x: 0, y: 0 });
    step(sim, 240);
    expect(f.body.position.y).toBeGreaterThan(450);
  });

  it('esteira empurra sem prender (fragmento sai pela ponta)', () => {
    const sim = new Sim(testZone());
    sim.addDevice({ type: 'conveyor', x: 300, y: 300, angle: 0, params: { speed: 4 }, enabled: true, paid: 0 });
    const f = sim.spawnFragment('common', { x: 290, y: 288 }, { x: 0, y: 0 });
    step(sim, 300);
    expect(f.body.position.x).toBeGreaterThan(345);
    expect(f.body.position.y).toBeGreaterThan(450);
  });

  it('comprar, mover, girar e vender não quebra a física', () => {
    const sim = new Sim(loadZone(1));
    for (let i = 0; i < 20; i++) {
      sim.extract(null, true);
      step(sim, 10);
    }
    const d = sim.addDevice({ type: 'spring', x: 470, y: 440, angle: 0, params: defaultParams('spring'), enabled: true, paid: 30 });
    step(sim, 30);
    sim.moveDevice(d, 480, 450, 0.5);
    step(sim, 30);
    d.enabled = false;
    step(sim, 30);
    sim.removeDevice(d);
    step(sim, 30);
    for (const f of sim.fragments.values()) {
      expect(Number.isFinite(f.body.position.x)).toBe(true);
      expect(Number.isFinite(f.body.position.y)).toBe(true);
    }
  });

  it('mola arremessa na direção da seta só quem encosta por cima', () => {
    const sim = new Sim(testZone());
    sim.addDevice({ type: 'spring', x: 300, y: 400, angle: 0.5, params: { power: 9 }, enabled: true, paid: 0 });
    const f = sim.spawnFragment('common', { x: 300, y: 380 }, { x: 0, y: 1 });
    let minY = 999;
    for (let i = 0; i < 40; i++) {
      sim.step();
      minY = Math.min(minY, f.body.position.y);
    }
    expect(minY).toBeLessThan(350);
    expect(f.body.position.x).toBeGreaterThan(310);
  });

  it('funil concentra a queda num único ponto', () => {
    const sim = new Sim(testZone());
    sim.addDevice({ type: 'funnel', x: 400, y: 300, angle: 0, params: {}, enabled: true, paid: 0 });
    const xs: number[] = [];
    const fs = [-30, -15, 15, 30].map((dx) => sim.spawnFragment('common', { x: 400 + dx, y: 250 }, { x: 0, y: 0 }));
    for (let i = 0; i < 90; i++) {
      sim.step();
      for (const f of fs) if (f.body.position.y > 312 && f.body.position.y < 330) xs.push(f.body.position.x);
    }
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) expect(Math.abs(x - 400)).toBeLessThan(14);
  });

  it('mineração automática solta pedras sozinha', () => {
    const sim = new Sim(testZone());
    sim.mods = { ...sim.mods, autoMineInterval: 1 };
    let auto = 0;
    sim.events.on('extract', (e) => e.auto && auto++);
    for (let i = 0; i < 60 * 3.5; i++) sim.step();
    expect(auto).toBe(3);
  });

  it('o buraco negro cresce e alcança mais longe', () => {
    const sim = new Sim(testZone());
    const r0 = sim.holeAttract();
    const a0 = sim.holeAbsorb();
    sim.holeGrowth = 1;
    expect(sim.holeAttract()).toBeGreaterThan(r0);
    expect(sim.holeAbsorb()).toBeGreaterThan(a0);
  });

  it('campos não atravessam paredes', () => {
    const wall = [[380, 300], [400, 300], [400, 480], [380, 480]] as [number, number][];
    const sim = new Sim(testZone({ gravity: { x: 0, y: 0 }, terrain: [[[0, 500], [800, 500], [800, 600], [0, 600]], wall] }));
    sim.addDevice({ type: 'attractor', x: 440, y: 400, angle: 0, params: { strength: 1 }, enabled: true, paid: 0 });
    const f = sim.spawnFragment('metallic', { x: 360, y: 400 }, { x: 0, y: 0 });
    step(sim, 120);
    expect(f.body.position.x).toBeCloseTo(360, 0);
  });

  it('metálicos sentem mais os campos; densos sentem menos o vento', () => {
    const zone = testZone({ gravity: { x: 0, y: 0 }, fields: [{ id: 'v', label: 'v', x: 0, y: 0, w: 800, h: 480, ax: -300, ay: 0 }] });
    const sim = new Sim(zone);
    const c = sim.spawnFragment('common', { x: 400, y: 100 }, { x: 0, y: 0 });
    const d = sim.spawnFragment('dense', { x: 400, y: 200 }, { x: 0, y: 0 });
    step(sim, 30);
    expect(400 - c.body.position.x).toBeGreaterThan((400 - d.body.position.x) * 1.8);

    const sim2 = new Sim(testZone({ gravity: { x: 0, y: 0 } }));
    sim2.addDevice({ type: 'attractor', x: 400, y: 300, angle: 0, params: { strength: 1 }, enabled: true, paid: 0 });
    const m = sim2.spawnFragment('metallic', { x: 330, y: 300 }, { x: 0, y: 0 });
    const k = sim2.spawnFragment('common', { x: 470, y: 300 }, { x: 0, y: 0 });
    step(sim2, 10);
    expect(m.body.position.x - 330).toBeGreaterThan(470 - k.body.position.x);
  });

  it('vítreo se parte em lascas num impacto forte', () => {
    const sim = new Sim(testZone());
    let shards = 0;
    sim.events.on('shatter', (e) => (shards = e.shards.length));
    sim.spawnFragment('glass', { x: 400, y: 380 }, { x: 0, y: 12 });
    step(sim, 60);
    expect(shards).toBeGreaterThanOrEqual(2);
    expect(shards).toBeLessThanOrEqual(3);
    // lascas não se partem de novo
    for (const f of sim.fragments.values()) expect(f.generation).toBe(1);
  });
});
