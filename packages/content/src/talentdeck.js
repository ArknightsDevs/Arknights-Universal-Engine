// A talent's parts on the deck, the cost and deployments (docs/spec/operators.md 干员-29): a starting cost, first
// deployments, cuts of the deploy cost, cost recovery, SP on deployments, answers to skills in range, SP pulses and SP on
// attacks — as additions to the trait (职业-30, 部署-10) and team parts (干员-9).
import { whomOf } from './talents.js';
import { plainOf, byEnd, all } from './talentparts.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').TeamTalent} TeamTalent */

/** The profession a name in a description is (干员-9), null for another. @param {string} name @returns {{ profession: string } | null} */
const professionNamed = (name) => { const whom = whomOf(name); return whom && 'profession' in whom ? whom : null; };

/**
 * The talents on the deck, the cost and deployments (干员-29), whole descriptions, and what each adds to the trait, to
 * the on-field team talents (`field`) or to the deck's (`deck`, 干员-9): 德克萨斯's starting cost, 截云's and 灰烬's
 * first deployment, 历阵锐枪芬's cut after a retreat, 野鬃's cuts for the undeployed, 缪尔赛思's 莱茵生命, 极境's
 * 狙击, 忍冬's cost recovery, 炎狱炎熔's SP on deployments, 录武官's answer to skills in range, 空弦's and 瑕光's SP,
 * 寻澜's cost alone.
 */
const DECK = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray) => { trait: Partial<TraitDef>, field?: TeamTalent[], deck?: TeamTalent[] } | null][]} */ ([
  [/^编入队伍后[，,]额外获得\d+点初始部署费用$/u, (bb) => (all([bb.cost]) ? { trait: { startCost: bb.cost } } : null)],
  [/^首次部署时[，,]攻击力[+＋]\d+(?:\.\d+)?%[，,]费用[-－]\d+$/u, (bb) => (all([bb.runtime_cost, bb.atk])
    ? { trait: { firstCost: bb.runtime_cost, whiles: [{ when: 'firstDeploy', mods: { atkPct: bb.atk } }] } } : null)],
  [/^首次部署时部署费用[-－]\d+[，,]部署后立即获得\d+技力$/u, (bb) => (all([bb.runtime_cost, bb.sp])
    ? { trait: { firstCost: bb.runtime_cost, deploySp: [{ who: 'self', first: true, sp: bb.sp }] } } : null)],
  [/^自身初次部署费用[-－]\d+[；;]撤退后使下一名干员部署费用[-－]\d+$/u, (bb) => (all([bb.runtime_cost, bb.value]) ? { trait: { firstCost: bb.runtime_cost, retreatCut: bb.value } } : null)],
  [/^部署后[，,]所有未部署的【([^】]+)】干员的部署费用[-－]\d+$/u, (bb, m) => {
    const whom = professionNamed(m[1]);
    return whom && all([bb.value, bb.max_stack_cnt]) ? { trait: { deployCut: { ...whom, value: bb.value, max: bb.max_stack_cnt } } } : null;
  }],
  [/^携带时【([^】]+)】干员部署费用[-－]\d+[，,]首名【([^】]+)】干员部署费用额外[-－]\d+$/u, (bb, m) => {
    const whom = whomOf(m[1]);
    return whom && m[1] === m[2] && all([bb.cost, bb.runtime_cost])
      ? { trait: { costCuts: [{ ...whom, value: bb.runtime_cost, first: true }] }, deck: [{ when: 'deck', ...whom, bb: { cost: bb.cost } }] } : null;
  }],
  [/^在场时[，,]所有【([^】]+)】干员的部署费用[-－]\d+[，,]且技能开启时所有【([^】]+)】干员的攻击速度[+＋]\d+$/u, (bb, m) => {
    const whom = whomOf(m[1]);
    return whom && m[1] === m[2] && all([bb.value, bb.attack_speed])
      ? { trait: { costCuts: [{ ...whom, value: bb.value, field: true }] }, field: [{ ...whom, bb: { attack_speed: bb.attack_speed }, skill: true }] } : null;
  }],
  [/^在场时[，,]部署费用的自然回复速度[+＋]\d+(?:\.\d+)?%[，,]若\d+(?:\.\d+)?秒内自身未受到伤害[，,]则每秒恢复\d+(?:\.\d+)?%的最大生命值$/u, (bb) => {
    const ratio = byEnd(bb, 'hp_recovery_per_sec_by_max_hp_ratio');
    return all([bb.delta_cost_increase_time, bb.interval, ratio])
      ? { trait: { costRate: bb.delta_cost_increase_time, whiles: [{ when: 'unhurt', value: bb.interval, fresh: true, mods: { hpRegenRatio: /** @type {number} */ (ratio) } }] } } : null;
  }],
  [/^首次部署后立即获得\d+点技力[，,]每次部署时使在场([^，,]{2})干员技力[+＋]\d+[，,]在场时其余友方\1干员初始技力[+＋]\d+$/u, (bb, m) => {
    const whom = professionNamed(m[1]), self = byEnd(bb, '[self].sp'), ally = byEnd(bb, '[ally].sp');
    return whom && all([self, ally]) ? { trait: { deploySp: [{ who: 'self', first: true, sp: /** @type {number} */ (self) },
      { who: 'field', ...whom, sp: /** @type {number} */ (ally) }, { who: 'arriving', ...whom, sp: /** @type {number} */ (ally) }] } } : null;
  }],
  [/^攻击范围内的干员开启技能时自身回复\d+点技力[，,]且攻击速度[+＋]\d+[，,]持续\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.sp, bb.attack_speed, bb.duration])
    ? { trait: { allySkill: { sp: bb.sp, seconds: bb.duration, mods: { aspd: bb.attack_speed } } } } : null)],
  [/^在场时所有【([^】]+)】干员的攻击回复技能每\d+(?:\.\d+)?秒回复\d+点技力$/u, (bb, m) => {
    const whom = professionNamed(m[1]);
    return whom && all([bb.sp, bb.interval]) ? { trait: { spPulse: { ...whom, every: bb.interval, sp: bb.sp } } } : null;
  }],
  [/^在场时所有受击回复的技能在干员攻击时也回复\d+点技力$/u, (bb) => (all([bb.sp]) ? { trait: { hurtAttackSp: bb.sp } } : null)],
  [/^部署时[，,]若周围4格没有其他干员[，,]获得\d+点部署费用$/u, (bb) => (all([bb.cost]) ? { trait: { aloneCost: bb.cost } } : null)],
]));

/**
 * The deck, cost and deployment parts of a talent (干员-29): its whole description (plainOf) one of DECK with the keys
 * it needs; null otherwise, and for hidden talents.
 * @param {Talent} c @returns {{ trait: Partial<TraitDef>, field?: TeamTalent[], deck?: TeamTalent[] } | null}
 */
export function deckParts(c) {
  if (c.hidden || !c.description) return null;
  const text = plainOf(c);
  for (const [re, make] of DECK) {
    const m = re.exec(text);
    if (m) return make(c.bb, m);
  }
  return null;
}
