// Ferramenta de desenvolvimento: simula uma zona com uma solução de referência
// e gera um SVG com terreno, peças e trajetórias. Uso:
//   npx vite-node tools/simzone.ts -- <zona> <solução|none> [segundos] [saida.svg] [alvoX alvoY]
import { writeFileSync } from 'node:fs';
import { Sim } from '../src/sim/Sim';
import { loadZone } from '../src/world/ZoneLoader';
import { DEVICES, defaultParams } from '../src/machines/catalog';
import { transformPoly } from '../src/core/geometry';

const args = process.argv.slice(2).filter((a) => a !== '--');
const zoneId = Number(args[0] ?? 1);
const solId = args[1] ?? 'none';
const seconds = Number(args[2] ?? 60);
const out = args[3] ?? 'zone.svg';
const zone = loadZone(zoneId);
const aim = args[4] ? { x: Number(args[4]), y: Number(args[5]) } : { x: zone.asteroid.x + 100, y: zone.asteroid.y - 30 };
const sim = new Sim(zone, { seed: 1234 });
const sol = process.env.DEVICES ? { devices: JSON.parse(process.env.DEVICES) as typeof zone.solutions[0]['devices'] } : zone.solutions.find((s) => s.id === solId);
if (sol) {
  for (const d of sol.devices) {
    const params = { ...defaultParams(d.type), ...(d.params ?? {}) };
    const v = sim.validatePlacement(d.type, d.x, d.y, d.angle, params);
    if (!v.ok) console.log('INVALID', d.type, d.x, d.y, v.reason);
    sim.addDevice({ type: d.type, x: d.x, y: d.y, angle: d.angle, params, enabled: true, paid: 0 });
  }
}
let delivered = 0;
let lost = 0;
const lostReasons: Record<string, number> = {};
sim.events.on('absorb', () => delivered++);
sim.events.on('lost', (e) => {
  lost++;
  lostReasons[e.reason] = (lostReasons[e.reason] ?? 0) + 1;
});
const traces = new Map<number, { x: number; y: number }[]>();
const steps = seconds * 60;
let extracted = 0;
for (let i = 0; i < steps; i++) {
  if (i % Number(process.env.PACE ?? (sol as { pace?: number })?.pace ?? 45) === 0 && i < steps - 600) extracted += sim.extract(aim).length;
  sim.step();
  if (i % 3 === 0) {
    for (const f of sim.fragments.values()) {
      if (f.id > 25) continue;
      let t = traces.get(f.id);
      if (!t) traces.set(f.id, (t = []));
      t.push({ x: f.body.position.x, y: f.body.position.y });
    }
  }
}
console.log(JSON.stringify({ zone: zoneId, sol: solId, extracted, delivered, lost, active: sim.fragments.size, rate: +(delivered / extracted).toFixed(2), lostReasons }));

const W = zone.width;
const H = zone.height;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#0B1026"/>`;
for (const p of zone.terrain) svg += `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="#454A61" stroke="#8890b0"/>`;
const a = zone.asteroid;
svg += `<circle cx="${a.x}" cy="${a.y}" r="${a.r}" fill="#7a5a4a"/>`;
const h = zone.blackHole;
svg += `<circle cx="${h.x}" cy="${h.y}" r="${h.attractRadius}" fill="none" stroke="#9D68E8" stroke-dasharray="4 4"/><circle cx="${h.x}" cy="${h.y}" r="${h.absorbRadius}" fill="#000" stroke="#FFB34B"/>`;
for (const an of zone.anchors ?? []) svg += `<circle cx="${an.x}" cy="${an.y}" r="${an.r}" fill="#6ee7a011" stroke="#6ee7a0" stroke-dasharray="3 3"/>`;
for (const m of zone.movers ?? []) for (let k = 0; k < 6; k++) { const pose = sim.moverPose(m, k * 0.6); svg += `<polygon points="${m.poly.map(([x, y]) => `${(pose.x + x * Math.cos(pose.angle) - y * Math.sin(pose.angle)).toFixed(1)},${(pose.y + x * Math.sin(pose.angle) + y * Math.cos(pose.angle)).toFixed(1)}`).join(' ')}" fill="#a0607044" stroke="#e08a8a"/>`; }
for (const f of zone.fields) svg += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" fill="#55D7E822" stroke="#55D7E8"/>`;
for (const r of zone.regions) svg += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#FFE08A" stroke-dasharray="2 4"/>`;
for (const d of sim.devices.values()) {
  for (const poly of DEVICES[d.type].solids(d.params).map((p) => transformPoly(p, d, d.angle)))
    svg += `<polygon points="${poly.map((q) => `${q.x},${q.y}`).join(' ')}" fill="#55D7E8"/>`;
  if (DEVICES[d.type].solids(d.params).length === 0) svg += `<circle cx="${d.x}" cy="${d.y}" r="6" fill="#55D7E8"/>`;
}
for (const t of traces.values()) svg += `<polyline points="${t.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#FFB34B" stroke-opacity="0.6"/>`;
for (const f of sim.fragments.values()) svg += `<circle cx="${f.body.position.x}" cy="${f.body.position.y}" r="${f.radius}" fill="#FFE08A"/>`;
svg += `<text x="10" y="20" fill="#fff" font-family="monospace" font-size="14">zona ${zoneId} sol ${solId}: ${delivered}/${extracted} entregues, ${lost} perdidos</text>`;
svg += '</svg>';
writeFileSync(out, svg);
