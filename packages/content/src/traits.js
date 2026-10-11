// Branch traits of the official content (docs/spec/traits.md 职业-7): each covered profession branch as the engine's
// trait data and damage type — data first; a branch that needs more than the data is not covered yet and takes the
// defaults of its position (M4).

/** @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').OperatorDef} OperatorDef */

/**
 * A covered branch: its normal attack's damage type, and its trait as data, made from the trait's blackboard.
 * @typedef {{ dmgType?: 'phys' | 'arts', trait?: (bb: Readonly<Record<string, number>>) => Partial<TraitDef> }} Branch
 */

const ARTS = /** @type {const} */ ('arts');
/** Normal attacks heal; at most n targets. @param {number} n @returns {Branch} */
const healer = (n) => ({ trait: () => ({ heal: true, targets: n }) });
/** The normal attack's maximum targets is the 阻挡数. @type {Branch} */
const blockTargets = { trait: () => ({ targets: 'blockCnt' }) };

/** The covered branches, by subProfessionId (职业-7). A branch not here uses its position's defaults. */
export const BRANCHES = Object.freeze(/** @type {Record<string, Branch>} */ ({
  // 先锋
  pioneer: {},
  agent: { trait: () => ({ antiAir: true, blockedFirst: false }) },
  bearer: {},
  charger: { trait: (bb) => ({ killCost: bb.cost ?? 1, refund: 1 }) },
  // 近卫
  fearless: {},
  fighter: {},
  artsfghter: { dmgType: ARTS },
  sword: { trait: () => ({ hits: 2 }) },
  // the attack's 倍率 against an enemy it does not block (职业-8)
  instructor: { trait: (bb) => ({ unblockedScale: bb.atk_scale ?? 1.2 }) },
  lord: { trait: (bb) => ({ antiAir: true, unblockedScale: bb.atk_scale ?? 0.8 }) },
  // the other enemies around the target take the share of the hit (职业-8)
  hammer: { trait: (bb) => ({ splash: { radius: bb['attack@ability_range_radius'] ?? 1, scale: bb['attack@atk_scale_2'] ?? 0.5, ground: false } }) },
  centurion: blockTargets,
  crusher: blockTargets,
  primguard: {},
  // 重装
  protector: {},
  guardian: {},
  primprotector: {},
  shotprotector: { trait: () => ({ antiAir: true }) },
  // 狙击
  fastshot: { trait: () => ({ secondary: 'FLY_FIRST' }) },
  closerange: {},
  longrange: { trait: () => ({ filter: 'DEF_ASC' }) },
  siegesniper: { trait: () => ({ filter: 'MASS_DES' }) },
  aoesniper: { trait: () => ({ splash: { radius: 1, scale: 1, ground: false } }) },
  bombarder: { trait: (bb) => ({ antiAir: false, splash: { radius: 0.9, scale: 1, ground: true }, aftershock: bb['attack@append_atk_scale'] ?? 0.5 }) },
  // 术师
  corecaster: { dmgType: ARTS },
  blastcaster: { dmgType: ARTS, trait: () => ({ filter: 'ALL', targets: 'all' }) },
  splashcaster: { dmgType: ARTS, trait: () => ({ splash: { radius: 1.1, scale: 1, ground: false } }) },
  primcaster: { dmgType: ARTS },
  // 医疗
  physician: healer(1),
  ringhealer: healer(3),
  watchman: healer(1),
  // 辅助
  slower: { dmgType: ARTS, trait: (bb) => ({ hitStatus: { key: 'sluggish', seconds: bb.sluggish ?? 0.8 } }) },
  summoner: { dmgType: ARTS },
  underminer: { dmgType: ARTS },
  ritualist: { dmgType: ARTS },
  // 特种
  executor: {},
  // every enemy in range; half of the physical and arts hits dodged (blackboard prob)
  stalker: { trait: (bb) => ({ filter: 'ALL', targets: 'all', blockedFirst: false, mods: { dodgePhys: bb.prob ?? 0.5, dodgeArts: bb.prob ?? 0.5 } }) },
}));

/** Whether a branch's trait is covered (职业-7). @param {string} branch */
export const coveredBranch = (branch) => Object.hasOwn(BRANCHES, branch);

/**
 * An operator record with its branch's trait (职业-7): the damage type and the trait data from the branch table and the
 * trait's blackboard (`traitBb`); an uncovered branch adds nothing.
 * @param {OperatorDef & { traitBb?: Record<string, number> }} op @returns {OperatorDef}
 */
export function withTrait(op) {
  const { traitBb = {}, ...rest } = op;
  const b = op.branch && coveredBranch(op.branch) ? BRANCHES[op.branch] : null;
  if (!b) return rest;
  return { ...rest, ...(b.dmgType ? { dmgType: b.dmgType } : {}), trait: { ...b.trait?.(traitBb), bb: { ...traitBb } } };
}
