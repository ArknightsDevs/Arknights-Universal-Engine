// A talent's parts beyond the always-on ones (docs/spec/operators.md 干员-17…干员-19): the operator's own modifiers while
// a condition holds, its 倍率 against some targets, and what its attacks' hits give their targets — as additions to its
// trait (职业-18, 职业-17, 职业-20) that the simulation merges into the trait (职业-24).
import { skills } from '@aue/sim';
import { selfClause, TAGS, powerOf } from './talents.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').WhileMods} WhileMods @typedef {import('@aue/sim').VsScale} VsScale */
/** @typedef {import('@aue/sim').TalentHit} TalentHit */

/** Text without its bracketed parts, the nested ones too (「（最多叠加6次（+1））」). @param {string} s @returns {string} */
const unbracket = (s) => (/（[^（）]*）/u.test(s) ? unbracket(s.replace(/（[^（）]*）/gu, '')) : s);
/** A talent's text as the readers take it: rich-text tags and bracketed potential differences removed. @param {Talent} c */
export const plainOf = (c) => unbracket((c.description ?? '').replace(/<[^>]*>/g, '')).replace(/[。；]+$/, '');
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
 * The conditions on the operator a clause may begin with (干员-17, 干员-24): the words, and the 职业-18 condition they are —
 * its number from the blackboard where it has one, else from the words; null when it needs a key the blackboard lacks.
 * In time (干员-24): 「N秒内没有主动攻击过」 and 「自身未进行攻击时」 (`idle`, `delay`), 「最近N秒内未受伤害时」 (`unhurt`, true from
 * the deployment on); 「身侧或身后存在高台时」 (`highSide`, `cnt`).
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
  [/^每次部署后击倒一名敌人之前[，,]?/u, () => ({ when: 'noKills' })],
  [/^(?:技能未开启时|未开启技能时)[，,]?/u, () => ({ when: 'notInSkill' })],
  [/^(?:被动技能(?:触发期间|持续时间内)|技能开启时|开启技能后)[，,]?/u, () => ({ when: 'inSkill' })],
  [/^部署后第(\d)次开启技能之前[，,]?/u, (m, bb) => ({ when: 'fewStarts', value: bb.cnt ?? Number(m[1]) })],
  [/^首次释放技能后后续技能期间/u, () => ({ when: 'laterSkill' })],
  [/^生命值(高于|低于)\d+(?:\.\d+)?%时[，,]?/u, (m, bb) => (has(bb, 'hp_ratio') ? { when: m[1] === '高于' ? 'hpAbove' : 'hpBelow', value: bb.hp_ratio } : null)],
  [/^(\d+(?:\.\d+)?)秒内没有主动攻击过[，,]?/u, (m, bb) => ({ when: 'idle', value: firstKey(bb, ['delay', 'attack@delay']) ?? Number(m[1]) })],
  [/^自身未进行攻击时[，,]?/u, (_m, bb) => (has(bb, 'delay') ? { when: 'idle', value: bb.delay } : null)],
  [/^最近(\d+(?:\.\d+)?)秒内未受到?伤害时[，,]?/u, (m, bb) => ({ when: 'unhurt', value: firstKey(bb, ['delay', 'interval']) ?? Number(m[1]), fresh: true })],
  [/^身侧或身后存在高台时[，,]?/u, (_m, bb) => ({ when: 'highSide', value: bb.cnt ?? 1 })],
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

/** @typedef {{ mods: Record<string, number>, flags?: Record<string, boolean> }} Gain */
/**
 * The clauses after a condition that are flags or whole-number changes (干员-17): 获得迷彩 (`camou`), 阻挡数降至0, 攻击间隔略微
 * 缩短 / 增大 (`base_attack_time`), 不容易成为敌人的目标 / 受到敌人（的）攻击 (`taunt_level`); 「每次受到攻击时对目标造成相当于
 * <name>攻击力N%的法术伤害」 (`atk_scale` as `counterArts`, 干员-25), 「攻击无视目标的物理闪避」 (`ignoreDodgePhys`, 干员-26).
 */
const STATE = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>) => Gain | null][]} */ ([
  [/^获得迷彩$/u, () => ({ mods: {}, flags: { camou: true } })],
  [/^阻挡数降至0$/u, () => ({ mods: { blockCntMul: 0 } })],
  [/^攻击间隔略微(?:缩短|增大)$/u, (bb) => (has(bb, 'base_attack_time') ? { mods: { batFlat: bb.base_attack_time } } : null)],
  [/^(?:自身)?不容易(?:成为敌人的目标|受到敌人的?攻击)$/u, (bb) => (has(bb, 'taunt_level') ? { mods: { taunt: bb.taunt_level } } : null)],
  [/^每次受到攻击时对(?:目标|攻击者)造成相当于\S+?攻击力\d+(?:\.\d+)?%的法术伤害$/u, (bb) => (has(bb, 'atk_scale') ? { mods: { counterArts: bb.atk_scale } } : null)],
  [/^攻击无视目标的物理闪避$/u, () => ({ mods: {}, flags: { ignoreDodgePhys: true } })],
]));

/**
 * What one clause after a condition gives (干员-17): a flag or whole change (STATE), what a 「改为」 one adds (insteadMods),
 * or the operator's own modifiers (condMods); null when it reads as none.
 * @param {string} rest @param {Record<string, number>} bb @returns {Gain | null}
 */
function gainOf(rest, bb) {
  const state = STATE.find(([re]) => re.test(rest));
  if (state) return state[1](bb);
  const mods = rest.startsWith('改为') ? insteadMods(rest.slice(2), bb) : condMods(rest, bb);
  return mods ? { mods } : null;
}

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
 * its part, the clauses after it (split at ，and 且) up to the next condition are about the operator itself (condMods),
 * a flag or a whole change (STATE) — or 「改为」 one, the part giving what it adds to the always-on one (insteadMods) —
 * and add to the part's modifiers and flags. Every clause from
 * the first condition on must read so, and no later sentence speak of an 效果. None when it has no condition; hidden
 * talents have none.
 * @param {Talent} c @returns {WhileMods[]}
 */
export function whileParts(c) {
  if (c.hidden || !c.description) return [];
  const { first, laterEffect } = firstOf(c), clauses = first.replace(/^首次释放技能后[，,]/u, '首次释放技能后').split(/，|且/u).map((x) => x.trim()).filter((x) => x);
  const start = clauses.findIndex((x) => condOf(x, c.bb) !== undefined);
  if (start < 0 || laterEffect) return [];
  /** @type {WhileMods[]} */
  const out = [];
  for (const clause of clauses.slice(start)) {
    const at = condOf(clause, c.bb);
    if (at === null) return [];
    if (at) out.push({ ...at.cond, mods: {} });
    const rest = at ? at.rest : clause, gain = rest ? gainOf(rest, c.bb) : { mods: {} };
    if (!gain) return [];
    const part = /** @type {WhileMods} */ (out.at(-1));
    out[out.length - 1] = { ...part, mods: { ...part.mods, ...gain.mods }, ...(gain.flags || part.flags ? { flags: { ...part.flags, ...gain.flags } } : {}) };
  }
  return out.every((x) => Object.keys(x.mods).length > 0 || x.flags) ? out : [];
}

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
  [/^攻击使目标中毒[，,]在\d+(?:\.\d+)?秒内每秒受到\d+点法术伤害$/u, (_m, bb) => (has(bb, 'poison_damage') && has(bb, 'duration') ? { dot: { amount: bb.poison_damage, seconds: bb.duration } } : null)],
  [/^攻击使目标在\d+(?:\.\d+)?秒内每秒受到\d+点法术伤害$/u, (_m, bb) => (has(bb, 'damage') && has(bb, 'duration') ? { dot: { amount: bb.damage, seconds: bb.duration } } : null)],
  [/^攻击使未被阻挡的敌人流血[，,]每秒受到相当于.+?攻击力\d+(?:\.\d+)?%的法术伤害[，,]持续\d+(?:\.\d+)?秒$/u,
    (_m, bb) => (has(bb, 'atk_scale') && has(bb, 'duration') ? { dot: { scale: bb.atk_scale, seconds: bb.duration }, when: 'unblocked' } : null)],
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
 * `attack@atk_scale_1` or `atk_scale`, 职业-20), 「攻击时同时攻击两个目标」 (two targets, 职业-3), 「攻击溅射范围内有大于或等于N个
 * 敌人时，使当次攻击造成的伤害提升至M%」 (`packed`: `min_target_cnt`, `damage_scale`, 职业-17) — as its whole first sentence.
 * Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {{ extraArts?: number, targets?: number, packed?: { cnt: number, atk: number } } | null}
 */
export function attackPart(c) {
  if (c.hidden || !c.description) return null;
  const { first, laterEffect } = firstOf(c), arts = firstKey(c.bb, ['attack@atk_scale_1', 'atk_scale']);
  if (laterEffect) return null;
  if (/^攻击额外造成攻击力\d+(?:\.\d+)?%的法术伤害$/u.test(first) && arts !== undefined) return { extraArts: arts };
  const n = /^攻击时同时攻击(两|三|2|3)个目标$/u.exec(first);
  if (n) return { targets: firstKey(c.bb, ['attack@max_target', 'max_target']) ?? COUNT[n[1]] };
  const packed = /^攻击溅射范围内有大于或等于\d+个敌人时[，,]使当次攻击造成的伤害提升至\d+(?:\.\d+)?%$/u.test(first);
  return packed && has(c.bb, 'min_target_cnt') && has(c.bb, 'damage_scale') ? { packed: { cnt: c.bb.min_target_cnt, atk: c.bb.damage_scale } } : null;
}

/** The attribute words of a step or an aura (干员-20, 干员-22), the blackboard key and the modifier without % and with %. */
const STEP_WORDS = Object.freeze(/** @type {Record<string, [string, string | null, string | null]>} */ ({
  攻击力: ['atk', 'atkFlat', 'atkPct'], 防御力: ['def', 'defFlat', 'defPct'], 生命上限: ['max_hp', 'hpFlat', 'hpPct'], 最大生命值: ['max_hp', 'hpFlat', 'hpPct'],
  攻击速度: ['attack_speed', 'aspd', null], 攻速: ['attack_speed', 'aspd', null],
}));
const STEP_ATTR = Object.keys(STEP_WORDS).sort((a, b) => b.length - a.length).join('|');
const STEP_FORWARD = new RegExp(`^(?:自身的?)?(${STEP_ATTR})(?:提高|提升|[+＋])\\d+(?:\\.\\d+)?(%)?$`, 'u');
const STEP_BACK = new RegExp(`^(?:获得)?[+＋]\\d+(?:\\.\\d+)?(%)?(${STEP_ATTR})$`, 'u');

/**
 * One attribute clause as a modifier (干员-20, 干员-22): 「（自身（的））属性提高/提升/+N（%）」 or 「（获得）+N（%）属性」 — a
 * number without % is 直接加算 on the attribute itself (生命上限 +50: `hpFlat`), with % a share (直接乘算); its value from
 * the blackboard key of the attribute; null for another clause or without the key.
 * @param {string} s @param {Record<string, number>} bb @returns {Record<string, number> | null}
 */
function stepMods(s, bb) {
  const f = STEP_FORWARD.exec(s), r = f ? null : STEP_BACK.exec(s), word = f ? f[1] : r?.[2], pct = f ? f[2] : r?.[1];
  const w = word ? STEP_WORDS[word] : null, mod = w ? w[pct ? 2 : 1] : null;
  return w && mod && has(bb, w[0]) ? { [mod]: bb[w[0]] } : null;
}

/** Clauses split at ，as one set of modifiers (stepMods, or condMods for the others); null when one reads as none. @param {string} s @param {Record<string, number>} bb */
function clausesMods(s, bb) {
  const parts = s.split(/[，,]/u).map((x) => x.trim()).map((x) => stepMods(x, bb) ?? condMods(x, bb));
  return parts.every((p) => p !== null) ? Object.assign({}, ...parts) : null;
}

/** @typedef {import('@aue/sim').TalentStack} TalentStack */
/**
 * The stacking talents' sentences (干员-20) and what each gives: on whose kills or damage, the modifiers a step, the most
 * steps, a step every so many, the seconds the steps last.
 */
const STACKS = Object.freeze(/** @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>) => TalentStack | null][]} */ ([
  [/^每击杀一[名个]敌人后?[，,]?(.+?)(?:[，,]最多(?:可以|可)?叠加\d+[次层])?$/u, (m, bb) => {
    const mods = stepMods(m[1], bb);
    return mods && has(bb, 'max_stack_cnt') ? { on: 'kill', mods, max: bb.max_stack_cnt } : null;
  }],
  [/^.+?与"[^"]+"击杀一名敌人时[，,].+?获得\d+(?:\.\d+)?%攻击力[，,]最多可?叠加\d+层$/u,
    (_m, bb) => (has(bb, 'atk') && has(bb, 'max_stack_cnt') ? { on: 'kill', summons: true, mods: { atkPct: bb.atk }, max: bb.max_stack_cnt } : null)],
  [/^击杀\d+个敌人后获得攻击速度[+＋]\d+和抵抗$/u, (_m, bb) => (['times', 'attack_speed', 'one_minus_status_resistance'].every((k) => has(bb, k))
    ? { on: 'kill', every: bb.times, max: 1, mods: { aspd: bb.attack_speed, statusResFlat: bb.one_minus_status_resistance } } : null)],
  [/^累计造成\d+次物理伤害后[，,](.+)$/u, (m, bb) => {
    const mods = clausesMods(m[1], bb);
    return mods && has(bb, 'count') ? { on: 'dealt', phys: true, every: bb.count, max: 1, mods } : null;
  }],
  [/^造成\d+次伤害后[，,](.+)$/u, (m, bb) => {
    const mods = clausesMods(m[1], bb);
    return mods && has(bb, 'trigger_damage_count') ? { on: 'dealt', every: bb.trigger_damage_count, max: 1, mods } : null;
  }],
  [/^每次造成伤害使自身\d+(?:\.\d+)?秒内(.+?)[，,]最多可?叠加\d+层$/u, (m, bb) => {
    const mods = clausesMods(m[1], bb);
    return mods && has(bb, 'duration') && has(bb, 'max_stack_cnt') ? { on: 'dealt', seconds: bb.duration, max: bb.max_stack_cnt, mods } : null;
  }],
]));

/**
 * The stacking part of a talent (干员-20): its first sentence is one of STACKS with the keys it needs, no later sentence
 * speaking of an 效果. Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {TalentStack | null}
 */
export function stackPart(c) {
  if (c.hidden || !c.description) return null;
  const { first, laterEffect } = firstOf(c);
  if (laterEffect) return null;
  for (const [re, make] of STACKS) {
    const m = re.exec(first);
    if (m) return make(m, c.bb);
  }
  return null;
}

/** @typedef {import('@aue/sim').TalentSp} TalentSp */
/**
 * The blackboard's value for a number of SP a description gives (干员-21): a key `sp` (or ending in `.sp`) with that value.
 * @param {Record<string, number>} bb @param {string} n
 */
const spOf = (bb, n) => Object.entries(bb).find(([k, v]) => /(?:^|[.\]])sp$/u.test(k) && v === Number(n))?.[1];

/** The SP talents' sentences (干员-21) and what each gives. */
const SPS = Object.freeze(/** @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>) => TalentSp[] | null][]} */ ([
  [/^攻击敌人时额外回复(\d+)点技力[，,]消灭敌人后额外获得(\d+)点技力$/u, (m, bb) => {
    const a = spOf(bb, m[1]), k = spOf(bb, m[2]);
    return a !== undefined && k !== undefined ? [{ on: 'attack', sp: a }, { on: 'kill', sp: k }] : null;
  }],
  [/^(?:每次回复友方单位生命值时额外回复该单位|治疗目标时使其获得[+＋]?)(\d+)点?技力$/u, (m, bb) => {
    const sp = spOf(bb, m[1]);
    return sp !== undefined ? [{ on: 'heal', sp }] : null;
  }],
  [/^攻击范围内有敌人倒下时[，,]为自身和范围内随机一名友方单位回复(\d+)点技力$/u, (m, bb) => {
    const sp = spOf(bb, m[1]);
    return sp !== undefined ? [{ on: 'enemyDown', sp, other: sp }] : null;
  }],
  [/^攻击范围内的友方干员被击倒时获得(\d+)点技力$/u, (m, bb) => {
    const sp = spOf(bb, m[1]);
    return sp !== undefined ? [{ on: 'allyDown', sp }] : null;
  }],
  [/^受到攻击时[，,]回复自己和周围一格内随机一名友方角色(\d+)点技力$/u, (m, bb) => {
    const sp = spOf(bb, m[1]);
    return sp !== undefined ? [{ on: 'attacked', sp, other: sp }] : null;
  }],
  [/^技能结束后[，,]\d+%几率立即回复\d+%的最大技力$/u, (_m, bb) => (has(bb, 'prob') && has(bb, 'sp') ? [{ on: 'skillEnd', prob: bb.prob, share: bb.sp }] : null)],
  [/^技能期间每击倒1名敌人[，,]技能结束时获得\d+点技力[，,]至多回复\d+点$/u, (_m, bb) => (has(bb, 'sp') && has(bb, 'max_sp') ? [{ on: 'skillKills', sp: bb.sp, max: bb.max_sp }] : null)],
  [/^技能结束时恢复自身\d+(?:\.\d+)?%最大生命值$/u, (_m, bb) => (has(bb, 'hp_ratio') ? [{ on: 'skillEnd', heal: bb.hp_ratio }] : null)],
  [/^造成伤害时有\d+(?:\.\d+)?%的几率额外回复(\d+)点技力$/u, (m, bb) => {
    const sp = spOf(bb, m[1]);
    return sp !== undefined && has(bb, 'prob') ? [{ on: 'dealt', prob: bb.prob, sp }] : null;
  }],
  [/^每场战斗中首次释放技能结束后立即回复(\d+)点技力$/u, (m, bb) => {
    const sp = spOf(bb, m[1]);
    return sp !== undefined ? [{ on: 'firstSkillEnd', sp }] : null;
  }],
]));

/**
 * The SP parts of a talent (干员-21): its first sentence is one of SPS with the keys it needs, no later sentence speaking
 * of an 效果. None otherwise; hidden talents have none.
 * @param {Talent} c @returns {TalentSp[]}
 */
export function spParts(c) {
  if (c.hidden || !c.description) return [];
  const { first, laterEffect } = firstOf(c);
  if (laterEffect) return [];
  for (const [re, make] of SPS) {
    const m = re.exec(first);
    if (m) return make(m, c.bb) ?? [];
  }
  return [];
}

/** A 坚忍's attributes (干员-23): the blackboard key of each attribute's most and its modifier. */
const GRIT = Object.freeze(/** @type {[string, string][]} */ ([['min_atk', 'atkPct'], ['min_attack_speed', 'aspd'], ['min_def', 'defPct']]));

/**
 * The 坚忍 of a talent (干员-23): its first sentence 「在场时，自身获得……的坚忍」 (the bracketed 「损失N%生命值时达到最大加成」
 * removed with the potential differences), the blackboard having `min_hp_ratio` and at least one of `min_atk`,
 * `min_attack_speed`, `min_def`: the modifiers at the most, reached at `1 − min_hp_ratio` of the maximum HP lost. Null
 * otherwise; hidden talents have none.
 * @param {Talent} c @returns {{ mods: Record<string, number>, full: number } | null}
 */
export function gritPart(c) {
  if (c.hidden || !c.description || !has(c.bb, 'min_hp_ratio') || !/^在场时[，,]?自身获得.+的坚忍$/u.test(firstOf(c).first)) return null;
  const mods = Object.fromEntries(GRIT.filter(([k]) => has(c.bb, k)).map(([k, mod]) => [mod, c.bb[k]]));
  return Object.keys(mods).length ? { mods, full: 1 - c.bb.min_hp_ratio } : null;
}

/** @typedef {import('@aue/sim').RangeTalent} RangeTalent @typedef {import('@aue/sim').ModuleAura} ModuleAura */
/** 庇护 of a share (干员-22): the physical and arts damage taken × (1 − it). @param {number} v */
const shelter = (v) => ({ physTakenMul: 1 - v, artsTakenMul: 1 - v });
/** What an in-range effect gives (干员-22): 脆弱, 【法术脆弱】 (`damage_scale`), 庇护 (`damage_resistance`); null without the key. @param {string} word @param {Record<string, number>} bb */
function effectMods(word, bb) {
  if (word === '庇护') return has(bb, 'damage_resistance') ? shelter(bb.damage_resistance) : null;
  if (!has(bb, 'damage_scale')) return null;
  return word === '脆弱' ? { dmgTakenMul: bb.damage_scale } : { artsTakenMul: bb.damage_scale };
}

/** The in-range talents with a condition on the unit (干员-22) and what each gives. */
const RANGED = Object.freeze(/** @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>) => RangeTalent | null][]} */ ([
  [/^攻击范围内的(敌人|友军)生命值?(少于|低于|大于|高于)\d+%时[，,](?:令|使)其获得\d+(?:\.\d+)?%的(脆弱|庇护)(?:效果)?$/u, (m, bb) => {
    const mods = effectMods(m[3], bb), below = m[2] === '少于' || m[2] === '低于';
    return mods && has(bb, 'hp_ratio') ? { side: m[1] === '敌人' ? 'enemy' : 'ally', ranged: false, mods, when: { when: below ? 'hpBelow' : 'hpAbove', value: bb.hp_ratio } } : null;
  }],
  [/^攻击范围内被阻挡的敌人获得\d+(?:\.\d+)?%的(脆弱|【法术脆弱】)效果$/u, (m, bb) => {
    const mods = effectMods(m[1], bb);
    return mods ? { side: 'enemy', ranged: false, mods, when: { when: 'blocked' } } : null;
  }],
  [/^攻击范围内的非精英和领袖敌人获得\d+(?:\.\d+)?%的(脆弱|【法术脆弱】)效果$/u, (m, bb) => {
    const mods = effectMods(m[1], bb);
    return mods ? { side: 'enemy', ranged: false, mods, when: { when: 'normal' } } : null;
  }],
  [/^攻击范围内的所有空中单位获得\d+(?:\.\d+)?%的(脆弱|【法术脆弱】)效果$/u, (m, bb) => {
    const mods = effectMods(m[1], bb);
    return mods ? { side: 'enemy', ranged: false, mods, when: { when: 'flying' } } : null;
  }],
  [/^攻击范围内敌人的物理和法术命中率降低\d+(?:\.\d+)?%$/u, (_m, bb) => (has(bb, 'damage_hitrate_physical') && bb.damage_hitrate_physical === bb.damage_hitrate_magical
    ? { side: 'enemy', ranged: false, mods: { hitRateMul: 1 + bb.damage_hitrate_physical } } : null)],
  [/^攻击范围内的友方干员受到的治疗效果提升\d+(?:\.\d+)?%$/u, (_m, bb) => (has(bb, 'heal_scale') ? { side: 'ally', ranged: false, mods: { healingTakenMul: bb.heal_scale } } : null)],
]));

/** The tiles of 周围8格 and 周围四格 / 相邻四格 around an operator, its own included (干员-8: x-4, x-5). */
const AROUND = Object.freeze(/** @type {Record<string, { row: number, col: number }[]>} */ ({
  8: [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col }))),
  4: [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: -1, col: 0 }, { row: 0, col: 1 }, { row: 0, col: -1 }],
}));
/** Who an aura around the operator is for (干员-22): the words and the record field it asks. @type {Record<string, Partial<RangeTalent>>} */
const AROUND_WHO = Object.freeze({ 近战友方单位: { melee: true }, 高台干员: { ranged: true }, '【术师】干员': { profession: 'CASTER' }, 友方干员: {}, 友方单位: {}, 干员: {} });
/** The sentence of an aura around the operator (干员-22): (在场时 / 部署后，) the operator itself too (its name before 自身), 周围/相邻 8 or 4 tiles, whom, what. */
const AROUND_SENTENCE = /^(?:在场时|部署后[，,])?(?:[^，,]{0,8}?自身[与和及])?(?:周围|相邻)(八|8|四|4)格内?的?(近战友方单位|高台干员|【术师】干员|友方干员|友方单位|干员)(.+)$/u;

/**
 * What an aura around the operator gives that is not an attribute (干员-22, 干员-26): 物理闪避 (`prob`), 对空庇护 (the
 * physical and arts damage from flying units × (1 − `damage_resistance`)); null for another.
 * @param {string} what @param {Record<string, number>} bb @returns {Record<string, number> | null}
 */
function aroundEffect(what, bb) {
  if (/^\d+(?:\.\d+)?%的物理闪避$/u.test(what)) return has(bb, 'prob') ? { dodgePhys: bb.prob } : null;
  return /^\d+(?:\.\d+)?%的对空庇护$/u.test(what) && has(bb, 'damage_resistance') ? { airTakenMul: 1 - bb.damage_resistance } : null;
}

/**
 * An aura around the operator (干员-22) from its sentence: the tiles of the talent's range (its id, else 周围8格 / 四格),
 * whom it is for, its modifiers — an attribute (stepMods), 物理闪避 or 对空庇护 (aroundEffect); null otherwise.
 * @param {string} first @param {Talent} c @param {Record<string, { row: number, col: number }[]>} ranges @returns {RangeTalent | null}
 */
function aroundPart(first, c, ranges) {
  const m = AROUND_SENTENCE.exec(first), what = m ? m[3].replace(/^获得/u, '') : '';
  if (!m) return null;
  const mods = aroundEffect(what, c.bb) ?? stepMods(what, c.bb);
  const area = (c.rangeId ? ranges[c.rangeId] : null) ?? AROUND[m[1] === '八' || m[1] === '8' ? 8 : 4];
  return mods ? { side: 'ally', ranged: false, mods, area, ...AROUND_WHO[m[2]] } : null;
}

/** The auras on enemies blocked (干员-22): by the operator itself, or by any unit while it is on the field. */
const BLOCKED = Object.freeze(/** @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>) => ModuleAura | null][]} */ ([
  [/^自身阻挡的敌人(?:攻击速度|攻速)[-－]\d+$/u, (_m, bb) => (has(bb, 'attack_speed') ? { to: 'blocked', mods: { aspd: bb.attack_speed } } : null)],
  [/^在场时[，,]?所有被阻挡的敌(?:人|方单位)受到的?(物理|法术)伤害(?:时伤害)?(?:提升|提高)\d+(?:\.\d+)?%$/u,
    (m, bb) => (has(bb, 'damage_scale') ? { to: 'blockedAll', mods: { [m[1] === '物理' ? 'physTakenMul' : 'artsTakenMul']: bb.damage_scale } } : null)],
]));

/**
 * The aura parts of a talent (干员-22): its first sentence — after the clauses about the operator itself that lead it
 * (干员-6, and 「但」) — an in-range one with a condition on the unit (RANGED), one around the operator (aroundPart), or
 * one on blocked enemies (BLOCKED); no later sentence speaking of an 效果. Hidden talents have none.
 * @param {Talent} c @param {Record<string, { row: number, col: number }[]>} ranges the range table (干员-8)
 * @returns {{ range: RangeTalent[], auras: ModuleAura[] }}
 */
export function auraParts(c, ranges) {
  const none = { range: [], auras: [] };
  if (c.hidden || !c.description) return none;
  const { first, laterEffect } = firstOf(c), clauses = first.split('，');
  if (laterEffect) return none;
  const lead = clauses.findIndex((x) => !selfClause(x, c.bb)), rest = clauses.slice(Math.max(0, lead)).join('，').replace(/^但/u, '');
  for (const [re, make] of RANGED) {
    const m = re.exec(rest), got = m ? make(m, c.bb) : null;
    if (got) return { range: [got], auras: [] };
  }
  const around = lead === 0 ? aroundPart(first, c, ranges) : null;
  if (around) return { range: [around], auras: [] };
  for (const [re, make] of BLOCKED) {
    const m = lead === 0 ? re.exec(first) : null, got = m ? make(m, c.bb) : null;
    if (got) return { range: [], auras: [got] };
  }
  return none;
}

/**
 * The steps by the enemies in range of a talent (干员-17): 「攻击范围内每有一个敌人，」 then an attribute clause (stepMods),
 * the most steps the blackboard's `max_valid_stack_cnt` (or `max_stack_cnt`) — as a conditional part `enemies` whose
 * modifiers are × the enemies in the operator's own attack range, at most that many (`per`). None otherwise; hidden
 * talents have none.
 * @param {Talent} c @returns {WhileMods[]}
 */
export function perParts(c) {
  if (c.hidden || !c.description) return [];
  const { first, laterEffect } = firstOf(c), m = /^攻击范围内每有一个敌人[，,](.+)$/u.exec(first);
  const mods = m && !laterEffect ? stepMods(m[1], c.bb) : null, max = firstKey(c.bb, ['max_valid_stack_cnt', 'max_stack_cnt']);
  return mods && max !== undefined ? [{ when: 'enemies', value: 1, per: max, mods }] : [];
}

/** @typedef {import('@aue/sim').TraitDef} TraitDef */
/** A blackboard value by the end of its key (`etlchi_t_2[heal].hp_ratio`), the first key that ends so. @param {Record<string, number>} bb @param {string} end */
export const byEnd = (bb, end) => Object.entries(bb).find(([k]) => k === end || k.endsWith(end))?.[1];
/** Whether every value is a number. @param {(number | undefined)[]} vs @returns {vs is number[]} */
export const all = (vs) => vs.every((v) => Number.isFinite(v));

/**
 * The talents in time (干员-24), whole descriptions, and what each adds to the trait: a next attack after `delay` seconds
 * without attacking (冰酿, 乌有; 图耶's heal) or after a dodge (因陀罗, 焰尾), 隐匿 while not attacking (狮蝎), a dodge
 * after a while without being hit (蒂比), the 倍率 by the time since the last attack (白金), a 屏障 after a while without
 * attacking (信仰搅拌机).
 */
const TIME = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>) => Partial<TraitDef> | null][]} */ ([
  [/^如果\d+(?:\.\d+)?秒内没有主动攻击过[，,]下次攻击造成相当于攻击力\d+(?:\.\d+)?%的物理伤害$/u, (bb) => {
    const delay = firstKey(bb, ['attack@delay', 'delay']);
    return all([delay, bb.atk_scale]) ? { nextAttack: [{ when: 'idle', value: /** @type {number} */ (delay), scale: bb.atk_scale }] } : null;
  }],
  [/^如果\d+(?:\.\d+)?秒内没有主动攻击过[，,]下一次攻击的攻击力提升至\d+(?:\.\d+)?%并晕眩目标\d+(?:\.\d+)?秒$/u,
    (bb) => (all([bb.delay, bb.atk_scale, bb.stun]) ? { nextAttack: [{ when: 'idle', value: bb.delay, scale: bb.atk_scale, stun: bb.stun }] } : null)],
  [/^\d+(?:\.\d+)?秒内未进行治疗后[，,]下次治疗时的治疗量提升至攻击力的\d+(?:\.\d+)?%$/u,
    (bb) => (all([bb.delay, bb.heal_scale_2]) ? { nextAttack: [{ when: 'idle', value: bb.delay, scale: bb.heal_scale_2 }] } : null)],
  [/^平时处于隐匿状态[，,]攻击时会解除隐匿状态[，,]且当次攻击的攻击力[+＋]\d+(?:\.\d+)?%。停止攻击\d+(?:\.\d+)?秒后[，,]重新进入隐匿状态$/u, (bb) => (all([bb.delay, bb.atk])
    ? { whiles: [{ when: 'idle', value: bb.delay, fresh: true, mods: {}, flags: { stealth: true } }], nextAttack: [{ when: 'idle', value: bb.delay, fresh: true, atk: bb.atk }] } : null)],
  [/^若最近\d+(?:\.\d+)?秒内未受攻击[，,]闪避下一次物理或法术攻击$/u,
    (bb) => (all([bb.stack_time, bb.prob]) ? { whiles: [{ when: 'calm', value: bb.stack_time, mods: { dodgePhys: bb.prob, dodgeArts: bb.prob } }] } : null)],
  [/^距离上次攻击的间隔越长[，,]下次攻击的攻击力就越高$/u, (bb) => {
    const [min, max, low, top] = ['attack@min_delta', 'attack@max_delta', 'attack@min_atk_scale', 'attack@max_atk_scale'].map((k) => bb[k]);
    return all([min, max, low, top]) && low === 1 && max > min ? { rhythm: { min, max, top } } : null;
  }],
  [/^若\d+(?:\.\d+)?秒内未主动攻击[，,]获得相当于生命上限\d+(?:\.\d+)?%的屏障[，,]失去屏障后重新计时$/u,
    (bb) => (all([bb.interval, bb.shield]) ? { idleShield: { value: bb.interval, share: bb.shield } } : null)],
  [/^有\d+(?:\.\d+)?%的概率闪避敌人的近战物理攻击[，,]成功闪避后自己的下一次攻击攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb) => {
    const prob = byEnd(bb, 'prob'), atk = byEnd(bb, '.atk');
    return all([prob, atk]) ? { whiles: [{ when: 'always', mods: { dodgeMelee: /** @type {number} */ (prob) } }], nextAttack: [{ when: 'dodged', atk: /** @type {number} */ (atk) }] } : null;
  }],
  [/^触发闪避时[，,]下次攻击变为二连击并攻击所有阻挡的敌人$/u, () => ({ nextAttack: [{ when: 'dodged', times: 2, blocked: true }] })],
  [/^触发闪避时[，,]下次攻击攻击力提升至\d+(?:\.\d+)?[%％]并变为二连击[，,]且攻击所有阻挡的敌人$/u,
    (bb) => (has(bb, 'atk_scale') ? { nextAttack: [{ when: 'dodged', scale: bb.atk_scale, times: 2, blocked: true }] } : null)],
]));

/**
 * The talents on life (干员-25), whole descriptions, and what each adds to the trait: a second life (号角), a heal once
 * the HP is low (隐德来希), a last stand (史尔特尔), a heal bought with cost (琳琅诗怀雅), 寒冷 on whoever hurts it and a frozen
 * life (圣聆初雪), a heal on every hit taken (乌尔比安), 护盾 layers (泥岩), true damage returned for its faction (玛恩纳).
 */
const LIFE = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray) => Partial<TraitDef> | null][]} */ ([
  [/^被击倒时不撤退[，,]恢复所有生命且生命上限[-－]\d+(?:\.\d+)?%[，,]攻击速度[+＋]\d+、防御力[+＋]\d+(?:\.\d+)?%$/u, (bb) => (all([bb.max_hp, bb.hp_ratio, bb.attack_speed, bb.def])
    ? { secondLife: { hp: bb.hp_ratio, mods: { hpMul: 1 - bb.max_hp, aspd: bb.attack_speed, defPct: bb.def } } } : null)],
  [/^生命值低于\d+(?:\.\d+)?%时[，,]仅一次立刻回复\d+(?:\.\d+)?%最大生命值[，,]且自身之后受到的物理伤害降低\d+(?:\.\d+)?%$/u, (bb) => {
    const heal = byEnd(bb, '[heal].hp_ratio');
    return all([bb.hp_ratio, heal, bb.damage_resistance]) ? { lowHp: { below: bb.hp_ratio, heal: /** @type {number} */ (heal), mods: { physTakenMul: 1 - bb.damage_resistance } } } : null;
  }],
  [/^受到致命伤害时持续使生命值不低于1[，,]\d+(?:\.\d+)?秒后强制退出战场$/u, (bb) => {
    const seconds = byEnd(bb, 'interval');
    return seconds !== undefined && Number.isFinite(seconds) ? { lastStand: { seconds } } : null;
  }],
  [/^受到致命伤害时[，,]若费用足够则消耗\d+点部署费用使生命恢复到\d+(?:\.\d+)?%[，,]每次触发该天赋时消耗的费用翻倍$/u,
    (bb) => (all([bb.cost, bb.hp_ratio, bb.cost_multi]) ? { costLife: { cost: Math.abs(bb.cost), hp: bb.hp_ratio, mul: bb.cost_multi } } : null)],
  [/^受到伤害时使敌人寒冷\d+(?:\.\d+)?秒[，,]若受到致命伤害[，,]仅一次立刻回复所有生命值并使自身冻结\d+(?:\.\d+)?秒[，,]使攻击范围内所有敌方单位冻结\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.cold, bb.hp_ratio, bb.freeze, bb.c2e_freeze])
    ? { hurt: { status: { key: 'cold', seconds: bb.cold } }, frostLife: { hp: bb.hp_ratio, self: bb.freeze, foes: bb.c2e_freeze } } : null)],
  [/^每次受到伤害时[，,]治疗自身\d+点生命值；生命值低于\d+(?:\.\d+)?%时[，,]治疗效果提升至\d+点生命值$/u,
    (bb) => (all([bb.value1, bb.value2, bb.hp_ratio]) ? { hurt: { heal: { low: bb.value1, high: bb.value2, below: bb.hp_ratio } } } : null)],
  [/^每\d+(?:\.\d+)?秒获得1层护盾[，,]每层护盾破裂时恢复自身\d+(?:\.\d+)?%最大生命$/u, (bb) => (all([bb.interval, bb.max_times, bb.times, bb.hp_ratio])
    ? { layers: { every: bb.interval, max: bb.max_times, init: bb.times, heal: bb.hp_ratio } } : null)],
  [/^在场时[，,]自身更容易受到攻击[，,]所有(\S+?)干员被攻击时反弹相当于\S+?攻击力\d+(?:\.\d+)?%的真实伤害$/u, (bb, m) => {
    const power = powerOf(m[1]);
    return power && all([bb.taunt_level, bb.atk_scale]) ? { whiles: [{ when: 'always', mods: { taunt: bb.taunt_level } }], reflect: { power, scale: bb.atk_scale } } : null;
  }],
]));

/** The statuses a talent on the enemies names (干员-27), by its word. */
const FOE_STATUS = Object.freeze(/** @type {Record<string, string>} */ ({ 晕眩: 'stun', 沉睡: 'sleep', 停顿: 'sluggish', 束缚: 'root' }));

/**
 * The talents on the enemies they meet (干员-27): a whole description, the blackboard keys it needs, and what it adds to
 * the trait (职业-28) — target 倍率 (`vs`), preferred targets (`prefer`), sleeping enemies attacked (`hurtSleeping`) and
 * hurt every second (`sleepDot`), arts damage on an attack's weakest targets (`lowestArts`).
 */
const FOES = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray) => Partial<TraitDef> | null][]} */ ([
  [/^优先攻击(晕眩)的敌人且攻击\1敌人时攻击力提升至\d+(?:\.\d+)?%$/u, (bb, m) => (all([bb.atk_scale])
    ? { prefer: [{ status: FOE_STATUS[m[1]] }], vs: [{ when: 'status', status: FOE_STATUS[m[1]], atk: bb.atk_scale }] } : null)],
  [/^自身可以攻击并优先攻击沉睡的目标且攻击力提升至\d+(?:\.\d+)?%$/u, (bb) => (all([bb.atk_scale])
    ? { hurtSleeping: true, prefer: [{ status: 'sleep' }], vs: [{ when: 'status', status: 'sleep', atk: bb.atk_scale }] } : null)],
  [/^自身可以攻击沉睡的敌人$/u, () => ({ hurtSleeping: true })],
  [/^自身可以攻击沉睡的敌人[，,]并且攻击沉睡敌人时无视其防御力的\d+(?:\.\d+)?%$/u, (bb) => (all([bb.def_penetrate])
    ? { hurtSleeping: true, vs: [{ when: 'status', status: 'sleep', defPct: bb.def_penetrate }] } : null)],
  [/^优先攻击【([^】]+)】单位[，,]且攻击【\1】时攻击力(?:提升至|[+＋])\d+(?:\.\d+)?%$/u, (bb, m) => (Object.hasOwn(TAGS, m[1]) && all([bb.atk_scale])
    ? { prefer: [{ tag: TAGS[m[1]] }], vs: [{ when: 'tag', tag: TAGS[m[1]], atk: bb.atk_scale }] } : null)],
  [/^攻击处于(停顿)、(束缚)的敌人时[，,]额外造成相当于攻击力\d+(?:\.\d+)?%的法术伤害$/u, (bb, m) => (all([bb.atk_scale])
    ? { vs: [{ when: 'statusAny', statuses: [FOE_STATUS[m[1]], FOE_STATUS[m[2]]], on: 'damage', arts: bb.atk_scale, later: true }] } : null)],
  [/^自身可以攻击沉睡的敌人[，,]且攻击非移动敌人时对其额外造成相当于攻击力\d+(?:\.\d+)?%的法术伤害[，,]在场时沉睡中的敌人每秒受到\S+?攻击力\d+(?:\.\d+)?%的法术伤害$/u,
    (bb) => (all([bb.extra_atk_scale, bb.damage_atk_scale])
      ? { hurtSleeping: true, vs: [{ when: 'still', on: 'damage', arts: bb.extra_atk_scale }], sleepDot: bb.damage_atk_scale } : null)],
  [/^治疗处于异常状态中的友方干员时治疗量提升至\d+(?:\.\d+)?%$/u, (bb) => (all([bb.heal_scale_up]) ? { vs: [{ when: 'abnormal', heal: bb.heal_scale_up }] } : null)],
  [/^攻击命中生命值为满的敌人时攻击力提升至\d+(?:\.\d+)?%[，,]并额外回复\d+点技力$/u, (bb) => (all([bb.atk_scale, bb.sp])
    ? { vs: [{ when: 'hpFull', on: 'attack', atk: bb.atk_scale, sp: bb.sp }] } : null)],
  [/^攻击命中生命值在\d+(?:\.\d+)?%以上的敌人时[，,]\d+(?:\.\d+)?秒内\S+?对其造成的伤害提升\d+(?:\.\d+)?%$/u, (bb) => {
    const dmg = byEnd(bb, '[enhance].damage_scale'), seconds = byEnd(bb, '[enhance].duration');
    return all([bb.hp_ratio, dmg, seconds]) ? { vs: [{ when: 'hpAbove', value: bb.hp_ratio, on: 'attack', mark: { seconds: /** @type {number} */ (seconds), dmg } }] } : null;
  }],
  [/^对每个敌人造成首次伤害后[，,]\d+(?:\.\d+)?秒内\S+?对该敌人造成伤害时额外造成攻击力\d+(?:\.\d+)?%的法术伤害$/u, (bb) => (all([bb.atk_scale, bb.interval])
    ? { vs: [{ when: 'first', seen: 'damage', on: 'damage', mark: { seconds: bb.interval, arts: bb.atk_scale } }] } : null)],
  [/^对每个敌人首次进行攻击时攻击力提升至\d+(?:\.\d+)?%[，,]并使目标浮空\d+(?:\.\d+)?秒$/u, (bb) => (all([bb.damage_scale, bb.levitate_duration])
    ? { vs: [{ when: 'first', seen: 'attack', on: 'attack', dmg: bb.damage_scale, inflict: { key: 'levitate', seconds: bb.levitate_duration } }] } : null)],
  [/^对每个敌人首次造成伤害后[，,]使目标束缚\d+(?:\.\d+)?秒并偷取其\d+点攻击力$/u, (bb) => (all([bb.duration, bb.steal_atk])
    ? { vs: [{ when: 'first', seen: 'damage', on: 'damage', inflict: { key: 'root', seconds: bb.duration }, steal: { atk: bb.steal_atk, max: bb.steal_atk_max ?? 200 * bb.steal_atk } }] } : null)],
  [/^攻击时对攻击目标中生命值最少的(?:(\d+)名)?敌人额外造成相当于攻击力\d+(?:\.\d+)?%的法术伤害$/u, (bb, m) => {
    const scale = byEnd(bb, '.atk_scale') ?? bb.atk_scale, n = bb['attack@max_target'] ?? (m[1] ? Number(m[1]) : 1);
    return all([scale, n]) ? { lowestArts: { scale: /** @type {number} */ (scale), n } } : null;
  }],
]));

/** An element's word in a talent (干员-28): 神经, 侵蚀, 灼燃, 凋亡, 狂躁. */
const EL_WORD = '(神经|侵蚀|灼燃|凋亡|狂躁)';
/** A number in a talent's text. */
const NUM = '\\d+(?:\\.\\d+)?';
/** A whole description of the talents on elements (干员-28), its words (EL_WORD, NUM) filled in. @param {string} src */
const elText = (src) => new RegExp(`^${src.replaceAll('<EL>', EL_WORD).replaceAll('<N>', NUM)}$`, 'u');
/** The element of a word (干员-28). @param {string} w */
const elOf = (w) => ELEMENT_WORD[w];
/** 1 − a share, without the float's tail (干员-28). @param {number} v */
const less = (v) => Math.round((1 - v) * 1e9) / 1e9;

/**
 * The talents on elements (干员-28): a whole description, the blackboard keys it needs, and what it adds to the trait
 * (职业-29) — answers to bursts (`burstOn`), steps for bursts (`stacks`), elemental damage while a burst lasts and
 * 元素损伤 over time (`vs`), pulses each second (`pulses`), 麻痹 cutting an attack (`palsyHit`), element values restored
 * on hits (`epOnHit`), heals over time (`healDot`), conditional parts (`whiles`) — or its in-range part (`range`).
 */
const ELEMS = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray) => { trait?: Partial<TraitDef>, range?: RangeTalent[] } | null][]} */ ([
  [elText('攻击范围内的敌人<EL>损伤爆发开始时立即受到相当于攻击力<N>%的元素伤害'), (bb, m) => (all([bb.ep_damage_scale])
    ? { trait: { burstOn: [{ el: elOf(m[1]), where: 'range', dmg: bb.ep_damage_scale }] } } : null)],
  [elText('全场有敌人<EL>损伤爆发开始时[，,]立即对其造成相当于攻击力<N>%的元素伤害并回复<N>%最大生命'), (bb, m) => (all([bb.ep_damage_scale, bb.hp_ratio])
    ? { trait: { burstOn: [{ el: elOf(m[1]), where: 'field', dmg: bb.ep_damage_scale, heal: bb.hp_ratio }] } } : null)],
  [elText('攻击处于<EL>损伤爆发期间的敌人时使其每秒受到相当于攻击力<N>%的元素伤害[，,]持续至\\1损伤爆发结束'), (bb, m) => (all([bb.element_atk_scale])
    ? { trait: { vs: [{ when: 'burstOf', el: elOf(m[1]), on: 'attack', post: true, burstDot: bb.element_atk_scale }] } } : null)],
  [elText('每当自身攻击范围内敌人<EL>损伤爆发[，,]攻击力[+＋]<N>%[，,]最多可叠加<N>层'), (bb, m) => (all([bb.atk, bb.max_stack_cnt])
    ? { trait: { stacks: [{ on: 'burst', el: elOf(m[1]), max: bb.max_stack_cnt, mods: { atkPct: bb.atk } }] } } : null)],
  [elText('攻击范围内有敌人<EL>损伤爆发时攻击速度[+＋]<N>[，,]最多可叠加<N>层'), (bb, m) => (all([bb.attack_speed, bb.max_stack_cnt])
    ? { trait: { stacks: [{ on: 'burst', el: elOf(m[1]), max: bb.max_stack_cnt, mods: { aspd: bb.attack_speed } }] } } : null)],
  [elText('攻击范围内的敌人触发麻痹时立即受到相当于攻击力<N>%的元素伤害'), (bb) => (all([bb.atk_scale]) ? { trait: { palsyHit: bb.atk_scale } } : null)],
  [elText('使攻击范围内敌人每秒受到相当于攻击力<N>%的<EL>损伤并停顿<N>秒'), (bb, m) => (all([bb.ep_damage_ratio, bb.sluggish])
    ? { trait: { pulses: [{ who: 'range', every: 1, ep: { el: elOf(m[1]), scale: bb.ep_damage_ratio }, status: { key: 'sluggish', seconds: bb.sluggish } }] } } : null)],
  [elText('使攻击范围内敌人受到的<EL>损伤提高<N>%'), (bb, m) => (all([bb.ep_damage_scale])
    ? { range: [{ side: 'enemy', ranged: false, mods: { [`${elOf(m[1])}TakenMul`]: bb.ep_damage_scale } }] } : null)],
  [elText('对每个敌人首次攻击时[，,]使其在接下来的<N>秒内每秒受到相当于攻击力<N>%的<EL>损伤'), (bb, m) => {
    const scale = byEnd(bb, 'ep_damage_ratio_talent'), seconds = byEnd(bb, 'dmg_duration');
    return all([scale, seconds]) ? { trait: { vs: [{ when: 'first', seen: 'attack', on: 'attack', epDot: { el: elOf(m[1]), scale: /** @type {number} */ (scale), seconds: /** @type {number} */ (seconds) } }] } } : null;
  }],
  [elText('阻挡敌人时自身获得<N>%的庇护[，,]并使阻挡的目标每秒受到相当于攻击力<N>%的法术伤害和相当于攻击力<N>%的<EL>损伤'), (bb, m) => {
    const arts = byEnd(bb, '[enemy].atk_scale'), ep = byEnd(bb, '[enemy].ep_damage_ratio'), every = byEnd(bb, '[enemy].interval') ?? 1;
    return all([bb.damage_resistance, arts, ep]) ? { trait: { whiles: [{ when: 'blocking', mods: shelter(bb.damage_resistance) }],
      pulses: [{ who: 'blocked', every, ep: { el: elOf(m[1]), scale: /** @type {number} */ (ep) }, arts }] } } : null;
  }],
  [elText('场上干员数量不低于<N>时[，,]自身每秒回复相当于生命上限<N>%的生命与元素损伤'), (bb) => (all([bb.cnt, bb.hp_recovery_per_sec_by_max_hp_ratio, bb.ep_heal_ratio])
    ? { trait: { whiles: [{ when: 'fieldOps', value: bb.cnt, mods: { hpRegenRatio: bb.hp_recovery_per_sec_by_max_hp_ratio, epRegenRatio: bb.ep_heal_ratio } }] } } : null)],
  [elText('对自身阻挡的敌人每秒造成相当于攻击力<N>%的<EL>损伤'), (bb, m) => (all([bb.ep_damage_ratio])
    ? { trait: { pulses: [{ who: 'blocked', every: 1, ep: { el: elOf(m[1]), scale: bb.ep_damage_ratio } }] } } : null)],
  [elText('自身受到的元素损伤[-－]<N>%[，,]受到的<EL>损伤额外[-－]<N>%'), (bb, m) => {
    const el = elOf(m[1]), all1 = byEnd(bb, '[other]'), own = byEnd(bb, `[${el.toLowerCase()}]`);
    return all([all1, own]) ? { trait: { whiles: [{ when: 'always', mods: { epTakenMul: less(/** @type {number} */ (all1)), [`${el}TakenMul`]: less(/** @type {number} */ (own)) } }] } } : null;
  }],
  [elText('攻击范围内元素损伤累计超过一半的目标受到的元素损伤降低<N>%'), (bb) => (all([bb.ep_damage_resistance])
    ? { range: [{ side: 'ally', ranged: false, when: { when: 'epHalf' }, mods: { epTakenMul: less(bb.ep_damage_resistance) } }] } : null)],
  [elText('每攻击到一个敌人回复自身<N>元素损伤[，,]最大生效数等于阻挡数'), (bb) => (all([bb.value]) ? { trait: { epOnHit: bb.value } } : null)],
  [elText('普通治疗使目标每秒额外受到一次治疗量和元素损伤回复量为<N>%的增益治疗[，,]持续<N>秒'), (bb) => (all([bb.heal_scale, bb.duration, bb.max_stack_cnt])
    ? { trait: { healDot: { share: bb.heal_scale, seconds: bb.duration, max: bb.max_stack_cnt } } } : null)],
]));

/** The tiles of 周围四格 around an operator, its own left out (干员-26). */
const AROUND_OTHERS = Object.freeze(AROUND[4].filter((t) => t.row !== 0 || t.col !== 0));

/**
 * The special parts of a talent (干员-24…干员-28): its whole description (plainOf) one of TIME, LIFE or FOES with the keys
 * it needs — what it adds to the trait —, or of ELEMS — what it adds to the trait or its in-range part —, or 可颂's 抵挡 (「有N%的几率抵挡物理和法术伤害。周围四格内的友方单位获得一半该效果」:
 * its own `blockPA` always, the other units on the 4 tiles next to it the blackboard's `[aura].prob`). Hidden talents have
 * none.
 * @param {Talent} c @returns {{ trait: Partial<TraitDef> | null, range: RangeTalent[] }}
 */
export function specialParts(c) {
  const none = { trait: null, range: [] };
  if (c.hidden || !c.description) return none;
  const text = plainOf(c);
  for (const [re, make] of [...TIME, ...LIFE, ...FOES]) {
    const m = re.exec(text);
    if (m) return { trait: make(c.bb, m), range: [] };
  }
  for (const [re, make] of ELEMS) {
    const m = re.exec(text), got = m ? make(c.bb, m) : null;
    if (m) return got ? { trait: got.trait ?? null, range: got.range ?? [] } : none;
  }
  const self = byEnd(c.bb, '[self].prob'), aura = byEnd(c.bb, '[aura].prob');
  if (!/^有\d+(?:\.\d+)?%的几率抵挡物理和法术伤害。周围四格内的友方单位获得一半该效果$/u.test(text) || !all([self, aura])) return none;
  return { trait: { whiles: [{ when: 'always', mods: { blockPA: /** @type {number} */ (self) } }] }, range: [{ side: 'ally', ranged: false, mods: { blockPA: /** @type {number} */ (aura) }, area: [...AROUND_OTHERS] }] };
}
