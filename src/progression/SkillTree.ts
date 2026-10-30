import type { DeviceType } from '../machines/types';
import { DEFAULT_MODS, type SimMods } from '../sim/mods';

export type Branch = 'core' | 'drone' | 'refine' | 'build' | 'seed' | 'beam' | 'builders' | 'economy';

export interface TreeNode {
  id: string;
  name: string;
  /** descrição; "{v}" vira o efeito total no nível indicado */
  desc: string;
  branch: Branch;
  /** posição na grade da árvore (raiz em 0,0) */
  x: number;
  y: number;
  parents: string[];
  /** custo do 1º nível */
  cost: number;
  /** multiplicador de custo a cada nível seguinte */
  growth?: number;
  /** quantidade de níveis (1 = compra única) */
  maxLevel?: number;
  /** precisa ter alcançado este planeta (6 = campanha concluída) */
  requiresZone?: number;
  /** peça liberada por este nó */
  unlock?: DeviceType;
  icon?: string;
  apply?: (m: SimMods, level: number) => void;
  /** efeito acumulado num nível, para a ficha ("−24% de recarga") */
  effect?: (level: number) => string;
}

export const BRANCH_INFO: Record<Branch, { name: string; color: string }> = {
  core: { name: 'Núcleo', color: '#ffe08a' },
  drone: { name: 'Drone de mineração', color: '#ff9a3a' },
  refine: { name: 'Refino', color: '#f0c86a' },
  build: { name: 'Engenharia', color: '#55d7e8' },
  seed: { name: 'Semente', color: '#ff6a4a' },
  beam: { name: 'Feixe trator', color: '#6ee7a0' },
  builders: { name: 'Construtores', color: '#9d7aff' },
  economy: { name: 'Economia', color: '#d8c8ff' },
};

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
const secs = (v: number) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)} s`.replace('.', ',');

/** Intervalo da mineração automática por nível de cadência. */
export const droneInterval = (level: number) => 3 * Math.pow(0.9, level);

export const TREE: TreeNode[] = [
  { id: 'core', name: 'Núcleo da Singularis', desc: 'Libera a Viga orbital. Tudo começa aqui.', branch: 'core', x: 0, y: 0, parents: [], cost: 0, unlock: 'plank', icon: 'star' },

  // --- Drone de mineração (para cima): o motor do jogo
  { id: 'laser', name: 'Laser focalizado', desc: 'Disparos manuais do laser mais rápidos.', branch: 'drone', x: 0, y: -1, parents: ['core'], cost: 12, growth: 1.27, maxLevel: 15, icon: 'laser', apply: (m, l) => (m.extractCooldownMul *= Math.pow(0.93, l)), effect: (l) => `${pct(Math.pow(0.93, l) - 1)} de recarga do laser` },
  { id: 'auto', name: 'Drone autônomo', desc: 'O drone minera sozinho na direção do seu último disparo: uma pedra a cada 3 s.', branch: 'drone', x: 0, y: -2, parents: ['laser'], cost: 40, icon: 'drone', apply: (m) => (m.autoMineInterval = Math.min(m.autoMineInterval, 3)) },
  { id: 'cadence', name: 'Cadência do drone', desc: 'O drone autônomo dispara mais vezes.', branch: 'drone', x: 0, y: -3, parents: ['auto'], cost: 30, growth: 1.2, maxLevel: 25, icon: 'drone', apply: (m, l) => (m.autoMineInterval = Math.min(m.autoMineInterval, droneInterval(l))), effect: (l) => `uma pedra a cada ${secs(droneInterval(l))}` },
  { id: 'fleet', name: 'Frota de drones', desc: 'Drones extras mineram junto com o primeiro, cada um soltando sua própria pedra.', branch: 'drone', x: 0, y: -4, parents: ['cadence'], cost: 1500, growth: 2.2, maxLevel: 4, requiresZone: 3, icon: 'drone', apply: (m, l) => (m.extraDrones += l), effect: (l) => `${l + 1} drones minerando` },
  { id: 'splitter', name: 'Divisor de feixe', desc: 'Chance de cada disparo soltar uma pedra a mais.', branch: 'drone', x: -1, y: -2, parents: ['laser'], cost: 60, growth: 1.27, maxLevel: 10, icon: 'laser', apply: (m, l) => (m.multiExtractChance += 0.05 * l), effect: (l) => `${pct(0.05 * l)} de chance de pedra extra` },
  { id: 'cascade', name: 'Fratura em cascata', desc: 'Ainda mais pedras por disparo; passando de 100%, solta duas extras.', branch: 'drone', x: -1, y: -3, parents: ['splitter'], cost: 500, growth: 1.27, maxLevel: 10, requiresZone: 3, icon: 'laser', apply: (m, l) => (m.multiExtractChance += 0.07 * l), effect: (l) => `${pct(0.07 * l)} de chance de pedra extra` },
  { id: 'rich', name: 'Veios ricos', desc: 'Toda pedra vale mais créditos.', branch: 'drone', x: 1, y: -3, parents: ['auto'], cost: 50, growth: 1.2, maxLevel: 20, icon: 'gem', apply: (m, l) => (m.fragmentValueMul *= 1 + 0.06 * l), effect: (l) => `${pct(0.06 * l)} de créditos por pedra` },
  { id: 'prospect', name: 'Prospecção profunda', desc: 'O drone mira veios valiosos: mais pedras densas, metálicas, vítreas e raras.', branch: 'drone', x: 1, y: -4, parents: ['rich'], cost: 350, growth: 1.27, maxLevel: 10, requiresZone: 2, icon: 'gem', apply: (m, l) => (m.valuableWeightMul *= 1 + 0.12 * l), effect: (l) => `${pct(0.12 * l)} de chance de pedras valiosas` },

  // --- Refino (à esquerda do drone): valor por tipo de pedra
  { id: 'r-metal', name: 'Refino de metais', desc: 'Pedras metálicas valem mais.', branch: 'refine', x: -2, y: -1, parents: ['laser'], cost: 80, growth: 1.27, maxLevel: 10, icon: 'gem', apply: (m, l) => (m.typeValueMul.metallic = (m.typeValueMul.metallic ?? 1) * (1 + 0.12 * l)), effect: (l) => `${pct(0.12 * l)} nas metálicas` },
  { id: 'r-dense', name: 'Compactação', desc: 'Pedras densas valem mais.', branch: 'refine', x: -2, y: -2, parents: ['r-metal'], cost: 120, growth: 1.27, maxLevel: 10, icon: 'gem', apply: (m, l) => (m.typeValueMul.dense = (m.typeValueMul.dense ?? 1) * (1 + 0.12 * l)), effect: (l) => `${pct(0.12 * l)} nas densas` },
  { id: 'r-glass', name: 'Lapidação', desc: 'Pedras vítreas e lascas valem mais.', branch: 'refine', x: -2, y: -3, parents: ['r-dense'], cost: 250, growth: 1.27, maxLevel: 10, requiresZone: 2, icon: 'gem', apply: (m, l) => {
      m.typeValueMul.glass = (m.typeValueMul.glass ?? 1) * (1 + 0.15 * l);
      m.typeValueMul.shard = (m.typeValueMul.shard ?? 1) * (1 + 0.15 * l);
    }, effect: (l) => `${pct(0.15 * l)} nas vítreas` },
  { id: 'r-rare', name: 'Estabilizador de núcleo', desc: 'Pedras instáveis e raras valem mais.', branch: 'refine', x: -2, y: -4, parents: ['r-glass'], cost: 600, growth: 1.27, maxLevel: 10, requiresZone: 3, icon: 'gem', apply: (m, l) => {
      m.typeValueMul.unstable = (m.typeValueMul.unstable ?? 1) * (1 + 0.2 * l);
      m.typeValueMul.rare = (m.typeValueMul.rare ?? 1) * (1 + 0.2 * l);
    }, effect: (l) => `${pct(0.2 * l)} nas raras` },
  { id: 'r-common', name: 'Triagem fina', desc: 'Pedras comuns e porosas valem mais.', branch: 'refine', x: -3, y: -2, parents: ['r-dense'], cost: 100, growth: 1.27, maxLevel: 15, icon: 'gem', apply: (m, l) => {
      m.typeValueMul.common = (m.typeValueMul.common ?? 1) * (1 + 0.08 * l);
      m.typeValueMul.porous = (m.typeValueMul.porous ?? 1) * (1 + 0.08 * l);
    }, effect: (l) => `${pct(0.08 * l)} nas comuns` },

  // --- Engenharia (para a direita)
  { id: 'ramp', name: 'Trilho curvo', desc: 'Libera o Trilho curvo.', branch: 'build', x: 1, y: 0, parents: ['core'], cost: 15, unlock: 'ramp' },
  { id: 'funnel', name: 'Coletor', desc: 'Libera o Coletor.', branch: 'build', x: 2, y: 0, parents: ['ramp'], cost: 30, unlock: 'funnel' },
  { id: 'spring', name: 'Placa de pulso', desc: 'Libera a Placa de pulso, que impulsiona na direção da seta.', branch: 'build', x: 3, y: 0, parents: ['funnel'], cost: 50, unlock: 'spring' },
  { id: 'spring2', name: 'Pulso reforçado', desc: 'Placas de pulso mais fortes.', branch: 'build', x: 4, y: -1, parents: ['spring'], cost: 90, growth: 1.27, maxLevel: 10, icon: 'up', apply: (m, l) => (m.springMul *= 1 + 0.04 * l), effect: (l) => `${pct(0.04 * l)} de força` },
  { id: 'spring3', name: 'Pulso adaptativo', desc: 'A placa de pulso perde menos força com pedras pesadas.', branch: 'build', x: 5, y: -1, parents: ['spring2'], cost: 700, growth: 1.45, maxLevel: 5, requiresZone: 3, icon: 'up', apply: (m, l) => (m.springMassExp = Math.max(0.2, m.springMassExp - 0.06 * l)), effect: (l) => `${pct(-0.12 * l)} de perda com a massa` },
  { id: 'launcher', name: 'Canhão de massa', desc: 'Libera o Canhão de massa (longo alcance, move pedras densas).', branch: 'build', x: 4, y: 0, parents: ['spring'], cost: 220, requiresZone: 2, unlock: 'launcher' },
  { id: 'launcher2', name: 'Recarga rápida', desc: 'Canhões de massa recarregam mais rápido.', branch: 'build', x: 5, y: 0, parents: ['launcher'], cost: 260, growth: 1.27, maxLevel: 10, icon: 'up', apply: (m, l) => (m.launcherCadenceMul *= Math.pow(0.92, l)), effect: (l) => `${pct(Math.pow(0.92, l) - 1)} de recarga` },
  { id: 'launcher3', name: 'Canhão calibrado', desc: 'Disparos do canhão mais precisos.', branch: 'build', x: 6, y: 0, parents: ['launcher2'], cost: 450, growth: 1.45, maxLevel: 5, requiresZone: 3, icon: 'arc', apply: (m, l) => (m.launcherErrMul *= Math.max(0, 1 - 0.18 * l)), effect: (l) => `${pct(-0.18 * l)} de desvio` },
  { id: 'conveyor', name: 'Esteira magnética', desc: 'Libera a Esteira magnética.', branch: 'build', x: 2, y: 1, parents: ['ramp'], cost: 60, unlock: 'conveyor' },
  { id: 'conveyor2', name: 'Esteira turbo', desc: 'Esteiras magnéticas mais rápidas.', branch: 'build', x: 3, y: 1, parents: ['conveyor'], cost: 120, growth: 1.27, maxLevel: 10, icon: 'right', apply: (m, l) => (m.conveyorMul *= 1 + 0.06 * l), effect: (l) => `${pct(0.06 * l)} de velocidade` },
  { id: 'booster', name: 'Acelerador linear', desc: 'Libera o Acelerador linear.', branch: 'build', x: 4, y: 1, parents: ['conveyor2'], cost: 150, requiresZone: 2, unlock: 'booster' },
  { id: 'booster2', name: 'Sobrecarga', desc: 'Aceleradores lineares mais fortes.', branch: 'build', x: 5, y: 1, parents: ['booster'], cost: 220, growth: 1.27, maxLevel: 10, icon: 'up', apply: (m, l) => (m.boosterMul *= 1 + 0.06 * l), effect: (l) => `${pct(0.06 * l)} de impulso` },
  { id: 'damper', name: 'Amortecedor inercial', desc: 'Libera o Amortecedor inercial.', branch: 'build', x: 2, y: 2, parents: ['conveyor'], cost: 120, requiresZone: 2, unlock: 'damper' },
  { id: 'gate', name: 'Comporta', desc: 'Libera a Comporta.', branch: 'build', x: 3, y: 2, parents: ['damper'], cost: 300, requiresZone: 3, unlock: 'gate' },
  { id: 'fan', name: 'Soprador iônico', desc: 'Libera o Soprador iônico.', branch: 'build', x: 4, y: 2, parents: ['gate'], cost: 350, requiresZone: 3, unlock: 'fan' },

  // --- Semente (para a esquerda): calor e crescimento
  { id: 'heat', name: 'Fornalha estelar', desc: 'Aumenta o multiplicador máximo do calor.', branch: 'seed', x: -1, y: 0, parents: ['core'], cost: 60, growth: 1.45, maxLevel: 9, icon: 'flame', apply: (m, l) => (m.heatMaxMult = Math.max(m.heatMaxMult, 3 + 0.5 * l)), effect: (l) => `calor até ×${(3 + 0.5 * l).toFixed(1).replace('.', ',')}` },
  { id: 'grow', name: 'Semente enriquecida', desc: 'Cada entrega faz a semente crescer mais: o planeta cai mais rápido.', branch: 'seed', x: -2, y: 0, parents: ['heat'], cost: 120, growth: 1.2, maxLevel: 20, icon: 'seed', apply: (m, l) => (m.growthMul *= 1 + 0.06 * l), effect: (l) => `${pct(0.06 * l)} de crescimento` },
  { id: 'horizon', name: 'Horizonte amplo', desc: 'A semente puxa as pedras de um pouco mais longe.', branch: 'seed', x: -3, y: 0, parents: ['grow'], cost: 500, growth: 1.45, maxLevel: 5, requiresZone: 3, icon: 'ring', apply: (m, l) => (m.holeRadiusMul *= 1 + 0.05 * l), effect: (l) => `${pct(0.05 * l)} de alcance` },
  { id: 'critical', name: 'Massa crítica', desc: 'Crescimento ainda mais rápido nos planetas distantes.', branch: 'seed', x: -4, y: 0, parents: ['horizon'], cost: 900, growth: 1.27, maxLevel: 10, requiresZone: 4, icon: 'seed', apply: (m, l) => (m.growthMul *= 1 + 0.08 * l), effect: (l) => `${pct(0.08 * l)} de crescimento` },
  { id: 'retain', name: 'Retenção térmica', desc: 'O calor esfria mais devagar.', branch: 'seed', x: -2, y: 1, parents: ['heat'], cost: 100, growth: 1.27, maxLevel: 10, icon: 'flame', apply: (m, l) => (m.heatDecayMul *= Math.pow(0.93, l)), effect: (l) => `${pct(Math.pow(0.93, l) - 1)} de resfriamento` },
  { id: 'kindle', name: 'Ignição rápida', desc: 'Cada entrega aquece mais.', branch: 'seed', x: -3, y: 1, parents: ['retain'], cost: 120, growth: 1.27, maxLevel: 10, icon: 'flame', apply: (m, l) => (m.heatGainMul *= 1 + 0.08 * l), effect: (l) => `${pct(0.08 * l)} de aquecimento` },

  // --- Feixe trator (diagonal inferior esquerda): segurar pedras à mão
  { id: 'beam1', name: 'Feixe longo', desc: 'O feixe trator alcança mais longe.', branch: 'beam', x: -1, y: 1, parents: ['core'], cost: 40, growth: 1.45, maxLevel: 5, icon: 'claw', apply: (m, l) => (m.grabReachMul *= 1 + 0.1 * l), effect: (l) => `${pct(0.1 * l)} de alcance` },
  { id: 'beam2', name: 'Pegada firme', desc: 'O feixe trator puxa com mais força (ergue pedras densas).', branch: 'beam', x: -1, y: 2, parents: ['beam1'], cost: 80, growth: 1.45, maxLevel: 5, icon: 'claw', apply: (m, l) => (m.grabForceMul *= 1 + 0.12 * l), effect: (l) => `${pct(0.12 * l)} de força` },
  { id: 'traj', name: 'Prévia de arremesso', desc: 'Mostra o arco da pedra que você está segurando.', branch: 'beam', x: -1, y: 3, parents: ['beam2'], cost: 150, icon: 'arc', apply: (m) => (m.trajectoryPreview = true) },

  // --- Construtores (para baixo): engenharia reversa das ruínas
  { id: 'ruins', name: 'Engenharia reversa', desc: 'Estudo das ruínas dos Construtores. Abre as tecnologias de campo.', branch: 'builders', x: 0, y: 1, parents: ['core'], cost: 500, requiresZone: 4, icon: 'glyph' },
  { id: 'attractor', name: 'Poço gravitacional', desc: 'Libera o Poço gravitacional.', branch: 'builders', x: 0, y: 2, parents: ['ruins'], cost: 500, requiresZone: 4, unlock: 'attractor' },
  { id: 'repulsor', name: 'Repulsor', desc: 'Libera o Repulsor.', branch: 'builders', x: 1, y: 3, parents: ['attractor'], cost: 500, requiresZone: 4, unlock: 'repulsor' },
  { id: 'lift', name: 'Elevador gravitacional', desc: 'Libera o Elevador gravitacional.', branch: 'builders', x: 0, y: 3, parents: ['attractor'], cost: 900, requiresZone: 4, unlock: 'lift' },
  { id: 'arm', name: 'Braço robótico', desc: 'Libera o Braço robótico (lança em lotes).', branch: 'builders', x: 0, y: 4, parents: ['lift'], cost: 1400, requiresZone: 4, unlock: 'arm' },
  { id: 'sensor', name: 'Sensor de passagem', desc: 'Libera o Sensor (comportas inteligentes).', branch: 'builders', x: 0, y: 5, parents: ['arm'], cost: 2000, requiresZone: 5, unlock: 'sensor' },
  { id: 'coils', name: 'Bobinas largas', desc: 'Campos e sopradores alcançam mais longe.', branch: 'builders', x: 1, y: 2, parents: ['ruins'], cost: 500, growth: 1.45, maxLevel: 5, requiresZone: 4, icon: 'ring', apply: (m, l) => (m.fieldRadiusMul *= 1 + 0.06 * l), effect: (l) => `${pct(0.06 * l)} de alcance` },
  { id: 'coils2', name: 'Bobinas densas', desc: 'Campos, sopradores e elevadores mais fortes.', branch: 'builders', x: 2, y: 3, parents: ['coils'], cost: 650, growth: 1.27, maxLevel: 10, requiresZone: 4, icon: 'ring', apply: (m, l) => (m.fieldStrengthMul *= 1 + 0.05 * l), effect: (l) => `${pct(0.05 * l)} de força` },
  { id: 'archive', name: 'Arquivo dos Construtores', desc: 'Os registros das ruínas ensinam a aproveitar melhor cada pedra: créditos de tudo aumentam.', branch: 'builders', x: 1, y: 4, parents: ['lift'], cost: 1200, growth: 1.27, maxLevel: 10, requiresZone: 5, icon: 'glyph', apply: (m, l) => (m.fragmentValueMul *= 1 + 0.08 * l), effect: (l) => `${pct(0.08 * l)} de créditos` },

  // --- Economia (diagonal superior direita)
  { id: 'refund', name: 'Desmontagem limpa', desc: 'Revender uma peça devolve mais do preço.', branch: 'economy', x: 1, y: -1, parents: ['core'], cost: 80, growth: 2.2, maxLevel: 3, icon: 'coin', apply: (m, l) => (m.refundRate = Math.max(m.refundRate, 0.75 + 0.05 * l)), effect: (l) => `revenda a ${Math.round((0.75 + 0.05 * l) * 100)}%` },
  { id: 'discount', name: 'Fabricação enxuta', desc: 'Peças mais baratas.', branch: 'economy', x: 2, y: -1, parents: ['refund'], cost: 150, growth: 1.27, maxLevel: 10, icon: 'coin', apply: (m, l) => (m.priceDiscount = Math.max(m.priceDiscount, 0.03 * l)), effect: (l) => `${pct(-0.03 * l)} no preço` },
  { id: 'bounty', name: 'Contratos premiados', desc: 'Desafios pagam mais.', branch: 'economy', x: 2, y: -2, parents: ['refund'], cost: 120, growth: 1.27, maxLevel: 10, icon: 'trophy', apply: (m, l) => (m.goalRewardMul *= 1 + 0.1 * l), effect: (l) => `${pct(0.1 * l)} nos desafios` },
  { id: 'salvage', name: 'Recuperação de módulos', desc: 'Ao entregar um planeta, mais do valor das peças volta em créditos.', branch: 'economy', x: 3, y: -1, parents: ['discount'], cost: 300, growth: 1.45, maxLevel: 5, requiresZone: 2, icon: 'coin', apply: (m, l) => (m.recoverRate = Math.max(m.recoverRate, 0.5 + 0.1 * l)), effect: (l) => `${Math.round((0.5 + 0.1 * l) * 100)}% recuperado` },
];

export const TREE_BY_ID = new Map(TREE.map((n) => [n.id, n]));

export type Levels = Record<string, number>;

export function maxLevel(n: TreeNode) {
  return n.maxLevel ?? 1;
}

/** Custo do próximo nível (a partir do nível atual). */
export function levelCost(n: TreeNode, current: number) {
  return Math.round(n.cost * Math.pow(n.growth ?? 1, current));
}

/** Nível máximo comprável com o planeta alcançado: o teto sobe a cada planeta. */
export function levelCap(n: TreeNode, reachedZone: number) {
  const max = maxLevel(n);
  if (max === 1 || reachedZone >= 6) return max;
  return Math.max(1, Math.ceil((max * Math.min(5, reachedZone)) / 5));
}

export function buildMods(levels: Levels): SimMods {
  const m: SimMods = { ...DEFAULT_MODS, typeValueMul: {} };
  for (const n of TREE) {
    const l = levels[n.id] ?? 0;
    if (l > 0) n.apply?.(m, Math.min(l, maxLevel(n)));
  }
  return m;
}

export function unlockedDevices(levels: Levels): Set<DeviceType> {
  const out = new Set<DeviceType>();
  for (const n of TREE) if (n.unlock && (levels[n.id] ?? 0) > 0) out.add(n.unlock);
  return out;
}

export type NodeState = 'owned' | 'available' | 'locked';

/** 'owned' = no nível máximo; 'available' = pais comprados e ainda há níveis. */
export function nodeState(levels: Levels, id: string): NodeState {
  const n = TREE_BY_ID.get(id);
  if (!n) return 'locked';
  if ((levels[id] ?? 0) >= maxLevel(n)) return 'owned';
  return n.parents.every((p) => (levels[p] ?? 0) > 0) ? 'available' : 'locked';
}

export function canBuyNode(levels: Levels, credits: number, reachedZone: number, id: string): { ok: boolean; reason?: string; cost?: number } {
  const n = TREE_BY_ID.get(id);
  if (!n) return { ok: false, reason: 'Inexistente' };
  const cur = levels[id] ?? 0;
  if (cur >= maxLevel(n)) return { ok: false, reason: maxLevel(n) > 1 ? 'Nível máximo' : 'Já desbloqueado' };
  if (!n.parents.every((p) => (levels[p] ?? 0) > 0)) return { ok: false, reason: 'Desbloqueie o nó anterior' };
  if (n.requiresZone && reachedZone < n.requiresZone) return { ok: false, reason: n.requiresZone >= 6 ? 'Conclua o contrato' : `Alcance o planeta ${ROMAN[n.requiresZone]}` };
  if (cur >= levelCap(n, reachedZone)) return { ok: false, reason: `Mais níveis no planeta ${ROMAN[Math.min(5, reachedZone + 1)]}` };
  const cost = levelCost(n, cur);
  if (credits < cost) return { ok: false, reason: 'Créditos insuficientes', cost };
  return { ok: true, cost };
}

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
