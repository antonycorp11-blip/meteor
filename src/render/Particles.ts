/** Partículas quadradas econômicas, com pool fixo. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
  /** espiral até o buraco negro */
  spiral?: { cx: number; cy: number; a: number; r: number; w: number };
}

export class Particles {
  readonly pool: Particle[] = [];
  private free: Particle[] = [];
  cap: number;

  constructor(cap = 600) {
    this.cap = cap;
  }

  setCap(cap: number) {
    this.cap = cap;
    while (this.pool.length > cap) this.free.push(this.pool.pop()!);
  }

  spawn(p: Omit<Particle, 'max'>) {
    if (this.pool.length >= this.cap) return;
    const q = this.free.pop() ?? ({} as Particle);
    Object.assign(q, p, { max: p.life, spiral: p.spiral });
    this.pool.push(q);
  }

  burst(x: number, y: number, n: number, colors: string[], speed = 40, life = 0.5, gravity = 120, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6),
        color: colors[(Math.random() * colors.length) | 0],
        size,
        gravity,
      });
    }
  }

  update(dt: number) {
    const pool = this.pool;
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        pool[i] = pool[pool.length - 1];
        pool.pop();
        this.free.push(p);
        continue;
      }
      if (p.spiral) {
        const s = p.spiral;
        s.a += s.w * dt;
        s.r = Math.max(0, s.r - (s.r * 2.2 + 6) * dt);
        p.x = s.cx + Math.cos(s.a) * s.r;
        p.y = s.cy + Math.sin(s.a) * s.r;
      } else {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
  }

  clear() {
    this.free.push(...this.pool);
    this.pool.length = 0;
  }
}
