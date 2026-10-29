// Busca aleatória + refinamento local de posições de peças para uma zona.
// Uso: npx vite-node tools/optimize.ts -- <zona> <template> [tentativas]
import { Sim } from '../src/sim/Sim';
import { loadZone } from '../src/world/ZoneLoader';
import { defaultParams } from '../src/machines/catalog';
import { TEMPLATES, type Tpl } from './templates';
import type { DeviceType } from '../src/machines/types';

const args = process.argv.slice(2).filter((a) => a !== '--');
const zone = loadZone(Number(args[0]));
const tpl: Tpl = TEMPLATES[args[1]];
const trials = Number(args[2] ?? 150);
const seconds = Number(args[3] ?? 50);

type Pick = { type: DeviceType; x: number; y: number; angle: number; params: Record<string, number> };
const r = (a: [number, number] | number) => (typeof a === 'number' ? a : a[0] + Math.random() * (a[1] - a[0]));

function sample(): Pick[] {
  return tpl.devices.map((d) => ({
    type: d.type,
    x: r(d.x),
    y: r(d.y),
    angle: r(d.angle),
    params: { ...defaultParams(d.type), ...Object.fromEntries(Object.entries(d.params ?? {}).map(([k, v]) => [k, r(v)])) },
  }));
}

function perturb(p: Pick[], s: number): Pick[] {
  return p.map((d, i) => {
    const t = tpl.devices[i];
    const clampR = (v: number, a: [number, number] | number) => (typeof a === 'number' ? a : Math.max(a[0], Math.min(a[1], v)));
    return {
      ...d,
      x: clampR(d.x + (Math.random() - 0.5) * 30 * s, t.x),
      y: clampR(d.y + (Math.random() - 0.5) * 30 * s, t.y),
      angle: clampR(d.angle + (Math.random() - 0.5) * 0.5 * s, t.angle),
      params: Object.fromEntries(
        Object.entries(d.params).map(([k, v]) => {
          const rg = t.params?.[k];
          if (!rg || typeof rg === 'number') return [k, v];
          return [k, clampR(v + (Math.random() - 0.5) * (rg[1] - rg[0]) * 0.3 * s, rg)];
        }),
      ),
    };
  });
}

export function evaluate(p: Pick[], secs = seconds, seed = 99): number {
  const sim = new Sim(zone, { seed });
  for (const d of p) {
    if (!sim.validatePlacement(d.type, d.x, d.y, d.angle, d.params).ok) return -1;
    sim.addDevice({ ...d, enabled: true, paid: 0 });
  }
  let del = 0;
  sim.events.on('absorb', () => del++);
  let ext = 0;
  const aim = tpl.aim ?? { x: zone.asteroid.x + 100, y: zone.asteroid.y - 30 };
  const steps = secs * 60;
  for (let i = 0; i < steps; i++) {
    if (i % (tpl.pace ?? 45) === 0 && i < steps - 900) ext += sim.extract(aim).length;
    sim.step();
  }
  sim.destroy();
  return del / Math.max(1, ext);
}

let best: Pick[] | null = null;
let bestScore = -1;
for (let i = 0; i < trials; i++) {
  const cand = best && i > trials * 0.4 ? perturb(best, 1 - i / trials + 0.15) : sample();
  const s = evaluate(cand);
  if (s > bestScore) {
    bestScore = s;
    best = cand;
    console.error(`#${i} ${s.toFixed(2)}`);
  }
}
if (best) {
  const confirm = [11, 22, 33].map((seed) => evaluate(best!, 60, seed));
  console.log(JSON.stringify({ score: bestScore, confirm: confirm.map((c) => +c.toFixed(2)), devices: best.map((d) => ({ type: d.type, x: +d.x.toFixed(1), y: +d.y.toFixed(1), angle: +d.angle.toFixed(3), params: Object.keys(d.params).length ? Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, +v.toFixed(2)])) : undefined })) }));
}
