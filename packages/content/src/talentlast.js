// More talents in time and on the field (docs/spec/operators.md 干员-34): a 倍率 for a faction against weaker enemies,
// a chance growing with ammo spent, stronger attacks after the first skill, buffs and auras for some seconds after the
// deployment, a blast and a retreat after a while, a gain for the first enemy blocked, hits that weaken 法抗 or add
// 元素损伤 for a while — as additions to the trait (职业-35), chance talents (攻击-4) and in-range talents (部署-6).
import { whomOf } from './talents.js';
import { plainOf, byEnd, all } from './talentparts.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').RangeTalent} RangeTalent */
/** @typedef {import('@aue/sim').CritTalent} CritTalent */
/** @typedef {{ trait?: Partial<TraitDef>, range?: RangeTalent[], crit?: CritTalent[] }} LastParts */

/** A number of the blackboard, when it is one. @param {Record<string, number>} bb @param {string} k */
const num = (bb, k) => (Number.isFinite(bb[k]) ? bb[k] : undefined);

/** The talents of 干员-34, whole descriptions, and what each adds: 摆渡人, 圣约送葬人, 焰狐龙梓兰, Castle-3, 正义骑士号, THRM-EX, CONFESS-47, GALLUS², PhonoR-0. */
const LAST = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray) => LastParts | null][]} */ ([
  [/^在场时[，,]所有【([^】]+)】干员攻击生命比例不高于自身的敌人时攻击力提升至\d+(?:\.\d+)?%$/u, (bb, m) => {
    const whom = whomOf(m[1]);
    return whom && 'power' in whom && all([bb.talent_atk_scale]) ? { trait: { fieldVs: { power: whom.power, vs: [{ when: 'hpRatioAtMostOwn', atk: bb.talent_atk_scale }] } } } : null;
  }],
  [/^攻击时有\d+(?:\.\d+)?%几率额外攻击一次[，,]技能期间每消耗1颗弹药这个几率提升\d+(?:\.\d+)?%[，,]技能结束时重置$/u, (bb) => (all([bb.prob, bb.prob_add])
    ? { crit: [{ prob: bb.prob, scale: 1, times: 2, ammoProb: bb.prob_add, sp: 1 }] } : null)],
  [/^部署后首次开启技能时[，,]接下来\d+次攻击的攻击力提升至\d+(?:\.\d+)?%$/u, (bb) => (all([bb.power_attack_count, bb.power_attack_scale])
    ? { trait: { powerAttacks: { count: bb.power_attack_count, scale: bb.power_attack_scale } } } : null)],
  [/^部署后\d+(?:\.\d+)?秒内所有友方【近战位】单位的攻击力和防御力[+＋]\d+(?:\.\d+)?%$/u, (bb) => (all([bb.duration, bb.atk, bb.def])
    ? { trait: { fieldBuffs: [{ melee: true, during: bb.duration, mods: { atkPct: bb.atk, defPct: bb.def } }] } } : null)],
  [/^部署后\d+(?:\.\d+)?秒内攻击范围内所有友方远程位单位更不容易被攻击且敌方空中单位获得\d+(?:\.\d+)?%的脆弱效果$/u, (bb) => {
    const taunt = byEnd(bb, '.taunt_level');
    return all([bb.duration, bb.damage_scale, taunt]) ? { range: [{ side: 'ally', ranged: true, during: bb.duration, mods: { taunt: /** @type {number} */ (taunt) } },
      { side: 'enemy', ranged: false, when: { when: 'flying' }, during: bb.duration, mods: { dmgTakenMul: bb.damage_scale } }] } : null;
  }],
  [/^部署经过\d+(?:\.\d+)?秒后[，,]对周围8格内的所有敌人造成相当于攻击力\d+(?:\.\d+)?%的物理伤害[，,]并令其获得\d+(?:\.\d+)?秒\d+(?:\.\d+)?%的脆弱效果[，,]之后自身强制退出战场$/u, (bb) => {
    const seconds = num(bb, 'weak[limit]');
    return seconds !== undefined && all([bb.interval, bb.damage_by_atk_scale, bb.damage_scale])
      ? { trait: { timedBlast: { after: bb.interval, scale: bb.damage_by_atk_scale, fragile: { value: Math.round((bb.damage_scale - 1) * 1e9) / 1e9, seconds } } } } : null;
  }],
  [/^首次阻挡敌人时立即获得\d+点部署费用[，,]并使该敌人沉睡\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.cost, bb.sleep]) ? { trait: { firstBlock: { cost: bb.cost, sleep: bb.sleep } } } : null)],
  [/^部署后\d+(?:\.\d+)?秒内[，,]攻击使敌人法术抗性[-－]\d+(?:\.\d+)?%[，,]且优先攻击未获得此效果的敌人$/u, (bb) => (all([bb.duration, bb.buff_duration, bb.magic_resistance])
    ? { trait: { onHit: [{ during: bb.duration, debuff: { seconds: bb.buff_duration, mods: { resMul: 1 + bb.magic_resistance } } }], prefer: [{ lacksHit: true, during: bb.duration }] } } : null)],
  [/^部署后\d+(?:\.\d+)?秒内攻击附带\d+点凋亡损伤[，,]并使攻击范围内的所有敌人受到\d+(?:\.\d+)?%的【法术脆弱】和【元素脆弱】$/u, (bb) => {
    const amount = num(bb, 'attack@dark_damage_value');
    return amount !== undefined && all([bb.duration, bb.damage_scale]) ? { trait: { onHit: [{ during: bb.duration, ep: { el: 'DARK', amount } }] },
      range: [{ side: 'enemy', ranged: false, during: bb.duration, mods: { artsTakenMul: bb.damage_scale, elementalTakenMul: bb.damage_scale } }] } : null;
  }],
]));

/**
 * The parts of a talent of 干员-34: its whole description (plainOf) one of LAST with the keys it needs; null otherwise,
 * and for hidden talents.
 * @param {Talent} c @returns {LastParts | null}
 */
export function lastParts(c) {
  if (c.hidden || !c.description) return null;
  const text = plainOf(c);
  for (const [re, make] of LAST) {
    const m = re.exec(text);
    if (m) return make(c.bb, m);
  }
  return null;
}
