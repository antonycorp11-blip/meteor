import { Config } from '../core/Config';
import { DEVICES } from '../machines/catalog';
import type { DeviceType } from '../machines/types';

/** Carteira local de uma zona. Nunca fica negativa. */
export class Wallet {
  credits: number;
  constructor(credits = 0) {
    this.credits = credits;
  }
  canAfford(cost: number) {
    return cost >= 0 && this.credits + 1e-9 >= cost;
  }
  spend(cost: number): boolean {
    if (!Number.isFinite(cost) || cost < 0 || !this.canAfford(cost)) return false;
    this.credits = Math.max(0, this.credits - cost);
    return true;
  }
  earn(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.credits += amount;
  }
}

export function priceFor(type: DeviceType, ownedOfType: number, zonePriceMult: number, discount: number): number {
  const base = DEVICES[type].cost * zonePriceMult;
  const p = base * Math.pow(Config.priceGrowth, ownedOfType) * (1 - discount);
  return Math.max(1, Math.round(p));
}

export function refundFor(paid: number, refundRate: number): number {
  return Math.floor(paid * Math.min(1, Math.max(0, refundRate)));
}

/**
 * recompensa = valor_base_do_tipo × multiplicador_suave_de_combo × bônus_pequeno_de_qualidade
 */
export function rewardFor(baseValue: number, combo: number, auto: boolean): number {
  const comboMult = Math.min(Config.comboCap, 1 + Config.comboStep * Math.max(0, combo - 1));
  const quality = auto ? Config.autoQualityBonus : 1;
  return baseValue * comboMult * quality;
}
