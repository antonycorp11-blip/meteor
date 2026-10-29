import { describe, expect, it } from 'vitest';
import { DEVICES } from '../src/machines/catalog';
import { TREE } from '../src/progression/SkillTree';
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

  it('cada zona tem meta de crescimento crescente e desafios com recompensa', () => {
    let prev = 0;
    for (const z of ZONES) {
      expect(z.growthTarget).toBeGreaterThan(prev);
      prev = z.growthTarget;
      expect(z.goals.length).toBeGreaterThanOrEqual(3);
      for (const g of z.goals) expect(g.reward).toBeGreaterThan(0);
    }
  });

  it('cada zona documenta pelo menos duas estratégias automatizadas', () => {
    for (const z of ZONES) expect(z.solutions.filter((s) => !s.manual).length).toBeGreaterThanOrEqual(2);
  });

  it('soluções usam peças que a árvore libera até aquela zona', () => {
    for (const z of ZONES)
      for (const s of z.solutions)
        for (const d of s.devices) {
          const node = TREE.find((n) => n.unlock === d.type);
          expect(node, d.type).toBeTruthy();
          expect(node!.requiresZone ?? 1).toBeLessThanOrEqual(z.id);
        }
  });

  it('a zona 1 é resolvível só com peças baratas do início', () => {
    const basics = new Set(['plank', 'ramp', 'funnel', 'spring']);
    for (const s of ZONES[0].solutions) for (const d of s.devices) expect(basics.has(d.type)).toBe(true);
    expect(DEVICES.plank.cost + DEVICES.funnel.cost + DEVICES.spring.cost).toBeLessThan(80);
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
