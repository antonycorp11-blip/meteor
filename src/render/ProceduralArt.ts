import type { Poly, Vec } from '../core/geometry';
import { Rng, hash2 } from '../core/rng';
import { ARM_LENGTH, DEVICES, SENSOR_SIZE } from '../machines/catalog';
import type { DeviceType } from '../machines/types';
import type { FragmentTypeId } from '../physics/fragmentTypes';
import type { ZoneData } from '../world/types';
import { terrainPolys } from '../world/Terrain';
import { BRASS, METAL, PAL, THEMES, hexToRgb, mix, ramp, type Theme } from './palette';
import { PixelGrid, makeCanvas, type Sprite } from './PixelSprite';

// ---------------------------------------------------------------------------
// Ruído e utilidades
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

function fbm(x: number, y: number, seed: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += valueNoise(x * f, y * f, seed + i * 17) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

/** Transformada de distância chanfrada (3-4) em pixels. */
function chamfer(mask: Uint8Array, W: number, H: number, target: 0 | 1): Float32Array {
  const d = new Float32Array(W * H);
  const INF = 1e7;
  for (let i = 0; i < W * H; i++) d[i] = mask[i] === target ? INF : 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - W] + 3);
        if (x > 0) v = Math.min(v, d[i - W - 1] + 4);
        if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < H - 1) {
        v = Math.min(v, d[i + W] + 3);
        if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + W - 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < W * H; i++) d[i] = d[i] >= INF ? 999 : d[i] / 3;
  return d;
}

const LIGHT = { x: -0.55, y: -0.83 };

/** Esboço de um cristal hexagonal (prisma) de pixels. */
function drawCrystal(set: (x: number, y: number, c: string) => void, cx: number, cy: number, h: number, w: number, lean: number, cols: [string, string, string, string]) {
  for (let j = 0; j < h; j++) {
    const t = j / Math.max(1, h - 1);
    const half = j < 2 ? Math.max(0.5, (j + 0.5) * (w / 4)) : w / 2;
    const ox = cx + lean * (h - j);
    for (let i = -Math.ceil(half); i <= Math.ceil(half); i++) {
      if (Math.abs(i) > half + 0.2) continue;
      const side = i < 0 ? 2 : i === 0 ? 3 : 1;
      let c = cols[side];
      if (j === 0) c = cols[3];
      if (t > 0.85) c = cols[0];
      set(Math.round(ox + i), Math.round(cy - h + j), c);
    }
  }
}

// ---------------------------------------------------------------------------
// Terreno: ilhas de rocha com silhueta orgânica, blocos, borda iluminada,
// gotejamentos pendentes e cristais luminosos.
// ---------------------------------------------------------------------------

export interface TerrainArt {
  tex: HTMLCanvasElement;
  /** brilho dos cristais (1/4 da resolução do mundo) */
  glow: HTMLCanvasElement;
}

export const GLOW_SCALE = 4;

export function makeTerrainArt(zone: ZoneData, highContrast = false): TerrainArt {
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
  const seed = zone.id * 131 + 7;

  // --- silhueta visual: erosão nas laterais, saliências e gotejamentos embaixo
  const dIn = chamfer(mask, W, H, 1);
  const dOut = chamfer(mask, W, H, 0);
  const at = (f: Float32Array, x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 999 : f[y * W + x]);
  const vis = new Uint8Array(mask);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (mask[i]) {
        const d = dIn[i];
        if (d > 4) continue;
        // normal para fora = −∇d
        const nx = at(dIn, x - 1, y) - at(dIn, x + 1, y);
        const ny = at(dIn, x, y - 1) - at(dIn, x, y + 1);
        const l = Math.hypot(nx, ny) || 1;
        const oy = ny / l;
        if (oy < -0.6) continue; // topos permanecem lisos (superfície de apoio)
        const er = Math.max(0, fbm(x / 7, y / 7, seed, 3) - 0.42) * 7;
        if (d < er) vis[i] = 0;
      } else {
        const d = dOut[i];
        if (d > 14) continue;
        const nx = at(dOut, x + 1, y) - at(dOut, x - 1, y);
        const ny = at(dOut, x, y + 1) - at(dOut, x, y - 1);
        const l = Math.hypot(nx, ny) || 1;
        const ox = nx / l;
        const oy = ny / l;
        if (oy > 0.65) {
          // gotejamentos sob a rocha
          const n = valueNoise(x / 3.2, 3.3, seed + 5);
          const len = Math.max(0, n - 0.5) * 30 + (hash2(x, 9, seed) > 0.93 ? 4 : 0);
          if (d < len) vis[i] = 1;
        } else if (Math.abs(ox) > 0.55) {
          const b = Math.max(0, fbm(x / 6, y / 6, seed + 3, 3) - 0.55) * 7;
          if (d < b) vis[i] = 1;
        }
      }
    }
  }

  // --- sombreamento: aglomerado de meteoros (esferas com crateras e veios)
  const dv = chamfer(vis, W, H, 1);
  const rock = theme.rock.map(hexToRgb);
  const line = hexToRgb(theme.rockLine);
  const rim = hexToRgb(highContrast ? '#e8e4ff' : theme.rim);
  const dust = hexToRgb(theme.dust);
  const lava = [hexToRgb('#ff6a1e'), hexToRgb('#ffb34b'), hexToRgb('#fff0c0')];
  const out = new Uint8ClampedArray(W * H * 4);
  const glow = makeCanvas(Math.ceil(W / GLOW_SCALE), Math.ceil(H / GLOW_SCALE));
  const gctx = glow.getContext('2d')!;
  const glowPts: Vec[] = [];
  const S = 30; // tamanho médio de cada meteoro
  const L3 = { x: -0.45, y: -0.65, z: 0.6 };
  const seedAt = (cx: number, cy: number) => ({
    x: (cx + 0.2 + hash2(cx, cy, seed + 11) * 0.6) * S,
    y: (cy + 0.2 + hash2(cx, cy, seed + 12) * 0.6) * S,
    r: S * (0.55 + hash2(cx, cy, seed + 13) * 0.3),
    id: cx * 7919 + cy,
  });
  // planetas distantes: alvenaria dos Construtores com glifos que ainda brilham
  const ruins = zone.theme === 'ion' || zone.theme === 'cathedral';
  const glyphCol = hexToRgb(theme.crystal[2]);
  const glyphHot = hexToRgb(theme.crystal[3]);
  const BW = 34;
  const BH = 16;
  const ruinPixel = (x: number, y: number, d: number, i: number): number[] => {
    const nx = at(dv, x - 1, y) - at(dv, x + 1, y);
    const ny = at(dv, x, y - 1) - at(dv, x, y + 1);
    const l = Math.hypot(nx, ny) || 1;
    const facing = d < 7 ? (nx / l) * LIGHT.x + (ny / l) * LIGHT.y : 0;
    const oy = d < 7 ? ny / l : 0;
    const row = Math.floor(y / BH);
    const off = (row % 2) * (BW / 2) + Math.floor(hash2(row, 1, seed + 90) * 6);
    const col = Math.floor((x + off) / BW);
    const lx = x + off - col * BW;
    const ly = y - row * BH;
    const id = col * 7919 + row * 31;
    const hb = hash2(col, row, seed + 91);
    const depth = Math.min(1, d / 90);
    let t = 0.42 + (hb - 0.5) * 0.18 - depth * 0.25 + (fbm(x / 70, y / 50, seed + 50, 2) - 0.5) * 0.25 + (bayer(x, y) - 0.5) * 0.08;
    const mortar = lx < 1 || ly < 1;
    if (mortar) t -= 0.38;
    else if (lx < 3 || ly < 3) t += 0.14;
    else if (lx > BW - 3 || ly > BH - 3) t -= 0.12;
    // blocos rachados ou faltando
    if (hb > 0.94 && d > 6) t -= 0.3;
    else if (hb > 0.88 && !mortar && Math.abs(lx - ly * 1.6 - hash2(id, 2, seed) * 10) < 0.8) t -= 0.3;
    if (d < 5 && facing > 0.3) t += 0.3 * (1 - d / 5) + 0.08;
    if (d < 6 && facing < -0.35) t -= 0.2;
    let c = rock[Math.max(0, Math.min(5, Math.floor(t * 6)))];
    if (d < 3.2 && facing > 0.45) c = rim;
    if (d < 2.6 && oy < -0.75 && hash2(x >> 1, y, seed + 21) > 0.4) c = dust;
    // glifos gravados (alguns blocos) e um duto de energia a cada tantas fiadas
    if (d > 5 && !mortar) {
      if (hb > 0.8 && hb < 0.86 && lx > 7 && lx < BW - 7 && ly > 4 && ly < BH - 4) {
        const gx = Math.floor((lx - 7) / 2);
        const gy = Math.floor((ly - 4) / 2);
        const on = hash2(id + gx, gy, seed + 92) > 0.55 && (gx + gy) % 2 === 0;
        if (on) {
          c = (x + y) % 5 === 0 ? glyphHot : glyphCol;
          if ((x * 7 + y) % 13 === 0) glowPts.push({ x, y });
        }
      } else if (row % 9 === 4 && ly === 8 && hash2(col, 5, seed + 93) > 0.45) {
        c = glyphCol;
        if (x % 14 === 0) glowPts.push({ x, y });
      }
    }
    void i;
    return c;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!vis[i]) continue;
      const d = dv[i];
      let c: number[];
      if (d < 1.2) c = line;
      else if (ruins) c = ruinPixel(x, y, d, i);
      else {
        let facing = 0;
        let oy = 0;
        if (d < 7) {
          const nx = at(dv, x - 1, y) - at(dv, x + 1, y);
          const ny = at(dv, x, y - 1) - at(dv, x, y + 1);
          const l = Math.hypot(nx, ny) || 1;
          facing = (nx / l) * LIGHT.x + (ny / l) * LIGHT.y;
          oy = ny / l;
        }
        const gx = Math.floor(x / S);
        const gy = Math.floor(y / S);
        let d1 = 1e9;
        let d2 = 1e9;
        let best = seedAt(gx, gy);
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++) {
            const sd = seedAt(gx + k, gy + j);
            // distância normalizada pelo raio: meteoros maiores "vencem"
            const dd = Math.hypot(x - sd.x, y - sd.y) / sd.r;
            if (dd < d1) {
              d2 = d1;
              d1 = dd;
              best = sd;
            } else if (dd < d2) d2 = dd;
          }
        const crevice = (d2 - d1) * best.r < 2.2;
        // esfera: normal a partir do centro do meteoro
        const ux = (x - best.x) / best.r;
        const uy = (y - best.y) / best.r;
        const uu = Math.min(1, ux * ux + uy * uy);
        const nz = Math.sqrt(1 - uu);
        let lam = ux * L3.x + uy * L3.y + nz * L3.z;
        // crateras pequenas dentro de cada meteoro
        for (let q = 0; q < 2; q++) {
          if (hash2(best.id, q, seed + 40) < 0.45) continue;
          const ca = hash2(best.id, q, seed + 41) * Math.PI * 2;
          const cd = hash2(best.id, q, seed + 42) * 0.55 * best.r;
          const cr = best.r * (0.16 + hash2(best.id, q, seed + 43) * 0.14);
          const cx = best.x + Math.cos(ca) * cd;
          const cy = best.y + Math.sin(ca) * cd;
          const dd = Math.hypot(x - cx, y - cy);
          if (dd < cr) {
            const inner = ((x - cx) * -LIGHT.x + (y - cy) * -LIGHT.y) / cr;
            lam = inner > 0.3 ? lam + 0.25 : lam - 0.35;
          } else if (dd < cr + 1.2) lam += 0.12;
        }
        const depth = Math.min(1, d / 80);
        let t = 0.3 + lam * 0.55 + (hash2(best.id, 3, seed) - 0.5) * 0.16 - depth * 0.22 + (fbm(x / 60, y / 50, seed + 50, 2) - 0.5) * 0.25;
        t += (bayer(x, y) - 0.5) * 0.1;
        if (crevice) t -= 0.35;
        if (d < 5 && facing > 0.3) t += 0.3 * (1 - d / 5) + 0.08;
        if (d < 6 && facing < -0.35) t -= 0.2;
        const idx = Math.max(0, Math.min(5, Math.floor(t * 6)));
        c = rock[idx];
        if (d < 3.2 && facing > 0.45) c = rim;
        if (d < 2.6 && oy < -0.75 && hash2(x >> 1, y, seed + 21) > 0.35) c = dust;
        // veios de magma em alguns meteoros
        if (!crevice && d > 4 && hash2(best.id, 9, seed) > 0.9) {
          const v = Math.abs(fbm(x / 9 + best.id, y / 9, seed + 60, 3) - 0.5);
          if (v < 0.014) {
            c = lava[v < 0.008 ? 2 : 1];
            if ((x + y * 3) % 23 === 0) glowPts.push({ x, y });
          } else if (v < 0.024) c = lava[0];
        }
      }
      const o = i * 4;
      out[o] = c[0];
      out[o + 1] = c[1];
      out[o + 2] = c[2];
      out[o + 3] = 255;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  const lavaGlow = (px: number, py: number, color: string, r: number, a: number) => {
    const gx = px / GLOW_SCALE;
    const gy = py / GLOW_SCALE;
    const grad = gctx.createRadialGradient(gx, gy, 0, gx, gy, r);
    const [rr, gg, bb] = hexToRgb(color);
    grad.addColorStop(0, `rgba(${rr},${gg},${bb},${a})`);
    grad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
    gctx.fillStyle = grad;
    gctx.fillRect(gx - r, gy - r, r * 2, r * 2);
  };
  for (const p of glowPts) lavaGlow(p.x, p.y, ruins ? theme.crystal[2] : '#ff6a1e', 4, ruins ? 0.3 : 0.22);

  // --- poucos cristais embutidos (com brilho)
  const rng = new Rng(seed + 77);
  let area = 0;
  for (let i = 0; i < W * H; i++) area += vis[i];
  const nClusters = Math.floor(area / 26000);
  const setPx = (px: number, py: number, col: string) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    ctx.fillStyle = col;
    ctx.fillRect(px, py, 1, 1);
  };
  let placed = 0;
  for (let tries = 0; tries < nClusters * 30 && placed < nClusters; tries++) {
    const x = rng.int(4, W - 5);
    const y = rng.int(8, H - 5);
    const i = y * W + x;
    if (!vis[i]) continue;
    const d = dv[i];
    if (d < 4 || d > 34) continue;
    placed++;
    const n = rng.int(2, 4);
    for (let k = 0; k < n; k++) {
      drawCrystal(setPx, x + rng.int(-4, 4), y + rng.int(-1, 3), rng.int(4, 8), rng.int(2, 4), rng.range(-0.3, 0.3), theme.crystal);
    }
    lavaGlow(x, y, theme.crystal[2], 7, 0.4);
  }
  return { tex: canvas, glow };
}

// ---------------------------------------------------------------------------
// Asteroide-fonte
// ---------------------------------------------------------------------------

export interface AsteroidArt {
  base: Sprite;
  glow: Sprite;
}

export function makeAsteroid(r: number, seed: number): AsteroidArt {
  const pad = 8;
  const size = r * 2 + pad * 2;
  const g = new PixelGrid(size, size, size / 2, size / 2);
  const glow = new PixelGrid(size, size, size / 2, size / 2);
  const rng = new Rng(seed);
  const ramp6 = ['#140c18', '#24152a', '#36203a', '#4a2e4a', '#62405c', '#7e5a70'];
  const radiusAt = (a: number) => r * (1 + 0.07 * (fbm(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, seed, 3) - 0.5) * 2);
  const S = 9;
  for (let y = -r - pad; y < r + pad; y++) {
    for (let x = -r - pad; x < r + pad; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dd = Math.hypot(px, py);
      const a = Math.atan2(py, px);
      const R = radiusAt(a);
      if (dd > R) continue;
      // esfera iluminada de cima/esquerda + blocos
      const nz = Math.sqrt(Math.max(0, 1 - (dd / R) ** 2));
      const lambert = (px / R) * LIGHT.x + (py / R) * LIGHT.y + nz * 0.6;
      const gx = Math.floor((x + 100) / S);
      const gy = Math.floor((y + 100) / S);
      let d1 = 1e9;
      let d2 = 1e9;
      let bid = 0;
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const sx = (gx + k + 0.2 + hash2(gx + k, gy + j, seed) * 0.6) * S - 100;
          const sy = (gy + j + 0.2 + hash2(gx + k, gy + j, seed + 1) * 0.6) * S - 100;
          const q = (x - sx) ** 2 + (y - sy) ** 2;
          if (q < d1) {
            d2 = d1;
            d1 = q;
            bid = (gx + k) * 31 + gy + j;
          } else if (q < d2) d2 = q;
        }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      let t = 0.25 + lambert * 0.45 + (hash2(bid, 1, seed) - 0.5) * 0.18 + (bayer(x, y) - 0.5) * 0.12;
      if (edge < 1.2) t -= 0.2;
      if (dd > R - 1.3) t = 0;
      g.set(x + g.ox, y + g.oy, ramp6[Math.max(0, Math.min(5, Math.floor(t * 6)))]);
    }
  }
  // crateras
  for (let k = 0; k < 7; k++) {
    const a = rng.next() * Math.PI * 2;
    const dd = rng.range(0, r * 0.6);
    const cr = rng.range(3, r * 0.17);
    const cx = Math.cos(a) * dd;
    const cy = Math.sin(a) * dd;
    g.circle(cx, cy, cr, (x, y) => {
      const rimv = ((x - cx) * -LIGHT.x + (y - cy) * -LIGHT.y) / cr;
      return rimv > 0.45 ? ramp6[4] : rimv < -0.3 ? ramp6[0] : ramp6[1];
    });
  }
  // fissuras luminosas e minério hexagonal (camada de brilho separada para pulsar)
  for (let k = 0; k < 7; k++) {
    let a = rng.next() * Math.PI * 2;
    let x = Math.cos(a) * r * 0.1;
    let y = Math.sin(a) * r * 0.1;
    const len = rng.int(Math.floor(r * 0.55), Math.floor(r * 1.0));
    for (let s = 0; s < len; s++) {
      if (Math.hypot(x, y) > r - 3) break;
      const fx = Math.floor(x);
      const fy = Math.floor(y);
      g.set(fx + g.ox, fy + g.oy, '#5a1a10');
      glow.set(fx + glow.ox, fy + glow.oy, s % 6 === 0 ? '#fff0c0' : '#ff8a2a');
      if (s % 2 === 0) glow.set(fx + glow.ox + 1, fy + glow.oy, '#d8501a', 200);
      a += rng.range(-0.55, 0.55);
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  const crystal: [string, string, string, string] = ['#8a3410', '#e06a1e', '#ffb34b', '#fff0c0'];
  const setG = (px: number, py: number, c: string) => glow.set(px + glow.ox, py + glow.oy, c);
  for (let k = 0; k < 9; k++) {
    const a = rng.next() * Math.PI * 2;
    const dd = rng.range(r * 0.15, r * 0.8);
    drawCrystal(setG, Math.round(Math.cos(a) * dd), Math.round(Math.sin(a) * dd) + 4, rng.int(4, 7), rng.int(2, 4), rng.range(-0.3, 0.3), crystal);
  }
  g.outline('#08040c');
  return { base: g.toSprite(), glow: glow.toSprite() };
}

// ---------------------------------------------------------------------------
// Buraco negro: disco de acreção em espiral (quadros pré-renderizados)
// ---------------------------------------------------------------------------

export interface BlackHoleArt {
  frames: Sprite[];
  core: Sprite;
}

const DISK = ['#24104a', '#3c1672', '#5a1e98', '#8a2cba', '#c048d0', '#ea78cc', '#ffa08a', '#ffd27a', '#fff4d8'];

export function makeBlackHole(absorb: number): BlackHoleArt {
  const core = absorb + 1.5;
  const R = absorb + 42;
  const N = 16;
  const frames: Sprite[] = [];
  for (let f = 0; f < N; f++) {
    const phase = (f / N) * Math.PI * 2;
    const g = new PixelGrid(R * 2 + 2, R * 2 + 2, R + 1, R + 1);
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const d = Math.hypot(px, py);
        if (d > R || d < core) continue;
        const a = Math.atan2(py, px);
        const u = (d - core) / (R - core); // 0 no centro → 1 na borda
        const arms = 0.5 + 0.5 * Math.sin(2 * a - Math.log(d / core) * 5.2 + phase);
        const fine = 0.5 + 0.5 * Math.sin(5 * a - Math.log(d / core) * 9 - phase * 2);
        const fall = Math.pow(1 - u, 1.15);
        let v = fall * (0.35 + Math.pow(arms, 2.2) * 0.75 + fine * 0.12) + (u < 0.1 ? (0.1 - u) * 6 : 0);
        v += (bayer(x + 64, y + 64) - 0.5) * 0.16;
        if (v < 0.14) continue;
        g.set(x + g.ox, y + g.oy, DISK[Math.max(0, Math.min(DISK.length - 1, Math.floor(v * DISK.length * 0.9)))]);
      }
    }
    frames.push(g.toSprite());
  }
  const cg = new PixelGrid(Math.ceil(core) * 2 + 4, Math.ceil(core) * 2 + 4, Math.ceil(core) + 2, Math.ceil(core) + 2);
  cg.circle(0, 0, core + 0.8, (x, y) => {
    const d = Math.hypot(x, y);
    return d > core - 0.2 ? '#fff4d8' : d > core - 1.4 ? '#ffb34b' : '#000000';
  });
  return { frames, core: cg.toSprite() };
}

// ---------------------------------------------------------------------------
// Fragmentos: minério facetado
// ---------------------------------------------------------------------------

const FRAG_RAMPS: Record<FragmentTypeId, [string, string, string, string, string]> = {
  // contorno, sombra, corpo, luz, brilho
  common: ['#3a1408', '#a8461a', '#f07e24', '#ffb84a', '#fff0c0'],
  porous: ['#3a2618', '#8a6a48', '#c8a070', '#ecd0a0', '#fff6e0'],
  dense: ['#1e0a08', '#5a2014', '#8a3a1e', '#c06030', '#ffb070'],
  metallic: ['#10161e', '#3e5468', '#7890a8', '#b8cce0', '#ffffff'],
  glass: ['#0a2a34', '#1f7a8a', '#3cc0d0', '#9cf4ff', '#ffffff'],
  unstable: ['#2a0610', '#8a1a2a', '#e0304a', '#ff7a6a', '#ffe0a0'],
  rare: ['#1a0a34', '#5a2aa8', '#9a5af0', '#d8b0ff', '#ffffff'],
  shard: ['#0a2a34', '#1f7a8a', '#3cc0d0', '#9cf4ff', '#ffffff'],
};

export function fragmentGlowColor(type: FragmentTypeId): string {
  return FRAG_RAMPS[type][2];
}

export function makeFragmentSprite(type: FragmentTypeId, local: Poly, radius: number, seed: number): Sprite {
  const [outline, shadow, body, light, shine] = FRAG_RAMPS[type];
  const s = Math.ceil(radius) * 2 + 4;
  const g = new PixelGrid(s, s, s / 2, s / 2);
  // centro das facetas deslocado para a luz
  const c: Vec = { x: LIGHT.x * radius * 0.25, y: LIGHT.y * radius * 0.25 };
  const n = local.length;
  g.poly(local, (x, y) => {
    // faceta = setor do polígono a partir do centro deslocado
    const a = Math.atan2(y - c.y, x - c.x);
    let best = 0;
    let bd = 1e9;
    for (let i = 0; i < n; i++) {
      const p = local[i];
      const q = local[(i + 1) % n];
      const mx = (p.x + q.x) / 2 - c.x;
      const my = (p.y + q.y) / 2 - c.y;
      const da = Math.abs(((Math.atan2(my, mx) - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < bd) {
        bd = da;
        best = i;
      }
    }
    const p = local[best];
    const q = local[(best + 1) % n];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const l = Math.hypot(ex, ey) || 1;
    // normal externa da aresta → luz da faceta
    const nx = ey / l;
    const ny = -ex / l;
    const lit = nx * LIGHT.x + ny * LIGHT.y;
    const center = Math.hypot(x - c.x, y - c.y) < radius * 0.32;
    if (type === 'porous' && hash2(Math.floor(x * 2) + 40, Math.floor(y * 2) + 40, seed) > 0.8) return shadow;
    if (type === 'dense' && hash2(Math.floor(x) + 40, Math.floor(y) + 40, seed) > 0.85) return light;
    if (center) return lit > -0.2 ? light : body;
    return lit > 0.45 ? light : lit > -0.25 ? body : shadow;
  });
  g.outline(outline);
  // brilho especular
  g.set(Math.round(g.ox + c.x - 1), Math.round(g.oy + c.y - 1), shine);
  if (radius > 5) g.set(Math.round(g.ox + c.x), Math.round(g.oy + c.y - 1), shine);
  if (type === 'unstable') g.set(g.ox, g.oy + 1, '#fff6c0');
  return g.toSprite();
}

/** Sprite radial suave reaproveitado para brilhos. */
export function makeGlowSprite(color: string, size = 32): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const [r, g, b] = hexToRgb(color);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// ---------------------------------------------------------------------------
// Dispositivos
// ---------------------------------------------------------------------------

export interface DeviceArt {
  base: Sprite;
  frames?: Sprite[];
  moving?: Sprite;
  lit?: Sprite;
  /** pontos de luz locais (para o bloom) */
  lights: { x: number; y: number; color: string; size: number }[];
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

function bounds(poly: Poly) {
  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const q of poly) {
    minY = Math.min(minY, q.y);
    maxY = Math.max(maxY, q.y);
    minX = Math.min(minX, q.x);
    maxX = Math.max(maxX, q.x);
  }
  return { minX, maxX, minY, maxY };
}

/** Metal com volume: topo claro, base escura. */
function metal(poly: Poly, cols = METAL) {
  const b = bounds(poly);
  return (x: number, y: number) => {
    const t = (y - b.minY) / Math.max(1, b.maxY - b.minY);
    const sx = (x - b.minX) / Math.max(1, b.maxX - b.minX);
    if (t < 0.18) return cols[5];
    if (t < 0.4) return cols[4];
    if (t > 0.8) return cols[1];
    return sx < 0.08 ? cols[4] : cols[3];
  };
}

function finish(g: PixelGrid) {
  g.outline('#06080e');
  return g.toSprite();
}

const cache = new Map<DeviceType, DeviceArt>();

export function deviceArt(type: DeviceType): DeviceArt {
  const hit = cache.get(type);
  if (hit) return hit;
  const def = DEVICES[type];
  const solids = def.solids({});
  let art: DeviceArt;
  switch (type) {
    case 'plank': {
      // viga treliçada
      const g = gridFor(solids);
      g.poly(solids[0], metal(solids[0]));
      for (let x = -30; x < 30; x += 6) g.line(x, -1, x + 3, 2, METAL[2]);
      for (let x = -28; x <= 28; x += 14) g.set(x + g.ox, g.oy, BRASS[4]);
      art = { base: finish(g), lights: [] };
      break;
    }
    case 'ramp': {
      const g = gridFor(solids);
      for (const s of solids) g.poly(s, metal(s, BRASS));
      for (const s of solids) g.line(s[0].x, s[0].y, s[1].x, s[1].y, BRASS[5]);
      art = { base: finish(g), lights: [] };
      break;
    }
    case 'funnel': {
      const g = gridFor(solids);
      for (const w of solids) g.poly(w, metal(w, BRASS));
      g.line(-37, -18, -13, 8, BRASS[5]);
      g.line(37, -18, 13, 8, BRASS[5]);
      g.set(g.ox - 11, g.oy + 7, PAL.core);
      g.set(g.ox + 11, g.oy + 7, PAL.core);
      art = { base: finish(g), lights: [{ x: 0, y: 6, color: PAL.amber, size: 12 }] };
      break;
    }
    case 'spring': {
      // placa de pulso: base blindada com emissores e lâmina de luz dura no topo (y −4..4)
      const mk = (lit: boolean) => {
        const g = gridFor(solids);
        g.rect(-21, 0, 42, 4, METAL[1]);
        g.line(-21, 0, 20, 0, METAL[3]);
        g.line(-21, 3, 20, 3, METAL[0]);
        for (const cx of [-15, -5, 5, 15]) {
          g.rect(cx - 2, 1, 4, 2, lit ? '#ffffff' : '#1f9ab0');
          g.set(g.ox + cx - 1, g.oy + 1, lit ? '#ffffff' : PAL.cyan);
        }
        g.set(g.ox - 21, g.oy + 1, PAL.core);
        g.set(g.ox + 20, g.oy + 1, PAL.core);
        // lâmina de luz dura, separada da base por uma fresta
        g.rect(-20, -4, 40, 2, lit ? '#e8ffff' : PAL.cyan);
        g.line(-19, -4, 18, -4, lit ? '#ffffff' : '#bff6ff');
        for (const cx of [-10, 0, 10]) g.set(g.ox + cx, g.oy - 3, lit ? '#ffffff' : '#1f9ab0');
        return finish(g);
      };
      art = { base: mk(false), lit: mk(true), lights: [{ x: 0, y: -3, color: PAL.cyan, size: 22 }] };
      break;
    }
    case 'booster': {
      const mk = (lit: boolean) => {
        const g = gridFor(solids);
        g.poly(solids[0], metal(solids[0]));
        for (let x = -14; x <= 10; x += 8) {
          const c = lit ? '#ffffff' : PAL.cyan;
          g.line(x, -2, x + 3, 0, c);
          g.line(x + 3, 0, x, 2, c);
        }
        return finish(g);
      };
      art = { base: mk(false), lit: mk(true), lights: [{ x: 0, y: 0, color: PAL.cyan, size: 16 }] };
      break;
    }
    case 'launcher': {
      const mk = (lit: boolean) => {
        const g = gridFor(solids);
        for (const s of solids) g.poly(s, metal(s, BRASS));
        g.line(-14, 7, 14, 7, lit ? '#ffffff' : PAL.cyan);
        g.line(-14, 8, 14, 8, lit ? PAL.core : '#1f9ab0');
        g.set(g.ox - 14, g.oy - 4, PAL.core);
        g.set(g.ox + 13, g.oy - 8, PAL.core);
        return finish(g);
      };
      art = { base: mk(false), lit: mk(true), lights: [{ x: 0, y: 6, color: PAL.cyan, size: 18 }, { x: 13, y: -8, color: PAL.amber, size: 8 }] };
      break;
    }
    case 'fan': {
      const frames: Sprite[] = [];
      for (let f = 0; f < 3; f++) {
        const g = gridFor([...solids, [{ x: 7, y: -11 }, { x: 11, y: -11 }, { x: 11, y: 11 }, { x: 7, y: 11 }]]);
        for (const p of solids) g.poly(p, metal(p));
        g.rect(-3, -8, 6, 16, METAL[1]);
        for (let k = 0; k < 4; k++) {
          const yy = -9 + ((k * 5 + f * 2) % 18);
          g.rect(7, yy, 3, 2, '#d8f6ff');
        }
        g.rect(-5, -10, 1, 20, PAL.cyan);
        frames.push(finish(g));
      }
      art = { base: frames[0], frames, lights: [{ x: 8, y: 0, color: PAL.cyan, size: 18 }] };
      break;
    }
    case 'gate': {
      const posts = solids.slice(0, 2);
      const g = gridFor(posts);
      for (const p of posts) g.poly(p, metal(p));
      g.set(g.ox - 28, g.oy - 3, PAL.core);
      g.set(g.ox + 28, g.oy - 3, PAL.core);
      const bar = solids[2].map((q) => ({ x: q.x + 25, y: q.y }));
      const gb = gridFor([bar], 2);
      gb.poly(bar, (x, y) => (Math.floor((x + 50) / 5) % 2 ? (y < 0 ? '#ffd27a' : PAL.amber) : '#1a1222'));
      art = { base: finish(g), moving: finish(gb), lights: [{ x: -28, y: -3, color: PAL.amber, size: 8 }, { x: 28, y: -3, color: PAL.amber, size: 8 }] };
      break;
    }
    case 'conveyor': {
      const frames: Sprite[] = [];
      for (let f = 0; f < 4; f++) {
        const g = gridFor(solids);
        g.poly(solids[0], (_x, y) => (y < -2.5 ? '#3a4458' : y > 2 ? '#141a26' : '#222a3a'));
        for (let x = -40 + f * 2; x < 42; x += 8) g.line(x, -3, x + 1, -3, PAL.cyan);
        for (let x = -36; x <= 36; x += 12) g.circle(x, 1, 2, BRASS[3]);
        frames.push(finish(g));
      }
      art = { base: frames[0], frames, lights: [{ x: 0, y: -3, color: PAL.cyan, size: 24 }] };
      break;
    }
    case 'damper': {
      const g = gridFor(solids);
      g.poly(solids[0], (_x, y) => (y < -2 ? '#c8b8ff' : y < 0 ? '#8a7ac8' : y < 2 ? PAL.lilac : METAL[1]));
      art = { base: finish(g), lights: [] };
      break;
    }
    case 'attractor':
    case 'repulsor': {
      const core = type === 'attractor' ? PAL.cyan : '#ff7a9a';
      const mk = (lit: boolean) => {
        const g = gridFor(solids);
        g.circle(0, 0, 8, (x, y) => {
          const d = Math.hypot(x, y);
          const l = (x * LIGHT.x + y * LIGHT.y) / 8;
          if (d > 6.2) return l > 0.2 ? BRASS[5] : BRASS[3];
          if (d > 3.6) return METAL[1];
          return lit ? '#ffffff' : d < 1.5 ? '#ffffff' : core;
        });
        return finish(g);
      };
      art = { base: mk(false), lit: mk(true), lights: [{ x: 0, y: 0, color: core, size: 26 }] };
      break;
    }
    case 'arm': {
      const g = gridFor([solids[0]]);
      g.poly(solids[0], metal(solids[0], BRASS));
      g.set(g.ox, g.oy, PAL.core);
      const armPoly = solids[1];
      const ga = gridFor([armPoly], 2);
      ga.poly(armPoly, metal(armPoly));
      ga.line(6, -3, ARM_LENGTH - 2, -3, '#d8ecff');
      ga.rect(ARM_LENGTH - 6, -2, 3, 3, PAL.amber);
      art = { base: finish(g), moving: finish(ga), lights: [{ x: 0, y: 0, color: PAL.amber, size: 10 }] };
      break;
    }
    case 'lift': {
      const mk = (lit: boolean) => {
        const g = gridFor(solids);
        g.poly(solids[0], metal(solids[0], BRASS));
        for (let x = -14; x <= 12; x += 6) g.rect(x, -4, 3, 1, lit ? '#ffffff' : PAL.cyan);
        return finish(g);
      };
      art = { base: mk(false), lit: mk(true), lights: [{ x: 0, y: -6, color: PAL.cyan, size: 30 }] };
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
      art = { base: mk(false), lit: mk(true), lights: [{ x: 0, y: 0, color: PAL.cyan, size: 12 }] };
      break;
    }
  }
  cache.set(type, art);
  return art;
}

/** Ícone de loja: o próprio sprite, ampliado com nearest-neighbor. */
export function deviceIcon(type: DeviceType, size = 48): HTMLCanvasElement {
  const art = deviceArt(type);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const s = art.base.canvas;
  const span = Math.max(s.width, s.height, art.moving ? art.moving.canvas.width + 20 : 0);
  const k = Math.max(1, Math.floor((size - 6) / span)) || 1;
  const fit = Math.min(k, (size - 6) / span);
  ctx.translate(size / 2, size / 2);
  ctx.scale(fit, fit);
  if (type === 'lift') {
    ctx.fillStyle = 'rgba(85,215,232,0.35)';
    ctx.fillRect(-7, -22, 14, 18);
  }
  if (art.moving) {
    const m = art.moving;
    const pivot = DEVICES[type].pivot!;
    ctx.drawImage(m.canvas, pivot.x - m.ox, pivot.y - m.oy);
  }
  ctx.drawImage(s, -art.base.ox, -art.base.oy);
  return c;
}

// ---------------------------------------------------------------------------
// Fundo: céu em degradê, nebulosa, galáxia, planetas e rochas distantes
// ---------------------------------------------------------------------------

export interface FarRock {
  sprite: Sprite;
  x: number;
  y: number;
  par: number;
  /** deriva lenta (px/s) */
  vx: number;
  vy: number;
}

export interface AnimatedPlanet {
  frames: Sprite[];
  x: number;
  y: number;
  par: number;
  r: number;
  moon: Sprite | null;
  moonOrbit: number;
  moonSpeed: number;
  /** período de rotação (s) */
  spin: number;
}

export interface BackgroundArt {
  far: HTMLCanvasElement;
  near: HTMLCanvasElement;
  twinkles: { x: number; y: number; c: string; p: number; s: number }[];
  nebula: HTMLCanvasElement;
  nebulaScale: number;
  galaxy: Sprite[];
  galaxyPos: Vec;
  planets: AnimatedPlanet[];
  farRocks: FarRock[];
  meteorColors: string[];
}

function starTile(size: number, density: number, colors: string[], seed: number, big: boolean) {
  const g = new PixelGrid(size, size);
  const rng = new Rng(seed);
  const n = Math.floor(size * size * density);
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, size - 1);
    const y = rng.int(0, size - 1);
    const c = rng.pick(colors);
    const dim = rng.chance(0.65);
    g.set(x, y, c, dim ? 90 : 230);
    if (big && rng.chance(0.07)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, c, 110);
    }
  }
  return g.toSprite().canvas;
}

/** Planeta com textura que gira (longitude deslocada por `lon`). */
function planet(r: number, cols: [string, string, string], ring: boolean, seed: number, lon: number): Sprite {
  const pad = ring ? Math.ceil(r * 1.0) : 2;
  const g = new PixelGrid(r * 2 + pad * 2, r * 2 + pad * 2, r + pad, r + pad);
  const ringPts: { x: number; y: number; front: boolean }[] = [];
  if (ring) {
    for (let a = 0; a < Math.PI * 2; a += 0.004) {
      for (const rr of [1.55, 1.65, 1.78]) {
        const x = Math.cos(a) * r * rr;
        const y = Math.sin(a) * r * 0.36 * rr;
        ringPts.push({ x, y: y - x * 0.18, front: Math.sin(a) > 0 });
      }
    }
    for (const p of ringPts) if (!p.front) g.set(Math.floor(p.x + g.ox), Math.floor(p.y + g.oy), mix(cols[0], '#ffffff', 0.2), 160);
  }
  g.circle(0, 0, r, (x, y) => {
    const nz = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (r * r)));
    const l = (x / r) * -0.7 + (y / r) * -0.45 + nz * 0.55;
    // coordenadas esféricas: longitude anda com o tempo
    const longi = Math.atan2(x / r, nz) / Math.PI + lon;
    const band = valueNoise(0.5, y / (r * 0.18) + 10, seed) * 0.45 + valueNoise(longi * 6, y / (r * 0.35), seed + 2) * 0.35;
    const t = l * 0.75 + band * 0.45 + (bayer(Math.floor(x + 64), Math.floor(y + 64)) - 0.5) * 0.2;
    if (t < 0.12) return mix(cols[2], '#000000', 0.35);
    if (t < 0.35) return cols[2];
    if (t < 0.62) return cols[1];
    return t > 0.88 ? mix(cols[0], '#ffffff', 0.35) : cols[0];
  });
  for (const p of ringPts) if (p.front) g.set(Math.floor(p.x + g.ox), Math.floor(p.y + g.oy), mix(cols[0], '#ffffff', 0.35), 220);
  return g.toSprite();
}

function galaxyFrame(t: Theme, seed: number, rotA: number): Sprite {
  const w = 72;
  const h = 40;
  const g = new PixelGrid(w, h, w / 2, h / 2);
  const rng = new Rng(seed);
  for (let i = 0; i < 1500; i++) {
    const arm = i % 2;
    const r = Math.pow(rng.next(), 0.7) * 30;
    const a = r * 0.22 + arm * Math.PI + rng.range(-0.35, 0.35) + rotA;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * 0.45;
    const c = r < 5 ? t.galaxy[0] : r < 14 ? t.galaxy[1] : t.galaxy[2];
    g.set(Math.floor(x + g.ox), Math.floor(y + g.oy), c, r < 5 ? 255 : 160);
  }
  g.circle(0, 0, 2.2, '#ffffff');
  return g.toSprite();
}

function rockBlob(size: number, cols: [string, string], rim: string, seed: number): Sprite {
  const r = size / 2;
  const g = new PixelGrid(size + 4, size + 4, r + 2, r + 2);
  const dark = mix(cols[0], '#000000', 0.35);
  const mid = mix(cols[0], cols[1], 0.5);
  g.circle(0, 0, r, (x, y) => {
    const a = Math.atan2(y, x);
    const rr = r * (0.74 + 0.26 * fbm(Math.cos(a) * 1.5 + 3, Math.sin(a) * 1.5 + 3, seed, 3));
    const d = Math.hypot(x, y);
    if (d > rr) return null;
    const nz = Math.sqrt(Math.max(0, 1 - (d / rr) ** 2));
    const l = (x / rr) * -0.6 + (y / rr) * -0.8 + nz * 0.5;
    if (d > rr - Math.max(1.2, r * 0.06) && l > 0.1) return rim;
    const n = fbm(x / Math.max(3, r * 0.25) + 10, y / Math.max(3, r * 0.25), seed + 1, 3);
    const t = l * 0.6 + n * 0.6 + (bayer(Math.floor(x + 64), Math.floor(y + 64)) - 0.5) * 0.15;
    return t > 0.75 ? cols[1] : t > 0.5 ? mid : t > 0.25 ? cols[0] : dark;
  });
  return g.toSprite();
}

export function makeBackground(zone: ZoneData): BackgroundArt {
  const t = THEMES[zone.theme];
  const seed = zone.id * 977;
  const far = starTile(256, 0.006, t.stars, seed + 1, false);
  const near = starTile(320, 0.0018, t.stars, seed + 2, true);
  const rngT = new Rng(seed + 9);
  const twinkles = Array.from({ length: 70 }, () => ({ x: rngT.next(), y: rngT.next(), c: rngT.pick(t.stars), p: rngT.next() * 6.28, s: rngT.range(0.6, 2.2) }));

  // nebulosa com distorção de domínio (fiapos)
  const scaleN = 2;
  const nw = Math.ceil((zone.width + 700) / scaleN);
  const nh = Math.ceil((zone.height + 450) / scaleN);
  const g = new PixelGrid(nw, nh);
  const neb = t.nebula;
  const cx = nw * (0.35 + new Rng(seed).next() * 0.3);
  const cy = nh * 0.45;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const wx = x / 70;
      const wy = y / 55;
      const qx = fbm(wx, wy, seed, 3);
      const qy = fbm(wx + 5.2, wy + 1.3, seed + 4, 3);
      let v = fbm(wx + qx * 1.8, wy + qy * 1.8, seed + 8, 4);
      const band = 1 - Math.min(1, Math.abs((y - cy) / nh - ((x - cx) / nw) * 0.6) * 2.2);
      v = v * (0.5 + band * 0.7) - 0.42 + (bayer(x, y) - 0.5) * 0.07;
      if (v <= 0) continue;
      const k = Math.min(neb.length - 1, Math.floor(v * neb.length * 1.7));
      g.set(x, y, neb[k], Math.min(150, 45 + v * 300));
    }
  }
  const rng = new Rng(seed + 5);
  const planets: AnimatedPlanet[] = [];
  const mkPlanet = (r: number, cols: [string, string, string], ring: boolean, ps: number, x: number, y: number, par: number, moon: boolean) => {
    const frames: Sprite[] = [];
    const N = 24;
    for (let f = 0; f < N; f++) frames.push(planet(r, cols, ring, ps, f / N));
    const moonCols: [string, string, string] = [mix(cols[0], '#ffffff', 0.4), mix(cols[1], '#888888', 0.4), mix(cols[2], '#222222', 0.3)];
    planets.push({ frames, x, y, par, r, moon: moon ? planet(Math.max(2, Math.round(r * 0.22)), moonCols, false, ps + 9, 0) : null, moonOrbit: r * 2.3, moonSpeed: 0.35, spin: 40 });
  };
  mkPlanet(rng.int(16, 24), t.planet, true, seed, rng.range(0.62, 0.88) * zone.width, rng.range(0.06, 0.2) * zone.height, 0.1, true);
  mkPlanet(rng.int(5, 8), [t.nebula[4], t.nebula[2], t.nebula[0]], false, seed + 3, rng.range(0.12, 0.4) * zone.width, rng.range(0.05, 0.16) * zone.height, 0.05, false);
  const farRocks: FarRock[] = [];
  for (let i = 0; i < 12; i++) {
    const size = rng.int(6, 26);
    farRocks.push({
      sprite: rockBlob(size, t.farRock, mix(t.farRock[1], t.rim, 0.35), seed + 40 + i),
      x: rng.range(-0.1, 1.1) * zone.width,
      y: rng.range(0.05, 0.95) * zone.height,
      par: 0.25 + size / 120,
      vx: rng.range(-3, 3),
      vy: rng.range(-1.5, 1.5),
    });
  }
  const galaxy: Sprite[] = [];
  for (let f = 0; f < 16; f++) galaxy.push(galaxyFrame(t, seed + 7, (f / 16) * Math.PI * 2));
  return {
    far,
    near,
    twinkles,
    nebula: g.toSprite().canvas,
    nebulaScale: scaleN,
    galaxy,
    galaxyPos: { x: rng.range(0.4, 0.95) * zone.width, y: rng.range(0.04, 0.3) * zone.height },
    planets,
    farRocks,
    meteorColors: ['#fff6d8', '#ffd27a', '#ff9a3a', '#e0661e', '#7a2a10'],
  };
}

/** Degradê vertical do céu com pontilhado ordenado. */
export function makeSky(theme: Theme, w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const steps = 8;
  const cols = Array.from({ length: steps }, (_, q) => hexToRgb(ramp([theme.skyTop, mix(theme.skyTop, theme.skyBottom, 0.55), theme.skyBottom], q / (steps - 1))));
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    for (let x = 0; x < w; x++) {
      const q = Math.max(0, Math.min(steps - 1, Math.floor(t * steps + (bayer(x >> 1, y >> 1) - 0.5) * 0.9)));
      const c3 = cols[q];
      const o = (y * w + x) * 4;
      d[o] = c3[0];
      d[o + 1] = c3[1];
      d[o + 2] = c3[2];
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Vinheta escura nas bordas. */
export function makeVignette(w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(4,2,12,0)');
  g.addColorStop(1, 'rgba(4,2,12,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

// ---------------------------------------------------------------------------
// Cursores e setas (pixel art desenhada à mão em grade de caracteres)
// ---------------------------------------------------------------------------

function fromRows(rows: string[], pal: Record<string, string>, hx: number, hy: number): Sprite {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const g = new PixelGrid(w, h, hx, hy);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (c) g.set(x, y, c);
    }
  });
  return g.toSprite();
}

export interface CursorArt {
  arrow: Sprite;
  clawOpen: Sprite;
  clawClosed: Sprite;
  hand: Sprite;
}

let cursorCache: CursorArt | null = null;

export function cursorArt(): CursorArt {
  if (cursorCache) return cursorCache;
  const pal = { k: '#0a0614', w: '#fff6dc', y: '#ffd27a', o: '#ff9a3a', b: '#8a5228', d: '#5a3014', s: '#cfd8ec', g: '#7a8aa8', c: '#55d7e8', C: '#bff6ff', n: '#1f7a8a' };
  const arrow = fromRows(
    ['k', 'kk', 'kwk', 'kwwk', 'kwwwk', 'kwwwwk', 'kwwwwwk', 'kwwwyyyk', 'kwwkyk', 'kwk kyk', 'kk  kyk', 'k    kk'],
    pal,
    0,
    0,
  );
  // garra do feixe: emissor com três dentes
  const clawOpen = fromRows(
    ['  kk     kk  ', ' kCck   kcCk ', ' kcnk   kncK ', '  kcnk kcnk  ', '   kcckcck   ', '    kcCck    ', '    kcnck    ', '   kkcnckk   ', '   kgsssgk   ', '   kgsssgk   ', '    kkkkk    '],
    { ...pal, K: '#0a0614' },
    6,
    5,
  );
  const clawClosed = fromRows(
    ['    k   k    ', '   kCk kCk   ', '   kcnknck   ', '    kcCck    ', '    kcCck    ', '    kcnck    ', '   kkcnckk   ', '   kgsssgk   ', '   kgsssgk   ', '    kkkkk    '],
    pal,
    6,
    3,
  );
  const hand = fromRows(
    ['   kk     ', '  kwwk    ', '  kwwk    ', '  kwwkkk  ', '  kwwkwwkk', 'kkkwwwwwwk', 'kwkwwwwwwk', 'kwwwwwwwwk', ' kwwwwwwwk', '  kwwwwwk ', '   kkkkkk '],
    pal,
    3,
    1,
  );
  cursorCache = { arrow, clawOpen, clawClosed, hand };
  return cursorCache;
}

let droneCache: Sprite | null = null;

/** Drone de mineração da Singularis: casco com lente do laser e propulsores. */
export function droneSprite(): Sprite {
  if (droneCache) return droneCache;
  const pal = { k: '#0a0614', s: '#cfd8ec', g: '#7a8aa8', d: '#454a61', c: '#55d7e8', C: '#bff6ff', w: '#ffffff', o: '#ff9a3a', y: '#ffd27a' };
  droneCache = fromRows(
    ['   kkkkk   ', '  kssssgk  ', ' ksgcccgdk ', 'kkgcCwCcgkk', 'kokgcCcgkok', 'kykdgggdkyk', ' k kdddk k ', '    kkk    '],
    pal,
    5,
    3,
  );
  return droneCache;
}

let arrowCache: Sprite | null = null;

/** Seta apontando para +x (gira junto com a peça). */
export function arrowSprite(): Sprite {
  if (arrowCache) return arrowCache;
  arrowCache = fromRows(['k   ', 'kyk ', 'kyyk', 'kyyyk', 'kyyk', 'kyk ', 'k   '].map((r) => r.padEnd(5, ' ')), { k: '#2a1006', y: '#ffd27a' }, 2, 3);
  return arrowCache;
}
