// Talents on heals (docs/spec/operators.md 干员-32): a share of the heal for the healer, one more target at a chance, what a
// heal leaves (物理闪避, a 屏障), more for a low target, the heal beyond the maximum as a 屏障, heals for a status taken or
// at a skill's end, a regen for those with 抵抗, more heal taken for the sturdiest in range — as additions to the trait
// (职业-33) and in-range talents (部署-6).
import { plainOf, all } from './talentparts.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').RangeTalent} RangeTalent */
/** @typedef {{ trait?: Partial<TraitDef>, range?: RangeTalent[] }} HealParts */

/** A number of the blackboard, when it is one. @param {Record<string, number>} bb @param {string} k */
const num = (bb, k) => (Number.isFinite(bb[k]) ? bb[k] : undefined);

/**
 * The talents of 干员-32, whole descriptions, and what each adds: 焰影苇草, 安赛尔, 斑点, 流明, 明椒, 医生, 莎草, 岳羽由加莉,
 * 絮雨, 休谟斯, 刺玫.
 */
const HEALS = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>) => HealParts | null][]} */ ([
  [/^治疗其他友方单位时[，,]\S+?同时享受\d+(?:\.\d+)?%的治疗量$/u, (bb) => (all([bb.scale]) ? { trait: { healShare: bb.scale } } : null)],
  [/^有\d+(?:\.\d+)?%的几率额外治疗一名友方单位$/u, (bb) => {
    const prob = num(bb, 'attack@prob') ?? num(bb, 'prob');
    return prob !== undefined ? { trait: { healMore: prob } } : null;
  }],
  [/^治疗友方单位后为其提供持续\d+(?:\.\d+)?秒的\d+(?:\.\d+)?%物理闪避$/u, (bb) => (all([bb.prob, bb.duration]) ? { trait: { healGives: { seconds: bb.duration, mods: { dodgePhys: bb.prob } } } } : null)],
  [/^攻击范围内的友方受到异常状态时[，,]立刻治疗目标相当于\S+?攻击力\d+(?:\.\d+)?%的生命[，,]该效果有\d+(?:\.\d+)?秒冷却时间$/u, (bb) => (all([bb.heal_scale, bb.duration])
    ? { trait: { statusHeal: { scale: bb.heal_scale, cooldown: bb.duration } } } : null)],
  [/^治疗时[，,]若目标生命少于\d+(?:\.\d+)?%则为其额外恢复\d+点生命$/u, (bb) => (all([bb.hp_ratio, bb.value]) ? { trait: { lowHeal: { below: bb.hp_ratio, value: bb.value } } } : null)],
  [/^治疗友方单位生命时[，,]超过目标生命上限的治疗量可转化为不断衰减的屏障$/u, (bb) => (all([bb.scale, bb.dec_rate])
    ? { trait: { overhealBarrier: { cap: bb.scale, decay: -bb.dec_rate } } } : null)],
  [/^治疗会为目标干员附加相当于自身\d+(?:\.\d+)?%攻击力的屏障[，,]持续\d+(?:\.\d+)?秒$/u, (bb) => {
    const scale = num(bb, 'attack@scale'), seconds = num(bb, 'attack@shield_duration');
    return scale !== undefined && seconds !== undefined ? { trait: { healBarrier: { scale, seconds } } } : null;
  }],
  [/^技能结束后[，,]治疗自身和攻击范围内最多\d+名干员相当于\S+?攻击力\d+(?:\.\d+)?%的生命值$/u, (bb) => (all([bb.max_target, bb.heal_scale])
    ? { trait: { skillEndHeal: { scale: bb.heal_scale, max: bb.max_target } } } : null)],
  [/^攻击范围内拥有抵抗的友方单位每秒恢复相当于\S+?攻击力\d+(?:\.\d+)?%的生命$/u, (bb) => (all([bb.atk_to_hp_recovery_ratio]) ? { trait: { resistRegen: bb.atk_to_hp_recovery_ratio } } : null)],
  [/^超出自身生命上限的生命值可转化为屏障[；;]最多不超过自身最大生命值的\d+(?:\.\d+)?%$/u, (bb) => (all([bb.max_hp_ratio]) ? { trait: { overflowBarrier: bb.max_hp_ratio } } : null)],
  [/^攻击范围内生命上限最高的友方角色受到的治疗效果提升\d+(?:\.\d+)?%$/u, (bb) => (all([bb.heal_scale])
    ? { range: [{ side: 'ally', ranged: false, when: { when: 'maxHpHighest' }, mods: { healingTakenMul: bb.heal_scale } }] } : null)],
]));

/**
 * The parts of a talent of 干员-32: its whole description (plainOf) one of HEALS with the keys it needs; null otherwise,
 * and for hidden talents.
 * @param {Talent} c @returns {HealParts | null}
 */
export function healParts(c) {
  if (c.hidden || !c.description) return null;
  const text = plainOf(c);
  for (const [re, make] of HEALS) if (re.test(text)) return make(c.bb);
  return null;
}
