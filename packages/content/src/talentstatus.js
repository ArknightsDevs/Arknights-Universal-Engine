// Talents that give a status where their words name it (docs/spec/operators.md 干员-14, 干员-19): the hits that give a 脆弱 or 法术脆弱
// — with the 灼痕 that also weakens the attack — and 「拥有抵抗」 held from the deployment. The in-range, team, timed, stacking and heal
// talents that give 抵抗 or 脆弱 are read where their wordings are (talents.js, talentparts.js, talentfight.js, talentlast.js,
// talentmore.js); all of them give the engine's statuses (状态-5), so that two sources of one name keep the strongest (状态-2).
import { plainOf } from './talentparts.js';
import { fragileOf, resistOf } from './talents.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').TalentHit} TalentHit @typedef {import('@aue/sim').TalentStatus} TalentStatus */

/** The first of the keys the blackboard has, its value; undefined for none. @param {Record<string, number>} bb @param {string[]} keys */
const firstKey = (bb, keys) => keys.map((k) => bb[k]).find((v) => Number.isFinite(v));
/** A hit's status 脆弱 or 法术脆弱 (`damage_scale`) for the seconds under the keys; null without them. @param {string} word @param {Record<string, number>} bb @param {string[]} keys */
function fragileHit(word, bb, keys) {
  const status = fragileOf(word, bb.damage_scale), seconds = firstKey(bb, keys);
  return status && seconds !== undefined ? { status: { key: status.key, seconds, ...(status.value === undefined ? {} : { value: status.value }) } } : null;
}

/**
 * The hits that give a status the words name (干员-19), whole descriptions: 「攻击敌人时对目标施加N%的【法术脆弱】，持续N秒」 (濯尘芙蓉);
 * 「造成伤害时有N%概率对敌人施加灼痕效果：攻击力-N%、N%的【法术脆弱】，不可叠加持续N秒」 (焰影苇草: at the chance `prob`, the status and
 * the lower attack for `duration` seconds); 「<名字>可以进行持续攻击；攻击时N%概率使敌人获得N%脆弱，持续N秒」 (祐天寺若麦: `prob`,
 * `weak[limit]`); 「攻击使目标的特殊能力失效并获得N%的脆弱，持续N秒」 (拉普兰德 module: both for the seconds).
 * @type {readonly [RegExp, (bb: Record<string, number>) => (TalentHit | null)[]][]}
 */
const HITS = Object.freeze([
  [/^攻击敌人时对目标施加\d+(?:\.\d+)?%的【法术脆弱】，持续\d+(?:\.\d+)?秒$/u, (bb) => [fragileHit('法术脆弱', bb, ['weak[magic][limit]', 'duration'])]],
  [/^造成伤害时有\d+(?:\.\d+)?%概率对敌人施加灼痕效果：攻击力[-－]\d+(?:\.\d+)?%、\d+(?:\.\d+)?%的【法术脆弱】，不可叠加持续\d+(?:\.\d+)?秒$/u, (bb) => {
    const hit = fragileHit('法术脆弱', bb, ['duration']);
    return hit && Number.isFinite(bb.prob) && Number.isFinite(bb.atk) ? [{ prob: bb.prob, ...hit, debuff: { seconds: bb.duration, mods: { atkPct: bb.atk } } }] : [null];
  }],
  [/^\S+?可以进行持续攻击；攻击时\d+(?:\.\d+)?%概率使敌人获得\d+(?:\.\d+)?%脆弱，持续\d+(?:\.\d+)?秒$/u, (bb) => {
    const hit = fragileHit('脆弱', bb, ['weak[limit]']);
    return hit && Number.isFinite(bb.prob) ? [{ prob: bb.prob, ...hit }] : [null];
  }],
  [/^攻击使目标的特殊能力失效并获得\d+(?:\.\d+)?%的脆弱，持续\d+(?:\.\d+)?秒$/u, (bb) => {
    const seconds = firstKey(bb, ['silence', 'duration']);
    return [seconds === undefined ? null : { status: { key: 'silence', seconds } }, fragileHit('脆弱', bb, ['weak[limit]', 'duration'])];
  }],
]);

/**
 * The hits of a talent that give a 脆弱 or 法术脆弱 (干员-19): its whole description (plainOf) one of HITS with the keys it needs;
 * none otherwise, and for a hidden talent. @param {Talent} c @returns {TalentHit[]}
 */
export function hitStatuses(c) {
  if (c.hidden || !c.description) return [];
  const text = plainOf(c);
  for (const [re, make] of HITS) {
    if (!re.test(text)) continue;
    const hits = make(c.bb);
    return hits.every((h) => h !== null) ? /** @type {TalentHit[]} */ (hits) : [];
  }
  return [];
}

/**
 * 「（自身）拥有 / 获得抵抗」 (干员-14): the operator holds the status 抵抗 (resistOf) from its deployment on. 亚叶's 「且受到来自自然环境的
 * 伤害-N%」, on her and in her range, is left out: the engine has no damage from the natural environment (敌能-140).
 */
const HOLD = /^(?:自身)?(?:获得|拥有)抵抗(?:且受到来自自然环境的伤害[-－]\d+(?:\.\d+)?%)?(?:，攻击范围内的其他友方角色受到来自自然环境的伤害[-－]\d+(?:\.\d+)?%)?$/u;

/**
 * The status a talent holds from the deployment on (干员-14): 「拥有抵抗」 (HOLD), its `one_minus_status_resistance` below 0 as the
 * strength; null for another description, and for a hidden talent. @param {Talent} c @returns {TalentStatus | null}
 */
export function selfStatus(c) {
  return !c.hidden && c.description && HOLD.test(plainOf(c)) ? resistOf(c.bb) : null;
}
