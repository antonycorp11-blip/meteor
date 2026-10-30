import type { DeviceType } from '../machines/types';
import { DEFAULT_MODS, type SimMods } from '../sim/mods';

export type Branch = 'core' | 'mining' | 'build' | 'fields' | 'heat' | 'beam' | 'economy';

export interface TreeNode {
  id: string;
  name: string;
  desc: string;
  branch: Branch;
  /** posição na grade da árvore (raiz em 0,0) */
  x: number;
  y: number;
  parents: string[];
  cost: number;
  /** precisa ter alcançado esta zona (6 = campanha concluída) */
  requiresZone?: number;
  /** peça liberada por este nó */
  unlock?: DeviceType;
  icon?: string;
  apply?: (m: SimMods) => void;
}

export const BRANCH_INFO: Record<Branch, { name: string; color: string }> = {
  core: { name: 'Núcleo', color: '#ffe08a' },
  mining: { name: 'Mineração', color: '#ff9a3a' },
  build: { name: 'Construção', color: '#55d7e8' },
  fields: { name: 'Campos', color: '#9d7aff' },
  heat: { name: 'Calor', color: '#ff6a4a' },
  beam: { name: 'Feixe', color: '#6ee7a0' },
  economy: { name: 'Economia', color: '#f0c86a' },
};

export const TREE: TreeNode[] = [
  { id: 'core', name: 'Núcleo da Singularis', desc: 'Libera a Viga orbital. Tudo começa aqui.', branch: 'core', x: 0, y: 0, parents: [], cost: 0, unlock: 'plank', icon: 'star' },

  // --- Mineração (para cima)
  { id: 'pick1', name: 'Laser focalizado', desc: 'Disparos do laser de mineração 25% mais rápidos.', branch: 'mining', x: 0, y: -1, parents: ['core'], cost: 20, icon: 'pick', apply: (m) => (m.extractCooldownMul *= 0.75) },
  { id: 'auto1', name: 'Mineração automática I', desc: 'O drone minera sozinho: uma pedra a cada 3 s, na direção do seu último disparo.', branch: 'mining', x: 0, y: -2, parents: ['pick1'], cost: 40, icon: 'drill', apply: (m) => (m.autoMineInterval = 3) },
  { id: 'auto2', name: 'Mineração automática II', desc: 'Uma pedra a cada 1,8 s.', branch: 'mining', x: 0, y: -3, parents: ['auto1'], cost: 220, icon: 'drill', apply: (m) => (m.autoMineInterval = 1.8) },
  { id: 'auto3', name: 'Mineração automática III', desc: 'Uma pedra a cada 1,1 s.', branch: 'mining', x: 0, y: -4, parents: ['auto2'], cost: 900, requiresZone: 3, icon: 'drill', apply: (m) => (m.autoMineInterval = 1.1) },
  { id: 'auto4', name: 'Mineração automática IV', desc: 'Uma pedra a cada 0,7 s.', branch: 'mining', x: 0, y: -5, parents: ['auto3'], cost: 3200, requiresZone: 4, icon: 'drill', apply: (m) => (m.autoMineInterval = 0.7) },
  { id: 'double', name: 'Feixe duplo', desc: '15% de chance de soltar duas pedras por disparo.', branch: 'mining', x: -1, y: -2, parents: ['pick1'], cost: 120, icon: 'pick', apply: (m) => (m.multiExtractChance += 0.15) },
  { id: 'double2', name: 'Feixe triplo', desc: '+20% de chance de pedra extra.', branch: 'mining', x: -1, y: -3, parents: ['double'], cost: 650, icon: 'pick', apply: (m) => (m.multiExtractChance += 0.2) },
  { id: 'rich', name: 'Veios ricos', desc: 'Cada pedra vale 20% mais créditos.', branch: 'mining', x: 1, y: -2, parents: ['pick1'], cost: 160, icon: 'gem', apply: (m) => (m.fragmentValueMul *= 1.2) },
  { id: 'rich2', name: 'Veios profundos', desc: 'Mais 25% de créditos por pedra.', branch: 'mining', x: 1, y: -3, parents: ['rich'], cost: 750, requiresZone: 2, icon: 'gem', apply: (m) => (m.fragmentValueMul *= 1.25) },

  // --- Construção (para a direita)
  { id: 'ramp', name: 'Trilho curvo', desc: 'Libera o Trilho curvo.', branch: 'build', x: 1, y: 0, parents: ['core'], cost: 15, unlock: 'ramp' },
  { id: 'funnel', name: 'Coletor', desc: 'Libera o Coletor.', branch: 'build', x: 2, y: 0, parents: ['ramp'], cost: 30, unlock: 'funnel' },
  { id: 'spring', name: 'Placa de pulso', desc: 'Libera a Placa de pulso, que impulsiona na direção da seta.', branch: 'build', x: 3, y: 0, parents: ['funnel'], cost: 50, unlock: 'spring' },
  { id: 'spring2', name: 'Pulso reforçado', desc: 'Placas de pulso 20% mais fortes.', branch: 'build', x: 4, y: -1, parents: ['spring'], cost: 260, icon: 'up', apply: (m) => (m.springMul *= 1.2) },
  { id: 'conveyor', name: 'Esteira magnética', desc: 'Libera a Esteira magnética.', branch: 'build', x: 2, y: 1, parents: ['ramp'], cost: 60, unlock: 'conveyor' },
  { id: 'conveyor2', name: 'Esteira turbo', desc: 'Esteiras magnéticas 40% mais rápidas.', branch: 'build', x: 3, y: 1, parents: ['conveyor'], cost: 300, icon: 'right', apply: (m) => (m.conveyorMul *= 1.4) },
  { id: 'booster', name: 'Acelerador linear', desc: 'Libera o Acelerador linear.', branch: 'build', x: 4, y: 0, parents: ['spring'], cost: 150, requiresZone: 2, unlock: 'booster' },
  { id: 'launcher', name: 'Canhão de massa', desc: 'Libera o Canhão de massa (longo alcance, move pedras densas).', branch: 'build', x: 5, y: 0, parents: ['booster'], cost: 220, requiresZone: 2, unlock: 'launcher' },
  { id: 'launcher2', name: 'Recarga rápida', desc: 'Canhões de massa recarregam 40% mais rápido.', branch: 'build', x: 6, y: 0, parents: ['launcher'], cost: 900, icon: 'up', apply: (m) => (m.launcherCadenceMul *= 0.6) },
  { id: 'arm', name: 'Braço robótico', desc: 'Libera o Braço robótico (lança em lotes).', branch: 'build', x: 5, y: 1, parents: ['launcher'], cost: 1200, requiresZone: 5, unlock: 'arm' },
  { id: 'damper', name: 'Amortecedor inercial', desc: 'Libera o Amortecedor inercial.', branch: 'build', x: 3, y: 2, parents: ['conveyor'], cost: 120, requiresZone: 2, unlock: 'damper' },
  { id: 'gate', name: 'Comporta', desc: 'Libera a Comporta.', branch: 'build', x: 4, y: 2, parents: ['damper'], cost: 300, requiresZone: 3, unlock: 'gate' },
  { id: 'sensor', name: 'Sensor de passagem', desc: 'Libera o Sensor (comportas inteligentes).', branch: 'build', x: 5, y: 2, parents: ['gate'], cost: 1500, requiresZone: 6, unlock: 'sensor' },

  // --- Campos (para baixo)
  { id: 'fan', name: 'Soprador iônico', desc: 'Libera o Soprador iônico.', branch: 'fields', x: 0, y: 1, parents: ['core'], cost: 350, requiresZone: 3, unlock: 'fan' },
  { id: 'attractor', name: 'Poço gravitacional', desc: 'Libera o Poço gravitacional.', branch: 'fields', x: 0, y: 2, parents: ['fan'], cost: 700, requiresZone: 4, unlock: 'attractor' },
  { id: 'repulsor', name: 'Repulsor', desc: 'Libera o Repulsor.', branch: 'fields', x: 1, y: 3, parents: ['attractor'], cost: 650, requiresZone: 4, unlock: 'repulsor' },
  { id: 'fields2', name: 'Bobinas largas', desc: 'Campos e sopradores alcançam 25% mais longe.', branch: 'fields', x: 0, y: 3, parents: ['attractor'], cost: 1200, icon: 'ring', apply: (m) => (m.fieldRadiusMul *= 1.25) },
  { id: 'lift', name: 'Elevador gravitacional', desc: 'Libera o Elevador gravitacional.', branch: 'fields', x: 0, y: 4, parents: ['fields2'], cost: 1600, requiresZone: 5, unlock: 'lift' },

  // --- Calor (para a esquerda)
  { id: 'heat1', name: 'Fornalha estelar I', desc: 'O calor máximo multiplica até ×4.', branch: 'heat', x: -1, y: 0, parents: ['core'], cost: 80, icon: 'flame', apply: (m) => (m.heatMaxMult = Math.max(m.heatMaxMult, 4)) },
  { id: 'heat2', name: 'Fornalha estelar II', desc: 'O calor máximo multiplica até ×5.', branch: 'heat', x: -2, y: 0, parents: ['heat1'], cost: 600, requiresZone: 2, icon: 'flame', apply: (m) => (m.heatMaxMult = Math.max(m.heatMaxMult, 5)) },
  { id: 'heat3', name: 'Fornalha estelar III', desc: 'O calor máximo multiplica até ×6.', branch: 'heat', x: -3, y: 0, parents: ['heat2'], cost: 2500, requiresZone: 4, icon: 'flame', apply: (m) => (m.heatMaxMult = Math.max(m.heatMaxMult, 6)) },
  { id: 'retain', name: 'Retenção térmica', desc: 'O calor esfria 40% mais devagar.', branch: 'heat', x: -2, y: -1, parents: ['heat1'], cost: 250, icon: 'flame', apply: (m) => (m.heatDecayMul *= 0.6) },
  { id: 'kindle', name: 'Ignição rápida', desc: 'Cada entrega aquece 40% mais.', branch: 'heat', x: -2, y: 1, parents: ['heat1'], cost: 300, icon: 'flame', apply: (m) => (m.heatGainMul *= 1.4) },
  { id: 'horizon', name: 'Horizonte amplo', desc: 'O buraco negro puxa de 25% mais longe.', branch: 'heat', x: -3, y: 1, parents: ['kindle'], cost: 900, requiresZone: 3, icon: 'ring', apply: (m) => (m.holeRadiusMul *= 1.25) },

  // --- Feixe (diagonal inferior esquerda)
  { id: 'beam1', name: 'Feixe longo', desc: 'O feixe manual alcança 40% mais longe.', branch: 'beam', x: -1, y: 1, parents: ['core'], cost: 60, icon: 'claw', apply: (m) => (m.grabReachMul *= 1.4) },
  { id: 'beam2', name: 'Pegada firme', desc: 'O feixe puxa com 50% mais força (ergue pedras densas).', branch: 'beam', x: -1, y: 2, parents: ['beam1'], cost: 200, icon: 'claw', apply: (m) => (m.grabForceMul *= 1.5) },
  { id: 'traj', name: 'Prévia de arremesso', desc: 'Mostra o arco da pedra que você está segurando.', branch: 'beam', x: -1, y: 3, parents: ['beam2'], cost: 150, icon: 'arc', apply: (m) => (m.trajectoryPreview = true) },

  // --- Economia (diagonal inferior direita)
  { id: 'refund', name: 'Desmontagem limpa', desc: 'Revender devolve 90% do preço.', branch: 'economy', x: 1, y: 1, parents: ['core'], cost: 100, icon: 'gem', apply: (m) => (m.refundRate = Math.max(m.refundRate, 0.9)) },
  { id: 'discount', name: 'Fabricação enxuta', desc: 'Peças 15% mais baratas.', branch: 'economy', x: 1, y: 2, parents: ['refund'], cost: 400, icon: 'gem', apply: (m) => (m.priceDiscount = Math.max(m.priceDiscount, 0.15)) },
];

export const TREE_BY_ID = new Map(TREE.map((n) => [n.id, n]));

export function buildMods(owned: Iterable<string>): SimMods {
  const m: SimMods = { ...DEFAULT_MODS };
  for (const id of owned) TREE_BY_ID.get(id)?.apply?.(m);
  return m;
}

export function unlockedDevices(owned: Iterable<string>): Set<DeviceType> {
  const out = new Set<DeviceType>();
  for (const id of owned) {
    const u = TREE_BY_ID.get(id)?.unlock;
    if (u) out.add(u);
  }
  return out;
}

export type NodeState = 'owned' | 'available' | 'locked';

/** reachedZone: maior zona liberada; 6 quando a campanha foi concluída. */
export function nodeState(owned: Set<string>, id: string): NodeState {
  if (owned.has(id)) return 'owned';
  const n = TREE_BY_ID.get(id);
  if (!n) return 'locked';
  return n.parents.every((p) => owned.has(p)) ? 'available' : 'locked';
}

export function canBuyNode(owned: Set<string>, credits: number, reachedZone: number, id: string): { ok: boolean; reason?: string } {
  const n = TREE_BY_ID.get(id);
  if (!n) return { ok: false, reason: 'Inexistente' };
  if (owned.has(id)) return { ok: false, reason: 'Já desbloqueado' };
  if (!n.parents.every((p) => owned.has(p))) return { ok: false, reason: 'Desbloqueie o nó anterior' };
  if (n.requiresZone && reachedZone < n.requiresZone)
    return { ok: false, reason: n.requiresZone >= 6 ? 'Conclua a campanha' : `Alcance a zona ${n.requiresZone}` };
  if (credits < n.cost) return { ok: false, reason: 'Créditos insuficientes' };
  return { ok: true };
}
