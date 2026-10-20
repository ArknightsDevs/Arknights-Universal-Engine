// More talents on the operator itself, its heals, kills near it and its deployment (docs/spec/operators.md 干员-30): a
// slower attack for a stronger one or a wider range, modifiers until hurt, around a skill, at low SP or with enemies
// around, a random gain, heals for enemies falling, buffs and stuns on deployment, what its heals leave, a field regen,
// a floor on its damage, attacks on 隐匿 enemies — as additions to the trait (职业-31).
import { whomOf } from './talents.js';
import { plainOf, byEnd, all } from './talentparts.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').TraitDef} TraitDef */

/** A number of the blackboard, when it is one. @param {Record<string, number>} bb @param {string} k */
const num = (bb, k) => (Number.isFinite(bb[k]) ? bb[k] : undefined);

/**
 * The talents of 干员-30, whole descriptions, and what each adds to the trait: 冬时, 远山, 白雪, 霜叶 (with its range id),
 * 卡达, 艾丝黛尔, 露托, 嘉维尔, 调香师, 清流, 流明, 褐果, 铅踝, 红 and 酸糖, 麒麟R夜刀, 极光, 玛恩纳, 百炼嘉维尔, 灰烬, 耀骑士临光.
 */
const MORE = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray, c: Talent) => Partial<TraitDef> | null][]} */ ([
  [/^攻击速度[+＋]\d+[，,]自身受到伤害后失去该效果$/u, (bb) => (all([bb.attack_speed]) ? { whiles: [{ when: 'neverHurt', mods: { aspd: bb.attack_speed } }] } : null)],
  [/^部署后随机永久获得下列一项增益[：:]攻击力[+＋]\d+(?:\.\d+)?%[；;]攻击速度[+＋]\d+[；;]生命上限(?:提升)?[+＋]?\d+(?:\.\d+)?%$/u, (bb) => (all([bb.atk, bb.attack_speed, bb.max_hp])
    ? { deployPick: [{ atkPct: bb.atk }, { aspd: bb.attack_speed }, { hpPct: bb.max_hp }] } : null)],
  [/^攻击间隔略微增大[，,]但攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb) => (all([bb.base_attack_time, bb.atk])
    ? { whiles: [{ when: 'always', mods: { batFlat: bb.base_attack_time, atkPct: bb.atk } }] } : null)],
  [/^攻击范围扩大[，,]但攻击间隔略微增大$/u, (bb, _m, c) => (all([bb.base_attack_time]) && c.rangeId ? { whiles: [{ when: 'always', mods: { batFlat: bb.base_attack_time } }] } : null)],
  [/^自身与浮游单元的攻击速度[+＋]\d+$/u, (bb) => (all([bb.attack_speed]) ? { whiles: [{ when: 'always', mods: { aspd: bb.attack_speed } }] } : null)],
  [/^周围8格内有敌人倒下时[，,]恢复自身最大生命值\d+(?:\.\d+)?%的生命$/u, (bb) => (all([bb.hp_ratio]) ? { downHeal: [{ where: 'around', share: bb.hp_ratio }] } : null)],
  [/^自身阻挡的敌方单位被击杀时[，,]回复自身\d+(?:\.\d+)?%的生命$/u, (bb) => (all([bb.hp_ratio]) ? { downHeal: [{ where: 'blocked', share: bb.hp_ratio }] } : null)],
  [/^部署后全体友方【([^】]+)】职业干员攻击力[+＋]\d+(?:\.\d+)?%[，,]防御力[+＋]\d+[，,]持续\d+(?:\.\d+)?秒$/u, (bb, m) => {
    const whom = whomOf(m[1]);
    return whom && 'profession' in whom && all([bb.atk, bb.def, bb.duration]) ? { deployBuff: { ...whom, seconds: bb.duration, mods: { atkPct: bb.atk, defFlat: bb.def } } } : null;
  }],
  [/^在战场时全体友方单位每秒恢复相当于\S+?攻击力\d+(?:\.\d+)?%的生命$/u, (bb) => (all([bb.atk_to_hp_recovery_ratio]) ? { fieldRegen: bb.atk_to_hp_recovery_ratio } : null)],
  [/^在治疗目标后使其获得\d+(?:\.\d+)?秒抵抗$/u, (bb) => {
    const seconds = num(bb, 'status_resistance[limit]');
    return all([seconds, bb.one_minus_status_resistance]) ? { healGives: { seconds: /** @type {number} */ (seconds), mods: { statusResFlat: bb.one_minus_status_resistance } } } : null;
  }],
  [/^治疗的目标获得\d+(?:\.\d+)?秒抵抗[，,]若目标生命值高于\d+(?:\.\d+)?%则改为\d+(?:\.\d+)?秒抵抗$/u, (bb) => {
    const seconds = num(bb, 'status_resistance[limit]'), high = byEnd(bb, '[special].status_resistance[limit]');
    return all([seconds, high, bb.hp_ratio, bb.one_minus_status_resistance]) ? { healGives: { seconds: /** @type {number} */ (seconds),
      mods: { statusResFlat: bb.one_minus_status_resistance }, above: bb.hp_ratio, aboveSeconds: /** @type {number} */ (high) } } : null;
  }],
  [/^治疗地面单位[，,]元素损伤回复量提高\d+(?:\.\d+)?%$/u, (bb) => (all([bb.ep_heal_scale]) ? { groundEpHeal: bb.ep_heal_scale } : null)],
  [/^可以攻击隐匿敌人[，,]并且攻击范围内存在(?:拥有)?隐匿敌人时[，,]攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb) => (all([bb.atk])
    ? { seeStealth: true, whiles: [{ when: 'stealthEnemies', mods: { atkPct: bb.atk } }] } : null)],
  [/^每次攻击至少造成\d+(?:\.\d+)?%攻击力的伤害$/u, (bb, _m, c) => {
    if (!all([bb.atk_scale])) return null;
    const front = /当敌人在正前方两格时提升至/u.test(c.description ?? '') ? num(bb, 'atk_scale_2') : undefined;
    return { minDamage: { scale: bb.atk_scale, ...(front !== undefined ? { front } : {}) } };
  }],
  [/^技能期间及技能结束后的\d+(?:\.\d+)?秒内攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb) => (all([bb.atk, bb.duration])
    ? { whiles: [{ when: 'skillOrAfter', value: bb.duration, mods: { atkPct: bb.atk } }] } : null)],
  [/^未开启技能且技力小于或等于最大值一半时[，,]停止攻击并每秒恢复\d+(?:\.\d+)?%最大生命值$/u, (bb) => (all([bb.sp_ratio, bb.hp_recovery_per_sec_by_max_hp_ratio])
    ? { whiles: [{ when: 'lowSp', value: bb.sp_ratio, mods: { hpRegenRatio: bb.hp_recovery_per_sec_by_max_hp_ratio }, flags: { noAttack: true } }] } : null)],
  [/^攻击敌人时攻击力提升至\d+(?:\.\d+)?%。周围存在\d+名及以上敌人时攻击力提升至\d+(?:\.\d+)?%且受到的伤害减少\d+(?:\.\d+)?%$/u, (bb) => (all([bb.atk_scale_base, bb.cnt, bb.atk_scale_up, bb.damage_resistance])
    ? { whiles: [{ when: 'enemiesNear', value: bb.cnt, mods: { atkScaleMul: bb.atk_scale_up, dmgTakenMul: 1 - bb.damage_resistance } },
      { when: 'fewEnemiesNear', value: bb.cnt, mods: { atkScaleMul: bb.atk_scale_base } }] } : null)],
  [/^受到的治疗效果提升\d+(?:\.\d+)?%[，,]生命值低于一半时提升至\d+(?:\.\d+)?%$/u, (bb) => (all([bb.heal_scale_1, bb.heal_scale_2, bb.hp_ratio])
    ? { whiles: [{ when: 'hpBelow', value: bb.hp_ratio, mods: { healingTakenMul: bb.heal_scale_2 } }, { when: 'hpNotBelow', value: bb.hp_ratio, mods: { healingTakenMul: bb.heal_scale_1 } }] } : null)],
  [/^部署后立即对攻击范围内一个敌人投掷闪光弹[，,]使其和周围敌人晕眩\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.stun]) ? { deployStun: { seconds: bb.stun, radius: 1 } } : null)],
  [/^部署时对周围四格敌人造成\d+(?:\.\d+)?%攻击力的真实伤害并晕眩\d+(?:\.\d+)?秒[，,]上一名部署干员势力为【([^】]+)】时额外造成一次伤害$/u, (bb, m) => {
    const whom = whomOf(m[1]);
    return whom && 'power' in whom && all([bb.atk_scale, bb.stun]) ? { deployBlast: { scale: bb.atk_scale, stun: bb.stun, again: whom.power } } : null;
  }],
]));

/**
 * The parts of a talent of 干员-30: its whole description (plainOf) one of MORE with the keys it needs, as additions to
 * the trait; null otherwise, and for hidden talents.
 * @param {Talent} c @returns {Partial<TraitDef> | null}
 */
export function moreParts(c) {
  if (c.hidden || !c.description) return null;
  const text = plainOf(c);
  for (const [re, make] of MORE) {
    const m = re.exec(text);
    if (m) return make(c.bb, m, c);
  }
  return null;
}

/**
 * The attack range a training's talents give it (干员-30): the last talent whose text begins with 「攻击范围扩大」 and that
 * has a range id, as offsets; null for none (霜叶: the talent's range is its attack range while it has it).
 * @param {Talent[]} talents @param {Record<string, { row: number, col: number }[]>} ranges
 */
export function talentRange(talents, ranges) {
  const id = talents.filter((c) => !c.hidden && c.rangeId && /^攻击范围扩大/u.test(plainOf(c))).at(-1)?.rangeId;
  return id && Object.hasOwn(ranges, id) ? ranges[id] : null;
}
