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
    skyTop: '#0e0507',
    skyBottom: '#2a0d0e',
    nebula: ['#2a0c10', '#4a1414', '#7a2216', '#b8461c', '#ffa04a'],
    rock: ['#140a0a', '#22110f', '#331a15', '#47251c', '#5e3426', '#7a4632'],
    rockLine: '#0a0404',
    rim: '#d89a6a',
    dust: '#ffcf8a',
    crystal: ['#7a2e10', '#e06a1e', '#ffb34b', '#fff0c0'],
    stars: ['#ffffff', '#ffe0b0', '#ffb08a', '#ffd8c8'],
    planet: ['#f0b870', '#b0603a', '#4a1e14'],
    galaxy: ['#fff0d8', '#ffaa6a', '#8a2a1a'],
    farRock: ['#1e0e0c', '#32180f'],
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
    skyTop: '#040a06',
    skyBottom: '#0f1e12',
    nebula: ['#0c2414', '#14381c', '#225a24', '#5a8a2a', '#d8e05a'],
    rock: ['#0b100c', '#141c15', '#1e2a1f', '#2b3b2a', '#3c5038', '#56694a'],
    rockLine: '#040705',
    rim: '#b8d88a',
    dust: '#e8e070',
    crystal: ['#5a5a10', '#b0b020', '#e8e85a', '#fffff0'],
    stars: ['#ffffff', '#e8ffd0', '#c8e8a8', '#fff8c0'],
    planet: ['#c8d870', '#6a8a3a', '#1e3016'],
    galaxy: ['#f8ffe0', '#c0e070', '#3a6a2a'],
    farRock: ['#0c160e', '#172818'],
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
