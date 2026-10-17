// Branch traits of the official content (docs/spec/traits.md 职业-7): each covered profession branch as the engine's
// trait data and damage type — data first; a branch that needs more than the data is not covered yet and takes the
// defaults of its position (M4).

import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').OperatorDef} OperatorDef */

/**
 * A covered branch: its normal attack's damage type, and its trait as data, made from the trait's blackboard and its
 * module's hidden talents' (干员-7).
 * @typedef {{ dmgType?: 'phys' | 'arts', trait?: (bb: Readonly<Record<string, number>>, hidden?: Readonly<Record<string, number>>) => Partial<TraitDef> }} Branch
 */

const ARTS = /** @type {const} */ ('arts');
/** Normal attacks heal; at most n targets. @param {number} n @returns {Branch} */
const healer = (n) => ({ trait: () => ({ heal: true, targets: n }) });
/** A range of range_table by id (干员-8). @param {string} id @returns {{ row: number, col: number }[]} */
const cellsOf = (id) => /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id];
/**
 * The seconds of a 傀儡师's switch between its own form and its 替身 (职业-15): every one of the switch clips of the 7
 * 傀儡师's battle skeletons (Start_B, Start_2, Doll_SwitchIn, Doll_SwitchOut, SwitchOut …) lasts 1 s.
 */
const DOLL_SWITCH = 1;
/**
 * The trait's 倍率 against a target as `when` says (职业-17), when its module gives one: × `scale` on the hit's attack
 * 倍率 (`atk`), its 伤害倍率 (`dmg`) or a heal (`heal`).
 * @param {import('@aue/sim').VsScale['when']} when @param {'atk' | 'dmg' | 'heal'} kind @param {number | undefined} scale
 * @param {Partial<import('@aue/sim').VsScale>} [more] @returns {{ vs?: import('@aue/sim').VsScale[] }}
 */
const vsWhen = (when, kind, scale, more = {}) => (scale ? { vs: [{ when, [kind]: scale, ...more }] } : {});
/**
 * The 伤害倍率 by the distance to the target its module gives (职业-17): min_dist to max_dist, up to + damage_scale.
 * @param {Readonly<Record<string, number>>} bb @returns {Partial<TraitDef>}
 */
const farOf = (bb) => (bb.max_dist !== undefined && bb.damage_scale ? { far: { min: bb.min_dist ?? 0, max: bb.max_dist, dmg: bb.damage_scale } } : {});
/** The normal attack's maximum targets is the 阻挡数; its module's 倍率 against a blocked enemy (职业-17). @param {'atk' | 'dmg'} kind @param {string} key @returns {Branch} */
const blockTargets = (kind, key) => ({ trait: (bb) => ({ targets: 'blockCnt', ...vsWhen('blocked', kind, bb[key]) }) });

/** The covered branches, by subProfessionId (职业-7). A branch not here uses its position's defaults. */
export const BRANCHES = Object.freeze(/** @type {Record<string, Branch>} */ ({
  // 先锋
  pioneer: {},
  agent: { trait: () => ({ antiAir: true, blockedFirst: false }) },
  bearer: {},
  // CHG-Y: × atk_scale against an enemy below hp_ratio of its HP (the module's own data; 职业-17)
  charger: { trait: (bb, own) => ({ killCost: bb.cost ?? 1, refund: 1, ...(own?.hp_ratio ? vsWhen('hpBelow', 'atk', own.atk_scale, { value: own.hp_ratio }) : {}) }) },
  // its 战术点 is a summon (召唤-11); × atk_scale against the enemies its own summons block (职业-14)
  tactician: { trait: (bb) => ({ summonBlockedScale: bb.atk_scale ?? 1.5 }) },
  // the support of the operators in the deck is its skills' and talents' (职业-7)
  counsellor: {},
  // 近卫
  // DRE-X: × atk_scale against a blocked enemy (职业-17)
  fearless: { trait: (bb) => vsWhen('blocked', 'atk', bb.atk_scale) },
  fighter: {},
  artsfghter: { dmgType: ARTS },
  sword: { trait: () => ({ hits: 2 }) },
  // the attack's 倍率 against an enemy it does not block (职业-8)
  instructor: { trait: (bb) => ({ unblockedScale: bb.atk_scale ?? 1.2 }) },
  lord: { trait: (bb) => ({ antiAir: true, unblockedScale: bb.atk_scale ?? 0.8 }) },
  // the other enemies around the target take the share of the hit (职业-8)
  // HAM-X: × atk_scale_e for an attack whose splash reaches cnt enemies (职业-17)
  hammer: { trait: (bb) => ({
    splash: { radius: bb['attack@ability_range_radius'] ?? 1, scale: bb['attack@atk_scale_2'] ?? 0.5, ground: false },
    ...(bb.atk_scale_e && bb.cnt ? { packed: { cnt: bb.cnt, atk: bb.atk_scale_e } } : {}),
  }) },
  // CEN-X: × atk_scale against a blocked enemy (职业-17)
  centurion: blockTargets('atk', 'atk_scale'),
  // no ally heals them; they heal themselves for the enemies their attacks reach (职业-9)
  musha: { trait: (bb) => ({ flags: { noAllyHeal: true }, selfHeal: bb.value ?? 0, selfHealOn: 'damage' }) },
  reaper: { trait: (bb) => ({ flags: { noAllyHeal: true }, filter: 'ALL', targets: 'all', selfHeal: bb.value ?? 0, selfHealMax: 'blockCnt' }) },
  // CRU-Y: 伤害倍率 × damage_scale against a blocked enemy (职业-17)
  crusher: blockTargets('dmg', 'damage_scale'),
  primguard: {},
  // the 应变 that spends cost is its skills' (职业-7)
  mercenary: {},
  // attacks only while its skill runs; 阻挡数 × 0 while it does not, and an attack bonus building up to atk over max_stack_cnt s (职业-12)
  librator: { trait: (bb, hidden) => ({ attackInSkill: true, idleMods: { blockCntMul: 0 }, charge: { atk: bb.atk ?? 2, steps: bb.max_stack_cnt ?? 40, init: hidden?.init_atk ?? 0 } }) },
  // 重装
  protector: {},
  // GUA-X: its heals × heal_scale on one below hp_ratio of its HP (职业-17)
  guardian: { trait: (bb) => (bb.hp_ratio ? vsWhen('hpBelow', 'heal', bb.heal_scale, { value: bb.hp_ratio }) : {}) },
  primprotector: {},
  shotprotector: { trait: () => ({ antiAir: true }) },
  unyield: { trait: () => ({ flags: { noAllyHeal: true } }) },
  // 阻回 always, but not while it blocks (职业-10)
  duelist: { trait: () => ({ flags: { noSp: true }, immuneBlocking: ['noSp'] }) },
  artsprotector: { trait: () => ({ skillArts: true }) },
  // 狙击
  // MAR-X: × atk_scale against a flying enemy (职业-17)
  fastshot: { trait: (bb) => ({ secondary: 'FLY_FIRST', ...vsWhen('flying', 'atk', bb.atk_scale) }) },
  // ARC-Y: × atk_scale against an enemy straight in front, its physical dodge ignored (the trait's, or the module's own data; 职业-17)
  closerange: { trait: (bb, own) => vsWhen('front', 'atk', bb.atk_scale ?? own?.atk_scale, { noDodge: true }) },
  // DEA-X: 伤害倍率 by the distance (职业-17)
  longrange: { trait: (bb) => ({ filter: 'DEF_ASC', ...farOf(bb) }) },
  // SIE-X: × atk_scale against an enemy of 重量等级 value or more (the module's own data); SIE-Y: 伤害倍率 by the distance (职业-17)
  siegesniper: { trait: (bb, own) => ({ filter: 'MASS_DES', ...(own?.value ? vsWhen('heavy', 'atk', own.atk_scale, { value: own.value }) : {}), ...farOf(bb) }) },
  // ART-X: × atk_scale against a blocked enemy (职业-17)
  aoesniper: { trait: (bb) => ({ splash: { radius: 1, scale: 1, ground: false }, ...vsWhen('blocked', 'atk', bb.atk_scale) }) },
  bombarder: { trait: (bb) => ({ antiAir: false, splash: { radius: 0.9, scale: 1, ground: true }, aftershock: bb['attack@append_atk_scale'] ?? 0.5 }) },
  // melee on what it blocks or what stands on its tile, ranged with a 1.0 splash on the others in its range (职业-12)
  // FOR-X: × atk_scale against a blocked enemy (职业-17)
  fortress: { trait: (bb) => ({ fortress: 1, ...vsWhen('blocked', 'atk', bb.atk_scale) }) },
  // air too; blocks 2 flying enemies once it took off (职业-12)
  skywalker: { trait: () => ({ antiAir: true, liftoffBlock: 2 }) },
  // air too, the blocked first; up in the air (起飞) while its skill does not run, attacking only flying enemies and those it
  // blocks; its skill's attacks splash 1.1 (职业-12)
  // BRK-X: while its skill runs, × atk_scale against a ground enemy (the module's own data; 职业-17)
  skybreaker: { trait: (_bb, own) => ({
    antiAir: true, blockedFirst: true, idleFlags: { liftoff: true }, idleAirOnly: true, skillSplash: { radius: 1.1, scale: 1, ground: false }, ...vsWhen('skillGround', 'atk', own?.atk_scale),
  }) },
  // its attacks throw boomerangs, out at 15 and back at 3.75 tiles a second; it attacks again once it caught them all (职业-12)
  // LPS-X: × atk_scale against an enemy on the 8 tiles around (the module's own data; 职业-17)
  loopshooter: { trait: (_bb, own) => ({ boomerang: { out: 15, back: 3.75 }, ...vsWhen('near', 'atk', own?.atk_scale) }) },
  // value bullets at atk_scale, reloaded one at a time (职业-12)
  hunter: { trait: (bb) => ({ bullets: { max: bb.value ?? 8, scale: bb.atk_scale ?? 1.2 } }) },
  // every enemy in range; 倍率 × atk_scale for those in its own and the three tiles before it (range 1-3, 职业-11)
  reaperrange: { trait: (bb) => ({ filter: 'ALL', targets: 'all', zone: { cells: cellsOf('1-3'), scale: bb.atk_scale ?? 1.5, outside: false } }) },
  // 术师
  corecaster: { dmgType: ARTS },
  // BLA-X: 伤害倍率 by the distance (职业-17)
  blastcaster: { dmgType: ARTS, trait: (bb) => ({ filter: 'ALL', targets: 'all', ...farOf(bb) }) },
  // attacks only while its skill runs, every enemy in range, air ones too; DEF × (1 + def) and RES + magic_resistance while it does not (职业-12);
  // PLX-Y: 伤害倍率 + damage_scale for each enemy in its range, at most max_valid_stack_cnt (the module's own data; 职业-17)
  phalanx: { dmgType: ARTS, trait: (bb, own) => ({
    antiAir: true, filter: 'ALL', targets: 'all', attackInSkill: true, idleMods: { defPct: bb.def ?? 2, resFlat: bb.magic_resistance ?? 20 },
    ...(own?.damage_scale && own.max_valid_stack_cnt ? { crowd: { step: own.damage_scale, cap: own.max_valid_stack_cnt } } : {}),
  }) },
  splashcaster: { dmgType: ARTS, trait: () => ({ splash: { radius: 1.1, scale: 1, ground: false } }) },
  // arts; also the enemies its own summons block, × atk_scale against them (its module's; 职业-14)
  soulcaster: { dmgType: ARTS, trait: (bb) => ({ summonBlocked: true, summonBlockedScale: bb.atk_scale ?? 1 }) },
  // PRI-X: 伤害倍率 × damage_scale against an enemy in an element burst (职业-17)
  primcaster: { dmgType: ARTS, trait: (bb) => vsWhen('burst', 'dmg', bb.damage_scale) },
  // arts, air too; init_atk_scale on a new target, delta_atk_scale more for each attack on the same, at most max_atk_scale (职业-12)
  funnel: { dmgType: ARTS, trait: (bb) => ({ antiAir: true, funnel: { init: bb.init_atk_scale ?? 0.2, delta: bb.delta_atk_scale ?? 0.15, max: bb.max_atk_scale ?? 1.1 } }) },
  // stores up to times attacks of energy when it has no target, and sends them with its next attack (职业-12)
  mystic: { dmgType: ARTS, trait: (bb) => ({ store: bb.times ?? 3 }) },
  // jumps among max_target enemies within 1.7 tiles, 85 % of the hit before (its module's attack@chain.atk_scale: 90 %, or
  // no less); each hit 停顿 (职业-11)
  chain: { dmgType: ARTS, trait: (bb) => ({
    chain: { max: bb['attack@max_target'] ?? bb['attack@chain.max_target'] ?? 3, scale: bb['attack@chain.atk_scale'] ?? 0.85, radius: 1.7, cells: null },
    hitStatus: { key: 'sluggish', seconds: bb['attack@sluggish'] ?? 0.5 },
  }) },
  // 医疗
  // PHY-X: heals × heal_scale on one below hp_ratio of its HP; PHY-Y (no hp_ratio): on one on a ground tile (职业-17)
  physician: { trait: (bb) => ({ heal: true, targets: 1, ...vsWhen(bb.hp_ratio ? 'hpBelow' : 'onGround', 'heal', bb.heal_scale, bb.hp_ratio ? { value: bb.hp_ratio } : {}) }) },
  ringhealer: healer(3),
  watchman: healer(1),
  // heal_scale for a target outside range 2-3 (职业-11)
  healer: { trait: (bb) => ({ heal: true, targets: 1, zone: { cells: cellsOf('2-3'), scale: bb.heal_scale ?? 0.8, outside: true } }) },
  // jumps among max_target operators in the 3 × 3 around each, 75 % of the heal before (职业-11)
  chainhealer: { trait: (bb) => ({ heal: true, targets: 1, chain: { max: bb['attack@chain.max_target'] ?? 3, scale: bb['attack@chain.atk_scale'] ?? 0.75, radius: 0, cells: cellsOf('x-4') } }) },
  // its heals also restore element values by ep_heal_ratio of them (职业-12)
  wandermedic: { trait: (bb) => ({ heal: true, targets: 1, epHeal: bb.ep_heal_ratio ?? 0.5 }) },
  // arts; its damage heals the most wounded operator in range by scale of it (职业-11)
  incantationmedic: { dmgType: ARTS, trait: (bb) => ({ healOnHit: bb.scale ?? 0.5 }) },
  // 辅助
  slower: { dmgType: ARTS, trait: (bb) => ({ hitStatus: { key: 'sluggish', seconds: bb.sluggish ?? 0.8 } }) },
  // no attacks, outside the deploy limit; the operators in its range regenerate a share of its attack a second (职业-13)
  bard: { trait: (bb) => ({ noAttack: true, free: true, regenAura: bb['attack@atk_to_hp_recovery_ratio'] ?? bb.atk_to_hp_recovery_ratio ?? 0.1 }) },
  // arts; while its skill runs, its attacks heal at heal_scale (职业-12)
  blessing: { dmgType: ARTS, trait: (bb) => ({ skillHeal: bb.heal_scale ?? 0.75 }) },
  summoner: { dmgType: ARTS },
  underminer: { dmgType: ARTS },
  ritualist: { dmgType: ARTS },
  // its support devices are summons (召唤-4); 触发型效果 are its skills' (职业-7)
  craftsman: {},
  supportiveranger: {},
  // 特种
  executor: {},
  // its 炼金单元 are its skills' (职业-7)
  alchemist: {},
  // at 0 HP in its own form, a switch to its 替身 for duration seconds, attack and HP + atk, max_hp; switches take 1 s (职业-15)
  dollkeeper: { trait: (bb) => ({ doll: { duration: bb.duration ?? 20, switch: DOLL_SWITCH, atk: bb.atk ?? 0, maxHp: bb.max_hp ?? 0 } }) },
  // its summons (traps) not on a tile a ground enemy stands on (职业-14)
  traper: { trait: () => ({ trapTiles: true }) },
  // every enemy in range; half of the physical and arts hits dodged (blackboard prob)
  stalker: { trait: (bb) => ({ filter: 'ALL', targets: 'all', blockedFirst: false, mods: { dodgePhys: bb.prob ?? 0.5, dodgeArts: bb.prob ?? 0.5 } }) },
  // melee, but may stand on ranged tiles too (职业-10)
  pusher: { trait: () => ({ targets: 'blockCnt', rangedTiles: true }) },
  hookmaster: { trait: () => ({ antiAir: true, rangedTiles: true }) },
  // no refund; the blackboard's cost (negative) every interval seconds on the field, or it retreats (职业-10)
  merchant: { trait: (bb) => ({ refund: 0, costDrain: { every: bb.interval ?? 3, cost: -(bb.cost ?? -3) } }) },
  geek: { trait: (bb) => ({ hpDrain: bb.hp_ratio ?? 0.01 }) },
}));

/** Whether a branch's trait is covered (职业-7). @param {string} branch */
export const coveredBranch = (branch) => Object.hasOwn(BRANCHES, branch);

/**
 * An operator record with its branch's trait (职业-7): the damage type and the trait data from the branch table and the
 * trait's blackboard (`traitBb`) and its module's hidden talents' (`hiddenBb`, 干员-7); an uncovered branch adds nothing.
 * @param {OperatorDef & { traitBb?: Record<string, number>, hiddenBb?: Record<string, number> }} op @returns {OperatorDef}
 */
export function withTrait(op) {
  const { traitBb = {}, hiddenBb = {}, ...rest } = op;
  const b = op.branch && coveredBranch(op.branch) ? BRANCHES[op.branch] : null;
  if (!b) return rest;
  return { ...rest, ...(b.dmgType ? { dmgType: b.dmgType } : {}), trait: { ...b.trait?.(traitBb, hiddenBb), bb: { ...traitBb } } };
}
