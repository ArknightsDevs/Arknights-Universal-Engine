// Sentences of a skill description that say what the skill's attacks are (docs/spec/skills.md 技能-9): how many boomerangs
// each attack throws, the damage type it changes to, and a reduction of the trait it lifts. One clause each, the blackboard
// gives the numbers; skills.js reads a clause with phraseOf and falls back to this.

/** Chinese numerals of projectiles. */
const COUNT = Object.freeze(/** @type {Record<string, number>} */ ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4 }));
/** The damage types a description names, by their words. */
const TYPE = Object.freeze(/** @type {Record<string, 'phys' | 'arts' | 'true'>} */ ({ 法术: 'arts', 真实: 'true', 物理: 'phys' }));

/**
 * 「每次攻击（额外）发射N个回旋投射物」, 「每次攻击发射{cnt}个回旋投射物（每个造成…）」: the attack throws that many boomerangs
 * at its target and they hit together, so each target takes that many hits (职业-12). The blackboard's `cnt` is the number
 * thrown in all — the 1 of 「额外发射1个」 is written in the text, and `cnt` is 2 there.
 */
const BOOMERANGS = /^每次攻击(额外)?发射(一|二|两|三|四|\d+|\{cnt\})个回旋投射物(?:（[^）]*）)?$/u;

/**
 * A sentence that changes the damage type of the skill's attacks: 「普通攻击造成法术伤害」, 「普通攻击造成真实伤害」, 「伤害类型变为法术」,
 * 「攻击时伤害类型变为真实」, 「普通攻击的伤害类型变为法术」; and 「（每次）攻击造成相当于攻击力{atk_scale}的法术伤害」, which says arts.
 */
const TYPE_CLAUSES = [
  /^(?:普通)?攻击造成(法术|真实)伤害$/u,
  /^(?:(?:普通)?攻击(?:时|的))?伤害类型变为(法术|真实|物理)$/u,
  /^(?:每次)?攻击造成相当于攻击力\{(?:attack@)?atk_scale\}的(法术)伤害$/u,
];

/** 「攻击自身与"耀阳"阻挡的单位时伤害类型变为真实」: the type changes only for enemies the operator or its summon blocks (职业-14). */
const TYPE_IF_BLOCKED = /^攻击自身与.{1,8}阻挡的单位时伤害类型变为(法术|真实)$/u;

/** 「攻击不再降低攻击力」, 「远程攻击不再降低攻击力（伤害）」: the trait's reduction for enemies the operator does not block is not applied (职业-8). */
const LIFTS_TRAIT = /^(?:远程)?攻击不再降低(?:攻击力|伤害)$/u;
/** 「攻击在跳跃时不再降低伤害」: the chain's loss at each jump is not applied (职业-11). */
const LIFTS_CHAIN = /^攻击在跳跃时不再降低伤害$/u;

/**
 * A clause whose subject is another unit than the operator — 「召唤物可部署在远程位」, 「被动：召唤物…」, 「Mon3tr的防御力+…」 —, after an
 * optional label (「被动：」). The rest of its sentence is about that unit: 「被动：召唤物可部署在远程位，攻击造成法术伤害」 is the
 * summons' attack, not the operator's. 「自身与召唤物攻击力+…」 starts with the operator and is not one.
 */
const OTHER_SUBJECT = /^(?:[^：:]{1,6}[：:])?(?:召唤物|替身|重构体|Mon3tr|棋子)/u;

/** Whether a clause is about another unit than the operator (技能-9). @param {string} s a clause, its placeholders as {key} */
export const otherSubject = (s) => OTHER_SUBJECT.test(s.trim());

/**
 * The hits of an attack that throws boomerangs, from a clause (技能-9): the blackboard's `cnt` when the clause names it or
 * the blackboard has it beside 「额外」, else what the text writes (the attack itself is one more with 「额外」).
 * @param {string} s a clause, its placeholders as {key} @param {Record<string, number>} bb @returns {number} 0 for another clause
 */
function boomerangsOf(s, bb) {
  const m = BOOMERANGS.exec(s);
  if (!m) return 0;
  const written = m[2] === '{cnt}' ? NaN : COUNT[m[2]] ?? Number(m[2]);
  const n = Number.isFinite(bb.cnt) && bb.cnt >= 1 ? bb.cnt : (m[1] ? 1 + written : written);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 0;
}

/**
 * What one clause says of the skill's attacks (技能-9): hits for the boomerangs it throws, a damage type (for every target, or for
 * those the operator or its summon blocks), the lifting of the
 * trait's lowered attack or of the chain's lowered damage (flags the sim reads while the skill runs); null for any other clause.
 * @param {string} s a clause, its placeholders as {key} @param {Record<string, number>} bb
 * @returns {{ attack?: { times?: number, type?: 'phys' | 'arts' | 'true', typeBlocked?: 'phys' | 'arts' | 'true' }, flags?: Record<string, boolean> } | null}
 */
export function attackPhraseOf(s, bb) {
  const times = boomerangsOf(s, bb);
  if (times > 0) return { attack: { times } };
  for (const re of TYPE_CLAUSES) {
    const m = re.exec(s);
    if (m) return { attack: { type: TYPE[m[1]] } };
  }
  const held = TYPE_IF_BLOCKED.exec(s);
  if (held) return { attack: { typeBlocked: TYPE[held[1]] } };
  if (LIFTS_TRAIT.test(s)) return { flags: { noUnblockedScale: true } };
  if (LIFTS_CHAIN.test(s)) return { flags: { noChainDecay: true } };
  return null;
}
