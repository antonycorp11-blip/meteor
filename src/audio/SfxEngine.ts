import type { AudioBus } from './AudioBus';

type Kind =
  | 'crack'
  | 'impact'
  | 'absorb'
  | 'bumper'
  | 'booster'
  | 'launch'
  | 'gate'
  | 'arm'
  | 'place'
  | 'invalid'
  | 'sell'
  | 'goal'
  | 'ui'
  | 'shatter'
  | 'pulse'
  | 'snap';

const MIN_GAP: Partial<Record<Kind, number>> = {
  impact: 0.028,
  absorb: 0.05,
  crack: 0.04,
  bumper: 0.05,
  booster: 0.06,
  gate: 0.1,
  arm: 0.1,
};

/** Efeitos sonoros sintetizados, com limite de vozes simultâneas. */
export class SfxEngine {
  private bus: AudioBus;
  private last: Partial<Record<Kind, number>> = {};
  private voices = 0;
  private maxVoices = 12;
  private noise: AudioBuffer | null = null;
  private hum: { o1: OscillatorNode; o2: OscillatorNode; g: GainNode } | null = null;

  constructor(bus: AudioBus) {
    this.bus = bus;
  }

  private ok(kind: Kind): AudioContext | null {
    const ctx = this.bus.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const now = ctx.currentTime;
    const gap = MIN_GAP[kind] ?? 0.02;
    if ((this.last[kind] ?? -1) > now - gap) return null;
    if (this.voices >= this.maxVoices) return null;
    this.last[kind] = now;
    return ctx;
  }

  private track(dur: number) {
    this.voices++;
    setTimeout(() => this.voices--, dur * 1000 + 50);
  }

  private noiseBuf(ctx: AudioContext) {
    if (this.noise) return this.noise;
    const len = ctx.sampleRate;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    return b;
  }

  private jitter(x: number, amt = 0.05) {
    return x * (1 + (Math.random() * 2 - 1) * amt);
  }

  private tone(ctx: AudioContext, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, dest: AudioNode = this.bus.sfx) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(ctx: AudioContext, t: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q = 0.8) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf(ctx);
    src.playbackRate.value = this.jitter(1, 0.1);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  crack() {
    const ctx = this.ok('crack');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseHit(ctx, t, 0.09, 0.32, 'bandpass', this.jitter(1300), 700, 1.1);
    this.tone(ctx, 'triangle', this.jitter(880), 620, t, 0.08, 0.07);
    this.tone(ctx, 'sine', 150, 60, t, 0.12, 0.22);
    this.track(0.15);
  }

  impact(speed: number, mass: number, surface: string, glass: boolean) {
    const ctx = this.ok('impact');
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = Math.min(1, (speed - 1) / 6) * 0.3;
    if (v < 0.02) return;
    if (glass) {
      this.tone(ctx, 'sine', this.jitter(1500), 1400, t, 0.12, v * 0.5);
    } else if (surface === 'device') {
      this.tone(ctx, 'triangle', this.jitter(560 / Math.sqrt(mass)), 480, t, 0.09, v * 0.55);
      this.tone(ctx, 'sine', this.jitter(840 / Math.sqrt(mass)), 800, t, 0.05, v * 0.25);
    } else {
      // timbre oco por massa e velocidade
      const f = this.jitter(240 / Math.sqrt(mass), 0.08);
      this.tone(ctx, 'sine', f * 1.4, f, t, 0.11, v);
      this.noiseHit(ctx, t, 0.05, v * 0.5, 'lowpass', 1200, 300);
    }
    this.track(0.12);
  }

  absorb(value: number) {
    const ctx = this.ok('absorb');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseHit(ctx, t, 0.38, 0.16, 'lowpass', 1800, 160, 1.5);
    this.tone(ctx, 'sine', 90, 45, t + 0.05, 0.35, 0.18);
    const base = value >= 4 ? 1046.5 : 783.99;
    this.tone(ctx, 'sine', this.jitter(base, 0.01), base, t + 0.16, 0.6, 0.06);
    this.tone(ctx, 'sine', this.jitter(base * 1.5, 0.01), base * 1.5, t + 0.2, 0.5, 0.03);
    this.track(0.7);
  }

  bumper() {
    const ctx = this.ok('bumper');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', this.jitter(520), 300, t, 0.16, 0.16);
    this.tone(ctx, 'triangle', this.jitter(260), 180, t, 0.1, 0.05);
    this.track(0.18);
  }

  booster() {
    const ctx = this.ok('booster');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseHit(ctx, t, 0.2, 0.13, 'bandpass', 420, 1300, 1.2);
    this.track(0.22);
  }

  launch() {
    const ctx = this.ok('launch');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 120, 55, t, 0.15, 0.25);
    this.noiseHit(ctx, t, 0.28, 0.12, 'bandpass', 600, 1600, 0.9);
    this.track(0.3);
  }

  gate() {
    const ctx = this.ok('gate');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', 320, 300, t, 0.05, 0.08);
    this.tone(ctx, 'triangle', 260, 250, t + 0.06, 0.05, 0.06);
    this.track(0.12);
  }

  arm() {
    const ctx = this.ok('arm');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseHit(ctx, t, 0.16, 0.08, 'bandpass', 500, 900, 1);
    this.tone(ctx, 'triangle', 180, 120, t, 0.08, 0.06);
    this.track(0.18);
  }

  place() {
    const ctx = this.ok('place');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 660, 660, t, 0.08, 0.1);
    this.tone(ctx, 'sine', 990, 990, t + 0.05, 0.1, 0.07);
    this.track(0.16);
  }

  invalid() {
    const ctx = this.ok('invalid');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', 150, 120, t, 0.14, 0.1);
    this.track(0.15);
  }

  sell() {
    const ctx = this.ok('sell');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 740, 740, t, 0.08, 0.08);
    this.tone(ctx, 'sine', 554, 554, t + 0.07, 0.1, 0.07);
    this.track(0.2);
  }

  goal() {
    const ctx = this.ok('goal');
    if (!ctx) return;
    const t = ctx.currentTime;
    // acorde leve de duas notas, sem fanfarra
    this.tone(ctx, 'sine', 659.25, 659.25, t, 1.4, 0.09);
    this.tone(ctx, 'sine', 987.77, 987.77, t + 0.12, 1.3, 0.07);
    this.track(1.5);
  }

  ui() {
    const ctx = this.ok('ui');
    if (!ctx) return;
    this.tone(ctx, 'sine', 880, 880, ctx.currentTime, 0.04, 0.05);
    this.track(0.05);
  }

  snap() {
    const ctx = this.ok('snap');
    if (!ctx) return;
    this.tone(ctx, 'triangle', 300, 140, ctx.currentTime, 0.1, 0.07);
    this.track(0.1);
  }

  shatter() {
    const ctx = this.ok('shatter');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 1800, 1600, t, 0.15, 0.06);
    this.tone(ctx, 'sine', 2400, 2100, t + 0.02, 0.12, 0.03);
    this.noiseHit(ctx, t, 0.08, 0.06, 'highpass', 1500, 1200);
    this.track(0.18);
  }

  pulse() {
    const ctx = this.ok('pulse');
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 200, 70, t, 0.25, 0.2);
    this.noiseHit(ctx, t, 0.2, 0.08, 'lowpass', 900, 200);
    this.track(0.25);
  }

  /** Zumbido discreto do feixe; `stretch` 0..1 modula o tom. */
  humStart() {
    const ctx = this.bus.ctx;
    if (!ctx || this.hum) return;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.frequency.value = 110;
    o2.frequency.value = 165.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.025, ctx.currentTime, 0.05);
    o1.connect(g);
    o2.connect(g);
    g.connect(this.bus.sfx);
    o1.start();
    o2.start();
    this.hum = { o1, o2, g };
  }

  humUpdate(stretch: number) {
    const ctx = this.bus.ctx;
    if (!ctx || !this.hum) return;
    const t = ctx.currentTime;
    this.hum.o1.frequency.setTargetAtTime(110 + stretch * 40, t, 0.05);
    this.hum.o2.frequency.setTargetAtTime(165.4 + stretch * 60, t, 0.05);
    this.hum.g.gain.setTargetAtTime(0.018 + stretch * 0.02, t, 0.05);
  }

  humStop() {
    const ctx = this.bus.ctx;
    if (!ctx || !this.hum) return;
    const h = this.hum;
    this.hum = null;
    h.g.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    h.o1.stop(ctx.currentTime + 0.3);
    h.o2.stop(ctx.currentTime + 0.3);
  }
}
