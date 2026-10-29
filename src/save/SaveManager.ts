import type { DeviceSave } from '../machines/types';
import { emptyStats, type ZoneStats } from '../progression/Goals';

export const SAVE_VERSION = 2;
const KEY = 'meteor-mill-save';
const BACKUP_KEY = 'meteor-mill-save-backup';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  uiScale: number;
  reduceParticles: boolean;
  noShake: boolean;
  highContrast: boolean;
  snap: boolean;
  showFps: boolean;
}

export interface ZoneSave {
  credits: number;
  devices: DeviceSave[];
  nextDeviceId: number;
  goals: string[];
  stats: ZoneStats;
  visited: boolean;
  converted: number;
}

export interface SaveData {
  version: number;
  currentZone: number;
  unlockedZone: number;
  campaignDone: boolean;
  research: { earned: number; levels: Record<string, number> };
  settings: Settings;
  zones: Record<string, ZoneSave>;
  tutorial: { extracted: boolean; grabbed: boolean; delivered: boolean; built: boolean };
}

export function defaultSettings(): Settings {
  return {
    master: 0.8,
    music: 0.45,
    sfx: 0.75,
    muted: false,
    uiScale: 1,
    reduceParticles: false,
    noShake: false,
    highContrast: false,
    snap: false,
    showFps: false,
  };
}

export function emptyZoneSave(startCredits: number): ZoneSave {
  return { credits: startCredits, devices: [], nextDeviceId: 1, goals: [], stats: emptyStats(), visited: false, converted: 0 };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    currentZone: 1,
    unlockedZone: 1,
    campaignDone: false,
    research: { earned: 0, levels: {} },
    settings: defaultSettings(),
    zones: {},
    tutorial: { extracted: false, grabbed: false, delivered: false, built: false },
  };
}

/** Migra saves antigos para o esquema atual. */
export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') return defaultSave();
  const data = raw as Record<string, unknown>;
  let version = typeof data.version === 'number' ? data.version : 1;
  let d = { ...data } as Record<string, unknown>;
  if (version < 2) {
    // v1 guardava pesquisa como número único e não tinha tutorial.
    const r = d.research;
    d.research = typeof r === 'number' ? { earned: r, levels: {} } : (r ?? { earned: 0, levels: {} });
    d.tutorial = { extracted: true, grabbed: true, delivered: true, built: true };
    version = 2;
  }
  const base = defaultSave();
  const out: SaveData = {
    ...base,
    ...(d as Partial<SaveData>),
    version: SAVE_VERSION,
    settings: { ...base.settings, ...((d.settings as Partial<Settings>) ?? {}) },
    research: { ...base.research, ...((d.research as SaveData['research']) ?? {}) },
    tutorial: { ...base.tutorial, ...((d.tutorial as SaveData['tutorial']) ?? {}) },
    zones: {},
  };
  const zones = (d.zones as Record<string, Partial<ZoneSave>>) ?? {};
  for (const [k, z] of Object.entries(zones)) {
    out.zones[k] = {
      ...emptyZoneSave(0),
      ...z,
      credits: Math.max(0, Number(z.credits) || 0),
      stats: { ...emptyStats(), ...(z.stats ?? {}) },
      devices: Array.isArray(z.devices) ? z.devices.filter((q) => q && typeof q.type === 'string') : [],
    };
  }
  return out;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function safeStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const t = '__mm_test';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return null;
  }
}

export class SaveManager {
  data: SaveData;
  private storage: StorageLike | null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  lastError: string | null = null;

  constructor(storage: StorageLike | null = safeStorage()) {
    this.storage = storage;
    this.data = this.load();
  }

  private load(): SaveData {
    if (!this.storage) return defaultSave();
    for (const key of [KEY, BACKUP_KEY]) {
      try {
        const raw = this.storage.getItem(key);
        if (!raw) continue;
        return migrate(JSON.parse(raw));
      } catch (e) {
        this.lastError = `Save corrompido em ${key}; usando cópia de segurança.`;
      }
    }
    return defaultSave();
  }

  zone(id: number, startCredits: number): ZoneSave {
    const k = String(id);
    if (!this.data.zones[k]) this.data.zones[k] = emptyZoneSave(startCredits);
    return this.data.zones[k];
  }

  /** Salva com debounce. */
  save(delayMs = 600) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delayMs);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.storage) return;
    try {
      const prev = this.storage.getItem(KEY);
      if (prev) this.storage.setItem(BACKUP_KEY, prev);
      this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      this.lastError = 'Não foi possível salvar (armazenamento indisponível).';
    }
  }

  reset() {
    this.data = defaultSave();
    if (this.storage) {
      try {
        this.storage.removeItem(KEY);
        this.storage.removeItem(BACKUP_KEY);
      } catch {
        /* ignore */
      }
    }
  }
}
