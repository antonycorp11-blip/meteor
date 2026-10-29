// Valores de balanceamento. Todos são hipóteses de playtest (GDD §9.3) e
// ficam centralizados aqui para facilitar ajustes.

export const Config = {
  // --- Simulação ---
  stepMs: 1000 / 60,
  substeps: 2,
  maxCatchUpSteps: 4,
  gravity: 560, // px/s² (unidades de mundo)
  maxFragmentSpeed: 13, // px por frame de 60 Hz
  outOfBoundsMargin: 60,
  restRecycleSeconds: 40, // fragmento parado por tanto tempo é recolhido (sem crédito)
  restSpeed: 0.12,
  maxActiveFragments: { desktop: 200, mobile: 110 },

  // --- Asteroide ---
  extractCooldown: 0.34, // s
  extractSpeed: 2.3, // px/frame ao sair da superfície
  extractSpread: 0.35,

  // --- Feixe manual ---
  grabStiffness: 26, // 1/s² escala de mola
  grabDamping: 7.5,
  grabMaxAccel: 1.75, // múltiplos da gravidade
  grabReach: 150, // px de mundo entre ponteiro e fragmento
  grabMaxSpeed: 7,

  // --- Buraco negro ---
  blackHoleSwirl: 0.28,

  // --- Economia ---
  comboWindow: 1.6, // s entre entregas para manter combo
  comboStep: 0.03,
  comboCap: 1.3,
  autoQualityBonus: 1.1,
  priceGrowth: 1.12, // cada cópia da mesma peça na zona custa um pouco mais
  baseRefund: 0.75,

  // --- Eficiência ---
  pendingGrace: 25, // s: fragmentos ativos mais novos que isso não entram na janela

  // --- Pesquisa ---
  // Créditos excedentes de zonas concluídas podem virar pesquisa (limitado).
  crossZoneConversion: { enabled: true, creditsPerPoint: 400, maxPointsPerZone: 2 },

  // --- Construção ---
  snapGrid: 4,
  snapAngleDeg: 5,
};

export type ConfigType = typeof Config;
