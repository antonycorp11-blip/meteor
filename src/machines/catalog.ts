import { rectPoly, circlePoly, v, type Poly } from '../core/geometry';
import type { DeviceDef, DeviceType } from './types';

function arcSegments(rIn: number, thick: number, a0: number, a1: number, n: number): Poly[] {
  const segs: Poly[] = [];
  const pts: Poly = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(v(Math.cos(a), Math.sin(a)));
  }
  // centraliza a curva pela caixa delimitadora
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    for (const r of [rIn, rIn + thick]) {
      minX = Math.min(minX, p.x * r);
      maxX = Math.max(maxX, p.x * r);
      minY = Math.min(minY, p.y * r);
      maxY = Math.max(maxY, p.y * r);
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const ro = rIn + thick;
    segs.push([
      v(p.x * rIn - cx, p.y * rIn - cy),
      v(q.x * rIn - cx, q.y * rIn - cy),
      v(q.x * ro - cx, q.y * ro - cy),
      v(p.x * ro - cx, p.y * ro - cy),
    ]);
  }
  return segs;
}

const deg = Math.PI / 180;

export const RAMP_SEGMENTS = arcSegments(38, 6, 186 * deg, 84 * deg, 7);

export const FAN_LENGTH = 150;
export const FAN_WIDTH = 36;
export const LIFT_HEIGHT = 240;
export const LIFT_WIDTH = 30;
export const FIELD_RADIUS = 110;
export const LAUNCHER_CUP = { x0: -10, x1: 10, y0: -9, y1: 6 };
export const SENSOR_SIZE = 28;
export const ARM_LENGTH = 58;

export const DEVICES: Record<DeviceType, DeviceDef> = {
  plank: {
    type: 'plank',
    name: 'Placa inclinável',
    desc: 'Superfície sólida, fixa e rotacionável.',
    limit: 'Comprimento limitado; pedras podem cair.',
    cost: 10,
    unlockZone: 1,
    solids: () => [rectPoly(64, 6)],
    friction: 0.002,
    restitution: 0.12,
    params: [],
    hitRadius: 32,
  },
  ramp: {
    type: 'ramp',
    name: 'Rampa curva',
    desc: 'Redireciona a trajetória por contato e gravidade.',
    limit: 'Raio limitado; não prende o objeto.',
    cost: 18,
    unlockZone: 1,
    solids: () => RAMP_SEGMENTS,
    friction: 0.0015,
    restitution: 0.05,
    params: [],
    hitRadius: 30,
  },
  deflector: {
    type: 'deflector',
    name: 'Defletor articulado',
    desc: 'Altera o ângulo de colisão e ricochete.',
    limit: 'Curto; não aplica força infinita.',
    cost: 12,
    unlockZone: 1,
    solids: () => [rectPoly(34, 5)],
    friction: 0.001,
    restitution: 0.72,
    params: [],
    hitRadius: 18,
  },
  bumper: {
    type: 'bumper',
    name: 'Bumper elástico',
    desc: 'Devolve impulso num choque.',
    limit: 'Intervalo de recuperação curto.',
    cost: 30,
    unlockZone: 1,
    solids: () => [circlePoly(9, 12)],
    friction: 0.003,
    restitution: 0.5,
    params: [{ key: 'power', label: 'Força', min: 2, max: 6, step: 0.5, def: 4, unit: '' }],
    hitRadius: 11,
  },
  booster: {
    type: 'booster',
    name: 'Propulsor de contato',
    desc: 'Força breve quando um fragmento encosta.',
    limit: 'Tem direção, alcance curto e recarga.',
    cost: 38,
    unlockZone: 2,
    solids: () => [rectPoly(40, 6)],
    friction: 0.002,
    restitution: 0.05,
    params: [{ key: 'power', label: 'Impulso', min: 2, max: 7, step: 0.5, def: 4.5 }],
    hitRadius: 21,
  },
  launcher: {
    type: 'launcher',
    name: 'Lançador aberto',
    desc: 'Dá impulso balístico ao que repousa na área de recepção.',
    limit: 'Erro de mira, cadência e recarga.',
    cost: 95,
    unlockZone: 2,
    solids: () => [rectPoly(32, 5, 0, 8.5), rectPoly(5, 12, -13.5, 1), rectPoly(5, 16, 13.5, -1)],
    friction: 0.02,
    restitution: 0.02,
    params: [{ key: 'power', label: 'Potência', min: 4, max: 13, step: 0.25, def: 8 }],
    hitRadius: 18,
  },
  fan: {
    type: 'fan',
    name: 'Ventilador de campo',
    desc: 'Força contínua numa faixa estreita.',
    limit: 'Rochas bloqueiam; pouco efeito em fragmento denso.',
    cost: 130,
    unlockZone: 3,
    solids: () => [rectPoly(14, 22)],
    friction: 0.01,
    restitution: 0.1,
    params: [{ key: 'strength', label: 'Intensidade', min: 0.3, max: 1, step: 0.05, def: 0.8 }],
    field: (_p, m) => ({
      kind: 'rect',
      rect: { x0: 7, x1: 7 + FAN_LENGTH * m.radius, y0: -FAN_WIDTH / 2, y1: FAN_WIDTH / 2 },
    }),
    hitRadius: 13,
  },
  gate: {
    type: 'gate',
    name: 'Portinhola',
    desc: 'Bloqueia ou libera a passagem com colisão real.',
    limit: 'Depende de timing; pode congestionar.',
    cost: 85,
    unlockZone: 3,
    solids: () => [rectPoly(6, 8, -28, 0), rectPoly(6, 8, 28, 0), rectPoly(50, 5, 0, 0)],
    movingSolid: 2,
    pivot: { x: -25, y: 0 },
    friction: 0.01,
    restitution: 0.05,
    params: [
      { key: 'mode', label: 'Modo', min: 0, max: 2, step: 1, def: 0, labels: ['Ciclo', 'Manual', 'Sensor'] },
      { key: 'open', label: 'Aberta (s)', min: 0.5, max: 5, step: 0.25, def: 1.5 },
      { key: 'closed', label: 'Fechada (s)', min: 0.5, max: 5, step: 0.25, def: 1.5 },
    ],
    hitRadius: 30,
  },
  conveyor: {
    type: 'conveyor',
    name: 'Esteira aberta',
    desc: 'Fricção tangencial motorizada na superfície.',
    limit: 'Pedras podem cair ou saltar; não se prendem.',
    cost: 150,
    unlockZone: 3,
    solids: () => [rectPoly(84, 8)],
    friction: 0.03,
    restitution: 0.02,
    params: [{ key: 'speed', label: 'Velocidade', min: -5, max: 5, step: 0.25, def: 3 }],
    hitRadius: 42,
  },
  damper: {
    type: 'damper',
    name: 'Amortecedor',
    desc: 'Reduz o impacto numa pequena área de contato.',
    limit: 'Não transporta; ocupa espaço.',
    cost: 60,
    unlockZone: 4,
    solids: () => [rectPoly(36, 8)],
    friction: 0.04,
    restitution: 0,
    params: [],
    hitRadius: 18,
  },
  attractor: {
    type: 'attractor',
    name: 'Campo atrator',
    desc: 'Atrai corpos no alcance e na linha de visão.',
    limit: 'Pouca força a longas distâncias.',
    cost: 290,
    unlockZone: 4,
    solids: () => [circlePoly(8, 10)],
    friction: 0.01,
    restitution: 0.2,
    params: [{ key: 'strength', label: 'Intensidade', min: 0.3, max: 1, step: 0.05, def: 0.8 }],
    field: (_p, m) => ({ kind: 'radial', radius: FIELD_RADIUS * m.radius }),
    hitRadius: 10,
  },
  repulsor: {
    type: 'repulsor',
    name: 'Campo repulsor',
    desc: 'Repele objetos para alterar arcos livres.',
    limit: 'Pode lançar para o lugar errado.',
    cost: 270,
    unlockZone: 4,
    solids: () => [circlePoly(8, 10)],
    friction: 0.01,
    restitution: 0.2,
    params: [{ key: 'strength', label: 'Intensidade', min: 0.3, max: 1, step: 0.05, def: 0.8 }],
    field: (_p, m) => ({ kind: 'radial', radius: FIELD_RADIUS * m.radius }),
    hitRadius: 10,
  },
  arm: {
    type: 'arm',
    name: 'Braço basculante',
    desc: 'Dá impulso por rotação e colisão.',
    limit: 'Requer espaço e boa angulação.',
    cost: 220,
    unlockZone: 5,
    solids: () => [circlePoly(6, 8), rectPoly(ARM_LENGTH - 4, 7, 4 + (ARM_LENGTH - 4) / 2, 0)],
    movingSolid: 1,
    pivot: { x: 0, y: 0 },
    friction: 0.012,
    restitution: 0.05,
    params: [
      { key: 'period', label: 'Período (s)', min: 0.8, max: 4, step: 0.1, def: 1.6 },
      { key: 'swing', label: 'Giro (°)', min: 30, max: 90, step: 5, def: 60 },
    ],
    hitRadius: 30,
  },
  lift: {
    type: 'lift',
    name: 'Elevador de campo aberto',
    desc: 'Levita livremente dentro de um feixe vertical.',
    limit: 'Sem captura rígida; não atravessa paredes.',
    cost: 360,
    unlockZone: 5,
    solids: () => [rectPoly(36, 8)],
    friction: 0.01,
    restitution: 0.05,
    params: [{ key: 'strength', label: 'Intensidade', min: 0.6, max: 1, step: 0.05, def: 0.9 }],
    field: (_p, m) => ({
      kind: 'rect',
      rect: { x0: -LIFT_WIDTH / 2, x1: LIFT_WIDTH / 2, y0: -4 - LIFT_HEIGHT * m.radius, y1: -4 },
    }),
    hitRadius: 18,
  },
  autoextractor: {
    type: 'autoextractor',
    name: 'Autoextrator',
    desc: 'Produz fragmentos numa cadência limitada.',
    limit: 'Alto custo; não resolve o transporte.',
    cost: 650,
    unlockZone: 5,
    maxPerZone: 2,
    solids: () => [rectPoly(18, 18)],
    friction: 0.01,
    restitution: 0.1,
    params: [],
    hitRadius: 11,
  },
  sensor: {
    type: 'sensor',
    name: 'Sensor + acionador',
    desc: 'Lê a passagem e abre portinholas em modo Sensor próximas.',
    limit: 'Só atua em portinholas a até 180 px.',
    cost: 110,
    unlockZone: 6,
    solids: () => [],
    friction: 0,
    restitution: 0,
    params: [{ key: 'hold', label: 'Abrir por (s)', min: 0.5, max: 3, step: 0.25, def: 1.25 }],
    hitRadius: 15,
  },
};

export const DEVICE_ORDER: DeviceType[] = [
  'plank',
  'ramp',
  'deflector',
  'bumper',
  'booster',
  'launcher',
  'fan',
  'gate',
  'conveyor',
  'damper',
  'attractor',
  'repulsor',
  'arm',
  'lift',
  'autoextractor',
  'sensor',
];

/** Polígono usado para validar posicionamento (sólidos ou área do sensor). */
export function footprint(type: DeviceType, params: Record<string, number>): Poly[] {
  const def = DEVICES[type];
  const s = def.solids(params);
  if (s.length) return s;
  return [rectPoly(SENSOR_SIZE, SENSOR_SIZE)];
}

export function defaultParams(type: DeviceType): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of DEVICES[type].params) out[p.key] = p.def;
  return out;
}
