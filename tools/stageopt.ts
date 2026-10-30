// Otimiza peças de UM estágio: pedras soltas num ponto devem chegar à região alvo.
// Uso: STAGE='{"zone":5,"drop":[650,450],"target":"920,1250"|"hole","devices":[{tipo, x:[a,b], y:[a,b], angle:[a,b], params:{power:[a,b]}}]}' npx vite-node tools/stageopt.ts -- [tentativas]
import { Sim } from '../src/sim/Sim';
import { loadZone } from '../src/world/ZoneLoader';
import { defaultParams } from '../src/machines/catalog';
import type { DeviceType } from '../src/machines/types';
import type { FragmentTypeId } from '../src/physics/fragmentTypes';
type R = [number, number] | number;
const cfg = JSON.parse(process.env.STAGE!) as { aim?: { x: number; y: number }; zone: number; drop: [number, number]; target: string; types?: FragmentTypeId[]; devices: { type: DeviceType; x: R; y: R; angle: R; params?: Record<string, R> }[] };
const trials = Number(process.argv.slice(2).filter((x) => x !== '--')[0] ?? 200);
const zone = loadZone(cfg.zone);
const rr = (v: R) => (typeof v === 'number' ? v : v[0] + Math.random() * (v[1] - v[0]));
const cl = (v: number, r: R) => (typeof r === 'number' ? r : Math.max(r[0], Math.min(r[1], v)));
type P = { type: DeviceType; x: number; y: number; angle: number; params: Record<string, number> };
const sample = (): P[] => cfg.devices.map((d) => ({ type: d.type, x: rr(d.x), y: rr(d.y), angle: rr(d.angle), params: { ...defaultParams(d.type), ...Object.fromEntries(Object.entries(d.params ?? {}).map(([k, v]) => [k, rr(v)])) } }));
const perturb = (p: P[], s: number): P[] =>
  p.map((d, i) => {
    const t = cfg.devices[i];
    return { ...d, x: cl(d.x + (Math.random() - 0.5) * 24 * s, t.x), y: cl(d.y + (Math.random() - 0.5) * 24 * s, t.y), angle: cl(d.angle + (Math.random() - 0.5) * 0.3 * s, t.angle), params: Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, t.params?.[k] !== undefined ? cl(v + (Math.random() - 0.5) * 3 * s, t.params[k]) : v])) };
  });
function evaluate(p: P[], seed = 3): number {
  const sim = new Sim(zone, { seed });
  for (const d of p) {
    if (!sim.validatePlacement(d.type, d.x, d.y, d.angle, d.params).ok) return -1;
    sim.addDevice({ ...d, enabled: true, paid: 0 });
  }
  let del = 0;
  sim.events.on('absorb', () => del++);
  const types = cfg.types ?? ['common', 'dense', 'porous', 'metallic'];
  const n = 12;
  for (let i = 0; i < n; i++) {
    if (cfg.aim) {
      sim.extract(cfg.aim);
      for (let k = 0; k < 70; k++) sim.step();
      continue;
    }
    sim.spawnFragment(types[i % types.length], { x: cfg.drop[0] + (Math.random() - 0.5) * 20, y: cfg.drop[1] }, { x: 0, y: 0 });
    for (let k = 0; k < 70; k++) sim.step();
  }
  for (let k = 0; k < 400; k++) sim.step();
  let got = del;
  if (cfg.target !== 'hole') {
    const [x0, x1] = cfg.target.split(',').map(Number);
    got = [...sim.fragments.values()].filter((f) => f.body.position.x > x0 && f.body.position.x < x1).length;
  }
  sim.destroy();
  return got / n;
}
let best: P[] | null = null;
let bs = -1;
for (let i = 0; i < trials; i++) {
  const c = best && i > trials * 0.35 ? perturb(best, 1 - i / trials + 0.1) : sample();
  const s = evaluate(c);
  if (s > bs) {
    bs = s;
    best = c;
  }
}
const conf = best ? [5, 6, 7].map((sd) => +evaluate(best!, sd).toFixed(2)) : [];
console.log(JSON.stringify({ score: +bs.toFixed(2), conf, devices: best?.map((d) => ({ type: d.type, x: +d.x.toFixed(1), y: +d.y.toFixed(1), angle: +d.angle.toFixed(3), params: Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, +v.toFixed(2)])) })) }));
