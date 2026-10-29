import { Config } from '../core/Config';
import { rewardFor } from '../economy/Economy';
import type { FragmentTypeId } from '../physics/fragmentTypes';
import type { AbsorbInfo } from '../sim/Sim';
import type { GoalDef, GoalReq, ZoneData } from '../world/types';
import { Ledger } from './Ledger';

export interface ZoneStats {
  massDelivered: number;
  delivered: number;
  autoDelivered: number;
  denseDelivered: number;
  generated: number;
  lost: number;
  recycled: number;
  creditsEarned: number;
  bestCombo: number;
  bestStreak: number;
  bestHandsFree: number;
  launchDistanceBest: number;
  fieldCurveCount: number;
  longestHandsOff: number;
  timePlayed: number;
}

export function emptyStats(): ZoneStats {
  return {
    massDelivered: 0,
    delivered: 0,
    autoDelivered: 0,
    denseDelivered: 0,
    generated: 0,
    lost: 0,
    recycled: 0,
    creditsEarned: 0,
    bestCombo: 0,
    bestStreak: 0,
    bestHandsFree: 0,
    launchDistanceBest: 0,
    fieldCurveCount: 0,
    longestHandsOff: 0,
    timePlayed: 0,
  };
}

export interface ReqProgress {
  label: string;
  value: number; // 0..1
  done: boolean;
}

export interface GoalProgress {
  def: GoalDef;
  done: boolean;
  reqs: ReqProgress[];
}

/**
 * Estatísticas vivas da zona e avaliação de objetivos.
 * "Entrega automática" = recebida sem o jogador ter aplicado força manual no
 * fragmento depois da extração.
 */
export class ZoneProgress {
  readonly zone: ZoneData;
  readonly ledger: Ledger;
  stats: ZoneStats;
  goalsDone: Set<string>;
  combo = 0;
  private lastDelivery = -99;
  streak = 0;
  handsFree = 0;
  private lastManual = 0;
  private recentDeliveries: number[] = [];
  private recentExtracts: number[] = [];
  private typesSeen = new Map<FragmentTypeId, number>();
  routeCounts = new Map<string, number>();
  cleanFlowTimer = 0;
  stabilityTimer = 0;
  cluster = 0;
  deviceCount = 0;
  now = 0;

  constructor(zone: ZoneData, stats: ZoneStats, goalsDone: string[]) {
    this.zone = zone;
    this.ledger = new Ledger(zone.efficiencyWindow);
    this.stats = { ...emptyStats(), ...stats };
    this.goalsDone = new Set(goalsDone);
  }

  onExtract(id: number, time: number) {
    this.ledger.generated(id, time);
    this.stats.generated++;
    this.recentExtracts.push(time);
  }

  onShatter(parentId: number, shardIds: number[]) {
    this.ledger.split(parentId, shardIds);
  }

  onManualGrab(time: number) {
    this.handsFree = 0;
    this.lastManual = time;
  }

  /** Mudança de instalação reinicia métricas que exigem "a mesma instalação". */
  onInstallationChanged() {
    this.routeCounts.clear();
  }

  /** Retorna os créditos ganhos (0 se a entrega já tinha sido paga). */
  onAbsorb(info: AbsorbInfo, time: number): number {
    if (!this.ledger.deliver(info.frag.id)) return 0;
    const s = this.stats;
    if (time - this.lastDelivery <= Config.comboWindow) this.combo++;
    else this.combo = 1;
    this.lastDelivery = time;
    s.bestCombo = Math.max(s.bestCombo, this.combo);
    this.streak++;
    s.bestStreak = Math.max(s.bestStreak, this.streak);
    if (info.auto) {
      s.autoDelivered++;
      this.handsFree++;
      s.bestHandsFree = Math.max(s.bestHandsFree, this.handsFree);
    }
    s.delivered++;
    s.massDelivered += info.mass;
    if (info.frag.type === 'dense') s.denseDelivered++;
    if (info.launchDistance > s.launchDistanceBest) s.launchDistanceBest = info.launchDistance;
    if (info.fieldCurve) s.fieldCurveCount++;
    for (const r of info.frag.regions) this.routeCounts.set(r, (this.routeCounts.get(r) ?? 0) + 1);
    this.recentDeliveries.push(time);
    this.typesSeen.set(info.frag.type === 'shard' ? 'glass' : info.frag.type, time);
    const reward = rewardFor(info.value, this.combo, info.auto);
    s.creditsEarned += reward;
    return reward;
  }

  onLost(id: number, reason: 'bounds' | 'rest' | 'shatter') {
    if (reason === 'shatter') {
      this.ledger.lose(id, true);
      return;
    }
    this.ledger.lose(id);
    this.stats.lost++;
    if (reason === 'rest') this.stats.recycled++;
    this.streak = 0;
  }

  /** Chamado ~1×/s com métricas da simulação. */
  tick(time: number, dt: number, cluster: number, deviceCount: number) {
    this.now = time;
    this.cluster = cluster;
    this.deviceCount = deviceCount;
    this.stats.timePlayed += dt;
    this.stats.longestHandsOff = Math.max(this.stats.longestHandsOff, time - this.lastManual);
    const cut = time - 60;
    while (this.recentDeliveries.length && this.recentDeliveries[0] < cut) this.recentDeliveries.shift();
    while (this.recentExtracts.length && this.recentExtracts[0] < cut) this.recentExtracts.shift();
    const producing = this.recentExtracts.some((t) => t > time - 10);
    for (const g of this.zone.goals) {
      for (const r of g.reqs) {
        if (r.kind === 'cleanFlow') {
          if (producing && cluster <= r.maxCluster && this.deliveriesIn(10) > 0) this.cleanFlowTimer += dt;
          else this.cleanFlowTimer = 0;
        }
        if (r.kind === 'stability') {
          if (cluster <= r.maxCluster && this.deliveriesIn(30) * 2 >= r.minRate) this.stabilityTimer += dt;
          else this.stabilityTimer = 0;
        }
      }
    }
  }

  deliveriesIn(seconds: number) {
    const cut = this.now - seconds;
    let n = 0;
    for (let i = this.recentDeliveries.length - 1; i >= 0 && this.recentDeliveries[i] >= cut; i--) n++;
    return n;
  }

  massPerMinute() {
    return this.deliveriesIn(60);
  }

  efficiency() {
    return this.ledger.efficiency(this.now);
  }

  private reqProgress(r: GoalReq): ReqProgress {
    const s = this.stats;
    const frac = (a: number, b: number) => Math.max(0, Math.min(1, a / b));
    switch (r.kind) {
      case 'mass':
        return { label: `Massa ${Math.floor(s.massDelivered)}/${r.target}`, value: frac(s.massDelivered, r.target), done: s.massDelivered >= r.target };
      case 'efficiency': {
        const e = this.efficiency();
        const ok = e.full && e.pct >= r.pct;
        const lbl = e.full ? `Eficiência ${Math.round(e.pct)}%/${r.pct}%` : `Eficiência: amostra ${e.considered}/${this.ledger.window}`;
        return { label: lbl, value: e.full ? frac(e.pct, r.pct) : frac(e.considered, this.ledger.window) * 0.5, done: ok };
      }
      case 'autoDeliveries':
        return { label: `Entregas automáticas ${s.autoDelivered}/${r.count}`, value: frac(s.autoDelivered, r.count), done: s.autoDelivered >= r.count };
      case 'denseDelivered':
        return { label: `Densos absorvidos ${s.denseDelivered}/${r.count}`, value: frac(s.denseDelivered, r.count), done: s.denseDelivered >= r.count };
      case 'streak':
        return { label: `Sequência ${this.streak} (melhor ${s.bestStreak})/${r.count}`, value: frac(s.bestStreak, r.count), done: s.bestStreak >= r.count };
      case 'handsFreeStreak':
        return { label: `Sem tocar ${this.handsFree} (melhor ${s.bestHandsFree})/${r.count}`, value: frac(s.bestHandsFree, r.count), done: s.bestHandsFree >= r.count };
      case 'combo':
        return { label: `Combo ${this.combo} (melhor ${s.bestCombo})/${r.count}`, value: frac(s.bestCombo, r.count), done: s.bestCombo >= r.count };
      case 'launchDistance':
        return { label: `Lançamento ${Math.round(s.launchDistanceBest)}/${r.dist} px`, value: frac(s.launchDistanceBest, r.dist), done: s.launchDistanceBest >= r.dist };
      case 'cleanFlow':
        return { label: `Fluxo limpo ${Math.floor(this.cleanFlowTimer)}/${r.seconds} s (gargalo ≤ ${r.maxCluster})`, value: frac(this.cleanFlowTimer, r.seconds), done: this.cleanFlowTimer >= r.seconds };
      case 'stability':
        return { label: `Estabilidade ${Math.floor(this.stabilityTimer)}/${r.seconds} s`, value: frac(this.stabilityTimer, r.seconds), done: this.stabilityTimer >= r.seconds };
      case 'bothRoutes': {
        const a = this.routeCounts.get(r.regions[0]) ?? 0;
        const b = this.routeCounts.get(r.regions[1]) ?? 0;
        return { label: `Rotas: ${Math.min(a, r.count)}+${Math.min(b, r.count)}/${r.count}+${r.count}`, value: frac(Math.min(a, r.count) + Math.min(b, r.count), r.count * 2), done: a >= r.count && b >= r.count };
      }
      case 'fieldCurve':
        return { label: `Curvas por campo ${s.fieldCurveCount}/${r.count}`, value: frac(s.fieldCurveCount, r.count), done: s.fieldCurveCount >= r.count };
      case 'maxDevicesEff': {
        const e = this.efficiency();
        const ok = this.deviceCount <= r.maxDevices && e.full && e.pct >= r.pct;
        return { label: `${this.deviceCount}/${r.maxDevices} peças · ${e.full ? Math.round(e.pct) + '%' : '—'}/${r.pct}%`, value: ok ? 1 : e.full ? frac(e.pct, r.pct) * 0.9 : 0, done: ok };
      }
      case 'typesFlow': {
        let n = 0;
        for (const t of this.typesSeen.values()) if (t >= this.now - r.seconds) n++;
        return { label: `Tipos em fluxo ${n}/${r.types} (${r.seconds} s)`, value: frac(n, r.types), done: n >= r.types };
      }
    }
  }

  goalProgress(): GoalProgress[] {
    return this.zone.goals.map((def) => {
      const reqs = def.reqs.map((r) => this.reqProgress(r));
      const done = this.goalsDone.has(def.id);
      return { def, done, reqs: done ? reqs.map((r) => ({ ...r, value: 1, done: true })) : reqs };
    });
  }

  /** Verifica e marca objetivos recém-cumpridos. */
  checkGoals(): GoalDef[] {
    const newly: GoalDef[] = [];
    for (const def of this.zone.goals) {
      if (this.goalsDone.has(def.id)) continue;
      if (def.reqs.every((r) => this.reqProgress(r).done)) {
        this.goalsDone.add(def.id);
        newly.push(def);
      }
    }
    return newly;
  }

  zoneComplete(): boolean {
    return this.zone.goals.filter((g) => g.tier !== 'extra').every((g) => this.goalsDone.has(g.id));
  }
}
