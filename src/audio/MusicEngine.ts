import { hash2 } from '../core/rng';
import type { AudioBus } from './AudioBus';

const BPM = 74;
const BEAT = 60 / BPM;
const STEP = BEAT / 4; // semicolcheia
const BARS = 64; // 64 compassos a 74 BPM ≈ 3 min 28 s
const STEPS = BARS * 16;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Progressão original em Ré maior/lídio, um acorde a cada 2 compassos.
 * Voicings com sétimas e nonas; o baixo é a primeira nota.
 */
const CHORDS: { bass: number; notes: number[]; scale: number[] }[] = [
  { bass: 38, notes: [50, 57, 61, 64, 66], scale: [62, 64, 66, 69, 71, 73] }, // Dmaj9
  { bass: 35, notes: [47, 54, 57, 61, 62], scale: [59, 61, 62, 66, 69, 71] }, // Bm9
  { bass: 31, notes: [43, 50, 54, 57, 61], scale: [62, 64, 66, 67, 69, 73] }, // Gmaj7(#11)
  { bass: 33, notes: [45, 52, 57, 59, 64], scale: [64, 66, 69, 71, 73, 76] }, // Asus2/add9
  { bass: 30, notes: [42, 49, 52, 57, 61], scale: [61, 64, 66, 69, 73, 76] }, // F#m7
  { bass: 35, notes: [47, 54, 57, 62, 66], scale: [59, 62, 66, 69, 71, 74] }, // Bm11
  { bass: 28, notes: [40, 50, 55, 57, 62], scale: [62, 64, 67, 69, 71, 74] }, // Em11
  { bass: 33, notes: [45, 52, 56, 59, 61], scale: [64, 66, 68, 69, 71, 73] }, // A6/9 (dominante suave)
];

/**
 * Trilha original procedural com Web Audio API: pad aveludado, subgrave
 * suave, piano elétrico FM, plucks e sinos raros. Variações determinísticas
 * por compasso e por volta evitam um loop cansativo.
 */
export class MusicEngine {
  private bus: AudioBus;
  private out: GainNode | null = null;
  private epBus: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private loop = 0;
  private activity = 0;
  private playing = false;
  private air: AudioBufferSourceNode | null = null;

  constructor(bus: AudioBus) {
    this.bus = bus;
  }

  get isPlaying() {
    return this.playing;
  }

  start() {
    const ctx = this.bus.ctx;
    if (!ctx || this.playing) return;
    this.playing = true;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.gain.setTargetAtTime(1, ctx.currentTime, 1.6); // fade in
    this.out.connect(this.bus.music);
    this.epBus = ctx.createGain();
    this.epBus.gain.value = 0.75;
    const epLp = ctx.createBiquadFilter();
    epLp.type = 'lowpass';
    epLp.frequency.value = 2300;
    this.epBus.connect(epLp).connect(this.out);
    epLp.connect(this.bus.delayIn);
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(this.padFilter.frequency);
    lfo.start();
    this.padFilter.connect(this.out);
    this.padFilter.connect(this.bus.reverbIn);
    this.startAir();
    this.nextTime = ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  stop() {
    const ctx = this.bus.ctx;
    if (!ctx || !this.playing || !this.out) return;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const out = this.out;
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
    setTimeout(() => out.disconnect(), 4000);
    this.air?.stop(ctx.currentTime + 3);
    this.air = null;
  }

  /** 0..1 — mais entregas = camadas de teclado/pluck um pouco mais presentes. */
  setActivity(a: number) {
    this.activity += (Math.max(0, Math.min(1, a)) - this.activity) * 0.2;
    const ctx = this.bus.ctx;
    if (ctx && this.epBus) this.epBus.gain.setTargetAtTime(0.6 + this.activity * 0.45, ctx.currentTime, 2);
  }

  /** Reinicia o relógio após o contexto voltar de suspensão. */
  resync() {
    const ctx = this.bus.ctx;
    if (ctx && this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.1;
  }

  private startAir() {
    const ctx = this.bus.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    let seed = 99;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      b = b * 0.985 + (seed / 4294967296 - 0.5) * 0.15;
      d[i] = b;
    }
    // cruza o fim com o início para não estalar na emenda
    const xf = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      d[len - xf + i] = d[len - xf + i] * (1 - t) + d[i] * t;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = (len - xf) / ctx.sampleRate;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.out!);
    src.start();
    this.air = src;
  }

  private schedule() {
    const ctx = this.bus.ctx;
    if (!ctx || !this.playing) return;
    if (ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.5) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.6) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step++;
      if (this.step >= STEPS) {
        this.step = 0;
        this.loop++;
      }
    }
  }

  private rnd(bar: number, s: number, salt: number) {
    return hash2(bar * 16 + s, this.loop * 7 + salt, 4242);
  }

  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const section = Math.floor(bar / 16); // 4 seções de 16 compassos
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    // seção 3 tem uma reharmonização leve na 2ª metade
    const ch = section === 3 && bar % 16 >= 8 ? CHORDS[(Math.floor(bar / 2) + 4) % CHORDS.length] : chord;

    if (s === 0 && bar % 2 === 0) {
      this.pad(ch.notes, t, BEAT * 8);
      this.sub(ch.bass + 12, t, BEAT * 8, section === 0 ? 0.07 : 0.1);
    }

    const intensity = [0.35, 0.7, 1, 0.55][section];
    // piano elétrico: arpejo delicado em colcheias
    if (s % 2 === 0 && section > 0) {
      const p = this.rnd(bar, s, 1);
      const pattern = [1, 0, 0.5, 0.3, 0.8, 0, 0.4, 0.2];
      const w = pattern[(s / 2) % 8] * intensity;
      if (p < w * 0.75) {
        const idx = Math.floor(this.rnd(bar, s, 2) * 4) + 1;
        const n = ch.notes[Math.min(ch.notes.length - 1, idx)] + 12;
        this.ep(n, t, 0.045 + 0.02 * this.rnd(bar, s, 3));
      }
    }
    if (s === 0 && section === 0 && bar % 4 === 1) this.ep(ch.notes[3] + 12, t, 0.04);

    // pluck melódico esparso (seção 2 principalmente)
    if (s % 2 === 0 && (section === 2 || (section === 1 && bar % 4 >= 2))) {
      const motifBar = Math.floor(bar / 4);
      const p = this.rnd(motifBar, s, 5); // motivo repetido a cada 4 compassos
      if (p < 0.22) {
        const deg = Math.floor(this.rnd(motifBar, s, 6) * ch.scale.length);
        const octave = this.rnd(bar, s, 7) < 0.25 ? 12 : 0;
        this.pluck(ch.scale[deg] + octave, t, 0.05);
      }
    }

    // sinos raros
    if (s === 8 && this.rnd(bar, s, 9) < 0.07 + section * 0.02) {
      this.bell(ch.scale[Math.floor(this.rnd(bar, s, 10) * ch.scale.length)] + 12, t);
    }

    // percussão quase imperceptível (escova) na seção 2
    if (section === 2 && (s === 4 || s === 12)) this.brush(t, 0.018 + this.rnd(bar, s, 11) * 0.008);
  }

  private pad(notes: number[], t: number, dur: number) {
    const ctx = this.bus.ctx!;
    const att = 2.2;
    const rel = 3.2;
    for (const n of notes) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.034, t + att);
      g.gain.setValueAtTime(0.034, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + rel);
      g.connect(this.padFilter!);
      for (const [type, det] of [
        ['sawtooth', -7],
        ['triangle', 6],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + rel + 0.1);
      }
    }
  }

  private sub(n: number, t: number, dur: number, level: number) {
    const ctx = this.bus.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = mtof(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 1.2);
    g.gain.setValueAtTime(level, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.4);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + dur + 1.5);
  }

  private ep(n: number, t: number, vel: number) {
    const ctx = this.bus.ctx!;
    const f = mtof(n);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.1, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.7);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    car.connect(g).connect(this.epBus!);
    g.connect(this.bus.reverbIn);
    car.start(t);
    mod.start(t);
    car.stop(t + 2.7);
    mod.stop(t + 2.7);
  }

  private pluck(n: number, t: number, vel: number) {
    const ctx = this.bus.ctx!;
    const f = mtof(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 4;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o1.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.epBus!);
    g.connect(this.bus.delayIn);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 1);
    o2.stop(t + 1);
  }

  private bell(n: number, t: number) {
    const ctx = this.bus.ctx!;
    const f = mtof(n);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 0.6, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 2.5);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.018, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    car.connect(g);
    g.connect(this.bus.reverbIn);
    g.connect(this.out!);
    car.start(t);
    mod.start(t);
    car.stop(t + 3.6);
    mod.stop(t + 3.6);
  }

  private brush(t: number, vel: number) {
    const ctx = this.bus.ctx!;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = vel;
    src.connect(f).connect(g).connect(this.out!);
    src.start(t);
  }
}

export const MUSIC_INFO = { bpm: BPM, bars: BARS, seconds: BARS * 4 * BEAT };
