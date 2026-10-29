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
  deviceArt,
  makeAsteroid,
  makeBackground,
  makeBlackHole,
  makeFragmentSprite,
  makeTerrainTexture,
  type AsteroidArt,
  type BackgroundArt,
  type BlackHoleArt,
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
  hoverAsteroid: boolean;
  hoverFragment: number;
  hint: { x: number; y: number; text: string } | null;
}

/**
 * Desenha o mundo num buffer de baixa resolução (≈640×360 px lógicos) e
 * amplia com nearest-neighbor para manter pixels nítidos.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  readonly particles = new Particles(600);
  pixelScale = 2;
  dpr = 1;
  private zone: ZoneData | null = null;
  private terrain: HTMLCanvasElement | null = null;
  private asteroid: AsteroidArt | null = null;
  private hole: BlackHoleArt | null = null;
  private bg: BackgroundArt | null = null;
  private fragSprites = new Map<number, Sprite>();
  private frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.buffer = makeCanvas(640, 360);
    this.bctx = this.buffer.getContext('2d')!;
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.dpr = dpr;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const devW = Math.floor(cssW * dpr);
    const devH = Math.floor(cssH * dpr);
    const scale = Math.max(1, Math.round(Math.min(devW / 640, devH / 360)));
    this.pixelScale = scale;
    const bw = Math.ceil(devW / scale);
    const bh = Math.ceil(devH / scale);
    this.buffer.width = bw;
    this.buffer.height = bh;
    this.canvas.width = bw * scale;
    this.canvas.height = bh * scale;
    this.canvas.style.width = `${(bw * scale) / dpr}px`;
    this.canvas.style.height = `${(bh * scale) / dpr}px`;
    this.camera.setView(bw, bh);
    this.bctx.imageSmoothingEnabled = false;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** CSS px (relativo ao canvas) → px do buffer. */
  cssToBuffer(cx: number, cy: number): Vec {
    return { x: (cx * this.dpr) / this.pixelScale, y: (cy * this.dpr) / this.pixelScale };
  }

  /** Quantos px de buffer equivalem a 1 px CSS. */
  bufferPerCss() {
    return this.dpr / this.pixelScale;
  }

  setZone(zone: ZoneData, highContrast: boolean) {
    this.zone = zone;
    this.terrain = makeTerrainTexture(zone, highContrast);
    this.asteroid = makeAsteroid(zone.asteroid.r, zone.id * 31 + 5);
    this.hole = makeBlackHole(zone.blackHole.absorbRadius);
    this.bg = makeBackground(zone);
    this.fragSprites.clear();
    this.particles.clear();
    this.camera.setWorld(zone.width, zone.height);
    this.camera.setView(this.buffer.width, this.buffer.height);
  }

  rebuildTerrain(highContrast: boolean) {
    if (this.zone) this.terrain = makeTerrainTexture(this.zone, highContrast);
  }

  forgetFragment(id: number) {
    this.fragSprites.delete(id);
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
    const theme = THEMES[zone.theme];
    const z = cam.zoom;
    const tx = Math.round(W / 2 - cam.x * z + s.shake.x);
    const ty = Math.round(H / 2 - cam.y * z + s.shake.y);

    // --- fundo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    this.drawBackground(s, W, H);
    if (s.highContrast) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, W, H);
    }

    // --- campos ambientais
    ctx.setTransform(z, 0, 0, z, tx, ty);
    for (const f of zone.fields) {
      ctx.fillStyle = 'rgba(85,215,232,0.08)';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawAmbientFields(s, tx, ty);
    for (const f of zone.fields) {
      const b = cam.toBuffer(f.x + f.w / 2, f.y);
      const arrow = f.ax < 0 ? '<' : f.ax > 0 ? '>' : '';
      const label = `${arrow}${arrow} ${f.label.toUpperCase()}`;
      drawPixelText(ctx, label, b.x - textWidth(label) / 2, b.y + 4, 'rgba(127,230,224,0.85)', 1);
    }
    this.drawDeviceFields(s, tx, ty);

    // --- terreno
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.drawImage(this.terrain, 0, 0);

    // --- buraco negro
    this.drawBlackHole(s, tx, ty);

    // --- asteroide
    const a = zone.asteroid;
    const ast = this.asteroid;
    const jig = s.crack > 0.6 ? (Math.random() - 0.5) * 1.2 : 0;
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.drawImage(ast.base.canvas, Math.round(a.x - ast.base.ox + jig), Math.round(a.y - ast.base.oy));
    ctx.globalAlpha = Math.min(1, 0.45 + s.crack * 0.55 + Math.sin(s.time * 1.7) * 0.08 + (s.hoverAsteroid ? 0.2 : 0));
    ctx.drawImage(ast.glow.canvas, Math.round(a.x - ast.glow.ox + jig), Math.round(a.y - ast.glow.oy));
    ctx.globalAlpha = 1;

    // --- dispositivos
    for (const d of s.sim.devices.values()) this.drawDevice(d, z, tx, ty, s.time, d === s.selected ? 1 : d.enabled ? 1 : 0.5);

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
        this.ringPx(b.x + s.shake.x, b.y + s.shake.y, (f.radius + 3) * z, PAL.cyan, 10);
      }
    }
    if (this.frame % 90 === 0) {
      for (const id of this.fragSprites.keys()) if (!s.sim.fragments.has(id)) this.fragSprites.delete(id);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // --- feixe manual
    if (s.sim.grab && s.grabPointer) {
      const f = s.sim.fragments.get(s.sim.grab.fragId);
      if (f) {
        const fp = cam.toBuffer(f.body.position.x, f.body.position.y);
        const pp = cam.toBuffer(s.grabPointer.x, s.grabPointer.y);
        const d = Math.hypot(s.grabPointer.x - f.body.position.x, s.grabPointer.y - f.body.position.y);
        const stretch = d / s.sim.grabReach();
        const col = stretch > 0.75 ? PAL.amber : PAL.cyan;
        this.linePx(fp.x + s.shake.x, fp.y + s.shake.y, pp.x + s.shake.x, pp.y + s.shake.y, col, 2, Math.floor(s.time * 20));
        this.ringPx(pp.x + s.shake.x, pp.y + s.shake.y, 3, col, 8);
      }
    }
    if (s.trajectory) {
      for (let i = 0; i < s.trajectory.length; i += 2) {
        const p = cam.toBuffer(s.trajectory[i].x, s.trajectory[i].y);
        ctx.fillStyle = i % 4 ? 'rgba(255,224,138,0.5)' : 'rgba(255,224,138,0.9)';
        ctx.fillRect(Math.round(p.x + s.shake.x), Math.round(p.y + s.shake.y), 1, 1);
      }
    }

    // --- partículas
    for (const p of this.particles.pool) {
      const b = cam.toBuffer(p.x, p.y);
      const sz = Math.max(1, Math.round(p.size * Math.min(1.5, z)));
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(b.x + s.shake.x), Math.round(b.y + s.shake.y), sz, sz);
    }
    ctx.globalAlpha = 1;

    // --- seleção, alças e fantasma
    if (s.selected) this.drawSelection(s.selected, s);
    if (s.ghost) this.drawGhost(s.ghost, s, tx, ty);
    for (const h of s.handles) {
      const b = cam.toBuffer(h.x, h.y);
      if (h.kind === 'rotate') {
        this.ringPx(b.x, b.y, h.r * z, PAL.core, 16);
        ctx.fillStyle = PAL.core;
        ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3);
      }
    }

    // --- textos flutuantes
    for (const fl of s.floaters) {
      const b = cam.toBuffer(fl.x, fl.y);
      const t = 1 - fl.life / fl.max;
      ctx.globalAlpha = Math.min(1, fl.life / fl.max * 2.5);
      drawPixelText(ctx, fl.text, b.x - textWidth(fl.text) / 2, b.y - 10 - t * 14, fl.color, 1);
    }
    ctx.globalAlpha = 1;
    if (s.hint) {
      const b = cam.toBuffer(s.hint.x, s.hint.y);
      const bob = Math.round(Math.sin(s.time * 4) * 2);
      drawPixelText(ctx, s.hint.text, b.x - textWidth(s.hint.text) / 2, b.y + bob, PAL.core, 1);
    }

    // --- blit
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.buffer, 0, 0, this.canvas.width, this.canvas.height);
  }

  private drawBackground(s: RenderState, W: number, H: number) {
    const bg = this.bg!;
    const ctx = this.bctx;
    const cam = this.camera;
    const tile = (img: HTMLCanvasElement, par: number) => {
      const tw = img.width;
      const th = img.height;
      const ox = -(((cam.x * par) % tw) + tw) % tw;
      const oy = -(((cam.y * par) % th) + th) % th;
      for (let y = Math.floor(oy); y < H; y += th) for (let x = Math.floor(ox); x < W; x += tw) ctx.drawImage(img, x, y);
    };
    tile(bg.far, 0.04);
    const ns = bg.nebulaScale;
    const z = cam.zoom;
    const nz = ns * Math.max(0.5, Math.min(1.2, z));
    const nx = Math.round(W / 2 - (cam.x * 0.35 + this.zone!.width * 0.65 * 0.5) * (nz / ns));
    const ny = Math.round(H / 2 - (cam.y * 0.35 + this.zone!.height * 0.65 * 0.5) * (nz / ns));
    ctx.drawImage(bg.nebula, nx - 20 * nz, ny - 15 * nz, bg.nebula.width * nz, bg.nebula.height * nz);
    for (const p of bg.planets) {
      const bx = Math.round(W / 2 + (p.x - this.zone!.width / 2) * 0.55 - (cam.x - this.zone!.width / 2) * p.par);
      const by = Math.round(H / 2 + (p.y - this.zone!.height / 2) * 0.55 - (cam.y - this.zone!.height / 2) * p.par);
      ctx.drawImage(p.sprite.canvas, bx - p.sprite.ox, by - p.sprite.oy);
    }
    tile(bg.near, 0.12);
    void s;
  }

  private drawAmbientFields(s: RenderState, tx: number, ty: number) {
    const ctx = this.bctx;
    const z = this.camera.zoom;
    for (const f of this.zone!.fields) {
      const len = Math.hypot(f.ax, f.ay) || 1;
      const dx = f.ax / len;
      const dy = f.ay / len;
      const n = Math.max(10, Math.floor((f.w * f.h) / 900));
      ctx.fillStyle = 'rgba(127,230,224,0.75)';
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
        ctx.fillStyle = 'rgba(191,232,242,0.65)';
        for (let k = 0; k < 9; k++) {
          const lane = ((k * 0.37) % 1) * 30 - 15;
          const t = (s.time * 1.6 + k * 0.27) % 1;
          const lx = 10 + t * L;
          for (let q = 0; q < 3; q++) {
            const px = d.x + c * (lx - q * 3) - sn * lane;
            const py = d.y + sn * (lx - q * 3) + c * lane;
            ctx.fillRect(Math.round(tx + px * z), Math.round(ty + py * z), 1, 1);
          }
        }
        if (show) this.polyPx(transformPoly([{ x: 7, y: -18 }, { x: 7 + L, y: -18 }, { x: 7 + L, y: 18 }, { x: 7, y: 18 }], d, d.angle), 'rgba(85,215,232,0.5)', tx, ty, 4);
      } else if (d.type === 'lift') {
        const Hh = LIFT_HEIGHT * mods.fieldRadiusMul;
        ctx.fillStyle = 'rgba(85,215,232,0.07)';
        ctx.save();
        ctx.setTransform(z * c, z * sn, -z * sn, z * c, tx + z * d.x, ty + z * d.y);
        ctx.fillRect(-LIFT_WIDTH / 2, -4 - Hh, LIFT_WIDTH, Hh);
        ctx.restore();
        ctx.fillStyle = 'rgba(160,240,255,0.7)';
        for (let k = 0; k < 10; k++) {
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
        const col = d.type === 'attractor' ? 'rgba(85,215,232,0.55)' : 'rgba(255,122,154,0.55)';
        for (let k = 0; k < 3; k++) {
          let t = (s.time * 0.45 + k / 3) % 1;
          if (d.type === 'attractor') t = 1 - t;
          const b = this.camera.toBuffer(d.x, d.y);
          this.ringPx(b.x, b.y, R * t * z, col, Math.max(10, Math.floor(R * t * z * 0.6)));
        }
        if (show) {
          const b = this.camera.toBuffer(d.x, d.y);
          this.ringPx(b.x, b.y, R * z, col, Math.floor(R * z * 1.2), true);
        }
      }
    }
  }

  private drawBlackHole(s: RenderState, tx: number, ty: number) {
    const ctx = this.bctx;
    const z = this.camera.zoom;
    const h = this.zone!.blackHole;
    const art = this.hole!;
    const spin = (spr: Sprite, a: number) => {
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ctx.setTransform(z * c, z * sn, -z * sn, z * c, tx + z * h.x, ty + z * h.y);
      ctx.drawImage(spr.canvas, -spr.ox, -spr.oy);
    };
    spin(art.halo, -s.time * 0.15);
    spin(art.ring, s.time * 0.6);
    ctx.setTransform(z, 0, 0, z, tx, ty);
    ctx.drawImage(art.core.canvas, Math.round(h.x - art.core.ox), Math.round(h.y - art.core.oy));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cb = this.camera.toBuffer(h.x, h.y);
    for (let i = 0; i < 26; i++) {
      const r = h.absorbRadius + 5 + ((i * 7.3) % 15);
      const a = s.time * (1.6 - r / 40) + i * 2.39;
      const x = cb.x + Math.cos(a) * r * z;
      const y = cb.y + Math.sin(a) * r * z * 0.92;
      ctx.fillStyle = i % 3 === 0 ? PAL.core : i % 3 === 1 ? PAL.vortex : '#FF9A5A';
      ctx.fillRect(Math.round(x + s.shake.x), Math.round(y + s.shake.y), 1, 1);
    }
    if (s.buildMode) this.ringPx(cb.x, cb.y, h.attractRadius * z, 'rgba(157,104,232,0.45)', Math.floor(h.attractRadius * z * 0.9), true);
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
    this.drawDevice(fake, z, tx, ty, s.time, 0.7);
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
    for (let guard = 0; guard < 4000; guard++) {
      if (!dash || Math.floor(i / dash) % 2 === 0) ctx.fillRect(x0, y0, 1, 1);
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
    for (let i = 0; i < steps; i++) {
      if (dotted && i % 2) continue;
      const a = (i / steps) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }
}
