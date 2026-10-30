import { makeShape, isConvex, lineOfSight, type Poly, type PolyShape, type Vec } from '../core/geometry';
import type { ZoneData } from './types';

export function terrainPolys(zone: ZoneData): Poly[] {
  return zone.terrain.map((p) => p.map(([x, y]) => ({ x, y })));
}

export function terrainShapes(zone: ZoneData): PolyShape[] {
  return terrainPolys(zone).map(makeShape);
}

export interface ZoneValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Regras de engenharia de níveis (GDD §16) que podem ser checadas
 * estaticamente: polígonos convexos e fonte/destino livres de rocha.
 */
export function validateZone(zone: ZoneData): ZoneValidation {
  const errors: string[] = [];
  const polys = terrainPolys(zone);
  polys.forEach((p, i) => {
    if (!isConvex(p)) errors.push(`terreno[${i}] não é convexo`);
  });
  const shapes = polys.map(makeShape);
  const a = zone.asteroid;
  const h = zone.blackHole;
  // fonte e destino não podem estar dentro da rocha
  for (const s of shapes) {
    for (const q of s.poly) {
      if (Math.hypot(q.x - a.x, q.y - a.y) < a.r - 2) errors.push('vértice de rocha dentro do asteroide');
    }
  }
  // (linhas retas livres não importam mais: o buraco negro flutua no espaço e
  // quem garante que não há atalho é tools/exploit.ts + o teste "sem peças")
  for (const m of zone.movers ?? []) if (!isConvex(m.poly.map(([x, y]) => ({ x, y })))) errors.push(`obstáculo ${m.id} não é convexo`);
  if (a.x < 0 || a.x > zone.width || h.x < 0 || h.x > zone.width) errors.push('fonte/destino fora dos limites');
  return { ok: errors.length === 0, errors };
}

/** Testa várias linhas entre pontos da borda do asteroide e do buraco negro. */
export function lineOfSightAny(zone: ZoneData, shapes: PolyShape[]): boolean {
  const a = zone.asteroid;
  const h = zone.blackHole;
  const srcPts: Vec[] = [];
  const dstPts: Vec[] = [{ x: h.x, y: h.y }];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    srcPts.push({ x: a.x + Math.cos(t) * (a.r + 8), y: a.y + Math.sin(t) * (a.r + 8) });
    dstPts.push({ x: h.x + Math.cos(t) * h.absorbRadius, y: h.y + Math.sin(t) * h.absorbRadius });
  }
  for (const s of srcPts) {
    // pontos de saída presos dentro da rocha não contam
    if (shapes.some((sh) => pointInside(s, sh.poly))) continue;
    for (const d of dstPts) if (lineOfSight(s, d, shapes)) return true;
  }
  return false;
}

function pointInside(p: Vec, poly: Poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
