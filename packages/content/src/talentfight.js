// Talents on attacks and statuses (docs/spec/operators.md 干员-33): steps for the same target, statuses at a chance and
// targets left alone, an attacker weakened, longer 停顿, stored energy, one of several effects at a chance, steps by
// kinds of enemies killed, 防御 ignored for a kind killed, a strike as the skill starts, a chance growing with kills near
// a faction, gains for spending cost, steps for 停顿 dealt, 脆弱 growing with the time in range or by status, 隐匿
// undone, steps for a run of attacks, blows that leave 重伤, a stance by 起飞, riders at full charge — as additions to
// the trait (职业-34), chance talents (攻击-4) and in-range talents (部署-6).
import { whomOf } from './talents.js';
import { plainOf, byEnd, all } from './talentparts.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').RangeTalent} RangeTalent */
/** @typedef {import('@aue/sim').CritTalent} CritTalent */
/** @typedef {{ trait?: Partial<TraitDef>, range?: RangeTalent[], crit?: CritTalent[] }} FightParts */

/** A number of the blackboard, when it is one. @param {Record<string, number>} bb @param {string} k */
const num = (bb, k) => (Number.isFinite(bb[k]) ? bb[k] : undefined);

/**
 * The talents of 干员-33, whole descriptions, and what each adds: 猎蜂, 深靛, 安比尔, 泡泡, 地灵, 爱丽丝, 空构, 吉星, 莱欧斯,
 * 雪猎, 达格达, 哈蒂娅, 溯光星源, 铃兰, 灵知, 银灰, 火龙S黑角, 罗小黑 and 矩, 云迹, 骋风.
 */
const FIGHT = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray, c: Talent) => FightParts | null][]} */ ([
  [/^攻击相同目标时每次攻击可提高自身攻击力\d+(?:\.\d+)?%[，,]最多可叠加\d+层。更换目标会失去之前叠加的效果$/u, (bb) => (all([bb.atk, bb.max_stack_cnt])
    ? { trait: { sameTarget: { max: bb.max_stack_cnt, mods: { atkPct: bb.atk } } } } : null)],
  [/^攻击时有\d+(?:\.\d+)?%的几率使目标束缚\d+(?:\.\d+)?秒[，,]不以束缚状态的敌人为攻击目标$/u, (bb) => (all([bb.prob, bb.duration])
    ? { trait: { onHit: [{ prob: bb.prob, status: { key: 'root', seconds: bb.duration } }], skipStatus: 'root' } } : null)],
  [/^攻击原本攻击范围以外的目标时[，,]有\d+(?:\.\d+)?%的几率使其晕眩\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.buff_prob, bb.stun])
    ? { trait: { onHit: [{ when: 'beyondRange', prob: bb.buff_prob, status: { key: 'stun', seconds: bb.stun } }] } } : null)],
  [/^敌人攻击\S+?后[，,]攻击力下降\d+(?:\.\d+)?%[，,]持续\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.atk, bb.duration])
    ? { trait: { attackerMods: { seconds: bb.duration, mods: { atkPct: bb.atk } } } } : null)],
  [/^稍微延长特性停顿的持续时间$/u, (bb) => (all([bb.sluggish]) ? { trait: { hitStatusPlus: bb.sluggish } } : null)],
  [/^储存的攻击能量造成的伤害提升至\d+(?:\.\d+)?%$/u, (bb) => (all([bb.atk_scale]) ? { trait: { energyScale: bb.atk_scale } } : null)],
  [/^每次攻击时有\d+(?:\.\d+)?%概率触发下列效果之一[：:]攻击变为二连击[；;]目标晕眩\d+(?:\.\d+)?秒[；;]攻击无视目标防御力的\d+(?:\.\d+)?%$/u, (bb) => (all([bb.prob, bb.stun, bb.def_penetrate])
    ? { crit: [{ prob: bb.prob, scale: 1, pick: [{ times: 2 }, { stun: bb.stun }, { ignoreDef: bb.def_penetrate }] }] } : null)],
  [/^上场后每击倒过一种敌人[，,]自身造成的伤害[+＋]\d+(?:\.\d+)?%[，,]最多叠加\d+次$/u, (bb) => (all([bb.damage_scale, bb.max_stack_cnt])
    ? { trait: { kindStack: { max: bb.max_stack_cnt, mods: { dmgDealtMul: 1 + bb.damage_scale } } } } : null)],
  [/^击倒敌人后[，,]\S+?攻击所有同名敌人时无视其\d+(?:\.\d+)?%防御力$/u, (bb) => (all([bb.def_penetrate])
    ? { trait: { slainKinds: true, vs: [{ when: 'slainKind', defPct: bb.def_penetrate }] } } : null)],
  [/^开启技能时[，,]派出\S+?进行攻击[，,]造成相当于攻击力\d+(?:\.\d+)?%的物理伤害和\d+(?:\.\d+)?秒寒冷$/u, (bb) => (all([bb.atk_scale, bb.cold])
    ? { trait: { skillStrike: { scale: bb.atk_scale, cold: bb.cold } } } : null)],
  [/^攻击时有\d+(?:\.\d+)?%概率使当次攻击力提升至\d+(?:\.\d+)?%[，,]自身在场时[，,]【([^】]+)】干员周围4格内每有一个敌人倒下[，,]攻击力提升额外提升\d+(?:\.\d+)?%$/u, (bb, m) => {
    const whom = whomOf(m[1]);
    return whom && 'power' in whom && all([bb.prob, bb.atk_scale, bb.atk_up_each_time, bb.atk_up_max_value])
      ? { crit: [{ prob: bb.prob, scale: bb.atk_scale, grow: { power: whom.power, step: bb.atk_up_each_time, max: bb.atk_up_max_value } }] } : null;
  }],
  [/^通过部署、开启技能、使用装备应变消耗费用后[，,]攻击力[+＋]\d+(?:\.\d+)?%[，,]使攻击范围内的敌人晕眩\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.atk, bb.max_stack_cnt, bb.stun])
    ? { trait: { spendBoost: { max: bb.max_stack_cnt, mods: { atkPct: bb.atk }, stun: bb.stun } } } : null)],
  [/^对敌人造成停顿效果时[，,]自身的攻击速度[+＋]\d+[，,]最多叠加\d+次$/u, (bb) => (all([bb.attack_speed, bb.max_stack_cnt])
    ? { trait: { stacks: [{ on: 'status', status: 'sluggish', max: bb.max_stack_cnt, mods: { aspd: bb.attack_speed } }] } } : null)],
  [/^攻击范围内的敌人受到\d+(?:\.\d+)?%的脆弱效果[，,]敌人在\S+?的攻击范围内停留超过\d+(?:\.\d+)?秒后[，,]脆弱效果提升至\d+(?:\.\d+)?%$/u, (bb) => {
    const base = byEnd(bb, '].damage_scale'), after = byEnd(bb, '].interval'), max = byEnd(bb, '].damage_scale_max');
    return all([base, after, max]) ? { trait: { stayVuln: { base: /** @type {number} */ (base), after: /** @type {number} */ (after), max: /** @type {number} */ (max) } } } : null;
  }],
  [/^攻击范围内被停顿的敌人在下一瞬间起还会受到等长时间的\d+(?:\.\d+)?%的脆弱效果$/u, (bb) => (all([bb.damage_scale])
    ? { range: [{ side: 'enemy', ranged: false, when: { when: 'sluggish' }, mods: { dmgTakenMul: bb.damage_scale } }] } : null)],
  [/^攻击造成\d+(?:\.\d+)?秒寒冷[；;]范围内寒冷的敌人受到\d+(?:\.\d+)?%的脆弱[，,]范围内冻结的敌人脆弱效果提升至2倍$/u, (bb) => (all([bb.cold, bb.damage_scale_cold, bb.damage_scale_freeze])
    ? { trait: { onHit: [{ status: { key: 'cold', seconds: bb.cold } }] }, range: [{ side: 'enemy', ranged: false, when: { when: 'coldOnly' }, mods: { dmgTakenMul: bb.damage_scale_cold } },
      { side: 'enemy', ranged: false, when: { when: 'frozen' }, mods: { dmgTakenMul: bb.damage_scale_freeze } }] } : null)],
  [/^攻击范围内敌人的隐匿效果失效$/u, () => ({ range: [{ side: 'enemy', ranged: false, mods: {}, flags: { unstealth: true } }] })],
  [/^非技能期间[，,]连续攻击\d+次后自身获得攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb, _m, c) => {
    const max = /最多(\d+)层/u.exec(c.description ?? ''), gap = num(bb, 'attack@clear_attackcount_time');
    return max && gap !== undefined && all([bb.hit_num, bb.atk]) ? { trait: { combo: { hits: bb.hit_num, gap, max: Number(max[1]), mods: { atkPct: bb.atk } } } } : null;
  }],
  [/^造成致命伤害时使敌人保留1点生命并使其重伤[；;]\S+?不攻击重伤单位$/u, (bb) => (all([bb.interval, bb.sp]) ? { trait: { nonLethal: { seconds: bb.interval, sp: bb.sp } } } : null)],
  [/^在地面时防御力[+＋]\d+(?:\.\d+)?%[，,]起飞后攻击敌人时攻击力提升至\d+(?:\.\d+)?%$/u, (bb) => (all([bb.def, bb.atk_scale])
    ? { trait: { whiles: [{ when: 'grounded', mods: { defPct: bb.def } }, { when: 'liftoff', mods: { atkScaleMul: bb.atk_scale } }] } } : null)],
  [/^特性攻击力提升至最高时[，,]每次攻击额外追加一次\d+(?:\.\d+)?%攻击力的攻击$/u, (bb) => (all([bb.atk_scale]) ? { trait: { chargedRider: bb.atk_scale } } : null)],
]));

/**
 * The parts of a talent of 干员-33: its whole description (plainOf) one of FIGHT with the keys it needs; null otherwise,
 * and for hidden talents.
 * @param {Talent} c @returns {FightParts | null}
 */
export function fightParts(c) {
  if (c.hidden || !c.description) return null;
  const text = plainOf(c);
  for (const [re, make] of FIGHT) {
    const m = re.exec(text);
    if (m) return make(c.bb, m, c);
  }
  return null;
}
