import { Config } from '../core/Config';
import { pointInPoly, transformPoly, type Vec } from '../core/geometry';
import { DEVICES, FAN_LENGTH, FIELD_RADIUS, LIFT_HEIGHT, LIFT_WIDTH, deviceArrow, footprint } from '../machines/catalog';
import type { DeviceType } from '../machines/types';
import type { Device, Sim } from '../sim/Sim';
import type { ZoneData } from '../world/types';
import { Camera } from './Camera';
import { PAL, THEMES } from './palette';
import { Particles } from './Particles';
import { drawPixelText, textWidth } from './PixelFont';
import {
  arrowSprite,
  cursorArt,
  deviceArt,
  fragmentGlowColor,
  makeAsteroid,
  makeBackground,
  makeBlackHole,
  makeFragmentSprite,
  makeGlowSprite,
  makeSky,
  makeTerrainArt,
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

export type CursorKind = 'arrow' | 'pick' | 'clawOpen' | 'clawClosed' | 'hand' | 'none';

export interface CursorState {
  /** posição em px de buffer */
  x: number;
  y: number;
  kind: CursorKind;
  /** 0..1: animação de golpe da picareta */
  swing: number;
  visible: boolean;
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
  /** 0..1 calor do buraco negro */
  heat: number;
  /** 0..1 progresso do colapso final (0 = nenhum) */
  collapse: number;
  cursor: CursorState;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  big: boolean;
}

/**
 * Desenha o mundo num buffer de pixels nítidos ampliado com nearest-neighbor.
 * A escala de pixel é escolhida para que o mapa inteiro apareça perto de
 * 1:1. Luzes vão numa camada aditiva de baixa resolução (bloom discreto).
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  /** o próprio canvas da página trabalha na resolução do buffer; o CSS amplia (pixelated) */
  readonly buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  /** camadas estáticas: céu+estrelas+nebulosa e terreno+brilho dos cristais */
  private backLayer: HTMLCanvasElement = makeCanvas(1, 1);
  private terrainLayer: HTMLCanvasElement = makeCanvas(1, 1);
  private backKey = '';
  private terrainKey = '';
  readonly camera = new Camera();
  readonly particles = new Particles(700);
  pixelScale = 2;
  dpr = 1;
  private insetCss = { top: 0, bottom: 0, left: 0 };
  private zone: ZoneData | null = null;
  private terrain: TerrainArt | null = null;
  private asteroid: AsteroidArt | null = null;
  private hole: BlackHoleArt | null = null;
  private bigHole: BlackHoleArt | null = null;
  private bg: BackgroundArt | null = null;
  private sky: HTMLCanvasElement | null = null;
  private fragSprites = new Map<number, Sprite>();
  private glowSprites = new Map<string, HTMLCanvasElement>();
  private meteors: Meteor[] = [];
  private nextMeteor = 1;
  private frame = 0;
  private titleOrbit: { a: number; r: number; w: number; c: string; s: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.buffer = canvas;
    this.bctx = canvas.getContext('2d', { alpha: false })!;
  }

  setInsetsCss(top: number, bottom: number, left = 0) {
    this.insetCss = { top, bottom, left };
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
      const freeW = devW - this.insetCss.left * dpr;
      const fit = Math.min(freeW / (this.zone.width + 30), freeH / (this.zone.height + 20));
      scale = Math.max(1, Math.floor(fit));
    } else scale = Math.max(1, Math.round(Math.min(devW / 640, devH / 360)));
    this.pixelScale = scale;
    const bw = Math.ceil(devW / scale);
    const bh = Math.ceil(devH / scale);
    const changed = bw !== this.buffer.width || bh !== this.buffer.height;
    if (changed) {
      this.buffer.width = bw;
      this.buffer.height = bh;
      this.backLayer.width = bw;
      this.backLayer.height = bh;
      this.terrainLayer.width = bw;
      this.terrainLayer.height = bh;
      this.backKey = '';
      this.terrainKey = '';
    }
    this.canvas.style.width = `${(bw * scale) / dpr}px`;
    this.canvas.style.height = `${(bh * scale) / dpr}px`;
    this.camera.setView(bw, bh);
    const k = dpr / scale;
    this.camera.setInsets(this.insetCss.top * k, this.insetCss.bottom * k, this.insetCss.left * k);
    this.bctx.imageSmoothingEnabled = false;
    if ((changed || !this.sky) && this.zone) this.buildScreenLayers();
  }

  private buildScreenLayers() {
    const t = THEMES[this.zone!.theme];
    this.sky = makeSky(t, this.buffer.width, this.buffer.height);
    this.backKey = '';
    this.terrainKey = '';
  }

  cssToBuffer(cx: number, cy: number): Vec {
    return { x: (cx * this.dpr) / this.pixelScale, y: (cy * this.dpr) / this.pixelScale };
  }

  bufferPerCss() {
    return this.dpr / this.pixelScale;
  }

  /** Escala de texto/ícones em pixel para continuarem legíveis com pixels pequenos. */
  private ui() {
    return Math.max(1, Math.round(2 / this.pixelScale));
  }

  setZone(zone: ZoneData, highContrast: boolean) {
    this.zone = zone;
    this.terrain = makeTerrainArt(zone, highContrast);
    this.terrainKey = '';
    this.asteroid = makeAsteroid(zone.asteroid.r, zone.id * 31 + 5);
    this.hole = makeBlackHole(zone.blackHole.absorbRadius);
    this.bg = makeBackground(zone);
    this.fragSprites.clear();
    this.particles.clear();
    this.meteors = [];
    this.camera.setWorld(zone.width, zone.height);
    this.sky = null;
    this.resize();
  }

  rebuildTerrain(highContrast: boolean) {
    if (this.zone) this.terrain = makeTerrainArt(this.zone, highContrast);
    this.terrainKey = '';
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

  // ------------------------------------------------------------------
  // Tela de título: buraco negro gigante engolindo um anel de detritos
  // ------------------------------------------------------------------

  renderTitle(time: number, dt: number, cursor: CursorState) {
    if (!this.zone || !this.bg) return;
    this.frame++;
    this.particles.update(dt);
    if (!this.bigHole) this.bigHole = makeBlackHole(46);
    const ctx = this.bctx;
    const W = this.buffer.width;
    const H = this.buffer.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const cam = this.camera;
    const saved = { x: cam.x, y: cam.y };
    cam.x = this.zone.width / 2;
    cam.y = this.zone.height / 2;
    this.drawBackLayer(W, H);
    this.drawBackAnimated(time, dt, W, H);
    cam.x = saved.x;
    cam.y = saved.y;
    // buraco negro gigante
    const s = Math.max(1, Math.round(Math.min(W, H) / 260));
    const cx = Math.round(W * (W > H * 1.3 ? 0.66 : 0.5));
    const cy = Math.round(H * 0.52);
    const hf = this.bigHole.frames[Math.floor(time * 10) % this.bigHole.frames.length];
    ctx.drawImage(hf.canvas, cx - hf.ox * s, cy - hf.oy * s, hf.canvas.width * s, hf.canvas.height * s);
    // detritos espiralando
    if (this.titleOrbit.length < 90 && this.frame % 3 === 0) {
      this.titleOrbit.push({ a: Math.random() * Math.PI * 2, r: 140 + Math.random() * 120, w: 0.25 + Math.random() * 0.3, c: Math.random() < 0.7 ? PAL.amber : '#e070c8', s: Math.random() < 0.2 ? 2 : 1 });
    }
    for (const o of this.titleOrbit) {
      o.a += o.w * dt * (120 / Math.max(30, o.r));
      o.r -= dt * (6 + 600 / Math.max(20, o.r));
      const x = cx + Math.cos(o.a) * o.r * s;
      const y = cy + Math.sin(o.a) * o.r * s * 0.42;
      ctx.fillStyle = o.c;
      ctx.fillRect(Math.round(x), Math.round(y), o.s * s, o.s * s);
    }
    this.titleOrbit = this.titleOrbit.filter((o) => o.r > 52);
    const bc = this.bigHole.core;
    ctx.drawImage(bc.canvas, cx - bc.ox * s, cy - bc.oy * s, bc.canvas.width * s, bc.canvas.height * s);
    // brilho (sprites aditivos, sem passar pela tela inteira)
    const sz = 520 * s;
    this.additive(() => {
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.glowSprite('#7a30c8'), cx - sz / 2, cy - sz / 2, sz, sz);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(this.glowSprite('#ff9a5a'), cx - sz / 5, cy - sz / 5, sz / 2.5, sz / 2.5);
    });
    ctx.drawImage(bc.canvas, cx - bc.ox * s, cy - bc.oy * s, bc.canvas.width * s, bc.canvas.height * s);
    this.drawCursor(cursor, time);
  }

  /** Executa desenhos em modo aditivo e suavizado (brilhos), restaurando o estado. */
  private additive(fn: () => void) {
    const ctx = this.bctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    fn();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------
  // Jogo
  // ------------------------------------------------------------------

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
    const col = s.collapse;
    const quake = col > 0 ? col * 4 : 0;
    const tx = Math.round(W / 2 - cam.x * z + s.shake.x + (Math.random() - 0.5) * quake);
    const ty = Math.round(H / 2 - cam.y * z + s.shake.y + (Math.random() - 0.5) * quake);
    const ui = this.ui();

    // --- fundo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.drawBackLayer(W, H);
    this.drawBackAnimated(s.time, dt, W, H);
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

    // --- terreno (camada cacheada; some no colapso)
    const tx0 = Math.round(W / 2 - cam.x * z);
    const ty0 = Math.round(H / 2 - cam.y * z);
    const tkey = `${tx0},${ty0},${z.toFixed(5)}`;
    if (tkey !== this.terrainKey) {
      this.terrainKey = tkey;
      const tc = this.terrainLayer.getContext('2d')!;
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.clearRect(0, 0, W, H);
      tc.imageSmoothingEnabled = false;
      tc.setTransform(z, 0, 0, z, tx0, ty0);
      tc.drawImage(this.terrain.tex, 0, 0);
      // brilho dos cristais/veios embutido na camada
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.globalCompositeOperation = 'lighter';
      tc.imageSmoothingEnabled = true;
      tc.globalAlpha = 0.85;
      tc.drawImage(this.terrain.glow, tx0, ty0, zone.width * z, zone.height * z);
      tc.globalAlpha = 1;
      tc.globalCompositeOperation = 'source-over';
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.max(0, 1 - col * 1.4);
    ctx.drawImage(this.terrainLayer, tx - tx0, ty - ty0);
    ctx.globalAlpha = 1;
    for (const f of zone.fields) {
      const b = cam.toBuffer(f.x + f.w / 2, f.y);
      const arrow = f.ax < 0 ? '<' : f.ax > 0 ? '>' : '';
      const label = `${arrow}${arrow} ${f.label.toUpperCase()}`;
      drawPixelText(ctx, label, b.x - textWidth(label, ui) / 2, b.y + 4 * ui, 'rgba(160,240,232,0.95)', ui, '#03141a');
    }

    // --- buraco negro (cresce com a alimentação; enorme no colapso)
    const h = zone.blackHole;
    const growth = s.sim.holeGrowth;
    const hs = (1 + 0.75 * growth) * (1 + col * col * 14);
    const hf = this.hole.frames[Math.floor(s.time * (10 + s.heat * 14)) % this.hole.frames.length];
    const hc = this.hole.core;
    const drawHole = (spr: Sprite) => {
      ctx.setTransform(z * hs, 0, 0, z * hs, tx + z * h.x, ty + z * h.y);
      ctx.drawImage(spr.canvas, -spr.ox, -spr.oy);
    };
    drawHole(hf);
    drawHole(hc);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cb = cam.toBuffer(h.x, h.y);
    const holeR = s.sim.holeAbsorb();
    for (let i = 0; i < 36; i++) {
      const r = (holeR + 6 + ((i * 7.3) % 28)) * (1 + col * 6);
      const a = s.time * (2.2 + s.heat * 2.5 - r / 30) + i * 2.39;
      ctx.fillStyle = s.heat > 0.6 && i % 2 ? '#fff4d8' : i % 3 === 0 ? PAL.core : i % 3 === 1 ? '#e070c8' : '#ff9a5a';
      ctx.fillRect(Math.round(cb.x + Math.cos(a) * r * z + s.shake.x), Math.round(cb.y + Math.sin(a) * r * z + s.shake.y), ui, ui);
    }
    if (s.buildMode) this.ringPx(cb.x, cb.y, s.sim.holeAttract() * z, 'rgba(176,104,232,0.5)', Math.floor(s.sim.holeAttract() * z * 0.9), true);

    // --- asteroide
    const a = zone.asteroid;
    const ast = this.asteroid;
    const jig = s.crack > 0.6 ? (Math.random() - 0.5) * 1.6 : 0;
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.globalAlpha = Math.max(0, 1 - col * 1.6);
    ctx.drawImage(ast.base.canvas, Math.round(a.x - ast.base.ox + jig), Math.round(a.y - ast.base.oy));
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.6 + s.crack * 0.4 + Math.sin(s.time * 1.7) * 0.12 + (s.hoverAsteroid ? 0.25 : 0)) - col);
    ctx.drawImage(ast.glow.canvas, Math.round(a.x - ast.glow.ox + jig), Math.round(a.y - ast.glow.oy));
    ctx.globalAlpha = 1;
    // pedrinhas orbitando a fonte
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ab = cam.toBuffer(a.x, a.y);
    for (let i = 0; i < 9; i++) {
      const ang = s.time * (0.35 + (i % 3) * 0.08) + i * 0.7;
      const rr = (a.r + 8 + (i % 4) * 4) * z;
      const px = ab.x + Math.cos(ang) * rr;
      const py = ab.y + Math.sin(ang) * rr * 0.35;
      const front = Math.sin(ang) > 0;
      ctx.fillStyle = front ? (i % 3 ? '#8a6a7a' : PAL.amber) : '#3a2a3e';
      ctx.fillRect(Math.round(px), Math.round(py), ui + (i % 2), ui);
    }
    if (this.frame % 5 === 0 && this.particles.pool.length < this.particles.cap * 0.5) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.spawn({ x: a.x + Math.cos(ang) * a.r * 0.8, y: a.y + Math.sin(ang) * a.r * 0.8, vx: (Math.random() - 0.5) * 6, vy: -8 - Math.random() * 8, life: 1.6, color: Math.random() < 0.5 ? '#ff8a2a' : PAL.core, size: 1, gravity: -4 });
    }

    // --- dispositivos
    for (const d of s.sim.devices.values()) this.drawDevice(d, z, tx, ty, s.time, d.enabled ? 1 - col : 0.5 - col);

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
      const sz = Math.max(1, Math.round(p.size * Math.min(2, z))) * ui;
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(b.x + s.shake.x), Math.round(b.y + s.shake.y), sz, sz);
    }
    ctx.globalAlpha = 1;

    // --- luzes e horizonte negro por cima
    this.drawGlow(s, tx, ty, hs);
    drawHole(hc);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (col > 0.85) {
      ctx.fillStyle = `rgba(255,240,220,${(col - 0.85) / 0.15})`;
      ctx.fillRect(0, 0, W, H);
    }

    // --- feixe manual
    if (s.sim.grab && s.grabPointer) {
      const f = s.sim.fragments.get(s.sim.grab.fragId);
      if (f) {
        const fp = cam.toBuffer(f.body.position.x, f.body.position.y);
        const pp = cam.toBuffer(s.grabPointer.x, s.grabPointer.y);
        const d = Math.hypot(s.grabPointer.x - f.body.position.x, s.grabPointer.y - f.body.position.y);
        const stretch = d / s.sim.grabReach();
        const c = stretch > 0.75 ? PAL.amber : PAL.cyan;
        this.linePx(fp.x + s.shake.x, fp.y + s.shake.y, pp.x + s.shake.x, pp.y + s.shake.y, c, 3, Math.floor(s.time * 20));
        this.ringPx(fp.x, fp.y, (f.radius + 4 + Math.sin(s.time * 12) * 1.5) * z, c, 16);
      }
    }
    if (s.trajectory) this.dots(s.trajectory, 'rgba(255,224,138,0.9)');

    // --- seleção, fantasma, prévias e alças
    if (s.selected) {
      this.drawSelection(s.selected, s);
      this.drawDevicePreview(s.selected, s);
    }
    if (s.ghost) {
      this.drawGhost(s.ghost, s, tx, ty);
      this.drawDevicePreview(s.ghost, s);
    }
    for (const hd of s.handles) {
      const b = cam.toBuffer(hd.x, hd.y);
      if (hd.kind === 'rotate') {
        this.ringPx(b.x, b.y, hd.r * z + 1, PAL.core, 20);
        ctx.fillStyle = PAL.core;
        ctx.fillRect(Math.round(b.x) - ui, Math.round(b.y) - ui, ui * 2 + 1, ui * 2 + 1);
      }
    }

    // --- textos flutuantes
    for (const fl of s.floaters) {
      const b = cam.toBuffer(fl.x, fl.y);
      const t = 1 - fl.life / fl.max;
      ctx.globalAlpha = Math.min(1, (fl.life / fl.max) * 2.5);
      drawPixelText(ctx, fl.text, b.x - textWidth(fl.text, ui) / 2, b.y - 10 * ui - t * 16 * ui, fl.color, ui);
    }
    ctx.globalAlpha = 1;
    if (s.hint) {
      const b = cam.toBuffer(s.hint.x, s.hint.y);
      const bob = Math.round(Math.sin(s.time * 4) * 2);
      drawPixelText(ctx, s.hint.text, b.x - textWidth(s.hint.text, ui) / 2, b.y + bob, PAL.core, ui, '#1a0c2a');
    }

    this.drawCursor(s.cursor, s.time);
  }

  // ------------------------------------------------------------------
  // Fundo animado
  // ------------------------------------------------------------------

  private par(x: number, y: number, p: number, W: number, H: number) {
    const cam = this.camera;
    const zw = this.zone!.width;
    const zh = this.zone!.height;
    return {
      x: Math.round(W / 2 + (x - zw / 2) * 0.9 - (cam.x - zw / 2) * p),
      y: Math.round(H / 2 + (y - zh / 2) * 0.9 - (cam.y - zh / 2) * p),
    };
  }

  /** Céu, estrelas e nebulosa: só são redesenhados quando a câmera se move. */
  private drawBackLayer(W: number, H: number) {
    const cam = this.camera;
    const key = `${Math.round(cam.x * 0.1)},${Math.round(cam.y * 0.1)}`;
    if (key !== this.backKey) {
      this.backKey = key;
      const bg = this.bg!;
      const c = this.backLayer.getContext('2d')!;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.imageSmoothingEnabled = false;
      if (this.sky) c.drawImage(this.sky, 0, 0);
      const tile = (img: HTMLCanvasElement, par: number) => {
        const tw = img.width;
        const th = img.height;
        const ox = -(((cam.x * par) % tw) + tw) % tw;
        const oy = -(((cam.y * par) % th) + th) % th;
        for (let y = Math.floor(oy); y < H; y += th) for (let x = Math.floor(ox); x < W; x += tw) c.drawImage(img, x, y);
      };
      tile(bg.far, 0.03);
      const ns = bg.nebulaScale;
      const np = this.par(-350, -220, 0.18, W, H);
      c.drawImage(bg.nebula, np.x, np.y, bg.nebula.width * ns * 0.9, bg.nebula.height * ns * 0.9);
      tile(bg.near, 0.1);
    }
    this.bctx.setTransform(1, 0, 0, 1, 0, 0);
    this.bctx.drawImage(this.backLayer, 0, 0);
  }

  /** O que se mexe no fundo: estrelas que piscam, galáxia, planetas, rochas à deriva e meteoros. */
  private drawBackAnimated(time: number, dt: number, W: number, H: number) {
    const bg = this.bg!;
    const ctx = this.bctx;
    const zw = this.zone!.width;
    const zh = this.zone!.height;
    const ui = this.ui();
    for (const t of bg.twinkles) {
      const v = 0.5 + 0.5 * Math.sin(time * t.s + t.p);
      const x = Math.round(t.x * W);
      const y = Math.round(t.y * H);
      ctx.globalAlpha = 0.25 + v * 0.75;
      ctx.fillStyle = t.c;
      ctx.fillRect(x, y, ui, ui);
      if (v > 0.8) {
        ctx.globalAlpha = (v - 0.8) * 5;
        ctx.fillRect(x - 2 * ui, y, 5 * ui, ui);
        ctx.fillRect(x, y - 2 * ui, ui, 5 * ui);
      }
    }
    ctx.globalAlpha = 1;
    const gf = bg.galaxy[Math.floor(time * 0.6) % bg.galaxy.length];
    const gp = this.par(bg.galaxyPos.x, bg.galaxyPos.y, 0.06, W, H);
    ctx.drawImage(gf.canvas, gp.x - gf.ox, gp.y - gf.oy);
    for (const p of bg.planets) {
      const q = this.par(p.x, p.y, p.par, W, H);
      const frame = p.frames[Math.floor(((time / p.spin) % 1) * p.frames.length)];
      const ma = time * p.moonSpeed;
      const mx = q.x + Math.cos(ma) * p.moonOrbit;
      const my = q.y + Math.sin(ma) * p.moonOrbit * 0.32;
      const behind = Math.sin(ma) < 0;
      if (p.moon && behind) ctx.drawImage(p.moon.canvas, Math.round(mx - p.moon.ox), Math.round(my - p.moon.oy));
      ctx.drawImage(frame.canvas, q.x - frame.ox, q.y - frame.oy);
      if (p.moon && !behind) ctx.drawImage(p.moon.canvas, Math.round(mx - p.moon.ox), Math.round(my - p.moon.oy));
    }
    for (const r of bg.farRocks) {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (r.x < -zw * 0.2) r.x = zw * 1.2;
      if (r.x > zw * 1.2) r.x = -zw * 0.2;
      if (r.y < -zh * 0.2) r.y = zh * 1.2;
      if (r.y > zh * 1.2) r.y = -zh * 0.2;
      const q = this.par(r.x, r.y, r.par, W, H);
      if (q.x < -40 || q.y < -40 || q.x > W + 40 || q.y > H + 40) continue;
      ctx.drawImage(r.sprite.canvas, q.x - r.sprite.ox, q.y - r.sprite.oy);
    }
    this.drawMeteors(time, dt, W, H);
  }

  /** Estrelas cadentes rápidas e meteoros grandes e lentos com cauda de fogo. */
  private drawMeteors(time: number, dt: number, W: number, H: number) {
    const ctx = this.bctx;
    const ui = this.ui();
    if (time > this.nextMeteor) {
      const big = Math.random() < 0.35;
      const fromLeft = Math.random() < 0.5;
      const sp = big ? 30 + Math.random() * 30 : 260 + Math.random() * 200;
      const ang = (fromLeft ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.4;
      this.meteors.push({
        x: fromLeft ? -20 : W + 20,
        y: Math.random() * H * 0.6,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: big ? 40 : 2.5,
        max: big ? 40 : 2.5,
        size: big ? 2 + Math.floor(Math.random() * 2) : 1,
        big,
      });
      this.nextMeteor = time + (big ? 5 : 1.5) + Math.random() * 4;
    }
    const cols = this.bg!.meteorColors;
    for (const m of this.meteors) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      const len = m.big ? 26 : 18;
      const l = Math.hypot(m.vx, m.vy) || 1;
      const dx = m.vx / l;
      const dy = m.vy / l;
      for (let i = len; i >= 0; i--) {
        const t = i / len;
        ctx.globalAlpha = (1 - t) * (m.big ? 0.95 : 0.8);
        ctx.fillStyle = cols[Math.min(cols.length - 1, Math.floor(t * cols.length))];
        const w = Math.max(1, Math.round((m.size * (1 - t * 0.7)) * ui));
        ctx.fillRect(Math.round(m.x - dx * i * ui * 1.5), Math.round(m.y - dy * i * ui * 1.5), w, w);
      }
      if (m.big) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#4a3040';
        const r = (m.size + 2) * ui;
        ctx.fillRect(Math.round(m.x - r / 2), Math.round(m.y - r / 2), r, r);
        ctx.fillStyle = '#fff0c0';
        ctx.fillRect(Math.round(m.x - r / 2), Math.round(m.y - r / 2), ui, ui);
      }
    }
    ctx.globalAlpha = 1;
    this.meteors = this.meteors.filter((m) => m.life > 0 && m.x > -80 && m.x < W + 80 && m.y < H + 80);
  }

  /** Luzes dinâmicas como sprites aditivos pequenos (o brilho fixo do terreno já está na camada). */
  private drawGlow(s: RenderState, tx: number, ty: number, holeScale: number) {
    const ctx = this.bctx;
    const W = this.buffer.width;
    const H = this.buffer.height;
    const z = this.camera.zoom;
    const zone = this.zone!;
    const k = s.reduceGlow ? 0.45 : 1;
    const put = (wx: number, wy: number, color: string, worldSize: number, alpha: number) => {
      const sz = worldSize * z;
      if (sz < 1 || alpha <= 0.01) return;
      const x = tx + wx * z;
      const y = ty + wy * z;
      if (x < -sz || y < -sz || x > W + sz || y > H + sz) return;
      ctx.globalAlpha = Math.min(1, alpha * k);
      ctx.drawImage(this.glowSprite(color), x - sz / 2, y - sz / 2, sz, sz);
    };
    this.additive(() => {
      const a = zone.asteroid;
      put(a.x, a.y, '#ff7a2a', a.r * 4, 0.35 + s.crack * 0.3 + Math.sin(s.time * 1.7) * 0.05);
      const h = zone.blackHole;
      put(h.x, h.y, '#7a30c8', (h.absorbRadius + 42) * 3.4 * holeScale, 0.38);
      put(h.x, h.y, '#ff7a2a', (h.absorbRadius + 30) * 2.6 * holeScale, 0.12 + s.heat * 0.45);
      put(h.x, h.y, '#fff0c0', (h.absorbRadius + 8) * 2 * holeScale, s.heat * 0.35);
      for (const f of s.sim.fragments.values()) put(f.body.position.x, f.body.position.y, fragmentGlowColor(f.type), 26, 0.32);
      for (const d of s.sim.devices.values()) {
        if (!d.enabled) continue;
        const art = deviceArt(d.type);
        const c = Math.cos(d.angle);
        const sn = Math.sin(d.angle);
        for (const l of art.lights) {
          put(d.x + l.x * c - l.y * sn, d.y + l.x * sn + l.y * c, l.color, l.size * (1 + d.rt.flash), 0.35 + d.rt.flash * 0.5);
        }
      }
    });
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
          this.polyPx(transformPoly([{ x: -15, y: -4 }, { x: 15, y: -4 }, { x: 15, y: -4 - Hh }, { x: -15, y: -4 - Hh }], d, d.angle), 'rgba(85,215,232,0.5)', tx, ty, 4);
      } else if (d.type === 'attractor' || d.type === 'repulsor') {
        const R = FIELD_RADIUS * mods.fieldRadiusMul;
        const colr = d.type === 'attractor' ? 'rgba(85,215,232,0.6)' : 'rgba(255,122,154,0.6)';
        const b = this.camera.toBuffer(d.x, d.y);
        for (let k = 0; k < 3; k++) {
          let t = (s.time * 0.45 + k / 3) % 1;
          if (d.type === 'attractor') t = 1 - t;
          this.ringPx(b.x, b.y, R * t * z, colr, Math.max(10, Math.floor(R * t * z * 0.6)));
        }
        if (show) this.ringPx(b.x, b.y, R * z, colr, Math.floor(R * z * 1.2), true);
      }
    }
  }

  drawDevice(d: Device, z: number, tx: number, ty: number, time: number, alpha: number) {
    if (alpha <= 0) return;
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
    if (art.lit && d.rt.flash > 0.3) spr = art.lit;
    const c = Math.cos(d.angle);
    const sn = Math.sin(d.angle);
    ctx.globalAlpha = alpha;
    // placa de pulso recua um instante ao disparar
    const squash = d.type === 'spring' ? 1 - d.rt.flash * 0.15 : 1;
    ctx.setTransform(z * c, z * sn, -z * sn * squash, z * c * squash, tx + z * d.x, ty + z * d.y);
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
    // seta de direção (gira com a peça; esteira com velocidade negativa inverte)
    let dir = deviceArrow(d.type);
    if (dir) {
      if (d.type === 'conveyor' && (d.params.speed ?? 3) < 0) dir = { x: -1, y: 0 };
      const ar = arrowSprite();
      const la = Math.atan2(dir.y, dir.x) + d.angle;
      const off = d.type === 'spring' ? -10 : d.type === 'launcher' ? -14 : d.type === 'lift' ? -12 : d.type === 'fan' ? 0 : -9;
      const ox = d.type === 'fan' ? 13 : 0;
      const wx = d.x + (ox * c - off * sn);
      const wy = d.y + (ox * sn + off * c);
      const bob = Math.sin(time * 5) * 1.2;
      const ca = Math.cos(la);
      const sa = Math.sin(la);
      ctx.globalAlpha = alpha * 0.95;
      ctx.setTransform(z * ca, z * sa, -z * sa, z * ca, tx + z * (wx + ca * bob), ty + z * (wy + sa * bob));
      ctx.drawImage(ar.canvas, -ar.ox, -ar.oy);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Arco pontilhado de onde a placa de pulso/canhão vão mandar as pedras. */
  private drawDevicePreview(d: { type: DeviceType; x: number; y: number; angle: number; params: Record<string, number> }, s: RenderState) {
    if (d.type !== 'spring' && d.type !== 'launcher') return;
    const mods = s.sim.mods;
    const n = { x: Math.sin(d.angle), y: -Math.cos(d.angle) };
    const power = d.type === 'spring' ? (d.params.power ?? 7) * mods.springMul : d.params.power ?? 11;
    let x = d.x + n.x * 8;
    let y = d.y + n.y * 8;
    let vx = n.x * power;
    let vy = n.y * power;
    const g = (Config.gravity / 3600) * this.zone!.gravity.y;
    const pts: Vec[] = [];
    const terr = s.sim.terrain;
    for (let i = 0; i < 160; i++) {
      vy += g;
      vx += (Config.gravity / 3600) * this.zone!.gravity.x;
      x += vx;
      y += vy;
      if (i % 2 === 0) pts.push({ x, y });
      if (terr.some((p) => pointInPoly({ x, y }, p))) break;
      if (Math.hypot(x - this.zone!.blackHole.x, y - this.zone!.blackHole.y) < s.sim.holeAbsorb()) break;
      if (y > this.zone!.height + 40) break;
    }
    this.dots(pts, 'rgba(255,224,138,0.9)');
  }

  private dots(pts: Vec[], color: string) {
    const ctx = this.bctx;
    const ui = this.ui();
    ctx.fillStyle = color;
    for (let i = 0; i < pts.length; i++) {
      const p = this.camera.toBuffer(pts[i].x, pts[i].y);
      ctx.globalAlpha = 1 - (i / pts.length) * 0.7;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), ui + (i % 3 === 0 ? 1 : 0), ui + (i % 3 === 0 ? 1 : 0));
    }
    ctx.globalAlpha = 1;
  }

  private drawCursor(c: CursorState, time: number) {
    if (!c.visible || c.kind === 'none') return;
    const art = cursorArt();
    const spr = art[c.kind];
    const s = this.ui();
    const ctx = this.bctx;
    if (c.kind === 'pick') {
      // golpe: a picareta gira para trás e desce
      const sw = c.swing;
      const ang = sw > 0 ? (sw > 0.5 ? -0.9 * (1 - (sw - 0.5) * 2) : -0.9 * (sw * 2)) : Math.sin(time * 3) * 0.06;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      ctx.setTransform(s * ca, s * sa, -s * sa, s * ca, Math.round(c.x), Math.round(c.y));
      ctx.drawImage(spr.canvas, -spr.ox, -spr.oy);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    let ox = 0;
    let oy = 0;
    if (c.kind === 'clawOpen') oy = Math.round(Math.sin(time * 6) * 1);
    ctx.setTransform(s, 0, 0, s, Math.round(c.x), Math.round(c.y + oy * s));
    ctx.drawImage(spr.canvas, -spr.ox + ox, -spr.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (c.kind === 'clawClosed') {
      // anéis de energia em volta da garra
      const r = 9 * s + Math.sin(time * 14) * s;
      this.ringPx(c.x, c.y + 2 * s, r, 'rgba(85,215,232,0.85)', 14);
    }
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
    this.drawDevice(fake, z, tx, ty, s.time, 0.8);
    const colr = g.valid ? PAL.ok : PAL.bad;
    for (const p of footprint(g.type, g.params).map((q) => transformPoly(q, g, g.angle))) this.polyPx(p, colr, tx, ty, 0);
    const def = DEVICES[g.type];
    if (def.field) {
      const f = def.field(g.params, { radius: s.sim.mods.fieldRadiusMul });
      if (f.kind === 'radial' && f.radius) {
        const b = this.camera.toBuffer(g.x, g.y);
        this.ringPx(b.x, b.y, f.radius * z, 'rgba(85,215,232,0.6)', Math.floor(f.radius * z), true);
      } else if (f.rect) {
        const r = f.rect;
        this.polyPx(transformPoly([{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }], g, g.angle), 'rgba(85,215,232,0.6)', tx, ty, 3);
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
    const w = this.ui();
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
    const w = this.ui();
    for (let i = 0; i < steps; i++) {
      if (dotted && i % 2) continue;
      const a = (i / steps) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), w, w);
    }
  }
}
