import z1 from './zones/zone1.json';
import z2 from './zones/zone2.json';
import z3 from './zones/zone3.json';
import z4 from './zones/zone4.json';
import z5 from './zones/zone5.json';
import type { ZoneData } from './types';
import { validateZone } from './Terrain';

const RAW: unknown[] = [z1, z2, z3, z4, z5];

export const ZONES: ZoneData[] = RAW.map((z) => z as ZoneData);

export function loadZone(id: number): ZoneData {
  const z = ZONES.find((q) => q.id === id);
  if (!z) throw new Error(`Zona ${id} inexistente`);
  return z;
}

export function zoneCount() {
  return ZONES.length;
}

/** Valida todas as zonas; usado em testes e no boot em modo dev. */
export function validateAllZones(): string[] {
  const errs: string[] = [];
  for (const z of ZONES) {
    const r = validateZone(z);
    for (const e of r.errors) errs.push(`zona ${z.id}: ${e}`);
  }
  return errs;
}
