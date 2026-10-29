import { describe, expect, it } from 'vitest';
import { Wallet, priceFor, refundFor, rewardFor } from '../src/economy/Economy';
import { ZoneProgress, emptyStats } from '../src/progression/Goals';
import { Ledger } from '../src/progression/Ledger';
import { Heat } from '../src/progression/Goals';
import { TREE, buildMods, canBuyNode, unlockedDevices } from '../src/progression/SkillTree';
import { DEFAULT_MODS } from '../src/sim/mods';
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
    expect(p0).toBe(8);
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
    expect(p.onAbsorb(info, 1).credits).toBeGreaterThan(0);
    expect(p.onAbsorb(info, 1.1).credits).toBe(0);
    expect(p.stats.energyFed).toBeGreaterThan(0);
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

  it('desafios cumpridos são marcados uma vez; a zona termina pela energia', () => {
    const z = loadZone(1);
    const p = new ZoneProgress(z, { ...emptyStats(), massDelivered: 70 }, []);
    expect(p.checkGoals().map((g) => g.id)).toContain('z1-basic');
    expect(p.checkGoals()).toHaveLength(0);
    expect(p.zoneComplete()).toBe(false);
    p.stats.energyFed = z.growthTarget;
    expect(p.zoneComplete()).toBe(true);
    expect(p.growth()).toBe(1);
  });

});

describe('calor', () => {
  it('fluxo contínuo aquece; entregas isoladas não', () => {
    const fast = new Heat();
    const slow = new Heat();
    for (let t = 0; t < 30; t++) {
      fast.deliver(1);
      fast.deliver(1);
      fast.update(1);
      if (t % 4 === 0) slow.deliver(1);
      slow.update(1);
    }
    expect(fast.mult()).toBeGreaterThan(2);
    expect(slow.mult()).toBeLessThan(1.3);
    expect(fast.mult()).toBeLessThanOrEqual(DEFAULT_MODS.heatMaxMult);
  });

  it('esfria sozinho até ×1', () => {
    const h = new Heat();
    h.value = 100;
    for (let i = 0; i < 60; i++) h.update(1);
    expect(h.mult()).toBeCloseTo(1, 1);
  });
});

describe('árvore estelar', () => {
  it('é uma árvore: todo nó tem pais existentes e só a raiz não tem pai', () => {
    const ids = new Set(TREE.map((n) => n.id));
    for (const n of TREE) {
      for (const p of n.parents) expect(ids.has(p)).toBe(true);
      if (n.id !== 'core') expect(n.parents.length).toBeGreaterThan(0);
    }
    expect(new Set(TREE.map((n) => `${n.x},${n.y}`)).size).toBe(TREE.length);
  });

  it('peças só existem depois de desbloqueadas', () => {
    expect([...unlockedDevices(['core'])]).toEqual(['plank']);
    expect(unlockedDevices(['core', 'ramp', 'funnel']).has('funnel')).toBe(true);
  });

  it('pré-requisitos, zona e créditos', () => {
    const owned = new Set(['core']);
    expect(canBuyNode(owned, 1000, 1, 'funnel').ok).toBe(false);
    expect(canBuyNode(owned, 1000, 1, 'ramp').ok).toBe(true);
    expect(canBuyNode(owned, 5, 1, 'ramp').ok).toBe(false);
    expect(canBuyNode(new Set(['core', 'ramp', 'funnel', 'spring']), 1e6, 1, 'booster').ok).toBe(false);
    expect(canBuyNode(new Set(['core', 'ramp', 'funnel', 'spring']), 1e6, 2, 'booster').ok).toBe(true);
  });

  it('mineração automática vem da árvore', () => {
    expect(buildMods(['core']).autoMineInterval).toBe(Infinity);
    expect(buildMods(['core', 'pick1', 'auto1']).autoMineInterval).toBe(3);
  });
});

describe('salvamento', () => {
  it('ida e volta preserva instalação e carteira', () => {
    const st = new MemStorage();
    const s = new SaveManager(st);
    const zs = s.zone(1, 0);
    s.data.credits = 42;
    zs.devices.push({ id: 1, type: 'plank', x: 10, y: 20, angle: 0.5, params: {}, enabled: true, paid: 10 });
    s.flush();
    const s2 = new SaveManager(st);
    expect(s2.data.credits).toBe(42);
    expect(s2.data.zones['1'].devices[0].angle).toBe(0.5);
  });

  it('migra saves antigos e higieniza créditos negativos', () => {
    const old = {
      version: 2,
      research: { earned: 7, levels: {} },
      zones: { '1': { credits: 30, devices: [{ type: 'plank', x: 1, y: 1, angle: 0, paid: 10 }, { type: 'bumper', x: 5, y: 5, angle: 0, paid: 30 }, null] }, '2': { credits: -50, devices: [] } },
    };
    const d = migrate(old);
    expect(d.version).toBe(SAVE_VERSION);
    // carteira global = inicial + carteiras das zonas + reembolso de peças extintas
    expect(d.credits).toBe(20 + 30 + 30);
    expect(d.tree.owned).toEqual(['core']);
    expect(d.zones['1'].devices).toHaveLength(1);
  });

  it('save corrompido cai para a cópia de segurança', () => {
    const st = new MemStorage();
    const s = new SaveManager(st);
    s.data.credits = 5;
    s.flush();
    s.data.credits = 6;
    s.flush(); // backup = 5, principal = 6
    st.setItem('meteor-mill-save', '{corrompido');
    const s2 = new SaveManager(st);
    expect(s2.data.credits).toBe(5);
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
