import type { Poly } from '../core/geometry';

export type DeviceType =
  | 'plank'
  | 'ramp'
  | 'deflector'
  | 'bumper'
  | 'booster'
  | 'launcher'
  | 'fan'
  | 'gate'
  | 'conveyor'
  | 'damper'
  | 'attractor'
  | 'repulsor'
  | 'arm'
  | 'lift'
  | 'autoextractor'
  | 'sensor';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** rótulos discretos opcionais (ex.: modos) */
  labels?: string[];
  unit?: string;
}

export interface FieldShape {
  kind: 'rect' | 'radial';
  /** rect local: x0..x1, y0..y1 */
  rect?: { x0: number; y0: number; x1: number; y1: number };
  radius?: number;
}

export interface DeviceDef {
  type: DeviceType;
  name: string;
  /** uma linha: o que faz de verdade */
  desc: string;
  /** limitação que mantém o desafio */
  limit: string;
  cost: number;
  /** zona em que a peça é desbloqueada (6 = pós-campanha) */
  unlockZone: number;
  /** polígonos convexos sólidos, em coordenadas locais (ângulo 0) */
  solids: (params: Record<string, number>) => Poly[];
  /** índice dos sólidos que se movem (portinhola, braço) */
  movingSolid?: number;
  /** pivô local da parte móvel */
  pivot?: { x: number; y: number };
  friction: number;
  restitution: number;
  params: ParamDef[];
  maxPerZone?: number;
  field?: (params: Record<string, number>, mods: { radius: number }) => FieldShape;
  /** raio aproximado para hit-test e alças */
  hitRadius: number;
}

export interface DeviceSave {
  id: number;
  type: DeviceType;
  x: number;
  y: number;
  angle: number;
  params: Record<string, number>;
  enabled: boolean;
  paid: number;
}
