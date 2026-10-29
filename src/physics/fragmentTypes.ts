export type FragmentTypeId = 'common' | 'porous' | 'dense' | 'metallic' | 'glass' | 'unstable' | 'rare' | 'shard';

export interface FragmentTypeDef {
  id: FragmentTypeId;
  name: string;
  mass: number; // também é a "massa" contada no objetivo
  value: number; // créditos base
  radius: [number, number];
  verts: [number, number];
  restitution: number;
  friction: number;
  frictionAir: number;
  /** resposta a campos atratores/repulsores */
  magnetic: number;
  /** cores: corpo, sombra, contorno, brilho */
  colors: [string, string, string, string];
  desc: string;
}

export const FRAGMENT_TYPES: Record<FragmentTypeId, FragmentTypeDef> = {
  common: {
    id: 'common',
    name: 'Comum',
    mass: 1,
    value: 1,
    radius: [5.2, 6.7],
    verts: [6, 8],
    restitution: 0.22,
    friction: 0.006,
    frictionAir: 0.004,
    magnetic: 1,
    colors: ['#FFB34B', '#C9762A', '#3A1E14', '#FFE08A'],
    desc: 'Física neutra.',
  },
  porous: {
    id: 'porous',
    name: 'Poroso',
    mass: 0.7,
    value: 1,
    radius: [5.6, 7.2],
    verts: [7, 9],
    restitution: 0.55,
    friction: 0.005,
    frictionAir: 0.008,
    magnetic: 0.8,
    colors: ['#E8C79A', '#A88660', '#3A2A1E', '#FFF0D0'],
    desc: 'Leve e quica mais.',
  },
  dense: {
    id: 'dense',
    name: 'Denso',
    mass: 2.6,
    value: 2.2,
    radius: [6.3, 7.8],
    verts: [5, 6],
    restitution: 0.06,
    friction: 0.008,
    frictionAir: 0.002,
    magnetic: 0.5,
    colors: ['#B86A3C', '#6E3A22', '#24120C', '#E89A5C'],
    desc: 'Pesado: difícil de erguer, rola com força.',
  },
  metallic: {
    id: 'metallic',
    name: 'Metálico',
    mass: 1.6,
    value: 1.6,
    radius: [5.4, 6.7],
    verts: [4, 5],
    restitution: 0.3,
    friction: 0.004,
    frictionAir: 0.003,
    magnetic: 2.4,
    colors: ['#9FB8C8', '#4E6A82', '#1A2430', '#E6F4FF'],
    desc: 'Responde muito mais a campos.',
  },
  glass: {
    id: 'glass',
    name: 'Vítreo',
    mass: 0.9,
    value: 1.5,
    radius: [5.6, 6.9],
    verts: [5, 6],
    restitution: 0.32,
    friction: 0.003,
    frictionAir: 0.004,
    magnetic: 0.9,
    colors: ['#7FE6E0', '#3A9AA6', '#13303A', '#E8FFFF'],
    desc: 'Parte-se em 2–3 lascas num impacto forte.',
  },
  unstable: {
    id: 'unstable',
    name: 'Instável',
    mass: 1.2,
    value: 2,
    radius: [5.6, 6.9],
    verts: [6, 7],
    restitution: 0.3,
    friction: 0.006,
    frictionAir: 0.004,
    magnetic: 1.2,
    colors: ['#FF7A5A', '#B03A3A', '#2A0E14', '#FFD0A0'],
    desc: 'Emite um pulso físico local ao bater forte.',
  },
  rare: {
    id: 'rare',
    name: 'Raro',
    mass: 1,
    value: 5,
    radius: [4.9, 6.0],
    verts: [6, 6],
    restitution: 0.25,
    friction: 0.006,
    frictionAir: 0.004,
    magnetic: 1,
    colors: ['#C79BFF', '#7A4EC8', '#1E1236', '#FFFFFF'],
    desc: 'Rendimento superior.',
  },
  shard: {
    id: 'shard',
    name: 'Lasca',
    mass: 0.35,
    value: 0.55,
    radius: [3.4, 4.0],
    verts: [3, 4],
    restitution: 0.3,
    friction: 0.004,
    frictionAir: 0.006,
    magnetic: 0.9,
    colors: ['#7FE6E0', '#3A9AA6', '#13303A', '#E8FFFF'],
    desc: 'Lasca vítrea.',
  },
};

// Obs.: no Matter.js o atrito cinético é um impulso constante por iteração;
// por isso os coeficientes aqui são bem menores que os "reais".
export const SHATTER_SPEED = 6.2; // px/frame de impacto normal
export const UNSTABLE_PULSE_SPEED = 3.6;
export const UNSTABLE_PULSE_RADIUS = 46;
export const UNSTABLE_PULSE_ACCEL = 5.5; // px/frame de Δv máximo
