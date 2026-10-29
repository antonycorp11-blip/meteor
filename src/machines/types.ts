import type { Poly } from '../core/geometry';

export type DeviceType =
  | 'plank'
  | 'ramp'
  | 'funnel'
  | 'spring'
  | 'conveyor'
  | 'booster'
  | 'launcher'
  | 'damper'
  | 'gate'
  | 'fan'
  | 'attractor'
  | 'repulsor'
  | 'arm'
  | 'lift'
  | 'sensor';

/** Tipos removidos em versões antigas do save (são reembolsados na migração). */
export const LEGACY_DEVICE_TYPES = ['deflector', 'bumper', 'autoextractor'];

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
  /** uma linha, em linguagem simples: o que faz */
  desc: string;
  /** como usar (dica prática) */
  howTo: string;
  /** limitação que mantém o desafio */
  limit: string;
  cost: number;
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
