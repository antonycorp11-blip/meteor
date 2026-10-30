// Testa um estágio: solta pedras num ponto com peças e conta entregas/posições finais.
// Uso: DEVICES='[...]' npx vite-node tools/stage.ts -- zona x y n [tipo] [svg]
import { writeFileSync } from 'node:fs';
import { Sim } from '../src/sim/Sim';
import { loadZone } from '../src/world/ZoneLoader';
import { defaultParams } from '../src/machines/catalog';
import type { FragmentTypeId } from '../src/physics/fragmentTypes';
const a = process.argv.slice(2).filter((x) => x !== '--');
const zone = loadZone(Number(a[0]));
const sim = new Sim(zone, { seed: 7 });
for (const d of JSON.parse(process.env.DEVICES ?? '[]')) if (!sim.validatePlacement(d.type, d.x, d.y, d.angle, { ...defaultParams(d.type), ...(d.params ?? {}) }).ok) console.error('INVALID', d.type, d.x, d.y); else sim.addDevice({ ...d, params: { ...defaultParams(d.type), ...(d.params ?? {}) }, enabled: true, paid: 0 });
let del = 0;
sim.events.on('absorb', () => del++);
const n = Number(a[3] ?? 10);
const traces: { x: number; y: number }[][] = [];
for (let i = 0; i < n; i++) {
  const f = sim.spawnFragment((a[4] ?? 'common') as FragmentTypeId, { x: Number(a[1]) + i * 0.5, y: Number(a[2]) }, { x: 0, y: 0 });
  const tr: { x: number; y: number }[] = [];
  traces.push(tr);
  for (let k = 0; k < 150; k++) {
    sim.step();
    if (k % 3 === 0 && f.alive) tr.push({ ...f.body.position });
  }
}
for (let k = 0; k < 300; k++) sim.step();
console.log(JSON.stringify({ delivered: del, of: n, rest: [...sim.fragments.values()].map((f) => [Math.round(f.body.position.x), Math.round(f.body.position.y)]) }));
if (a[5]) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${zone.width}" height="${zone.height}"><rect width="100%" height="100%" fill="#0B1026"/>`;
  for (const p of zone.terrain) svg += `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="#454A61"/>`;
  for (const d of sim.devices.values()) for (const p of d.worldSolids) svg += `<polygon points="${p.map((q) => `${q.x},${q.y}`).join(' ')}" fill="#55D7E8"/>`;
  svg += `<circle cx="${zone.blackHole.x}" cy="${zone.blackHole.y}" r="15" fill="#000" stroke="#fb4"/>`;
  for (const t of traces) svg += `<polyline points="${t.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#FFB34B"/>`;
  writeFileSync(a[5], svg + '</svg>');
}
