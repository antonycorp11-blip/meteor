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

export const FUNNEL_WALLS: Poly[] = [
  [v(-40, -18), v(-34, -18), v(-10, 8), v(-16, 8)],
  [v(34, -18), v(40, -18), v(16, 8), v(10, 8)],
];

export const DEVICES: Record<DeviceType, DeviceDef> = {
  plank: {
    type: 'plank',
    name: 'Placa',
    desc: 'Uma prancha reta: as pedras rolam e deslizam por cima.',
    howTo: 'Incline um pouco para criar uma descida até onde você quer levar as pedras.',
    limit: 'Comprimento curto: emende várias.',
    cost: 8,
    solids: () => [rectPoly(64, 6)],
    friction: 0.002,
    restitution: 0.12,
    params: [],
    hitRadius: 32,
  },
  ramp: {
    type: 'ramp',
    name: 'Rampa curva',
    desc: 'Curva que transforma uma queda em movimento para o lado.',
    howTo: 'Coloque embaixo de onde as pedras caem: elas saem deslizando na direção da curva.',
    limit: 'Raio pequeno; não prende a pedra.',
    cost: 14,
    solids: () => RAMP_SEGMENTS,
    friction: 0.0015,
    restitution: 0.05,
    params: [],
    hitRadius: 30,
  },
  funnel: {
    type: 'funnel',
    name: 'Funil',
    desc: 'Junta tudo que cai em cima e solta por um único buraco embaixo.',
    howTo: 'Ponha sob uma chuva de pedras para alinhar o fluxo antes de uma mola, esteira ou lançador.',
    limit: 'Se entrar demais de uma vez, entope.',
    cost: 20,
    solids: () => FUNNEL_WALLS,
    friction: 0.002,
    restitution: 0.08,
    params: [],
    hitRadius: 36,
  },
  spring: {
    type: 'spring',
    name: 'Mola',
    desc: 'Plataforma reta que arremessa na direção da seta tudo que encosta nela.',
    howTo: 'Gire a seta para onde quer mandar as pedras. Ao posicionar, a linha pontilhada mostra o arco.',
    limit: 'Força fixa por ajuste; pedras pesadas vão menos longe.',
    cost: 30,
    solids: () => [rectPoly(42, 8)],
    friction: 0.05,
    restitution: 0.1,
    params: [{ key: 'power', label: 'Força', min: 4, max: 13, step: 0.25, def: 8 }],
    hitRadius: 22,
  },
  conveyor: {
    type: 'conveyor',
    name: 'Esteira',
    desc: 'Arrasta para o lado tudo que está em cima dela.',
    howTo: 'Ótima para tirar pedras de um chão plano. Velocidade negativa inverte o sentido.',
    limit: 'Não prende: pedras podem cair ou quicar.',
    cost: 35,
    solids: () => [rectPoly(84, 8)],
    friction: 0.03,
    restitution: 0.02,
    params: [{ key: 'speed', label: 'Velocidade', min: -5, max: 5, step: 0.25, def: 3.5 }],
    hitRadius: 42,
  },
  booster: {
    type: 'booster',
    name: 'Acelerador',
    desc: 'Dá um empurrão na direção da seta em quem passa por cima.',
    howTo: 'Use em sequência para vencer subidas ou ganhar velocidade antes de um salto.',
    limit: 'Precisa de contato; recarrega rapidamente.',
    cost: 45,
    solids: () => [rectPoly(40, 6)],
    friction: 0.002,
    restitution: 0.05,
    params: [{ key: 'power', label: 'Impulso', min: 2, max: 7, step: 0.5, def: 4.5 }],
    hitRadius: 21,
  },
  launcher: {
    type: 'launcher',
    name: 'Lançador',
    desc: 'Copo que segura uma pedra por um instante e a lança na direção da seta.',
    howTo: 'Deixe as pedras caírem dentro do copo. A prévia pontilhada mostra onde elas vão parar.',
    limit: 'Uma pedra por vez; tem recarga.',
    cost: 60,
    solids: () => [rectPoly(32, 5, 0, 8.5), rectPoly(5, 12, -13.5, 1), rectPoly(5, 16, 13.5, -1)],
    friction: 0.02,
    restitution: 0.02,
    params: [{ key: 'power', label: 'Potência', min: 4, max: 13, step: 0.25, def: 9 }],
    hitRadius: 18,
  },
  damper: {
    type: 'damper',
    name: 'Almofada',
    desc: 'Absorve o impacto: a pedra para de quicar ao bater nela.',
    howTo: 'Coloque onde as pedras chegam rápido demais e saem quicando para longe.',
    limit: 'Não transporta nada.',
    cost: 40,
    solids: () => [rectPoly(36, 8)],
    friction: 0.04,
    restitution: 0,
    params: [],
    hitRadius: 18,
  },
  gate: {
    type: 'gate',
    name: 'Portinhola',
    desc: 'Barreira que abre e fecha sozinha para dosar o fluxo.',
    howTo: 'Use para alternar duas rotas ou evitar congestionamento na frente de um lançador.',
    limit: 'Depende do tempo de abertura; pode acumular pedras.',
    cost: 70,
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
  fan: {
    type: 'fan',
    name: 'Ventilador',
    desc: 'Sopra numa faixa reta e empurra as pedras sem tocar nelas.',
    howTo: 'Aponte para cima para segurar pedras no ar, ou de lado para atravessar um vão.',
    limit: 'Rocha bloqueia o vento; pedras densas quase não se mexem.',
    cost: 90,
    solids: () => [rectPoly(14, 22)],
    friction: 0.01,
    restitution: 0.1,
    params: [{ key: 'strength', label: 'Intensidade', min: 0.3, max: 1, step: 0.05, def: 0.8 }],
    field: (_p, m) => ({ kind: 'rect', rect: { x0: 7, x1: 7 + FAN_LENGTH * m.radius, y0: -FAN_WIDTH / 2, y1: FAN_WIDTH / 2 } }),
    hitRadius: 13,
  },
  attractor: {
    type: 'attractor',
    name: 'Ímã gravitacional',
    desc: 'Puxa as pedras próximas e curva a trajetória delas.',
    howTo: 'Coloque perto do caminho para dobrar arcos; metálicos sentem muito mais.',
    limit: 'Fraco de longe e não atravessa rocha.',
    cost: 160,
    solids: () => [circlePoly(8, 10)],
    friction: 0.01,
    restitution: 0.2,
    params: [{ key: 'strength', label: 'Intensidade', min: 0.3, max: 1, step: 0.05, def: 0.8 }],
    field: (_p, m) => ({ kind: 'radial', radius: FIELD_RADIUS * m.radius }),
    hitRadius: 10,
  },
  repulsor: {
    type: 'repulsor',
    name: 'Repulsor',
    desc: 'Empurra para longe as pedras próximas.',
    howTo: 'Use para desviar pedras de um buraco ou separar leves de pesadas.',
    limit: 'Pode mandar para o lugar errado.',
    cost: 150,
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
    desc: 'Alavanca que gira de tempos em tempos e rebate o que está em cima.',
    howTo: 'Deixe as pedras se juntarem no braço: a cada giro ele as atira para cima.',
    limit: 'Precisa de espaço para girar.',
    cost: 140,
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
    name: 'Elevador de campo',
    desc: 'Feixe que faz as pedras flutuarem para cima.',
    howTo: 'Ponha a base onde as pedras caem; no topo, use um ventilador ou mola para tirá-las.',
    limit: 'Não prende: no topo elas ficam boiando.',
    cost: 200,
    solids: () => [rectPoly(36, 8)],
    friction: 0.01,
    restitution: 0.05,
    params: [{ key: 'strength', label: 'Intensidade', min: 0.6, max: 1, step: 0.05, def: 0.9 }],
    field: (_p, m) => ({ kind: 'rect', rect: { x0: -LIFT_WIDTH / 2, x1: LIFT_WIDTH / 2, y0: -4 - LIFT_HEIGHT * m.radius, y1: -4 } }),
    hitRadius: 18,
  },
  sensor: {
    type: 'sensor',
    name: 'Sensor',
    desc: 'Detecta pedras passando e abre portinholas em modo Sensor por perto.',
    howTo: 'Coloque antes de uma portinhola para ela abrir só quando há pedra chegando.',
    limit: 'Alcance de 180 px.',
    cost: 80,
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
  'funnel',
  'spring',
  'conveyor',
  'booster',
  'launcher',
  'damper',
  'gate',
  'fan',
  'attractor',
  'repulsor',
  'arm',
  'lift',
  'sensor',
];

/** Direção de efeito local (seta desenhada sobre a peça), se houver. */
export function deviceArrow(type: DeviceType): { x: number; y: number } | null {
  switch (type) {
    case 'spring':
    case 'launcher':
    case 'lift':
      return { x: 0, y: -1 };
    case 'booster':
    case 'conveyor':
    case 'fan':
      return { x: 1, y: 0 };
    default:
      return null;
  }
}

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
