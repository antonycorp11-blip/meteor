export interface Vec {
  x: number;
  y: number;
}
export type Poly = Vec[];

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec): Vec => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const rot = (a: Vec, ang: number): Vec => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function transformPoly(local: Poly, pos: Vec, angle: number): Poly {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return local.map((p) => ({ x: pos.x + p.x * c - p.y * s, y: pos.y + p.x * s + p.y * c }));
}

export function rectPoly(w: number, h: number, cx = 0, cy = 0): Poly {
  const hw = w / 2;
  const hh = h / 2;
  return [v(cx - hw, cy - hh), v(cx + hw, cy - hh), v(cx + hw, cy + hh), v(cx - hw, cy + hh)];
}

export function circlePoly(r: number, n = 12, cx = 0, cy = 0): Poly {
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(v(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}

export function polyArea(p: Poly): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    a += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return a / 2;
}

export function polyCentroid(p: Poly): Vec {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    const f = p[i].x * p[j].y - p[j].x * p[i].y;
    cx += (p[i].x + p[j].x) * f;
    cy += (p[i].y + p[j].y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) return p[0];
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function isConvex(p: Poly): boolean {
  if (p.length < 3) return false;
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const c = p[(i + 2) % p.length];
    const z = cross(sub(b, a), sub(c, b));
    if (Math.abs(z) < 1e-9) continue;
    const s = Math.sign(z);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polyBounds(p: Poly): AABB {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of p) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return { minX, minY, maxX, maxY };
}

export function aabbOverlap(a: AABB, b: AABB, pad = 0): boolean {
  return a.minX - pad <= b.maxX && a.maxX + pad >= b.minX && a.minY - pad <= b.maxY && a.maxY + pad >= b.minY;
}

export function pointInPoly(pt: Vec, poly: Poly): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distPointSeg(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
  return dist(p, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}

export function distPointPoly(p: Vec, poly: Poly): number {
  if (pointInPoly(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distPointSeg(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Retorna t em [0,1] ao longo de a→b onde o segmento cruza c→d, ou -1. */
export function segIntersectT(a: Vec, b: Vec, c: Vec, d: Vec): number {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < 1e-12) return -1;
  const ca = sub(c, a);
  const t = cross(ca, s) / den;
  const u = cross(ca, r) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return -1;
}

export interface PolyShape {
  poly: Poly;
  bounds: AABB;
}

export function makeShape(poly: Poly): PolyShape {
  return { poly, bounds: polyBounds(poly) };
}

/** Raycast contra polígonos; retorna o menor t (0..1) ou -1 se livre. */
export function raycast(a: Vec, b: Vec, shapes: PolyShape[]): number {
  const rb: AABB = {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  };
  let best = -1;
  for (const s of shapes) {
    if (!aabbOverlap(rb, s.bounds)) continue;
    const p = s.poly;
    for (let i = 0; i < p.length; i++) {
      const t = segIntersectT(a, b, p[i], p[(i + 1) % p.length]);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
  }
  return best;
}

export function lineOfSight(a: Vec, b: Vec, shapes: PolyShape[]): boolean {
  return raycast(a, b, shapes) < 0;
}

function project(p: Poly, axis: Vec): [number, number] {
  let mn = Infinity;
  let mx = -Infinity;
  for (const q of p) {
    const d = q.x * axis.x + q.y * axis.y;
    if (d < mn) mn = d;
    if (d > mx) mx = d;
  }
  return [mn, mx];
}

/** SAT para polígonos convexos. `slop` > 0 tolera encostar. */
export function convexOverlap(a: Poly, b: Poly, slop = 0.01): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const axis = norm({ x: -(p2.y - p1.y), y: p2.x - p1.x });
      const [a0, a1] = project(a, axis);
      const [b0, b1] = project(b, axis);
      if (a1 <= b0 + slop || b1 <= a0 + slop) return false;
    }
  }
  return true;
}

export function circleOverlapsPoly(c: Vec, r: number, poly: Poly): boolean {
  return distPointPoly(c, poly) < r;
}
