// Varre ângulo e potência de UMA peça para um estágio: solta pedras num ponto e
// conta quantas terminam na região alvo (ou no buraco negro).
// Uso: npx vite-node tools/sweep.ts -- zona tipo x y dropX dropY alvo(x0,x1|hole) [tipoPedra] [ângulos] [potências]
import { Sim } from '../src/sim/Sim';
import { loadZone } from '../src/world/ZoneLoader';
import { defaultParams } from '../src/machines/catalog';
import type { DeviceType } from '../src/machines/types';
import type { FragmentTypeId } from '../src/physics/fragmentTypes';
const a = process.argv.slice(2).filter((x) => x !== '--');
const zone = loadZone(Number(a[0]));
const type = a[1] as DeviceType;
const [x, y, dx, dy] = a.slice(2, 6).map(Number);
const target = a[6];
const ftype = (a[7] ?? 'common') as FragmentTypeId;
const angles = (a[8] ?? '0,0.08,0.15,0.22,0.3,0.4,0.5').split(',').map(Number);
const powers = (a[9] ?? '9,11,13,15,16').split(',').map(Number);
const extra = JSON.parse(process.env.EXTRA ?? '[]');
const rows: string[] = [];
for (const p of powers) {
  const cells: string[] = [];
  for (const ang of angles) {
    const sim = new Sim(zone, { seed: 3 });
    const params = { ...defaultParams(type), power: p };
    if (!sim.validatePlacement(type, x, y, ang, params).ok) {
      cells.push(' X');
      continue;
    }
    sim.addDevice({ type, x, y, angle: ang, params, enabled: true, paid: 0 });
    for (const d of extra) sim.addDevice({ ...d, params: { ...defaultParams(d.type), ...(d.params ?? {}) }, enabled: true, paid: 0 });
    let del = 0;
    sim.events.on('absorb', () => del++);
    for (let i = 0; i < 10; i++) {
      sim.spawnFragment(ftype, { x: dx + i * 0.5, y: dy }, { x: 0, y: 0 });
      for (let k = 0; k < 90; k++) sim.step();
    }
    for (let k = 0; k < 400; k++) sim.step();
    let n = del;
    if (target !== 'hole') {
      const [x0, x1] = target.split(',').map(Number);
      n = [...sim.fragments.values()].filter((f) => f.body.position.x > x0 && f.body.position.x < x1).length;
    }
    sim.destroy();
    cells.push(String(n).padStart(2));
  }
  rows.push(`p${String(p).padEnd(4)} ${cells.join(' ')}`);
}
console.log(`ang   ${angles.map((v) => String(v).padStart(2)).join(' ')}\n${rows.join('\n')}`);
