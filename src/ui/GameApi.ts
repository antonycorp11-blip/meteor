import type { DeviceType, ParamDef } from '../machines/types';
import type { GoalProgress, ZoneStats } from '../progression/Goals';
import type { SaveData, Settings } from '../save/SaveManager';

export interface DockItem {
  type: DeviceType;
  name: string;
  desc: string;
  howTo: string;
  limit: string;
  price: number;
  affordable: boolean;
  locked: boolean;
  /** nó da árvore que libera a peça (quando bloqueada) */
  nodeName?: string;
  nodeCost?: number;
}

export interface ZoneCard {
  id: number;
  name: string;
  subtitle: string;
  unlocked: boolean;
  complete: boolean;
  growth: number;
  current: boolean;
}

export interface HudData {
  zoneId: number;
  zoneName: string;
  credits: number;
  growth: number;
  growthLabel: string;
  heat: number;
  heatMult: number;
  heatMax: number;
  paused: boolean;
  affordableNodes: number;
  challengesDone: number;
  challengesTotal: number;
  active: number;
  maxActive: number;
  fps: number;
  ghostActive: boolean;
  ghostValid: boolean;
  ghostReason: string;
  ghostPrice: number;
  autoMine: number;
  drones: number;
}

export interface SelectedInfo {
  id: number;
  type: DeviceType;
  name: string;
  desc: string;
  howTo: string;
  params: ParamDef[];
  values: Record<string, number>;
  enabled: boolean;
  refund: number;
  manualGate: boolean;
  angleDeg: number;
}

export interface StatsInfo {
  stats: ZoneStats;
  efficiencyPct: number;
  considered: number;
  window: number;
  pending: number;
  delivered: number;
  perMinute: number;
  active: number;
  devices: number;
}

export interface GameApi {
  readonly save: SaveData;
  zoneCards(): ZoneCard[];
  dockItems(): DockItem[];
  stats(): StatsInfo;
  challenges(): GoalProgress[];
  zoneHints(): string[];
  reachedZone(): number;
  play(): void;
  openZone(id: number): void;
  startGhost(type: DeviceType): void;
  confirmGhost(): void;
  cancelGhost(): void;
  rotate(deg: number): void;
  setParam(key: string, v: number): void;
  toggleEnabled(): void;
  toggleGate(): void;
  copySelected(): void;
  sellSelected(): void;
  deselect(): void;
  togglePause(): void;
  overview(): void;
  home(): void;
  undo(): void;
  buyNode(id: string): boolean;
  openTree(): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  resetSave(): void;
  uiSound(): void;
  dockChanged(): void;
}
