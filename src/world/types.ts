import type { DeviceType } from '../machines/types';
import type { FragmentTypeId } from '../physics/fragmentTypes';

export type ThemeKey = 'ash' | 'orion' | 'basalt' | 'ion' | 'cathedral';

export interface AmbientFieldData {
  id: string;
  label: string;
  /** retângulo alinhado aos eixos */
  x: number;
  y: number;
  w: number;
  h: number;
  /** aceleração em px/s² */
  ax: number;
  ay: number;
}

export interface RegionData {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GoalTier = 'basic' | 'engineering' | 'extra';

export type GoalReq =
  | { kind: 'mass'; target: number }
  | { kind: 'efficiency'; pct: number }
  | { kind: 'autoDeliveries'; count: number }
  | { kind: 'denseDelivered'; count: number }
  | { kind: 'streak'; count: number }
  | { kind: 'handsFreeStreak'; count: number }
  | { kind: 'combo'; count: number }
  | { kind: 'launchDistance'; dist: number }
  | { kind: 'cleanFlow'; seconds: number; maxCluster: number }
  | { kind: 'stability'; seconds: number; maxCluster: number; minRate: number }
  | { kind: 'bothRoutes'; count: number; regions: [string, string] }
  | { kind: 'fieldCurve'; count: number }
  | { kind: 'maxDevicesEff'; maxDevices: number; pct: number }
  | { kind: 'typesFlow'; types: number; seconds: number };

export interface GoalDef {
  id: string;
  tier: GoalTier;
  title: string;
  reqs: GoalReq[];
  research: number;
}

export interface ZoneData {
  id: number;
  key: string;
  name: string;
  subtitle: string;
  theme: ThemeKey;
  intro: string;
  width: number;
  height: number;
  /** multiplicador do vetor de gravidade padrão */
  gravity: { x: number; y: number };
  /** polígonos convexos, indestrutíveis */
  terrain: [number, number][][];
  asteroid: { x: number; y: number; r: number };
  blackHole: { x: number; y: number; attractRadius: number; absorbRadius: number; strength: number };
  noBuild: { x: number; y: number; r: number }[];
  fields: AmbientFieldData[];
  regions: RegionData[];
  /** ferramentas que passam a existir a partir desta zona */
  tools: DeviceType[];
  startCredits: number;
  priceMult: number;
  fragmentTable: { type: FragmentTypeId; weight: number }[];
  efficiencyWindow: number;
  goals: GoalDef[];
  hints: string[];
  /** Soluções de referência (documentação + testes automatizados). */
  solutions: ZoneSolution[];
}

export interface ZoneSolution {
  id: string;
  label: string;
  /** manual = depende do feixe; não é testável automaticamente */
  manual?: boolean;
  devices: { type: DeviceType; x: number; y: number; angle: number; params?: Record<string, number> }[];
  /** fração mínima esperada em teste automatizado */
  expectRate?: number;
  /** ponto de mira dos cliques no asteroide (padrão: acima e à direita) */
  aim?: { x: number; y: number };
  /** quadros entre cliques no asteroide (ritmo do jogador; padrão 45) */
  pace?: number;
}
