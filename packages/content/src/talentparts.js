// A talent's parts beyond the always-on ones (docs/spec/operators.md 干员-17…干员-19): the operator's own modifiers while
// a condition holds, its 倍率 against some targets, and what its attacks' hits give their targets — as additions to its
// trait (职业-18, 职业-17, 职业-20) that the simulation merges into the trait (职业-24).
import { skills } from '@aue/sim';
import { selfClause } from './talents.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').WhileMods} WhileMods @typedef {import('@aue/sim').VsScale} VsScale */
/** @typedef {import('@aue/sim').TalentHit} TalentHit */

/** A talent's text as the readers take it: rich-text tags and bracketed potential differences removed. @param {Talent} c */
const plainOf = (c) => (c.description ?? '').replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').replace(/[。；]+$/, '');
/** Its first sentence (up to 。 or ；) and whether a later one speaks of an 效果. @param {Talent} c */
function firstOf(c) {
  const text = plainOf(c), first = text.split(/[。；]/)[0];
  return { first, laterEffect: text.slice(first.length).includes('效果') };
}
/** @param {Record<string, number>} bb @param {string} k */
const has = (bb, k) => Number.isFinite(bb[k]);
/** Chinese and Arabic counts. */
const COUNT = Object.freeze(/** @type {Record<string, number>} */ ({ 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 1: 1, 2: 2, 3: 3, 4: 4 }));
/** An element's 损伤 in a description (元素-1). */
const ELEMENT_WORD = Object.freeze(/** @type {Record<string, string>} */ ({ 神经: 'SANITY', 侵蚀: 'WATER', 灼燃: 'FIRE', 凋亡: 'DARK', 狂躁: 'ANGER' }));

/**
 * The conditions on the operator a clause may begin with (干员-17): the words, and the 职业-18 condition they are — its
 * number from the blackboard where it has one, else from the words; null when it needs a key the blackboard lacks.
 */
const SELF_WHEN = Object.freeze(/** @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>) => Omit<WhileMods, 'mods'> | null][]} */ ([
  [/^未阻挡敌人时[，,]?/u, () => ({ when: 'notBlocking' })],
  [/^阻挡敌人时[，,]?/u, () => ({ when: 'blocking' })],
  [/^阻挡(两|三|2|3)个及?以上的?敌人时[，,]?/u, (m, bb) => ({ when: 'blockingAtLeast', value: bb.cnt ?? COUNT[m[1]] })],
  [/^攻击范围内存在(\d+)名及以上的?敌人时[，,]?/u, (m, bb) => ({ when: 'enemies', value: bb.cnt ?? Number(m[1]) })],
  [/^攻击范围内(?:存在|有)敌人时[，,]?/u, () => ({ when: 'enemies', value: 1 })],
  [/^攻击范围内至少有(\d+)名其他(?:友方)?干员时[，,]?/u, (m, bb) => ({ when: 'allies', value: bb.cnt ?? Number(m[1]) })],
  [/^攻击范围内存在生命值低于一半的敌人时[，,]?/u, (_m, bb) => ({ when: 'lowHpEnemies', value: bb.hp_ratio ?? 0.5 })],
  [/^攻击范围内存在处于(神经|侵蚀|灼燃|凋亡|狂躁)损伤爆发期间的敌方单位时[，,]?/u, (m) => ({ when: 'burstEnemies', el: ELEMENT_WORD[m[1]] })],
  [/^当?周围(?:四|4)格内?没有敌人时[，,]?/u, () => ({ when: 'noEnemies4' })],
  [/^周围(?:四|4)格内仅存在一名敌人时[，,]?/u, () => ({ when: 'soleEnemy4' })],
  [/^当?周围(?:四|4)格内?没有其他友方单位时[，,]?/u, () => ({ when: 'aloneUnits4' })],
  [/^周围(?:八|8)格(?:内)?没有友方干员时[，,]?/u, () => ({ when: 'alone8' })],
  [/^技能未开启时[，,]?/u, () => ({ when: 'notInSkill' })],
  [/^生命值(高于|低于)\d+(?:\.\d+)?%时[，,]?/u, (m, bb) => (has(bb, 'hp_ratio') ? { when: m[1] === '高于' ? 'hpAbove' : 'hpBelow', value: bb.hp_ratio } : null)],
]));

/**
 * A clause's condition, when it begins with one (SELF_WHEN), and the rest of it; undefined when it begins with none,
 * null when its condition needs a key the blackboard lacks.
 * @param {string} clause @param {Record<string, number>} bb
 * @returns {{ cond: Omit<WhileMods, 'mods'>, rest: string } | null | undefined}
 */
function condOf(clause, bb) {
  for (const [re, make] of SELF_WHEN) {
    const m = re.exec(clause);
    if (!m) continue;
    const cond = make(m, bb);
    return cond ? { cond, rest: clause.slice(m[0].length) } : null;
  }
  return undefined;
}

/** An attribute key's modifier and value (技能-5), as the skills' attribute keys. @param {string} k @param {number} v */
const attrMods = (k, v) => skills.statMods({ [k]: v });

/**
 * One clause after a condition as modifiers (干员-17): the operator's own attributes or effects (selfClause), every key
 * in the blackboard; null otherwise. @param {string} clause @param {Record<string, number>} bb
 */
function condMods(clause, bb) {
  const p = selfClause(clause, bb);
  if (!p || !p.keys.every((k) => has(bb, k))) return null;
  if (Object.keys(p.mods).length) return p.mods;
  const mods = Object.assign({}, ...p.keys.map((k) => attrMods(k, bb[k])));
  return Object.keys(mods).length === p.keys.length ? mods : null;
}

/**
 * A clause 「改为……」 after a condition (干员-17): what it gives more than the always-on clause it replaces — the same
 * clause read with each key's value under a blackboard key ending in 「.<key>」 (绮良's `kirara_t_2.…`), less (for a
 * product, over) its value under the key itself; null without both.
 * @param {string} clause @param {Record<string, number>} bb @returns {Record<string, number> | null}
 */
function insteadMods(clause, bb) {
  const p = selfClause(clause, bb);
  if (!p) return null;
  const over = Object.fromEntries(p.keys.map((k) => [k, Object.entries(bb).find(([kk]) => kk.endsWith(`.${k}`))?.[1]]));
  if (!p.keys.every((k) => has(bb, k) && Number.isFinite(over[k]))) return null;
  const now = condMods(clause, { ...bb, .../** @type {Record<string, number>} */ (over) }), was = condMods(clause, bb);
  if (!now || !was) return null;
  return Object.fromEntries(Object.entries(now).map(([k, v]) => [k, k.endsWith('Mul') ? v / was[k] : v - was[k]]));
}

/**
 * The conditional parts of a talent (干员-17): its first sentence's clauses (split at ，) — those before the first
 * condition are the always-on part's (干员-6) and left out; a clause that begins with a condition (SELF_WHEN) starts
 * its part, the clauses after it up to the next condition are about the operator itself (condMods) — or 「改为」 one,
 * the part giving what it adds to the always-on one (insteadMods) — and add to the part's modifiers. Every clause from
 * the first condition on must read so, and no later sentence speak of an 效果. None when it has no condition; hidden
 * talents have none.
 * @param {Talent} c @returns {WhileMods[]}
 */
export function whileParts(c) {
  if (c.hidden || !c.description) return [];
  const { first, laterEffect } = firstOf(c), clauses = first.split('，').map((x) => x.trim()).filter((x) => x);
  const start = clauses.findIndex((x) => condOf(x, c.bb) !== undefined);
  if (start < 0 || laterEffect) return [];
  /** @type {WhileMods[]} */
  const out = [];
  for (const clause of clauses.slice(start)) {
    const at = condOf(clause, c.bb);
    if (at === null) return [];
    if (at) out.push({ ...at.cond, mods: {} });
    const rest = at ? at.rest : clause;
    if (!rest) continue;
    const mods = rest.startsWith('改为') ? insteadMods(rest.slice(2), c.bb) : condMods(rest, c.bb);
    if (!mods) return [];
    Object.assign(/** @type {WhileMods} */ (out.at(-1)).mods, mods);
  }
  return out.every((x) => Object.keys(x.mods).length > 0) ? out : [];
}

/** The enemies' tags by the names a description gives them in 【】 (关卡-1). */
const TAGS = Object.freeze(/** @type {Record<string, string>} */ ({ 萨卡兹: 'sarkaz', 无人机: 'drone', 感染生物: 'infection' }));

/** The target conditions a talent names (干员-18): the words between 攻击/对 and 的敌人, and the 职业-17 condition they are. */
const TARGET_WHEN = Object.freeze(/** @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>) => Omit<VsScale, 'atk' | 'dmg'> | null][]} */ ([
  [/^被阻挡$/u, () => ({ when: 'blocked' })],
  [/^未被阻挡$/u, () => ({ when: 'unblocked' })],
  [/^未被自身阻挡$/u, () => ({ when: 'notOwnBlocked' })],
  [/^使用远程武器$/u, () => ({ when: 'rangedFoe' })],
  [/^(?:空中|飞行)$/u, () => ({ when: 'flying' })],
  [/^生命值(低于|高于)\d+(?:\.\d+)?%$/u, (m, bb) => (has(bb, 'hp_ratio') ? { when: m[1] === '低于' ? 'hpBelow' : 'hpAbove', value: bb.hp_ratio } : null)],
  [/^重量(小于等于|大于等于)(\d+)$/u, (m, bb) => ({ when: m[1] === '小于等于' ? 'light' : 'heavy', value: bb.value ?? Number(m[2]) })],
  [/^【([^】]+)】$/u, (m) => (Object.hasOwn(TAGS, m[1]) ? { when: 'tag', tag: TAGS[m[1]] } : null)],
  [/^被战栗$/u, () => ({ when: 'status', status: 'disarmedCombat' })],
]));

/** A target-talent's sentence (干员-18): 攻击/对, the target's words, 的敌人/目标/单位 (时) — or 攻击【tag】时 —, then what it gets. */
const TARGET_HEAD = /^(?:攻击|对)(.+?)的?(?:敌人|目标|单位)(?:时)?[，,]?|^攻击(【[^】]+】)时[，,]?/u;

/**
 * What a target-talent gives (干员-18) from the blackboard: 攻击力提升至 / 攻击力+ (`atk_scale` as the attack 倍率), 伤害提升 /
 * 提高 / + (the attack 倍率 when the blackboard has `atk_scale`, else `damage_scale` as the 伤害倍率), 无视 N（点）防御力
 * (`def_penetrate_fixed`) or N% 的防御力 (`def_penetrate`); null for another.
 * @param {string} s @param {Record<string, number>} bb @returns {Partial<VsScale> | null}
 */
function targetGain(s, bb) {
  if (/^攻击力(?:提升至|[+＋])\d+(?:\.\d+)?%$/u.test(s)) return has(bb, 'atk_scale') ? { atk: bb.atk_scale } : null;
  if (/^(?:自身)?(?:造成的?)?伤害(?:提升|提高|[+＋])\d+(?:\.\d+)?%$/u.test(s)) return has(bb, 'atk_scale') ? { atk: bb.atk_scale } : has(bb, 'damage_scale') ? { dmg: bb.damage_scale } : null;
  if (/^无视(?:目标|其)\d+点?的?防御力$/u.test(s)) return has(bb, 'def_penetrate_fixed') ? { defFlat: bb.def_penetrate_fixed } : null;
  if (/^无视(?:目标|其)\d+(?:\.\d+)?%的防御力$/u.test(s)) return has(bb, 'def_penetrate') ? { defPct: bb.def_penetrate } : null;
  return null;
}

/**
 * The target part of a talent (干员-18): its first sentence is 「攻击/对 + the target (TARGET_WHEN) + 的敌人/目标/单位（时），」
 * then what it gets (targetGain) — nothing else in it, no later sentence speaking of an 效果. Null otherwise; hidden
 * talents have none.
 * @param {Talent} c @returns {VsScale | null}
 */
export function targetPart(c) {
  if (c.hidden || !c.description) return null;
  const { first, laterEffect } = firstOf(c), head = TARGET_HEAD.exec(first);
  if (!head || laterEffect) return null;
  const words = head[1] ?? head[2];
  const form = TARGET_WHEN.map(([re, make]) => { const m = re.exec(words); return m ? make(m, c.bb) : undefined; }).find((x) => x !== undefined);
  const gain = form ? targetGain(first.slice(head[0].length).replace(/^时[，,]?/u, ''), c.bb) : null;
  return form && gain ? /** @type {VsScale} */ ({ ...form, ...gain }) : null;
}

/** @typedef {NonNullable<TalentHit['status']>['key']} StatusKey */
/** The status a hit gives by its word (状态-5), and the blackboard keys its seconds may be under. */
const HIT_STATUS = Object.freeze(/** @type {Record<string, [StatusKey, string[]]>} */ ({
  束缚: ['root', ['duration', 'frozen_duration']], 晕眩: ['stun', ['stun']], 停顿: ['sluggish', ['sluggish', 'attack@sluggish']], 寒冷: ['cold', ['cold']],
  沉睡: ['sleep', ['sleep']], 战栗: ['disarmedCombat', ['not_combat', 'duration']], 特殊能力失效: ['silence', ['silence', 'duration']],
}));

/** The first of the keys the blackboard has, its value; undefined for none. @param {Record<string, number>} bb @param {string[]} keys */
const firstKey = (bb, keys) => keys.map((k) => bb[k]).find((v) => Number.isFinite(v));
/** A chance from the blackboard: `prob`, else `attack@prob`. @param {Record<string, number>} bb */
const probOf = (bb) => firstKey(bb, ['prob', 'attack@prob']);

/**
 * A status a hit gives (干员-19) by its word and the seconds the blackboard has for it; null without them.
 * @param {string} word @param {Record<string, number>} bb @param {number | undefined} [prob] @returns {TalentHit | null}
 */
function statusHit(word, bb, prob) {
  const s = HIT_STATUS[word], seconds = s ? firstKey(bb, s[1]) : undefined;
  return s && seconds !== undefined ? { status: { key: s[0], seconds }, ...(prob !== undefined ? { prob } : {}) } : null;
}

/** The sentences of a talent about its attacks' hits (干员-19) and what each gives the target. */
const HITS = Object.freeze(/** @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>) => TalentHit | null][]} */ ([
  [/^攻击时有?\d+(?:\.\d+)?%的?(?:几率|概率)使目标(束缚|晕眩|停顿|寒冷|沉睡)\d+(?:\.\d+)?秒$/u, (m, bb) => (probOf(bb) === undefined ? null : statusHit(m[1], bb, probOf(bb)))],
  [/^攻击时有\d+(?:\.\d+)?%的几率对攻击目标造成\d+(?:\.\d+)?秒的停顿$/u, (_m, bb) => (probOf(bb) === undefined ? null : statusHit('停顿', bb, probOf(bb)))],
  [/^攻击时对攻击目标造成\d+(?:\.\d+)?秒的停顿$/u, (_m, bb) => statusHit('停顿', bb)],
  [/^攻击造成\d+(?:\.\d+)?秒寒冷$/u, (_m, bb) => statusHit('寒冷', bb)],
  [/^攻击使目标的特殊能力失效，持续\d+(?:\.\d+)?秒$/u, (_m, bb) => statusHit('特殊能力失效', bb)],
  [/^对每个敌人首次造成伤害[时后]，使(?:其|目标)的?(战栗|特殊能力失效)(?:，持续)?\d+(?:\.\d+)?秒$/u, (m, bb) => {
    const h = statusHit(m[1], bb);
    return h ? { ...h, first: true } : null;
  }],
  [/^攻击敌人时对目标施加\d+(?:\.\d+)?%的【法术脆弱】，持续\d+(?:\.\d+)?秒$/u, (_m, bb) => {
    const seconds = firstKey(bb, ['weak[magic][limit]', 'duration']);
    return has(bb, 'damage_scale') && seconds !== undefined ? { status: { key: 'artsFragile', seconds, value: Math.round((bb.damage_scale - 1) * 1e9) / 1e9 } } : null;
  }],
  [/^攻击(?:时有\d+(?:\.\d+)?%的几率)?使目标法术抗性[-－]\d+(?:\.\d+)?%，持续\d+(?:\.\d+)?秒$/u, (m, bb) => {
    const chance = m[0].includes('几率'), prob = probOf(bb);
    if (!has(bb, 'magic_resistance') || !has(bb, 'duration') || (chance && prob === undefined)) return null;
    return { debuff: { seconds: bb.duration, mods: { resPct: bb.magic_resistance } }, ...(chance ? { prob } : {}) };
  }],
  [/^造成伤害时有\d+(?:\.\d+)?%概率对敌人施加灼痕效果：攻击力[-－]\d+(?:\.\d+)?%、\d+(?:\.\d+)?%的【法术脆弱】，不可叠加持续\d+(?:\.\d+)?秒$/u, (_m, bb) => {
    const ok = ['prob', 'atk', 'damage_scale', 'duration'].every((k) => has(bb, k));
    return ok ? { prob: bb.prob, debuff: { seconds: bb.duration, mods: { atkPct: bb.atk, artsTakenMul: bb.damage_scale } } } : null;
  }],
]));

/**
 * The hit part of a talent (干员-19): its first sentence is one of HITS — a status at a chance or on every hit, 失去特殊
 * 能力, the first hit on each enemy's status, 法术脆弱, a lower 法术抗性 for some seconds (at a chance or not), 灼痕 —
 * with the keys it needs; no later sentence speaking of an 效果. Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {TalentHit | null}
 */
export function hitPart(c) {
  if (c.hidden || !c.description) return null;
  const { first, laterEffect } = firstOf(c);
  if (laterEffect) return null;
  for (const [re, make] of HITS) {
    const m = re.exec(first);
    if (m) return make(m, c.bb);
  }
  return null;
}

/**
 * What a talent adds to its operator's attacks (干员-19): 「攻击额外造成攻击力N%的法术伤害」 (`extraArts` from
 * `attack@atk_scale_1` or `atk_scale`, 职业-20), 「攻击时同时攻击两个目标」 (two targets, 职业-3) — as its whole first
 * sentence. Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {{ extraArts?: number, targets?: number } | null}
 */
export function attackPart(c) {
  if (c.hidden || !c.description) return null;
  const { first, laterEffect } = firstOf(c), arts = firstKey(c.bb, ['attack@atk_scale_1', 'atk_scale']);
  if (laterEffect) return null;
  if (/^攻击额外造成攻击力\d+(?:\.\d+)?%的法术伤害$/u.test(first) && arts !== undefined) return { extraArts: arts };
  const n = /^攻击时同时攻击(两|三|2|3)个目标$/u.exec(first);
  return n ? { targets: firstKey(c.bb, ['attack@max_target', 'max_target']) ?? COUNT[n[1]] } : null;
}
