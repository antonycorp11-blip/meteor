/** Modificadores que a árvore de pesquisa aplica à simulação. */
export interface SimMods {
  extractCooldownMul: number;
  fragmentValueMul: number;
  multiExtractChance: number;
  grabReachMul: number;
  grabForceMul: number;
  trajectoryPreview: boolean;
  boosterMul: number;
  bumperMul: number;
  launcherCadenceMul: number;
  fieldRadiusMul: number;
  fieldStrengthMul: number;
  autoExtractCadenceMul: number;
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
  bumperMul: 1,
  launcherCadenceMul: 1,
  fieldRadiusMul: 1,
  fieldStrengthMul: 1,
  autoExtractCadenceMul: 1,
  refundRate: 0.75,
  priceDiscount: 0,
};
