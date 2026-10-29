import type { ThemeKey } from '../world/types';

/** Paleta base do GDD §12.2 (+ variações para luz e metal) */
export const PAL = {
  bg: '#0B1026',
  violet: '#272044',
  rock: '#454A61',
  rockLine: '#24273D',
  amber: '#FFB34B',
  core: '#FFE08A',
  steel: '#4E6A82',
  steelLight: '#7A98B0',
  steelDark: '#2C3E52',
  cyan: '#55D7E8',
  vortex: '#9D68E8',
  lilac: '#5A4E88',
  ok: '#6EE7A0',
  bad: '#FF6B6B',
  white: '#F4F1FF',
};

/** Rampas de metal das máquinas (escuro → claro) */
export const METAL = ['#10141f', '#1d2636', '#2e3d55', '#46597a', '#6b84a6', '#a6bdd8'];
export const BRASS = ['#2a160a', '#4e2e14', '#7a4a20', '#b0742e', '#e0a64a', '#ffd88a'];

export interface Theme {
  /** gradiente do céu (topo → base) */
  skyTop: string;
  skyBottom: string;
  /** cores da nebulosa, do mais fundo ao mais claro */
  nebula: string[];
  /** rampa de 6 tons da rocha, escuro → claro */
  rock: string[];
  rockLine: string;
  rim: string;
  /** poeira/gelo no topo das rochas */
  dust: string;
  crystal: [string, string, string, string];
  stars: string[];
  planet: [string, string, string];
  galaxy: [string, string, string];
  farRock: [string, string];
}

export const THEMES: Record<ThemeKey, Theme> = {
  ash: {
    skyTop: '#070a1c',
    skyBottom: '#1a1438',
    nebula: ['#141a46', '#22236a', '#3a2a80', '#6a3a9a', '#b05ab0'],
    rock: ['#120d1e', '#1d1530', '#2a2042', '#3a2d55', '#4d3d6a', '#665282'],
    rockLine: '#0a0714',
    rim: '#9a84b8',
    dust: '#d9a35e',
    crystal: ['#7a2e10', '#e06a1e', '#ffb34b', '#fff0c0'],
    stars: ['#ffffff', '#ffe08a', '#a8c0ff', '#d8b8ff'],
    planet: ['#e8a868', '#a8603a', '#4a2418'],
    galaxy: ['#f6d8ff', '#c68af0', '#5a3aa0'],
    farRock: ['#1a1430', '#2c2248'],
  },
  orion: {
    skyTop: '#040b18',
    skyBottom: '#0c1e38',
    nebula: ['#0a1a3a', '#0f2a5a', '#14407a', '#1f6a9a', '#4ab0c8'],
    rock: ['#101828', '#18243a', '#22334f', '#2e4566', '#3c5a80', '#50749c'],
    rockLine: '#050a14',
    rim: '#8cc8e6',
    dust: '#bff4ff',
    crystal: ['#0e4a5a', '#1f9ab0', '#55d7e8', '#e8ffff'],
    stars: ['#ffffff', '#bff0ff', '#a8c0ff', '#ffe8c8'],
    planet: ['#8ac0e0', '#3a6a9a', '#142a48'],
    galaxy: ['#e8fbff', '#7ad0f0', '#1f4a8a'],
    farRock: ['#0f1a2c', '#1a2c44'],
  },
  basalt: {
    skyTop: '#0a0714',
    skyBottom: '#1c1030',
    nebula: ['#1a0f2e', '#2c1648', '#46206a', '#7a3070', '#c05a5a'],
    rock: ['#161420', '#22202e', '#302c3e', '#403a50', '#544d66', '#6e6782'],
    rockLine: '#07060a',
    rim: '#9c96b0',
    dust: '#e0a050',
    crystal: ['#7a2a0e', '#d8601e', '#ff9a4a', '#ffe0b0'],
    stars: ['#ffffff', '#ffd9a0', '#d0b8ff', '#ffb8b8'],
    planet: ['#d08ae0', '#7a3a9a', '#2a1440'],
    galaxy: ['#ffe8d8', '#f09a8a', '#6a2a6a'],
    farRock: ['#18121f', '#28202f'],
  },
  ion: {
    skyTop: '#030e12',
    skyBottom: '#0a2228',
    nebula: ['#062428', '#0a3a40', '#0f5a5a', '#1a8a80', '#6ae0c8'],
    rock: ['#0c1a1e', '#14282e', '#1d3940', '#284c54', '#356369', '#4a7e82'],
    rockLine: '#030a0b',
    rim: '#8ae8e0',
    dust: '#c8fff4',
    crystal: ['#0e5a52', '#1fb0a0', '#7fe6e0', '#f0fffc'],
    stars: ['#ffffff', '#c8fff4', '#a8e0ff', '#fff0d0'],
    planet: ['#7ad8c0', '#2a8070', '#0e3430'],
    galaxy: ['#e8fffa', '#7ae0d0', '#1a5a6a'],
    farRock: ['#0a1a1c', '#13292c'],
  },
  cathedral: {
    skyTop: '#080418',
    skyBottom: '#200e40',
    nebula: ['#1a0e40', '#2c1460', '#4a1e88', '#8a30a8', '#e070c0'],
    rock: ['#120a22', '#1d1236', '#2a1a4a', '#3a2662', '#4e347c', '#684898'],
    rockLine: '#08040f',
    rim: '#b89ae8',
    dust: '#ffd27a',
    crystal: ['#7a3a10', '#e07a20', '#ffb34b', '#fff2c8'],
    stars: ['#ffffff', '#ffe08a', '#d8b8ff', '#ffc8e8'],
    planet: ['#f0b860', '#a8603a', '#40180e'],
    galaxy: ['#fff0ff', '#e08ae0', '#6a2aa0'],
    farRock: ['#160c28', '#26183e'],
  },
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((x, i) => Math.round(x + (B[i] - x) * t));
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Interpola uma rampa de cores (t em 0..1). */
export function ramp(cols: string[], t: number): string {
  const x = Math.max(0, Math.min(0.9999, t)) * (cols.length - 1);
  const i = Math.floor(x);
  return mix(cols[i], cols[i + 1], x - i);
}
