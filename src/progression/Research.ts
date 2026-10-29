import { DEFAULT_MODS, type SimMods } from '../sim/mods';

export type Branch = 'extracao' | 'manipulacao' | 'cinetica' | 'campos' | 'engenharia';

export interface ResearchNode {
  id: string;
  branch: Branch;
  name: string;
  desc: string;
  max: number;
  /** custo do nível n (1-based) */
  cost: (level: number) => number;
  requires?: { id: string; level: number };
  apply: (m: SimMods, level: number) => void;
}

export const BRANCHES: { id: Branch; name: string; desc: string }[] = [
  { id: 'extracao', name: 'Extração', desc: 'Cadência e rendimento do asteroide.' },
  { id: 'manipulacao', name: 'Manipulação', desc: 'Alcance e força do feixe manual.' },
  { id: 'cinetica', name: 'Cinética', desc: 'Impulsores, bumpers e lançadores.' },
  { id: 'campos', name: 'Campos', desc: 'Alcance e força de campos e elevadores.' },
  { id: 'engenharia', name: 'Engenharia', desc: 'Custos e reaproveitamento de peças.' },
];

const lin = (a: number, b: number) => (lvl: number) => a + b * (lvl - 1);

export const RESEARCH: ResearchNode[] = [
  // Extração
  { id: 'ex-cad', branch: 'extracao', name: 'Martelo sônico', desc: '−12% no intervalo entre extrações.', max: 4, cost: lin(1, 1), apply: (m, l) => (m.extractCooldownMul *= Math.pow(0.88, l)) },
  { id: 'ex-val', branch: 'extracao', name: 'Veios ricos', desc: '+8% de crédito por fragmento.', max: 3, cost: lin(2, 1), requires: { id: 'ex-cad', level: 1 }, apply: (m, l) => (m.fragmentValueMul *= 1 + 0.08 * l) },
  { id: 'ex-multi', branch: 'extracao', name: 'Fissura dupla', desc: '+8% de chance de soltar dois fragmentos.', max: 3, cost: lin(2, 1), requires: { id: 'ex-cad', level: 2 }, apply: (m, l) => (m.multiExtractChance += 0.08 * l) },
  { id: 'ex-auto', branch: 'extracao', name: 'Autoextrator afinado', desc: '−12% no ciclo do autoextrator.', max: 3, cost: lin(2, 1), requires: { id: 'ex-val', level: 1 }, apply: (m, l) => (m.autoExtractCadenceMul *= Math.pow(0.88, l)) },
  // Manipulação
  { id: 'ma-reach', branch: 'manipulacao', name: 'Feixe longo', desc: '+20% de alcance do feixe.', max: 3, cost: lin(1, 1), apply: (m, l) => (m.grabReachMul *= 1 + 0.2 * l) },
  { id: 'ma-force', branch: 'manipulacao', name: 'Pegada firme', desc: '+15% de força máxima do feixe.', max: 4, cost: lin(1, 1), apply: (m, l) => (m.grabForceMul *= 1 + 0.15 * l) },
  { id: 'ma-traj', branch: 'manipulacao', name: 'Prévia de trajetória', desc: 'Mostra o arco curto ao soltar um fragmento.', max: 1, cost: () => 2, requires: { id: 'ma-force', level: 1 }, apply: (m) => (m.trajectoryPreview = true) },
  // Cinética
  { id: 'ki-boost', branch: 'cinetica', name: 'Bocal reforçado', desc: '+12% de impulso dos propulsores.', max: 3, cost: lin(1, 1), apply: (m, l) => (m.boosterMul *= 1 + 0.12 * l) },
  { id: 'ki-bump', branch: 'cinetica', name: 'Mola resiliente', desc: '+12% de impulso dos bumpers.', max: 2, cost: lin(1, 1), apply: (m, l) => (m.bumperMul *= 1 + 0.12 * l) },
  { id: 'ki-launch', branch: 'cinetica', name: 'Recarga rápida', desc: '−12% na recarga dos lançadores.', max: 3, cost: lin(2, 1), requires: { id: 'ki-boost', level: 1 }, apply: (m, l) => (m.launcherCadenceMul *= Math.pow(0.88, l)) },
  // Campos
  { id: 'fi-radius', branch: 'campos', name: 'Bobinas largas', desc: '+10% de alcance de campos.', max: 3, cost: lin(2, 1), apply: (m, l) => (m.fieldRadiusMul *= 1 + 0.1 * l) },
  { id: 'fi-power', branch: 'campos', name: 'Núcleo denso', desc: '+12% de força de campos.', max: 3, cost: lin(2, 1), requires: { id: 'fi-radius', level: 1 }, apply: (m, l) => (m.fieldStrengthMul *= 1 + 0.12 * l) },
  // Engenharia
  { id: 'en-refund', branch: 'engenharia', name: 'Desmontagem limpa', desc: '+5% de reembolso ao revender.', max: 3, cost: lin(1, 1), apply: (m, l) => (m.refundRate = Math.min(0.95, DEFAULT_MODS.refundRate + 0.05 * l)) },
  { id: 'en-disc', branch: 'engenharia', name: 'Fabricação enxuta', desc: '−4% no preço das peças.', max: 3, cost: lin(2, 1), apply: (m, l) => (m.priceDiscount = 0.04 * l) },
];

export function researchCount() {
  return RESEARCH.reduce((s, n) => s + n.max, 0);
}

export function buildMods(levels: Record<string, number>): SimMods {
  const m: SimMods = { ...DEFAULT_MODS };
  for (const node of RESEARCH) {
    const l = Math.min(node.max, levels[node.id] ?? 0);
    if (l > 0) node.apply(m, l);
  }
  return m;
}

export function spentOn(levels: Record<string, number>): number {
  let s = 0;
  for (const node of RESEARCH) {
    const l = Math.min(node.max, levels[node.id] ?? 0);
    for (let i = 1; i <= l; i++) s += node.cost(i);
  }
  return s;
}

export function canBuy(levels: Record<string, number>, available: number, id: string): { ok: boolean; reason?: string; cost: number } {
  const node = RESEARCH.find((n) => n.id === id);
  if (!node) return { ok: false, reason: 'Inexistente', cost: 0 };
  const lvl = levels[id] ?? 0;
  if (lvl >= node.max) return { ok: false, reason: 'Máximo', cost: 0 };
  const cost = node.cost(lvl + 1);
  if (node.requires && (levels[node.requires.id] ?? 0) < node.requires.level) {
    const req = RESEARCH.find((n) => n.id === node.requires!.id);
    return { ok: false, reason: `Requer ${req?.name} ${node.requires.level}`, cost };
  }
  if (available < cost) return { ok: false, reason: 'Pesquisa insuficiente', cost };
  return { ok: true, cost };
}
