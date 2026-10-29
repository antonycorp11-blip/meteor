import { defaultParams } from '../src/machines/catalog';
import { Sim } from '../src/sim/Sim';
import type { ZoneData, ZoneSolution } from '../src/world/types';

/** Zona mínima para testes de física isolados. */
export function testZone(over: Partial<ZoneData> = {}): ZoneData {
  return {
    id: 99,
    key: 'teste',
    name: 'Teste',
    subtitle: '',
    theme: 'ash',
    intro: '',
    width: 800,
    height: 600,
    gravity: { x: 0, y: 1 },
    terrain: [[[0, 500], [800, 500], [800, 600], [0, 600]]],
    asteroid: { x: 100, y: 200, r: 30 },
    blackHole: { x: 700, y: 400, attractRadius: 90, absorbRadius: 15, strength: 1000 },
    noBuild: [],
    fields: [],
    regions: [],
    tools: [],
    startCredits: 0,
    priceMult: 1,
    fragmentTable: [{ type: 'common', weight: 1 }],
    efficiencyWindow: 10,
    goals: [],
    hints: [],
    solutions: [],
    ...over,
  };
}

export function runSolution(zone: ZoneData, sol: ZoneSolution, seconds: number, seed: number) {
  const sim = new Sim(zone, { seed });
  for (const d of sol.devices) {
    const params = { ...defaultParams(d.type), ...(d.params ?? {}) };
    const v = sim.validatePlacement(d.type, d.x, d.y, d.angle, params);
    if (!v.ok) throw new Error(`peça inválida ${d.type} @${d.x},${d.y}: ${v.reason}`);
    sim.addDevice({ type: d.type, x: d.x, y: d.y, angle: d.angle, params, enabled: true, paid: 0 });
  }
  let delivered = 0;
  let extracted = 0;
  sim.events.on('absorb', () => delivered++);
  const aim = sol.aim ?? { x: zone.asteroid.x + 100, y: zone.asteroid.y - 30 };
  const pace = sol.pace ?? 45;
  const steps = seconds * 60;
  for (let i = 0; i < steps; i++) {
    if (i % pace === 0 && i < steps - 900) extracted += sim.extract(aim).length;
    sim.step();
  }
  sim.destroy();
  return { delivered, extracted, rate: delivered / Math.max(1, extracted) };
}
