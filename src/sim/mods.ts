/** Modificadores que a árvore de pesquisa aplica à simulação. */
export interface SimMods {
  extractCooldownMul: number;
  fragmentValueMul: number;
  multiExtractChance: number;
  grabReachMul: number;
  grabForceMul: number;
  trajectoryPreview: boolean;
  boosterMul: number;
  springMul: number;
  conveyorMul: number;
  launcherCadenceMul: number;
  fieldRadiusMul: number;
  fieldStrengthMul: number;
  /** segundos entre pedras da mineração automática (Infinity = desligada) */
  autoMineInterval: number;
  holeRadiusMul: number;
  /** calor */
  heatGainMul: number;
  heatDecayMul: number;
  heatMaxMult: number;
  refundRate: number;
  priceDiscount: number;
}

export const DEFAULT_MODS: SimMods = {
  extractCooldownMul: 1,
  fragmentValueMul: 1,
  multiExtractChance: 0,
  grabReachMul: 1,
  grabForceMul: 1,
  trajectoryPreview: false,
  boosterMul: 1,
  springMul: 1,
  conveyorMul: 1,
  launcherCadenceMul: 1,
  fieldRadiusMul: 1,
  fieldStrengthMul: 1,
  autoMineInterval: Infinity,
  holeRadiusMul: 1,
  heatGainMul: 1,
  heatDecayMul: 1,
  heatMaxMult: 3,
  refundRate: 0.75,
  priceDiscount: 0,
};
