import { describe, expect, it } from 'vitest';
import { DEVICES } from '../src/machines/catalog';
import { Sim } from '../src/sim/Sim';
import { ZONES, validateAllZones } from '../src/world/ZoneLoader';
import { runSolution } from './helpers';

describe('engenharia de níveis', () => {
  it('existem cinco zonas implementadas', () => {
    expect(ZONES.map((z) => z.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('terrenos convexos e nenhuma linha reta livre entre fonte e buraco negro', () => {
    expect(validateAllZones()).toEqual([]);
  });

  it('cada zona tem objetivo básico, de engenharia e dois extras', () => {
    for (const z of ZONES) {
      expect(z.goals.filter((g) => g.tier === 'basic')).toHaveLength(1);
      expect(z.goals.filter((g) => g.tier === 'engineering')).toHaveLength(1);
      expect(z.goals.filter((g) => g.tier === 'extra').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('cada zona documenta pelo menos duas estratégias automatizadas', () => {
    for (const z of ZONES) expect(z.solutions.filter((s) => !s.manual).length).toBeGreaterThanOrEqual(2);
  });

  it('soluções usam apenas peças disponíveis até a zona', () => {
    for (const z of ZONES)
      for (const s of z.solutions) for (const d of s.devices) expect(DEVICES[d.type].unlockZone).toBeLessThanOrEqual(z.id);
  });

  it('a zona 1 é resolvível só com peças básicas', () => {
    const basics = new Set(['plank', 'ramp', 'deflector', 'bumper']);
    for (const s of ZONES[0].solutions) for (const d of s.devices) expect(basics.has(d.type)).toBe(true);
  });

  for (const z of ZONES) {
    it(`zona ${z.id}: sem peças, nada chega ao buraco negro`, () => {
      const sim = new Sim(z, { seed: 3 });
      let delivered = 0;
      sim.events.on('absorb', () => delivered++);
      const aim = z.solutions[0]?.aim ?? { x: z.asteroid.x + 100, y: z.asteroid.y - 30 };
      for (let i = 0; i < 40 * 60; i++) {
        if (i % 45 === 0) sim.extract(aim);
        sim.step();
      }
      expect(delivered).toBe(0);
    });

    for (const sol of z.solutions.filter((s) => !s.manual)) {
      it(`zona ${z.id}: estratégia ${sol.id} entrega (${sol.label})`, () => {
        const r = runSolution(z, sol, 70, 11);
        expect(r.delivered).toBeGreaterThan(0);
        expect(r.rate).toBeGreaterThanOrEqual(sol.expectRate ?? 0.05);
      }, 30000);
    }
  }

  it('zona 2 exige deslocamento balístico/desnível: placas sozinhas não bastam', () => {
    const z = ZONES[1];
    const sol = { id: 'x', label: '', devices: z.solutions[1].devices.filter((d) => d.type === 'plank'), aim: z.solutions[1].aim };
    expect(runSolution(z, sol, 50, 5).delivered).toBe(0);
  });
});
