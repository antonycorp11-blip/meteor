/**
 * Grafo de áudio compartilhado: master → compressor suave → saída,
 * com barramentos separados para música e efeitos e uma reverb gerada.
 */
export class AudioBus {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  reverb!: ConvolverNode;
  reverbIn!: GainNode;
  delayIn!: GainNode;
  private vol = { master: 0.8, music: 0.45, sfx: 0.75, muted: false };

  get ready() {
    return !!this.ctx;
  }

  /** Precisa ser chamado num gesto do usuário. */
  init(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    // corte suave de agudos penetrantes no barramento final
    const tame = ctx.createBiquadFilter();
    tame.type = 'peaking';
    tame.frequency.value = 3200;
    tame.Q.value = 0.8;
    tame.gain.value = -3;
    this.master = ctx.createGain();
    this.master.connect(tame).connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music.connect(this.master);
    this.sfx.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.4);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.55;
    this.reverbIn.connect(this.reverb).connect(revOut).connect(this.music);

    // delay pontilhado de colcheia a 74 BPM
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (60 / 74) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    this.delayIn = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.delayIn.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(wet).connect(this.music);
    wet.connect(this.reverbIn);
    this.apply();
    return true;
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      let seed = 1234 + ch * 77;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const n = seed / 4294967296 - 0.5;
        lp += (n - lp) * 0.22; // reverb escura
        const t = i / len;
        d[i] = lp * Math.pow(1 - t, 2.6) * (i < rate * 0.02 ? i / (rate * 0.02) : 1) * 1.6;
      }
    }
    return buf;
  }

  setVolumes(master: number, music: number, sfx: number, muted: boolean) {
    this.vol = { master, music, sfx, muted };
    this.apply();
  }

  private apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.vol.muted ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }
}
