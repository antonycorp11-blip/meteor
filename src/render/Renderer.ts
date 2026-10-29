import { transformPoly, type Vec } from '../core/geometry';
import { DEVICES, FAN_LENGTH, FIELD_RADIUS, LIFT_HEIGHT, LIFT_WIDTH, footprint } from '../machines/catalog';
import type { DeviceType } from '../machines/types';
import type { Device, Sim } from '../sim/Sim';
import type { ZoneData } from '../world/types';
import { Camera } from './Camera';
import { PAL, THEMES } from './palette';
import { Particles } from './Particles';
import { drawPixelText, textWidth } from './PixelFont';
import {
  GLOW_SCALE,
  deviceArt,
  fragmentGlowColor,
  makeAsteroid,
  makeBackground,
  makeBlackHole,
  makeFragmentSprite,
  makeGlowSprite,
  makeSky,
  makeTerrainArt,
  makeVignette,
  type AsteroidArt,
  type BackgroundArt,
  type BlackHoleArt,
  type TerrainArt,
} from './ProceduralArt';
import { makeCanvas, type Sprite } from './PixelSprite';

export interface Ghost {
  type: DeviceType;
  x: number;
  y: number;
  angle: number;
  params: Record<string, number>;
  valid: boolean;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
}

export interface Handle {
  kind: 'rotate' | 'move';
  x: number;
  y: number;
  r: number;
}

export interface RenderState {
  sim: Sim;
  alpha: number;
  time: number;
  ghost: Ghost | null;
  selected: Device | null;
  handles: Handle[];
  grabPointer: Vec | null;
  floaters: Floater[];
  buildMode: boolean;
  crack: number;
  shake: Vec;
  trajectory: Vec[] | null;
  highContrast: boolean;
  reduceGlow: boolean;
  hoverAsteroid: boolean;
  hoverFragment: number;
  hint: { x: number; y: number; text: string } | null;
}

/**
 * Desenha o mundo num buffer de pixels nítidos ampliado com nearest-neighbor.
 * A escala de pixel é escolhida para que o mapa inteiro apareça perto de
 * 1:1 (sem reamostrar a arte para baixo). Luzes vão numa camada aditiva de
 * baixa resolução (bloom discreto) que não borra os contornos.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private glow: HTMLCanvasElement;
  private gctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  readonly particles = new Particles(600);
  pixelScale = 2;
  dpr = 1;
  private insetCss = { top: 0, bottom: 0 };
  private zone: ZoneData | null = null;
  private terrain: TerrainArt | null = null;
  private asteroid: AsteroidArt | null = null;
  private hole: BlackHoleArt | null = null;
  private bg: BackgroundArt | null = null;
  private sky: HTMLCanvasElement | null = null;
  private vignette: HTMLCanvasElement | null = null;
  private fragSprites = new Map<number, Sprite>();
  private glowSprites = new Map<string, HTMLCanvasElement>();
  private frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.buffer = makeCanvas(640, 360);
    this.bctx = this.buffer.getContext('2d')!;
    this.glow = makeCanvas(160, 90);
    this.gctx = this.glow.getContext('2d')!;
  }

  setInsetsCss(top: number, bottom: number) {
    this.insetCss = { top, bottom };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const devW = Math.floor(cssW * dpr);
    const devH = Math.floor(cssH * dpr);
    let scale: number;
    if (this.zone) {
      const freeH = devH - (this.insetCss.top + this.insetCss.bottom) * dpr;
      const fit = Math.min(devW / (this.zone.width + 30), freeH / (this.zone.height + 20));
      scale = Math.max(1, Math.floor(fit));
    } else scale = Math.max(1, Math.round(Math.min(devW / 640, devH / 360)));
    this.pixelScale = scale;
    const bw = Math.ceil(devW / scale);
    const bh = Math.ceil(devH / scale);
    const changed = bw !== this.buffer.width || bh !== this.buffer.height;
    this.buffer.width = bw;
    this.buffer.height = bh;
    this.canvas.width = bw * scale;
    this.canvas.height = bh * scale;
    this.canvas.style.width = `${(bw * scale) / dpr}px`;
    this.canvas.style.height = `${(bh * scale) / dpr}px`;
    this.glow.width = Math.ceil(bw / GLOW_SCALE);
    this.glow.height = Math.ceil(bh / GLOW_SCALE);
    this.camera.setView(bw, bh);
    this.camera.setInsets((this.insetCss.top * dpr) / scale, (this.insetCss.bottom * dpr) / scale);
    this.bctx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingEnabled = false;
    if ((changed || !this.sky) && this.zone) this.buildScreenLayers();
  }

  private buildScreenLayers() {
    const t = THEMES[this.zone!.theme];
    this.sky = makeSky(t, this.buffer.width, this.buffer.height);
    this.vignette = makeVignette(this.buffer.width, this.buffer.height);
  }

  /** CSS px (relativo ao canvas) → px do buffer. */
  cssToBuffer(cx: number, cy: number): Vec {
    return { x: (cx * this.dpr) / this.pixelScale, y: (cy * this.dpr) / this.pixelScale };
  }

  bufferPerCss() {
    return this.dpr / this.pixelScale;
  }

  /** Escala do texto em pixel para continuar legível com pixels pequenos. */
  private textScale() {
    return Math.max(1, Math.round(2 / this.pixelScale));
  }

  setZone(zone: ZoneData, highContrast: boolean) {
    this.zone = zone;
    this.terrain = makeTerrainArt(zone, highContrast);
    this.asteroid = makeAsteroid(zone.asteroid.r, zone.id * 31 + 5);
    this.hole = makeBlackHole(zone.blackHole.absorbRadius);
    this.bg = makeBackground(zone);
    this.fragSprites.clear();
    this.particles.clear();
    this.camera.setWorld(zone.width, zone.height);
    this.sky = null;
    this.resize();
  }

  rebuildTerrain(highContrast: boolean) {
    if (this.zone) this.terrain = makeTerrainArt(this.zone, highContrast);
  }

  forgetFragment(id: number) {
    this.fragSprites.delete(id);
  }

  private glowSprite(color: string) {
    let g = this.glowSprites.get(color);
    if (!g) {
      g = makeGlowSprite(color, 32);
      this.glowSprites.set(color, g);
    }
    return g;
  }

  render(s: RenderState, dt: number) {
    const zone = this.zone;
    if (!zone || !this.terrain || !this.asteroid || !this.hole || !this.bg) return;
    this.frame++;
    this.particles.update(dt);
    const ctx = this.bctx;
    const cam = this.camera;
    const W = this.buffer.width;
    const H = this.buffer.height;
    const z = cam.zoom;
    const tx = Math.round(W / 2 - cam.x * z + s.shake.x);
    const ty = Math.round(H / 2 - cam.y * z + s.shake.y);
    const ts = this.textScale();

    // --- fundo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.sky) ctx.drawImage(this.sky, 0, 0);
    this.drawBackground(s, W, H);
    if (s.highContrast) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, W, H);
    }

    // --- campos
    ctx.setTransform(z, 0, 0, z, tx, ty);
    for (const f of zone.fields) {
      ctx.fillStyle = 'rgba(85,215,232,0.07)';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawAmbientFields(s, tx, ty);
    this.drawDeviceFields(s, tx, ty);

    // --- terreno
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.drawImage(this.terrain.tex, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const f of zone.fields) {
      const b = cam.toBuffer(f.x + f.w / 2, f.y);
      const arrow = f.ax < 0 ? '<' : f.ax > 0 ? '>' : '';
      const label = `${arrow}${arrow} ${f.label.toUpperCase()}`;
      drawPixelText(ctx, label, b.x - textWidth(label, ts) / 2, b.y + 4 * ts, 'rgba(160,240,232,0.95)', ts, '#03141a');
    }

    // --- buraco negro
    const h = zone.blackHole;
    const hf = this.hole.frames[Math.floor(s.time * 10) % this.hole.frames.length];
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.drawImage(hf.canvas, Math.round(h.x - hf.ox), Math.round(h.y - hf.oy));
    const hc = this.hole.core;
    ctx.drawImage(hc.canvas, Math.round(h.x - hc.ox), Math.round(h.y - hc.oy));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cb = cam.toBuffer(h.x, h.y);
    for (let i = 0; i < 30; i++) {
      const r = h.absorbRadius + 6 + ((i * 7.3) % 26);
      const a = s.time * (2.2 - r / 30) + i * 2.39;
      ctx.fillStyle = i % 3 === 0 ? PAL.core : i % 3 === 1 ? '#e070c8' : '#ffffff';
      ctx.fillRect(Math.round(cb.x + Math.cos(a) * r * z + s.shake.x), Math.round(cb.y + Math.sin(a) * r * z + s.shake.y), 1, 1);
    }
    if (s.buildMode) this.ringPx(cb.x, cb.y, h.attractRadius * z, 'rgba(176,104,232,0.5)', Math.floor(h.attractRadius * z * 0.9), true);

    // --- asteroide
    const a = zone.asteroid;
    const ast = this.asteroid;
    const jig = s.crack > 0.6 ? (Math.random() - 0.5) * 1.2 : 0;
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.drawImage(ast.base.canvas, Math.round(a.x - ast.base.ox + jig), Math.round(a.y - ast.base.oy));
    ctx.globalAlpha = Math.min(1, 0.6 + s.crack * 0.4 + Math.sin(s.time * 1.7) * 0.12 + (s.hoverAsteroid ? 0.2 : 0));
    ctx.drawImage(ast.glow.canvas, Math.round(a.x - ast.glow.ox + jig), Math.round(a.y - ast.glow.oy));
    ctx.globalAlpha = 1;
    if (this.frame % 5 === 0 && this.particles.pool.length < this.particles.cap * 0.5) {
      // brasas soltas pelas fissuras
      const ang = Math.random() * Math.PI * 2;
      this.particles.spawn({ x: a.x + Math.cos(ang) * a.r * 0.8, y: a.y + Math.sin(ang) * a.r * 0.8, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 8, life: 1.6, color: Math.random() < 0.5 ? '#ff8a2a' : PAL.core, size: 1, gravity: -4 });
    }

    // --- dispositivos
    for (const d of s.sim.devices.values()) this.drawDevice(d, z, tx, ty, s.time, d.enabled ? 1 : 0.5);

    // --- fragmentos
    const alpha = s.alpha;
    for (const f of s.sim.fragments.values()) {
      let spr = this.fragSprites.get(f.id);
      if (!spr) {
        spr = makeFragmentSprite(f.type, f.local, f.radius, f.id);
        this.fragSprites.set(f.id, spr);
      }
      const x = f.prevX + (f.body.position.x - f.prevX) * alpha;
      const y = f.prevY + (f.body.position.y - f.prevY) * alpha;
      const an = f.prevA + (f.body.angle - f.prevA) * alpha;
      const c = Math.cos(an);
      const sn = Math.sin(an);
      ctx.setTransform(z * c, z * sn, -z * sn, z * c, tx + z * x, ty + z * y);
      ctx.drawImage(spr.canvas, -spr.ox, -spr.oy);
      if (f.id === s.hoverFragment) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const b = cam.toBuffer(x, y);
        this.ringPx(b.x + s.shake.x, b.y + s.shake.y, (f.radius + 3) * z, PAL.cyan, 14);
      }
    }
    if (this.frame % 90 === 0) {
      for (const id of this.fragSprites.keys()) if (!s.sim.fragments.has(id)) this.fragSprites.delete(id);
    }

    // --- partículas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of this.particles.pool) {
      const b = cam.toBuffer(p.x, p.y);
      const sz = Math.max(1, Math.round(p.size * Math.min(2, z)));
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(b.x + s.shake.x), Math.round(b.y + s.shake.y), sz, sz);
    }
    ctx.globalAlpha = 1;

    // --- luzes (bloom aditivo); o horizonte de eventos continua negro por cima
    this.drawGlow(s, tx, ty);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.drawImage(hc.canvas, Math.round(h.x - hc.ox), Math.round(h.y - hc.oy));
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // --- rochas de moldura em primeiro plano (fora do mapa) e vinheta
    this.drawFrameRocks(W, H);
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0);

    // --- feixe manual
    if (s.sim.grab && s.grabPointer) {
      const f = s.sim.fragments.get(s.sim.grab.fragId);
      if (f) {
        const fp = cam.toBuffer(f.body.position.x, f.body.position.y);
        const pp = cam.toBuffer(s.grabPointer.x, s.grabPointer.y);
        const d = Math.hypot(s.grabPointer.x - f.body.position.x, s.grabPointer.y - f.body.position.y);
        const stretch = d / s.sim.grabReach();
        const col = stretch > 0.75 ? PAL.amber : PAL.cyan;
        this.linePx(fp.x + s.shake.x, fp.y + s.shake.y, pp.x + s.shake.x, pp.y + s.shake.y, col, 3, Math.floor(s.time * 20));
        this.ringPx(pp.x + s.shake.x, pp.y + s.shake.y, 4, col, 12);
      }
    }
    if (s.trajectory) {
      for (let i = 0; i < s.trajectory.length; i += 2) {
        const p = cam.toBuffer(s.trajectory[i].x, s.trajectory[i].y);
        ctx.fillStyle = i % 4 ? 'rgba(255,224,138,0.5)' : 'rgba(255,224,138,0.95)';
        ctx.fillRect(Math.round(p.x + s.shake.x), Math.round(p.y + s.shake.y), ts, ts);
      }
    }

    // --- seleção, fantasma e alças
    if (s.selected) this.drawSelection(s.selected, s);
    if (s.ghost) this.drawGhost(s.ghost, s, tx, ty);
    for (const hd of s.handles) {
      const b = cam.toBuffer(hd.x, hd.y);
      if (hd.kind === 'rotate') {
        this.ringPx(b.x, b.y, hd.r * z + 1, PAL.core, 20);
        ctx.fillStyle = PAL.core;
        ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
      }
    }

    // --- textos flutuantes
    for (const fl of s.floaters) {
      const b = cam.toBuffer(fl.x, fl.y);
      const t = 1 - fl.life / fl.max;
      ctx.globalAlpha = Math.min(1, (fl.life / fl.max) * 2.5);
      drawPixelText(ctx, fl.text, b.x - textWidth(fl.text, ts) / 2, b.y - 10 * ts - t * 16 * ts, fl.color, ts);
    }
    ctx.globalAlpha = 1;
    if (s.hint) {
      const b = cam.toBuffer(s.hint.x, s.hint.y);
      const bob = Math.round(Math.sin(s.time * 4) * 2);
      drawPixelText(ctx, s.hint.text, b.x - textWidth(s.hint.text, ts) / 2, b.y + bob, PAL.core, ts, '#1a0c2a');
    }

    // --- blit
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  private drawBackground(s: RenderState, W: number, H: number) {
    const bg = this.bg!;
    const ctx = this.bctx;
    const cam = this.camera;
    const zw = this.zone!.width;
    const zh = this.zone!.height;
    const tile = (img: HTMLCanvasElement, par: number) => {
      const tw = img.width;
      const th = img.height;
      const ox = -(((cam.x * par) % tw) + tw) % tw;
      const oy = -(((cam.y * par) % th) + th) % th;
      for (let y = Math.floor(oy); y < H; y += th) for (let x = Math.floor(ox); x < W; x += tw) ctx.drawImage(img, x, y);
    };
    tile(bg.far, 0.03);
    // estrelas cintilantes
    for (const t of bg.twinkles) {
      const v = 0.5 + 0.5 * Math.sin(s.time * 1.3 + t.p);
      if (v < 0.35) continue;
      const x = Math.round(t.x * W);
      const y = Math.round(t.y * H);
      ctx.globalAlpha = v;
      ctx.fillStyle = t.c;
      ctx.fillRect(x, y, 1, 1);
      if (v > 0.85) {
        ctx.globalAlpha = (v - 0.85) * 4;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
    // projeção paralaxe: posição na tela de um ponto do "céu" com fator par
    const par = (x: number, y: number, p: number) => ({
      x: Math.round(W / 2 + (x - zw / 2) * 0.9 - (cam.x - zw / 2) * p),
      y: Math.round(H / 2 + (y - zh / 2) * 0.9 - (cam.y - zh / 2) * p),
    });
    const ns = bg.nebulaScale;
    const np = par(-300, -200, 0.18);
    ctx.drawImage(bg.nebula, np.x, np.y, bg.nebula.width * ns * 0.9, bg.nebula.height * ns * 0.9);
    const gp = par(bg.galaxyPos.x, bg.galaxyPos.y, 0.06);
    ctx.drawImage(bg.galaxy.canvas, gp.x - bg.galaxy.ox, gp.y - bg.galaxy.oy);
    for (const p of bg.planets) {
      const q = par(p.x, p.y, p.par);
      ctx.drawImage(p.sprite.canvas, q.x - p.sprite.ox, q.y - p.sprite.oy);
    }
    tile(bg.near, 0.1);
    for (const r of bg.farRocks) {
      const q = par(r.x, r.y, r.par);
      ctx.drawImage(r.sprite.canvas, q.x - r.sprite.ox, q.y - r.sprite.oy);
    }
  }

  private drawFrameRocks(W: number, H: number) {
    const ctx = this.bctx;
    const cam = this.camera;
    const z = cam.zoom;
    for (const r of this.bg!.frameRocks) {
      const bx = W / 2 + (r.x - cam.x) * z * r.par;
      const by = H / 2 + (r.y - cam.y) * z * r.par;
      const sw = r.sprite.canvas.width * z;
      const sh = r.sprite.canvas.height * z;
      if (bx + sw < 0 || by + sh < 0 || bx - sw > W || by - sh > H) continue;
      ctx.drawImage(r.sprite.canvas, Math.round(bx - r.sprite.ox * z), Math.round(by - r.sprite.oy * z), Math.round(sw), Math.round(sh));
    }
  }

  private drawGlow(s: RenderState, tx: number, ty: number) {
    const g = this.gctx;
    const gw = this.glow.width;
    const gh = this.glow.height;
    const z = this.camera.zoom;
    const k = 1 / GLOW_SCALE;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, gw, gh);
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    const zone = this.zone!;
    // cristais do terreno
    g.globalAlpha = 0.85 + Math.sin(s.time * 0.8) * 0.1;
    g.drawImage(this.terrain!.glow, tx * k, ty * k, (zone.width * z) * k, (zone.height * z) * k);
    const put = (wx: number, wy: number, color: string, worldSize: number, alpha: number) => {
      const sz = worldSize * z * k;
      if (sz < 0.5) return;
      const x = (tx + wx * z) * k;
      const y = (ty + wy * z) * k;
      if (x < -sz || y < -sz || x > gw + sz || y > gh + sz) return;
      g.globalAlpha = alpha;
      g.drawImage(this.glowSprite(color), x - sz / 2, y - sz / 2, sz, sz);
    };
    const a = zone.asteroid;
    put(a.x, a.y, '#ff7a2a', a.r * 4, 0.35 + s.crack * 0.3 + Math.sin(s.time * 1.7) * 0.05);
    const h = zone.blackHole;
    put(h.x, h.y, '#7a30c8', (h.absorbRadius + 42) * 3.4, 0.38);
    put(h.x, h.y, '#ff9a5a', (h.absorbRadius + 6) * 2.2, 0.22);
    for (const f of s.sim.fragments.values()) put(f.body.position.x, f.body.position.y, fragmentGlowColor(f.type), 26, 0.32);
    for (const d of s.sim.devices.values()) {
      if (!d.enabled) continue;
      const art = deviceArt(d.type);
      const c = Math.cos(d.angle);
      const sn = Math.sin(d.angle);
      for (const l of art.lights) {
        const wx = d.x + l.x * c - l.y * sn;
        const wy = d.y + l.x * sn + l.y * c;
        put(wx, wy, l.color, l.size * (1 + d.rt.flash), 0.35 + d.rt.flash * 0.5);
      }
    }
    g.globalAlpha = 1;
    const b = this.bctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'lighter';
    b.imageSmoothingEnabled = true;
    b.globalAlpha = s.reduceGlow ? 0.45 : 1;
    b.drawImage(this.glow, 0, 0, gw * GLOW_SCALE, gh * GLOW_SCALE);
    b.globalAlpha = 1;
    b.imageSmoothingEnabled = false;
    b.globalCompositeOperation = 'source-over';
  }

  private drawAmbientFields(s: RenderState, tx: number, ty: number) {
    const ctx = this.bctx;
    const z = this.camera.zoom;
    for (const f of this.zone!.fields) {
      const len = Math.hypot(f.ax, f.ay) || 1;
      const dx = f.ax / len;
      const dy = f.ay / len;
      const n = Math.max(10, Math.floor((f.w * f.h) / 900));
      ctx.fillStyle = 'rgba(127,230,224,0.8)';
      for (let i = 0; i < n; i++) {
        const seedX = (i * 73.13) % 1;
        const seedY = (i * 37.71) % 1;
        const t = (s.time * 0.35 + seedX * 7.3) % 1;
        const x = f.x + ((seedX + dx * t * 0.6 + 1) % 1) * f.w;
        const y = f.y + ((seedY + dy * t * 0.6 + 1) % 1) * f.h;
        for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(tx + (x - dx * k * 3) * z), Math.round(ty + (y - dy * k * 3) * z), 1, 1);
      }
    }
  }

  private drawDeviceFields(s: RenderState, tx: number, ty: number) {
    const ctx = this.bctx;
    const z = this.camera.zoom;
    const mods = s.sim.mods;
    for (const d of s.sim.devices.values()) {
      if (!d.enabled) continue;
      const c = Math.cos(d.angle);
      const sn = Math.sin(d.angle);
      const show = s.buildMode || d === s.selected;
      if (d.type === 'fan') {
        const L = FAN_LENGTH * mods.fieldRadiusMul;
        ctx.fillStyle = 'rgba(200,240,250,0.7)';
        for (let k = 0; k < 10; k++) {
          const lane = ((k * 0.37) % 1) * 30 - 15;
          const t = (s.time * 1.6 + k * 0.27) % 1;
          const lx = 10 + t * L;
          for (let q = 0; q < 4; q++) {
            const px = d.x + c * (lx - q * 3) - sn * lane;
            const py = d.y + sn * (lx - q * 3) + c * lane;
            ctx.fillRect(Math.round(tx + px * z), Math.round(ty + py * z), 1, 1);
          }
        }
        if (show) this.polyPx(transformPoly([{ x: 7, y: -18 }, { x: 7 + L, y: -18 }, { x: 7 + L, y: 18 }, { x: 7, y: 18 }], d, d.angle), 'rgba(85,215,232,0.5)', tx, ty, 4);
      } else if (d.type === 'lift') {
        const Hh = LIFT_HEIGHT * mods.fieldRadiusMul;
        ctx.save();
        ctx.setTransform(z * c, z * sn, -z * sn, z * c, tx + z * d.x, ty + z * d.y);
        const gr = ctx.createLinearGradient(0, -4, 0, -4 - Hh);
        gr.addColorStop(0, 'rgba(85,215,232,0.22)');
        gr.addColorStop(1, 'rgba(85,215,232,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(-LIFT_WIDTH / 2, -4 - Hh, LIFT_WIDTH, Hh);
        ctx.restore();
        ctx.fillStyle = 'rgba(180,245,255,0.8)';
        for (let k = 0; k < 12; k++) {
          const lane = ((k * 0.61) % 1) * 26 - 13;
          const t = (s.time * 0.5 + k * 0.17) % 1;
          const ly = -4 - t * Hh;
          const px = d.x + c * lane - sn * ly;
          const py = d.y + sn * lane + c * ly;
          ctx.fillRect(Math.round(tx + px * z), Math.round(ty + py * z), 1, 2);
        }
        if (show)
          this.polyPx(
            transformPoly([{ x: -15, y: -4 }, { x: 15, y: -4 }, { x: 15, y: -4 - Hh }, { x: -15, y: -4 - Hh }], d, d.angle),
            'rgba(85,215,232,0.5)',
            tx,
            ty,
            4,
          );
      } else if (d.type === 'attractor' || d.type === 'repulsor') {
        const R = FIELD_RADIUS * mods.fieldRadiusMul;
        const col = d.type === 'attractor' ? 'rgba(85,215,232,0.6)' : 'rgba(255,122,154,0.6)';
        const b = this.camera.toBuffer(d.x, d.y);
        for (let k = 0; k < 3; k++) {
          let t = (s.time * 0.45 + k / 3) % 1;
          if (d.type === 'attractor') t = 1 - t;
          this.ringPx(b.x, b.y, R * t * z, col, Math.max(10, Math.floor(R * t * z * 0.6)));
        }
        if (show) this.ringPx(b.x, b.y, R * z, col, Math.floor(R * z * 1.2), true);
      }
    }
  }

  drawDevice(d: Device, z: number, tx: number, ty: number, time: number, alpha: number) {
    const ctx = this.bctx;
    const art = deviceArt(d.type);
    let spr = art.base;
    if (art.frames) {
      if (d.type === 'conveyor') {
        const sp = d.enabled ? d.params.speed ?? 3 : 0;
        const n = art.frames.length;
        let idx = Math.floor(time * Math.abs(sp) * 4) % n;
        if (sp < 0) idx = n - 1 - idx;
        spr = art.frames[idx];
      } else if (d.enabled) spr = art.frames[Math.floor(time * 12) % art.frames.length];
    }
    if (art.lit && (d.rt.flash > 0.3 || (d.type === 'autoextractor' && d.enabled && Math.sin(time * 3) > 0.7))) spr = art.lit;
    const c = Math.cos(d.angle);
    const sn = Math.sin(d.angle);
    ctx.globalAlpha = alpha;
    ctx.setTransform(z * c, z * sn, -z * sn, z * c, tx + z * d.x, ty + z * d.y);
    ctx.drawImage(spr.canvas, -spr.ox, -spr.oy);
    if (art.moving && d.pivotWorld) {
      let delta = 0;
      if (d.type === 'gate') delta = (-85 * Math.PI * d.rt.open) / 180;
      if (d.type === 'arm') delta = d.rt.swing;
      const a = d.angle + delta;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      ctx.setTransform(z * ca, z * sa, -z * sa, z * ca, tx + z * d.pivotWorld.x, ty + z * d.pivotWorld.y);
      ctx.drawImage(art.moving.canvas, -art.moving.ox, -art.moving.oy);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private drawSelection(d: Device, s: RenderState) {
    const cam = this.camera;
    const tx = Math.round(this.buffer.width / 2 - cam.x * cam.zoom);
    const ty = Math.round(this.buffer.height / 2 - cam.y * cam.zoom);
    const polys = d.worldSolids.length ? d.worldSolids : footprint(d.type, d.params).map((p) => transformPoly(p, d, d.angle));
    for (const p of polys) this.polyPx(p, PAL.cyan, tx, ty, Math.floor(s.time * 8) % 2 ? 3 : 0);
  }

  private drawGhost(g: Ghost, s: RenderState, tx: number, ty: number) {
    const z = this.camera.zoom;
    const fake = {
      type: g.type,
      x: g.x,
      y: g.y,
      angle: g.angle,
      params: g.params,
      enabled: true,
      rt: { flash: 0, open: 0, swing: 0 },
      pivotWorld: DEVICES[g.type].pivot ? transformPoly([DEVICES[g.type].pivot!], g, g.angle)[0] : null,
    } as unknown as Device;
    this.drawDevice(fake, z, tx, ty, s.time, 0.75);
    const col = g.valid ? PAL.ok : PAL.bad;
    for (const p of footprint(g.type, g.params).map((q) => transformPoly(q, g, g.angle))) this.polyPx(p, col, tx, ty, 0);
    const def = DEVICES[g.type];
    if (def.field) {
      const f = def.field(g.params, { radius: s.sim.mods.fieldRadiusMul });
      if (f.kind === 'radial' && f.radius) {
        const b = this.camera.toBuffer(g.x, g.y);
        this.ringPx(b.x, b.y, f.radius * z, 'rgba(85,215,232,0.6)', Math.floor(f.radius * z), true);
      } else if (f.rect) {
        const r = f.rect;
        this.polyPx(
          transformPoly([{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }], g, g.angle),
          'rgba(85,215,232,0.6)',
          tx,
          ty,
          3,
        );
      }
    }
  }

  // --- primitivas de pixel no espaço do buffer --------------------------

  private linePx(x0: number, y0: number, x1: number, y1: number, color: string, dash = 0, phase = 0) {
    const ctx = this.bctx;
    ctx.fillStyle = color;
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let i = phase;
    const w = this.textScale();
    for (let guard = 0; guard < 6000; guard++) {
      if (!dash || Math.floor(i / dash) % 2 === 0) ctx.fillRect(x0, y0, w, w);
      i++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  private polyPx(poly: Vec[], color: string, tx: number, ty: number, dash: number) {
    const z = this.camera.zoom;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      this.linePx(tx + a.x * z, ty + a.y * z, tx + b.x * z, ty + b.y * z, color, dash);
    }
  }

  private ringPx(cx: number, cy: number, r: number, color: string, n: number, dotted = false) {
    const ctx = this.bctx;
    ctx.fillStyle = color;
    const steps = Math.max(8, n);
    const w = this.textScale();
    for (let i = 0; i < steps; i++) {
      if (dotted && i % 2) continue;
      const a = (i / steps) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), w, w);
    }
  }
}
