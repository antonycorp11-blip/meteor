import { describe, expect, it } from 'vitest';
import { Wallet, priceFor, refundFor, rewardFor } from '../src/economy/Economy';
import { ZoneProgress, emptyStats } from '../src/progression/Goals';
import { Ledger } from '../src/progression/Ledger';
import { RESEARCH, buildMods, canBuy, spentOn } from '../src/progression/Research';
import { SAVE_VERSION, SaveManager, defaultSave, migrate, type StorageLike } from '../src/save/SaveManager';
import { Sim, type AbsorbInfo } from '../src/sim/Sim';
import { loadZone } from '../src/world/ZoneLoader';

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('economia', () => {
  it('carteira nunca fica negativa', () => {
    const w = new Wallet(10);
    expect(w.spend(15)).toBe(false);
    expect(w.credits).toBe(10);
    expect(w.spend(-5)).toBe(false);
    expect(w.spend(NaN)).toBe(false);
    expect(w.spend(10)).toBe(true);
    expect(w.credits).toBe(0);
    w.earn(-3);
    expect(w.credits).toBe(0);
  });

  it('preços crescem suavemente e revenda reembolsa parcialmente', () => {
    const p0 = priceFor('plank', 0, 1, 0);
    const p3 = priceFor('plank', 3, 1, 0);
    expect(p0).toBe(10);
    expect(p3).toBeGreaterThan(p0);
    expect(p3).toBeLessThan(p0 * 2);
    expect(refundFor(100, 0.75)).toBe(75);
    expect(refundFor(100, 2)).toBe(100);
  });

  it('combo tem teto e entrega automática tem bônus pequeno', () => {
    expect(rewardFor(1, 1, false)).toBe(1);
    expect(rewardFor(1, 1000, false)).toBeCloseTo(1.3);
    expect(rewardFor(1, 1, true)).toBeCloseTo(1.1);
  });
});

describe('entregas e eficiência', () => {
  it('cada fragmento recebido paga uma única vez', () => {
    const l = new Ledger(10);
    l.generated(1, 0);
    expect(l.deliver(1)).toBe(true);
    expect(l.deliver(1)).toBe(false);
  });

  it('ZoneProgress não paga duas vezes o mesmo id', () => {
    const z = loadZone(1);
    const p = new ZoneProgress(z, emptyStats(), []);
    const sim = new Sim(z);
    const f = sim.spawnFragment('common', { x: 300, y: 200 }, { x: 0, y: 0 });
    p.onExtract(f.id, 0);
    const info: AbsorbInfo = { frag: f, value: 1, mass: 1, auto: true, launchDistance: 0, fieldCurve: false };
    expect(p.onAbsorb(info, 1)).toBeGreaterThan(0);
    expect(p.onAbsorb(info, 1.1)).toBe(0);
    expect(p.stats.delivered).toBe(1);
  });

  it('janela não dá 100% falso com um único fragmento', () => {
    const l = new Ledger(10);
    l.generated(1, 0);
    l.deliver(1);
    const e = l.efficiency(100);
    expect(e.full).toBe(false);
  });

  it('fragmentos recentes ficam pendentes; antigos ativos contam como falha', () => {
    const l = new Ledger(4);
    for (let i = 1; i <= 4; i++) l.generated(i, 0);
    l.deliver(1);
    l.deliver(2);
    l.generated(5, 99); // recente: pendente
    const e = l.efficiency(100);
    expect(e.pending).toBe(1);
    expect(e.full).toBe(true);
    expect(e.pct).toBe(50);
  });

  it('lascas resolvem o fragmento original', () => {
    const l = new Ledger(2);
    l.generated(1, 0);
    l.split(1, [10, 11]);
    l.lose(1, true);
    l.lose(10);
    expect(l.deliver(11)).toBe(true);
    l.generated(2, 0);
    l.lose(2);
    expect(l.efficiency(100).pct).toBe(50);
  });

  it('objetivo básico de massa é concluído e a zona destrava', () => {
    const z = loadZone(1);
    const p = new ZoneProgress(z, { ...emptyStats(), massDelivered: 70 }, []);
    const done = p.checkGoals();
    expect(done.map((g) => g.id)).toContain('z1-basic');
    expect(p.zoneComplete()).toBe(false);
    p.goalsDone.add('z1-eng');
    expect(p.zoneComplete()).toBe(true);
  });
});

describe('pesquisa', () => {
  it('tem entre 25 e 45 melhorias em cinco ramos', () => {
    const levels = RESEARCH.reduce((s, n) => s + n.max, 0);
    expect(levels).toBeGreaterThanOrEqual(25);
    expect(levels).toBeLessThanOrEqual(45);
    expect(new Set(RESEARCH.map((n) => n.branch)).size).toBe(5);
  });

  it('pré-requisitos e redistribuição', () => {
    expect(canBuy({}, 10, 'ex-val').ok).toBe(false);
    expect(canBuy({ 'ex-cad': 1 }, 10, 'ex-val').ok).toBe(true);
    expect(canBuy({}, 0, 'ex-cad').ok).toBe(false);
    const lv = { 'ex-cad': 2, 'ma-force': 1 };
    expect(spentOn(lv)).toBe(1 + 2 + 1);
    const m = buildMods(lv);
    expect(m.extractCooldownMul).toBeLessThan(1);
    expect(m.grabForceMul).toBeGreaterThan(1);
  });
});

describe('salvamento', () => {
  it('ida e volta preserva instalação e carteira', () => {
    const st = new MemStorage();
    const s = new SaveManager(st);
    const zs = s.zone(1, 0);
    zs.credits = 42;
    zs.devices.push({ id: 1, type: 'plank', x: 10, y: 20, angle: 0.5, params: {}, enabled: true, paid: 10 });
    s.flush();
    const s2 = new SaveManager(st);
    expect(s2.data.zones['1'].credits).toBe(42);
    expect(s2.data.zones['1'].devices[0].angle).toBe(0.5);
  });

  it('migra saves antigos e higieniza créditos negativos', () => {
    const old = { version: 1, research: 7, zones: { '1': { credits: -50, devices: [{ type: 'plank', x: 1, y: 1, angle: 0 }, null] } } };
    const d = migrate(old);
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.research.earned).toBe(7);
    expect(d.zones['1'].credits).toBe(0);
    expect(d.zones['1'].devices).toHaveLength(1);
  });

  it('save corrompido cai para a cópia de segurança', () => {
    const st = new MemStorage();
    const s = new SaveManager(st);
    s.data.research.earned = 5;
    s.flush();
    s.data.research.earned = 6;
    s.flush(); // backup = 5, principal = 6
    st.setItem('meteor-mill-save', '{corrompido');
    const s2 = new SaveManager(st);
    expect(s2.data.research.earned).toBe(5);
    expect(s2.lastError).toBeTruthy();
  });

  it('reset volta ao padrão', () => {
    const st = new MemStorage();
    const s = new SaveManager(st);
    s.data.unlockedZone = 4;
    s.flush();
    s.reset();
    expect(s.data).toEqual(defaultSave());
    expect(st.getItem('meteor-mill-save')).toBeNull();
  });
});
