import type { ThemeKey } from '../world/types';

/** Paleta base do GDD §12.2 */
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

export interface Theme {
  bg: string;
  bg2: string;
  nebula: string[];
  rock: [string, string, string]; // escuro, médio, claro
  rockEdge: string;
  rockLine: string;
  speck: string;
  stars: string[];
  planet: [string, string];
}

export const THEMES: Record<ThemeKey, Theme> = {
  ash: {
    bg: '#0B1026',
    bg2: '#101836',
    nebula: ['#141F3A', '#1A2A48', '#2A2644'],
    rock: ['#2F3348', '#3D4259', '#4C5270'],
    rockEdge: '#6D7596',
    rockLine: '#1A1C2E',
    speck: '#FFB34B',
    stars: ['#F4F1FF', '#FFE08A', '#9DB7FF'],
    planet: ['#C98E5A', '#6E4A3A'],
  },
  orion: {
    bg: '#0A1224',
    bg2: '#0E1A33',
    nebula: ['#0F2438', '#12304A', '#18263E'],
    rock: ['#2B3447', '#37435A', '#46536E'],
    rockEdge: '#55D7E8',
    rockLine: '#161C2C',
    speck: '#55D7E8',
    stars: ['#F4F1FF', '#9DE9F5', '#C7D2FF'],
    planet: ['#5E8FB0', '#2E4A66'],
  },
  basalt: {
    bg: '#0E0D1E',
    bg2: '#161230',
    nebula: ['#1E1636', '#281C46', '#1A1832'],
    rock: ['#34333D', '#45444F', '#585766'],
    rockEdge: '#8A8796',
    rockLine: '#19181F',
    speck: '#FFB34B',
    stars: ['#F4F1FF', '#FFD9A0', '#C9B8FF'],
    planet: ['#B07AC8', '#5A3A70'],
  },
  ion: {
    bg: '#081420',
    bg2: '#0C1D2C',
    nebula: ['#0C2C36', '#103C46', '#14243A'],
    rock: ['#283A50', '#334A64', '#425C7A'],
    rockEdge: '#7FE6E0',
    rockLine: '#131D2A',
    speck: '#7FE6E0',
    stars: ['#E8FFFF', '#9DE9F5', '#F4F1FF'],
    planet: ['#4FB0A0', '#265A56'],
  },
  cathedral: {
    bg: '#100C26',
    bg2: '#18123A',
    nebula: ['#201642', '#2C1C56', '#181538'],
    rock: ['#332C4A', '#433A5E', '#564B76'],
    rockEdge: '#9D8CD0',
    rockLine: '#17122A',
    speck: '#FFB34B',
    stars: ['#F4F1FF', '#FFE08A', '#C79BFF'],
    planet: ['#D0A05A', '#7A4E2E'],
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
