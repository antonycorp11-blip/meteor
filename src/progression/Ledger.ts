import { Config } from '../core/Config';

export type FragmentOutcome = 'active' | 'delivered' | 'lost';

interface Record_ {
  id: number;
  born: number;
  status: FragmentOutcome;
  /** lascas vivas (vítreo) — o registro só se resolve quando todas acabam */
  children: number;
}

/**
 * Registro de fragmentos gerados. Garante entrega idempotente (cada id paga
 * uma única vez) e calcula a eficiência numa janela móvel dos últimos N
 * fragmentos gerados. Fragmentos ativos mais novos que `pendingGrace` ficam
 * fora da janela; mais velhos contam como não entregues até se resolverem.
 */
export class Ledger {
  private records: Record_[] = [];
  private byId = new Map<number, Record_>();
  private paid = new Set<number>();
  readonly window: number;

  constructor(window: number) {
    this.window = window;
  }

  generated(id: number, time: number) {
    const r: Record_ = { id, born: time, status: 'active', children: 0 };
    this.records.push(r);
    this.byId.set(id, r);
    const keep = this.window * 3 + 50;
    if (this.records.length > keep) {
      const drop = this.records.splice(0, this.records.length - keep);
      for (const d of drop) this.byId.delete(d.id);
    }
  }

  /** Vincula lascas ao fragmento original. */
  split(parentId: number, shardIds: number[]) {
    const r = this.byId.get(parentId);
    if (!r) return;
    r.children += shardIds.length;
    for (const s of shardIds) this.byId.set(s, r);
  }

  /** Retorna true apenas na primeira entrega deste id (idempotente). */
  deliver(id: number): boolean {
    if (this.paid.has(id)) return false;
    this.paid.add(id);
    if (this.paid.size > 5000) {
      // mantém o conjunto limitado; ids são crescentes
      const arr = [...this.paid].slice(-2500);
      this.paid = new Set(arr);
    }
    const r = this.byId.get(id);
    if (r) {
      if (r.id !== id && r.children > 0) r.children--;
      r.status = 'delivered';
    }
    return true;
  }

  lose(id: number, shattered = false) {
    const r = this.byId.get(id);
    if (!r || r.status === 'delivered') return;
    if (shattered) return; // o pai continua ativo enquanto houver lascas
    if (r.id !== id) {
      r.children--;
      if (r.children <= 0 && r.status === 'active') r.status = 'lost';
      return;
    }
    if (r.children <= 0) r.status = 'lost';
  }

  /** {pct, considered, delivered, full} */
  efficiency(now: number) {
    let considered = 0;
    let delivered = 0;
    let pending = 0;
    for (let i = this.records.length - 1; i >= 0 && considered < this.window; i--) {
      const r = this.records[i];
      if (r.status === 'active' && now - r.born < Config.pendingGrace) {
        pending++;
        continue;
      }
      considered++;
      if (r.status === 'delivered') delivered++;
    }
    return {
      pct: considered ? (delivered / considered) * 100 : 0,
      considered,
      delivered,
      pending,
      full: considered >= this.window,
    };
  }
}
