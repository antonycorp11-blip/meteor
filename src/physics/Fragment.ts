import Matter from 'matter-js';
import { polyCentroid, v, type Poly, type Vec } from '../core/geometry';
import type { Rng } from '../core/rng';
import { FRAGMENT_TYPES, type FragmentTypeId } from './fragmentTypes';

export interface Fragment {
  id: number;
  type: FragmentTypeId;
  body: Matter.Body;
  /** vértices locais (centrados, ângulo 0) — iguais ao corpo físico */
  local: Poly;
  radius: number;
  born: number;
  /** jogador aplicou força manual após a extração */
  manual: boolean;
  /** extraído por autoextrator */
  autoExtracted: boolean;
  launchedFrom: Vec | null;
  launcherTouched: boolean;
  fieldTouched: boolean;
  regions: Set<string>;
  restTime: number;
  lastPulse: number;
  /** id do fragmento de origem (lascas) */
  parentId: number;
  generation: number;
  /** posição anterior para interpolação de render */
  prevX: number;
  prevY: number;
  prevA: number;
  alive: boolean;
}

function convexHull(pts: Vec[]): Vec[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const crossZ = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec[] = [];
  for (const q of p) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Vec[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Polígono irregular convexo — mesma forma usada na física e no desenho. */
export function makeFragmentShape(type: FragmentTypeId, rng: Rng): { poly: Poly; radius: number } {
  const def = FRAGMENT_TYPES[type];
  const r = rng.range(def.radius[0], def.radius[1]);
  const n = rng.int(def.verts[0], def.verts[1]);
  const pts: Vec[] = [];
  const offset = rng.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25) * (Math.PI / n);
    const rr = r * rng.range(0.78, 1.05);
    pts.push(v(Math.cos(a) * rr, Math.sin(a) * rr * rng.range(0.85, 1)));
  }
  let hull = convexHull(pts);
  if (hull.length < 3) hull = [v(-r, -r * 0.6), v(r, -r * 0.4), v(0, r)];
  const c = polyCentroid(hull);
  const poly = hull.map((q) => v(q.x - c.x, q.y - c.y));
  let maxR = 0;
  for (const q of poly) maxR = Math.max(maxR, Math.hypot(q.x, q.y));
  return { poly, radius: maxR };
}
