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
  /** placa de pulso: potência / massa^expoente */
  springMassExp: number;
  /** desvio de mira do canhão */
  launcherErrMul: number;
  /** drones de mineração além do primeiro */
  extraDrones: number;
  /** quanto cada entrega faz a semente crescer */
  growthMul: number;
  /** valor por tipo de pedra */
  typeValueMul: Partial<Record<string, number>>;
  /** peso de sorteio das pedras valiosas */
  valuableWeightMul: number;
  goalRewardMul: number;
  /** fração do valor das peças recuperada ao entregar o planeta */
  recoverRate: number;
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
  springMassExp: 0.5,
  launcherErrMul: 1,
  extraDrones: 0,
  growthMul: 1,
  typeValueMul: {},
  valuableWeightMul: 1,
  goalRewardMul: 1,
  recoverRate: 0.5,
};
