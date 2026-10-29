import { rot, type Poly } from '../core/geometry';
import { Rng, hash2 } from '../core/rng';
import { ARM_LENGTH, DEVICES, SENSOR_SIZE } from '../machines/catalog';
import type { DeviceType } from '../machines/types';
import { FRAGMENT_TYPES, type FragmentTypeId } from '../physics/fragmentTypes';
import type { ZoneData } from '../world/types';
import { terrainPolys } from '../world/Terrain';
import { PAL, THEMES, hexToRgb, mix, type Theme } from './palette';
import { PixelGrid, makeCanvas, type Sprite } from './PixelSprite';

// ---------------------------------------------------------------------------
// Ruído
// ---------------------------------------------------------------------------

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

// ---------------------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------------------

export function makeTerrainTexture(zone: ZoneData, highContrast = false): HTMLCanvasElement {
  const theme = THEMES[zone.theme];
  const W = zone.width;
  const H = zone.height;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  for (const p of terrainPolys(zone)) {
    ctx.beginPath();
    p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
  }
  const img = ctx.getImageData(0, 0, W, H);
  const src = img.data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = src[i * 4 + 3] >= 128 ? 1 : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : mask[y * W + x]);
  const seed = zone.id * 131;
  const rocks = theme.rock.map(hexToRgb);
  const edge = hexToRgb(highContrast ? '#C8D0F0' : theme.rockEdge);
  const line = hexToRgb(theme.rockLine);
  const speck = hexToRgb(theme.speck);
  const crack = hexToRgb(mix(theme.rock[0], theme.rockLine, 0.6));
  const out = new Uint8ClampedArray(W * H * 4);

  // fissuras pontuais: caminhadas aleatórias curtas dentro da rocha
  const crackMask = new Uint8Array(W * H);
  const rng = new Rng(seed + 7);
  const polys = terrainPolys(zone);
  for (const p of polys) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const q of p) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
    const area = (maxX - minX) * (maxY - minY);
    const n = Math.floor(area / 5000);
    for (let k = 0; k < n; k++) {
      let x = Math.floor(rng.range(minX + 6, maxX - 6));
      let y = Math.floor(rng.range(minY + 10, maxY - 6));
      let dir = rng.next() * Math.PI * 2;
      const len = rng.int(6, 18);
      for (let s = 0; s < len; s++) {
        if (at(x, y) && at(x + 2, y) && at(x - 2, y) && at(x, y + 2) && at(x, y - 2)) crackMask[y * W + x] = 1;
        dir += rng.range(-0.7, 0.7);
        x += Math.round(Math.cos(dir));
        y += Math.round(Math.sin(dir));
      }
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const i = (y * W + x) * 4;
      let c: number[];
      const exposedUp = !at(x, y - 1);
      const isEdge = exposedUp || !at(x, y + 1) || !at(x - 1, y) || !at(x + 1, y);
      if (isEdge) c = line;
      else if (!at(x, y - 2) || !at(x, y - 3)) c = edge;
      else if (!at(x - 2, y) || !at(x + 2, y) || !at(x, y + 2)) c = rocks[0];
      else if (crackMask[y * W + x]) c = crack;
      else {
        const n = valueNoise(x / 16, y / 13, seed) * 0.75 + valueNoise(x / 5, y / 5, seed + 1) * 0.25;
        const t = n + (bayer(x, y) - 0.5) * 0.1;
        c = t < 0.36 ? rocks[0] : t < 0.7 ? rocks[1] : rocks[2];
        // minério pontual
        if (hash2(x >> 1, y >> 1, seed + 3) > 0.9965) c = speck;
      }
      out[i] = c[0];
      out[i + 1] = c[1];
      out[i + 2] = c[2];
      out[i + 3] = 255;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Asteroide-fonte
// ---------------------------------------------------------------------------

export interface AsteroidArt {
  base: Sprite;
  glow: Sprite;
}

export function makeAsteroid(r: number, seed: number): AsteroidArt {
  const pad = 6;
  const size = r * 2 + pad * 2;
  const g = new PixelGrid(size, size, size / 2, size / 2);
  const glow = new PixelGrid(size, size, size / 2, size / 2);
  const rng = new Rng(seed);
  const radiusAt = (a: number) => r * (1 + 0.05 * (valueNoise(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, seed) - 0.5) * 2);
  const c0 = '#3A2C3E';
  const c1 = '#4E3C50';
  const c2 = '#665066';
  const c3 = '#7E6A7E';
  for (let y = -r - pad; y < r + pad; y++) {
    for (let x = -r - pad; x < r + pad; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.hypot(px, py);
      const a = Math.atan2(py, px);
      if (d > radiusAt(a)) continue;
      const light = (-px * 0.6 - py * 0.8) / r; // luz do canto superior esquerdo
      const n = valueNoise(px / 5 + 20, py / 5, seed) - 0.5;
      const t = light * 0.55 + n * 0.5 + (bayer(x, y) - 0.5) * 0.15;
      const col = t > 0.35 ? c3 : t > 0.02 ? c2 : t > -0.3 ? c1 : c0;
      g.set(x + g.ox, y + g.oy, col);
    }
  }
  // crateras
  for (let k = 0; k < 9; k++) {
    const a = rng.next() * Math.PI * 2;
    const dd = rng.range(0, r * 0.72);
    const cr = rng.range(3, r * 0.2);
    const cx = Math.cos(a) * dd;
    const cy = Math.sin(a) * dd;
    g.circle(cx, cy, cr, (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const rim = (dx * 0.6 + dy * 0.8) / cr; // borda iluminada embaixo/direita do interior
      return rim > 0.45 ? c2 : c0;
    });
    g.circle(cx + cr * 0.15, cy + cr * 0.15, cr * 0.45, '#2E2232');
  }
  // fissuras luminosas (camada de brilho separada para pulsar)
  for (let k = 0; k < 6; k++) {
    let a = rng.next() * Math.PI * 2;
    let x = Math.cos(a) * r * 0.15;
    let y = Math.sin(a) * r * 0.15;
    const len = rng.int(Math.floor(r * 0.5), Math.floor(r * 0.95));
    for (let s = 0; s < len; s++) {
      if (Math.hypot(x, y) > r - 3) break;
      g.set(Math.floor(x) + g.ox, Math.floor(y) + g.oy, '#7A2E22');
      glow.set(Math.floor(x) + glow.ox, Math.floor(y) + glow.oy, s % 5 === 0 ? PAL.core : '#FF8A3A');
      if (s % 3 === 0) glow.set(Math.floor(x) + glow.ox + 1, Math.floor(y) + glow.oy, '#FF8A3A', 150);
      a += rng.range(-0.5, 0.5);
      x += Math.cos(a);
      y += Math.sin(a);
      if (rng.chance(0.08)) {
        // ramificação curta
        let bx = x;
        let by = y;
        let ba = a + rng.range(-1.2, 1.2);
        for (let q = 0; q < 6; q++) {
          bx += Math.cos(ba);
          by += Math.sin(ba);
          ba += rng.range(-0.4, 0.4);
          if (Math.hypot(bx, by) > r - 3) break;
          glow.set(Math.floor(bx) + glow.ox, Math.floor(by) + glow.oy, '#E8662E');
        }
      }
    }
  }
  g.outline('#1A1222');
  return { base: g.toSprite(), glow: glow.toSprite() };
}

// ---------------------------------------------------------------------------
// Buraco negro
// ---------------------------------------------------------------------------

export interface BlackHoleArt {
  core: Sprite;
  ring: Sprite;
  halo: Sprite;
}

export function makeBlackHole(absorb: number): BlackHoleArt {
  const R = absorb + 2;
  const core = new PixelGrid(R * 2 + 4, R * 2 + 4, R + 2, R + 2);
  core.circle(0, 0, R, (x, y) => {
    const d = Math.hypot(x, y);
    return d > R - 1.2 ? '#FFE08A' : d > R - 2.4 ? '#9D68E8' : '#030208';
  });
  const r1 = R + 1;
  const r2 = R + 10;
  const ring = new PixelGrid(r2 * 2 + 2, r2 * 2 + 2, r2 + 1, r2 + 1);
  for (let y = -r2; y <= r2; y++) {
    for (let x = -r2; x <= r2; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.hypot(px, py);
      if (d < r1 || d > r2) continue;
      const t = (d - r1) / (r2 - r1);
      const a = Math.atan2(py, px);
      const swirl = Math.sin(a * 3 + t * 6) * 0.5 + 0.5;
      const v = (1 - t) * 0.9 + swirl * 0.25 - bayer(x, y) * 0.5;
      if (v < 0.2) continue;
      const col = v > 0.85 ? '#FFE08A' : v > 0.6 ? '#FF9A5A' : v > 0.4 ? '#C77AE8' : '#6A3AA8';
      ring.set(x + ring.ox, y + ring.oy, col);
    }
  }
  const hr = R + 22;
  const halo = new PixelGrid(hr * 2 + 2, hr * 2 + 2, hr + 1, hr + 1);
  for (let y = -hr; y <= hr; y++) {
    for (let x = -hr; x <= hr; x++) {
      const d = Math.hypot(x + 0.5, y + 0.5);
      if (d < r2 - 2 || d > hr) continue;
      const t = 1 - (d - (r2 - 2)) / (hr - r2 + 2);
      if (bayer(x, y) < t * 0.55) halo.set(x + halo.ox, y + halo.oy, t > 0.6 ? '#5A3A9A' : '#3A2A6E');
    }
  }
  return { core: core.toSprite(), ring: ring.toSprite(), halo: halo.toSprite() };
}

// ---------------------------------------------------------------------------
// Fragmentos
// ---------------------------------------------------------------------------

export function makeFragmentSprite(type: FragmentTypeId, local: Poly, radius: number, seed: number): Sprite {
  const def = FRAGMENT_TYPES[type];
  const [body, shadow, outline, shine] = def.colors;
  const s = Math.ceil(radius) * 2 + 4;
  const g = new PixelGrid(s, s, s / 2, s / 2);
  g.poly(local, (x, y) => {
    const l = (-x * 0.6 - y * 0.8) / radius;
    const n = hash2(Math.floor(x * 2) + 50, Math.floor(y * 2) + 50, seed);
    if (type === 'porous' && n > 0.82) return shadow;
    if (type === 'dense' && n > 0.88) return outline;
    if (l > 0.42) return shine;
    if (l < -0.2) return shadow;
    return body;
  });
  g.innerEdge(outline);
  if (type === 'metallic') g.line(-radius * 0.4, -radius * 0.1, radius * 0.1, -radius * 0.5, '#FFFFFF');
  if (type === 'unstable') g.set(g.ox, g.oy, PAL.core);
  if (type === 'rare') {
    g.set(g.ox - 1, g.oy - 1, '#FFFFFF');
    g.set(g.ox, g.oy, '#FFFFFF');
  }
  if (type === 'glass') g.set(g.ox - 1, g.oy - 2, '#FFFFFF');
  return g.toSprite();
}

// ---------------------------------------------------------------------------
// Dispositivos
// ---------------------------------------------------------------------------

export interface DeviceArt {
  base: Sprite;
  /** quadros alternativos para animação */
  frames?: Sprite[];
  moving?: Sprite;
  /** sprite de "ativação" (luz) */
  lit?: Sprite;
}

function gridFor(polys: Poly[], pad = 3): PixelGrid {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys)
    for (const q of p) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
  const ox = Math.ceil(-minX) + pad;
  const oy = Math.ceil(-minY) + pad;
  return new PixelGrid(Math.ceil(maxX) + ox + pad, Math.ceil(maxY) + oy + pad, ox, oy);
}

function steelShade(poly: Poly, light = PAL.steelLight, mid = PAL.steel, dark = PAL.steelDark) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const q of poly) {
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
  }
  return (_x: number, y: number) => {
    const t = (y - minY) / Math.max(1, maxY - minY);
    return t < 0.3 ? light : t > 0.75 ? dark : mid;
  };
}

function plate(polys: Poly[], extra?: (g: PixelGrid, f: number) => void, frames = 1): DeviceArt {
  const out: Sprite[] = [];
  for (let f = 0; f < frames; f++) {
    const g = gridFor(polys);
    for (const p of polys) g.poly(p, steelShade(p));
    extra?.(g, f);
    g.outline('#141A26');
    out.push(g.toSprite());
  }
  return { base: out[0], frames: frames > 1 ? out : undefined };
}

const cache = new Map<string, DeviceArt>();

export function deviceArt(type: DeviceType): DeviceArt {
  const hit = cache.get(type);
  if (hit) return hit;
  const def = DEVICES[type];
  const solids = def.solids({});
  let art: DeviceArt;
  switch (type) {
    case 'plank':
      art = plate(solids, (g) => {
        for (let x = -28; x <= 28; x += 8) g.set(x + g.ox, g.oy, '#9FB8C8');
        g.line(-31, -3, 31, -3, '#A8C4D6');
      });
      break;
    case 'ramp':
      art = plate(solids, (g) => {
        for (const s of solids) g.line(s[0].x, s[0].y, s[1].x, s[1].y, '#A8C4D6');
      });
      break;
    case 'deflector':
      art = plate(solids, (g) => {
        g.line(-16, -2, 16, -2, '#C8E0F0');
        g.circle(0, 0, 3.2, PAL.steelDark);
        g.set(g.ox, g.oy, PAL.amber);
      });
      break;
    case 'bumper': {
      const frames: Sprite[] = [];
      for (let f = 0; f < 2; f++) {
        const g = gridFor(solids);
        g.circle(0, 0, 9, (x, y) => {
          const d = Math.hypot(x, y);
          if (d > 7.6) return f ? '#BFF6FF' : PAL.cyan;
          if (d > 5.5) return (-x - y) > 2 ? PAL.steelLight : PAL.steel;
          return f ? PAL.core : PAL.amber;
        });
        g.outline('#141A26');
        frames.push(g.toSprite());
      }
      art = { base: frames[0], lit: frames[1] };
      break;
    }
    case 'booster': {
      const mk = (lit: boolean) =>
        plate(solids, (g) => {
          for (let x = -14; x <= 10; x += 8) {
            const c = lit ? '#E8FFFF' : PAL.cyan;
            g.line(x, -2, x + 3, 0, c);
            g.line(x + 3, 0, x, 2, c);
          }
        }).base;
      art = { base: mk(false), lit: mk(true) };
      break;
    }
    case 'launcher': {
      const mk = (lit: boolean) =>
        plate(solids, (g) => {
          g.line(-15, 7, 15, 7, lit ? PAL.core : PAL.cyan);
          g.set(g.ox - 14, g.oy - 9, PAL.amber);
          g.set(g.ox + 13, g.oy - 9, PAL.amber);
          g.line(0, 3, 0, 5, lit ? PAL.core : PAL.amber);
        }).base;
      art = { base: mk(false), lit: mk(true) };
      break;
    }
    case 'fan': {
      const frames: Sprite[] = [];
      for (let f = 0; f < 3; f++) {
        const g = gridFor([...solids, [{ x: 7, y: -11 }, { x: 11, y: -11 }, { x: 11, y: 11 }, { x: 7, y: 11 }]]);
        for (const p of solids) g.poly(p, steelShade(p));
        g.rect(-3, -8, 6, 16, PAL.steelDark);
        for (let k = 0; k < 4; k++) {
          const yy = -9 + ((k * 5 + f * 2) % 18);
          g.rect(7, yy, 3, 2, '#BFE8F2');
        }
        g.rect(-5, -10, 1, 20, PAL.cyan);
        g.outline('#141A26');
        frames.push(g.toSprite());
      }
      art = { base: frames[0], frames };
      break;
    }
    case 'gate': {
      const posts = solids.slice(0, 2);
      const g = gridFor(posts);
      for (const p of posts) g.poly(p, steelShade(p));
      g.set(g.ox - 28, g.oy - 3, PAL.amber);
      g.set(g.ox + 28, g.oy - 3, PAL.amber);
      g.outline('#141A26');
      // barra móvel desenhada com origem no pivô
      const bar = solids[2].map((q) => ({ x: q.x + 25, y: q.y }));
      const gb = gridFor([bar], 2);
      gb.poly(bar, (x) => (Math.floor((x + 50) / 5) % 2 ? '#FFB34B' : '#2A2230'));
      gb.outline('#141A26');
      art = { base: g.toSprite(), moving: gb.toSprite() };
      break;
    }
    case 'conveyor': {
      const frames: Sprite[] = [];
      for (let f = 0; f < 4; f++) {
        const g = gridFor(solids);
        g.poly(solids[0], (x, y) => (y < -2 ? '#3A4250' : y > 2 ? '#1E2430' : '#2A3140'));
        for (let x = -40 + f * 2; x < 42; x += 8) g.line(x, -3, x, -3, '#9FB8C8');
        for (let x = -36; x <= 36; x += 12) g.circle(x, 1, 2, PAL.steelLight);
        g.outline('#141A26');
        frames.push(g.toSprite());
      }
      art = { base: frames[0], frames };
      break;
    }
    case 'damper': {
      const g = gridFor(solids);
      g.poly(solids[0], (_x, y) => (y < 0 ? '#8A7AC8' : y < 2 ? PAL.lilac : PAL.steelDark));
      g.line(-17, -3, 17, -3, '#B8A8F0');
      g.outline('#141A26');
      art = { base: g.toSprite() };
      break;
    }
    case 'attractor':
    case 'repulsor': {
      const core = type === 'attractor' ? PAL.cyan : '#FF7A9A';
      const mk = (lit: boolean) => {
        const g = gridFor(solids);
        g.circle(0, 0, 8, (x, y) => {
          const d = Math.hypot(x, y);
          if (d > 6.2) return (-x - y) > 3 ? PAL.steelLight : PAL.steel;
          if (d > 3.4) return PAL.steelDark;
          return lit ? '#FFFFFF' : core;
        });
        g.outline('#141A26');
        return g.toSprite();
      };
      art = { base: mk(false), lit: mk(true) };
      break;
    }
    case 'arm': {
      const g = gridFor([solids[0]]);
      g.poly(solids[0], steelShade(solids[0]));
      g.set(g.ox, g.oy, PAL.amber);
      g.outline('#141A26');
      const armPoly = solids[1];
      const ga = gridFor([armPoly], 2);
      ga.poly(armPoly, steelShade(armPoly));
      ga.line(6, -3, ARM_LENGTH - 2, -3, '#A8C4D6');
      ga.rect(ARM_LENGTH - 6, -2, 3, 3, PAL.amber);
      ga.outline('#141A26');
      art = { base: g.toSprite(), moving: ga.toSprite() };
      break;
    }
    case 'lift': {
      const mk = (lit: boolean) =>
        plate(solids, (g) => {
          for (let x = -14; x <= 12; x += 6) g.rect(x, -4, 3, 1, lit ? '#E8FFFF' : PAL.cyan);
        }).base;
      art = { base: mk(false), lit: mk(true) };
      break;
    }
    case 'autoextractor': {
      const mk = (lit: boolean) =>
        plate(solids, (g) => {
          g.rect(-6, -6, 12, 12, PAL.steelDark);
          g.rect(-3, -3, 6, 6, lit ? PAL.core : PAL.amber);
          g.line(-9, -9, -6, -6, PAL.cyan);
        }).base;
      art = { base: mk(false), lit: mk(true) };
      break;
    }
    case 'sensor': {
      const h = SENSOR_SIZE / 2;
      const mk = (lit: boolean) => {
        const g = new PixelGrid(SENSOR_SIZE + 4, SENSOR_SIZE + 4, h + 2, h + 2);
        const c = lit ? PAL.core : PAL.cyan;
        for (let i = -h; i < h; i += 3) {
          g.set(i + g.ox, -h + g.oy, c);
          g.set(i + g.ox, h - 1 + g.oy, c);
          g.set(-h + g.ox, i + g.oy, c);
          g.set(h - 1 + g.ox, i + g.oy, c);
        }
        g.circle(0, 0, 2.5, c);
        return g.toSprite();
      };
      art = { base: mk(false), lit: mk(true) };
      break;
    }
  }
  cache.set(type, art);
  return art;
}

/** Ícone de loja: o próprio sprite, ampliado com nearest-neighbor. */
export function deviceIcon(type: DeviceType, size = 40): HTMLCanvasElement {
  const art = deviceArt(type);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const parts: Sprite[] = [art.base];
  if (art.moving) parts.push(art.moving);
  const s = art.base.canvas;
  const span = Math.max(s.width, s.height, art.moving ? art.moving.canvas.width : 0);
  const scale = Math.max(1, Math.floor((size - 4) / span)) || 1;
  const k = Math.min(scale, (size - 4) / span);
  ctx.translate(size / 2, size / 2);
  ctx.scale(k, k);
  if (type === 'gate' || type === 'arm') {
    const m = art.moving!;
    const pivot = DEVICES[type].pivot!;
    ctx.drawImage(m.canvas, pivot.x - m.ox, pivot.y - m.oy);
  }
  if (type === 'sensor') ctx.drawImage(s, -art.base.ox, -art.base.oy);
  else ctx.drawImage(s, -art.base.ox, -art.base.oy);
  if (type === 'lift') {
    ctx.fillStyle = 'rgba(85,215,232,0.35)';
    ctx.fillRect(-7, -16, 14, 12);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Fundo
// ---------------------------------------------------------------------------

export interface BackgroundArt {
  far: HTMLCanvasElement;
  near: HTMLCanvasElement;
  nebula: HTMLCanvasElement;
  nebulaScale: number;
  planets: { sprite: Sprite; x: number; y: number; par: number }[];
}

function starTile(size: number, density: number, colors: string[], seed: number, big: boolean) {
  const g = new PixelGrid(size, size);
  const rng = new Rng(seed);
  const n = Math.floor(size * size * density);
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, size - 1);
    const y = rng.int(0, size - 1);
    const c = rng.pick(colors);
    const dim = rng.chance(0.6);
    g.set(x, y, dim ? mix(c, '#0B1026', 0.55) : c);
    if (big && rng.chance(0.08)) {
      g.set(x + 1, y, mix(c, '#0B1026', 0.5));
      g.set(x - 1, y, mix(c, '#0B1026', 0.5));
      g.set(x, y + 1, mix(c, '#0B1026', 0.5));
      g.set(x, y - 1, mix(c, '#0B1026', 0.5));
    }
  }
  return g.toSprite().canvas;
}

function planet(r: number, colors: [string, string], ring: boolean, seed: number): Sprite {
  const pad = ring ? Math.ceil(r * 0.9) : 2;
  const g = new PixelGrid(r * 2 + pad * 2, r * 2 + pad * 2, r + pad, r + pad);
  g.circle(0, 0, r, (x, y) => {
    const l = (-x * 0.7 - y * 0.5) / r;
    const band = valueNoise(0, y / 3 + 10, seed) > 0.55;
    const t = l + (bayer(Math.floor(x + 50), Math.floor(y + 50)) - 0.5) * 0.4;
    if (t < -0.35) return mix(colors[1], '#0B1026', 0.5);
    if (t < 0.05) return band ? mix(colors[1], colors[0], 0.3) : colors[1];
    return band ? mix(colors[0], '#FFFFFF', 0.15) : colors[0];
  });
  if (ring) {
    for (let a = 0; a < Math.PI * 2; a += 0.01) {
      const x = Math.cos(a) * r * 1.7;
      const y = Math.sin(a) * r * 0.42;
      const front = Math.sin(a) > 0;
      if (!front && Math.hypot(x, y) < r) continue;
      g.set(Math.floor(x + g.ox), Math.floor(y + g.oy - x * 0.12), mix(colors[0], '#FFFFFF', 0.3));
    }
  }
  return g.toSprite();
}

export function makeBackground(zone: ZoneData): BackgroundArt {
  const t: Theme = THEMES[zone.theme];
  const seed = zone.id * 977;
  const far = starTile(256, 0.0045, t.stars, seed + 1, false);
  const near = starTile(320, 0.0016, t.stars, seed + 2, true);
  const scaleN = 4;
  const nw = Math.ceil(zone.width / scaleN) + 40;
  const nh = Math.ceil(zone.height / scaleN) + 30;
  const g = new PixelGrid(nw, nh);
  const neb = t.nebula;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const n = valueNoise(x / 22, y / 16, seed) * 0.6 + valueNoise(x / 9, y / 9, seed + 9) * 0.4;
      const v = n - 0.45 + (bayer(x, y) - 0.5) * 0.12;
      if (v < 0) continue;
      const c = v > 0.22 ? neb[2] : v > 0.1 ? neb[1] : neb[0];
      g.set(x, y, c, v > 0.1 ? 120 : 80);
    }
  }
  const rng = new Rng(seed + 5);
  const planets: BackgroundArt['planets'] = [];
  planets.push({
    sprite: planet(rng.int(9, 14), t.planet, rng.chance(0.6), seed),
    x: rng.range(0.55, 0.85) * zone.width,
    y: rng.range(0.08, 0.25) * zone.height,
    par: 0.12,
  });
  if (rng.chance(0.6))
    planets.push({
      sprite: planet(rng.int(4, 6), [t.nebula[1], t.nebula[0]], false, seed + 3),
      x: rng.range(0.15, 0.45) * zone.width,
      y: rng.range(0.05, 0.18) * zone.height,
      par: 0.06,
    });
  return { far, near, nebula: g.toSprite().canvas, nebulaScale: scaleN, planets };
}

export function rotatePoint(x: number, y: number, a: number) {
  return rot({ x, y }, a);
}
