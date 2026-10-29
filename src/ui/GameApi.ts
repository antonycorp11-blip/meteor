import type { DeviceType, ParamDef } from '../machines/types';
import type { GoalProgress, ZoneStats } from '../progression/Goals';
import type { SaveData, Settings } from '../save/SaveManager';

export interface ShopItem {
  type: DeviceType;
  name: string;
  desc: string;
  limit: string;
  price: number;
  affordable: boolean;
  isNew: boolean;
}

export interface ZoneCard {
  id: number;
  name: string;
  subtitle: string;
  unlocked: boolean;
  complete: boolean;
  goalsDone: number;
  goalsTotal: number;
  credits: number;
  current: boolean;
}

export interface HudData {
  zoneId: number;
  zoneName: string;
  credits: number;
  objective: string;
  objectiveProgress: number;
  efficiency: string;
  paused: boolean;
  combo: number;
  research: number;
  active: number;
  maxActive: number;
  fps: number;
  goals: GoalProgress[];
  ghostActive: boolean;
  ghostValid: boolean;
  ghostReason: string;
  ghostPrice: number;
}

export interface SelectedInfo {
  id: number;
  type: DeviceType;
  name: string;
  desc: string;
  limit: string;
  params: ParamDef[];
  values: Record<string, number>;
  enabled: boolean;
  refund: number;
  manualGate: boolean;
  gateOpen: boolean;
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
  shopItems(): ShopItem[];
  researchAvailable(): number;
  stats(): StatsInfo;
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
  buyResearch(id: string): void;
  respec(): void;
  convertCredits(zoneId: number): void;
  conversionInfo(): { zoneId: number; name: string; credits: number; remaining: number; cost: number }[];
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  resetSave(): void;
  uiSound(): void;
}
