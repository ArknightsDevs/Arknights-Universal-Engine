// What a skill says about its operator's talents (docs/spec/skills.md 技能-17): 「第一天赋效果提升至{talent_scale}倍」「天赋的发动
// 概率提高至{talent@prob}」「天赋的伤害倍率翻倍」. The skill's level gives the rise; the talents it names are read again with
// their numbers risen, and the parts that read differently are what the operator uses while its skill runs
// (operators.js `skillTalents`).

import { skills } from '@aue/sim';
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('./talents.js').Talent} Talent */
/**
 * What a skill raises of a talent: its place among the talents shown (0 first, 1 second), how it changes the talent's
 * numbers — `times` (× `by`, in a share of its effect `kind`: its `effect`, its `chance` or its `time`) or `to` (the
 * chances become `by`).
 * @typedef {{ slot: number, how: 'times' | 'to', by: number, kind: 'effect' | 'chance' | 'time' }} Rise
 */

/** The clause that raises a talent: the talent named (第一天赋, 第二天赋, or 天赋 for the first), what rises, and the number shown. */
const RISE = /(?:第([一二])天赋|天赋)[^，。；\n]*?(?:提升|提高)(?:至|到)(?:原本的)?\{([^}:]+)(?::([^}]*))?\}(倍)?/u;
/** 「第一天赋触发几率提升至100%」: the chance written as a number. */
const LITERAL = /(?:第([一二])天赋|天赋)[^，。；\n]*?(?:几率|概率)(?:提升|提高)(?:至|到)(\d+(?:\.\d+)?)%/u;
/** 「天赋的伤害倍率翻倍」: the rise is the blackboard's `talent_scale`, else 2. */
const DOUBLE = /(?:第([一二])天赋|天赋)[^，。；\n]*?翻倍/u;
/** A clause about a chance (触发几率, 发动概率) or about how long (持续时间). */
const CHANCE = /几率|概率/u;
const TIME = /持续时间/u;
/** A clause about the chances of the talent being raised before deployment: not a rise while the skill runs. */
const DEPLOY = /部署后/u;

/** A clause that only says the effect rises, about the talent the clause before it names (「第一天赋生效范围大幅度扩大，效果提升至{talent_scale}倍」). */
const EFFECT_RISE = /^效果(?:提升|提高)(?:至|到)\{([^}:]+)(?::[^}]*)?\}倍$/u;

/**
 * The rises a skill level's description says (技能-17), in order. A clause 「第一天赋（的）…提升至{键}倍」 (or 「{键:0%}」) is a
 * `times` rise by the key's value; 「…提升至{键:0%}」 of a key with `prob` in its name makes the chance that value (`to`);
 * 「翻倍」 is × the blackboard's `talent_scale`, else × 2. What the clause is about — chance, time, else the effect — says which
 * of the talent's numbers rise. A clause 「效果提升至{键}倍」 after one that names a talent is about that talent.
 * @param {{ description?: string, blackboard: { key: string, value: number }[] }} level @returns {Rise[]}
 */
export function risesOf(level) {
  const bb = Object.fromEntries(level.blackboard.map((b) => [b.key, b.value]));
  const clauses = (level.description ?? '').replace(/<[^>]*>/g, '').replace(/\\n/g, '\n').split(/[，。；\n]/u);
  return clauses.map((clause, i) => {
    const named = clause.includes('天赋') ? clause : EFFECT_RISE.test(clause) && clauses[i - 1]?.includes('天赋') ? `${clauses[i - 1]}${clause}` : '';
    return named && !DEPLOY.test(named) ? riseOf(named, bb) : null;
  }).filter((r) => r !== null);
}

/**
 * The rise one clause says (技能-17), or null: the talent it names, how and by how much, and which of the talent's numbers.
 * @param {string} clause @param {Record<string, number>} bb @returns {Rise | null}
 */
function riseOf(clause, bb) {
  const m = RISE.exec(clause), d = DOUBLE.exec(clause);
  if (m && Number.isFinite(bb[m[2]]) && bb[m[2]] > 0) {
    const to = !m[4] && /prob/u.test(m[2]), kind = CHANCE.test(clause) || to ? 'chance' : TIME.test(clause) ? 'time' : 'effect';
    return { slot: m[1] === '二' ? 1 : 0, how: to ? 'to' : 'times', by: bb[m[2]], kind };
  }
  const l = LITERAL.exec(clause);
  if (l) return { slot: l[1] === '二' ? 1 : 0, how: 'to', by: Number(l[2]) / 100, kind: 'chance' };
  return d ? { slot: d[1] === '二' ? 1 : 0, how: 'times', by: Number.isFinite(bb.talent_scale) ? bb.talent_scale : 2, kind: 'effect' } : null;
}

/** The keys that are counts, thresholds, intervals or ranges, whatever the talent does: not an effect that can rise (技能-17). */
const COUNT = /^(?:hp_ratio|min_hp_ratio|sp_ratio|sp|times|range|range_radius|radius|limit|interval)$|(?:^|_)(?:cnt|count|stack|interval)(?:_|$)|^max_(?!hp)|_max$|_max_(?:value|cnt|count)|_display$/u;

/**
 * What a blackboard key of a talent is (技能-17): a chance (`prob`), a time (`duration`, the seconds of a status), a count or a
 * threshold, or an effect.
 * @param {string} key @returns {'chance' | 'time' | 'count' | 'effect'}
 */
function classOf(key) {
  const name = key.split(/[.@[\]]/u).filter(Boolean).at(-1) ?? key;
  if (/^prob|_prob$/u.test(name)) return 'chance';
  if (/^(?:duration|.+_duration|sluggish|stun|frozen|silence|sleep|cold|fear|seconds)$/u.test(name)) return 'time';
  return COUNT.test(name) ? 'count' : 'effect';
}

/** A key whose value above 1 is a multiplier (a 脆弱, a damage ×): the share above 1 rises, not the whole. @param {string} key */
const isMultiplier = (key) => /(?:^|[.@[\]])(?:damage_scale|ep_damage_scale|atk_scale|scale_delta_to_one)$/u.test(key);

/**
 * A talent's blackboard with a rise applied (技能-17): the keys of the rise's kind × `by` (a multiplier's share above 1 × `by`;
 * a chance at most 1), or with `to` the chances `by`; the other keys as they are.
 * @param {Record<string, number>} bb @param {Rise} rise @returns {Record<string, number>}
 */
function risenBb(bb, rise) {
  // a talent that is nothing but a chance (可颂's 抵挡) has the chance as its effect
  const onlyChance = !Object.keys(bb).some((k) => classOf(k) === 'effect');
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, v] of Object.entries(bb)) {
    const kind = classOf(key), mine = kind === rise.kind || (rise.kind === 'effect' && kind === 'chance' && onlyChance);
    if (rise.how === 'to') out[key] = kind === 'chance' ? rise.by : v;
    else if (!mine) out[key] = v;
    else if (kind === 'chance') out[key] = Math.min(1, v * rise.by);
    else out[key] = isMultiplier(key) && v > 1 ? 1 + (v - 1) * rise.by : v * rise.by;
  }
  return out;
}

/**
 * The talents with the rises applied (技能-17): each rise to the talent in its place among the shown ones (a hidden talent
 * or none there: nothing rises). A rise only changes numbers — the descriptions stay.
 * @template {Talent} T
 * @param {T[]} talents @param {Rise[]} rises @returns {T[]}
 */
export function risenTalents(talents, rises) {
  const shown = talents.filter((c) => !c.hidden);
  return talents.map((c) => {
    const mine = rises.filter((r) => shown[r.slot] === c);
    return mine.length ? { ...c, bb: mine.reduce((bb, r) => risenBb(bb, r), c.bb) } : c;
  });
}

/**
 * The always-on modifiers of a talent record's fields (干员-6): its blackboard's attribute keys (技能-5) under its effects' modifiers.
 * @param {{ talentBb?: Record<string, number>, talentMods?: Record<string, number> }} f @returns {Record<string, number>}
 */
const staticMods = (f) => ({ ...skills.statMods(f.talentBb ?? {}), ...f.talentMods });

/**
 * What the always-on talents add while the skill runs (技能-17): per modifier the risen one less the plain one — a product's
 * (…Mul) risen over the plain one —, those that differ.
 * @param {Parameters<typeof staticMods>[0]} base @param {Parameters<typeof staticMods>[0]} risen
 */
function staticDelta(base, risen) {
  const was = staticMods(base), now = staticMods(risen);
  /** @type {[string, number][]} */
  const delta = Object.entries(now).map(([k, v]) => [k, k.endsWith('Mul') ? v / (was[k] ?? 1) : v - (was[k] ?? 0)]);
  return Object.fromEntries(delta.filter(([k, v]) => v !== (k.endsWith('Mul') ? 1 : 0)));
}

/**
 * The tiles the skill makes its talent's area (技能-17): the level's range, when its blackboard has `talent_range_flag` — 「第一天赋
 * 生效范围大幅度扩大」 (诗怀雅 S1), 「使天赋效果的范围扩大」 (嘉辛塔 S2) —; none otherwise.
 * @param {{ rangeId?: string | null, blackboard: { key: string, value: number }[] }} level @returns {{ row: number, col: number }[] | null}
 */
export function talentArea(level) {
  const flag = level.blackboard.some((b) => b.key === 'talent_range_flag' && b.value > 0);
  return flag && level.rangeId ? /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[level.rangeId] ?? null : null;
}

/**
 * The talent fields an operator uses while its skill runs (技能-17): those of the risen talents that read differently from the
 * plain ones — except the always-on ones (`talentBb`, `talentMods`), whose difference is one more `whiles` entry of the
 * trait that holds while the skill runs —; the in-range talents with an area stand on `area` instead when the skill gives
 * one; null when nothing differs.
 * @param {Record<string, any>} base the fields of the plain talents (operators.js talentFields) @param {Record<string, any>} risen those of the risen ones
 * @param {{ row: number, col: number }[] | null} [area] what the skill makes the talents' area (talentArea)
 * @returns {Record<string, any> | null}
 */
export function skillTalentsFrom(base, risen, area = null) {
  /** @type {Record<string, any>} */
  const diff = {};
  const now = area && risen.rangeTalents ? { ...risen, rangeTalents: risen.rangeTalents.map((/** @type {any} */ t) => (t.area ? { ...t, area } : t)) } : risen;
  for (const [k, v] of Object.entries(now)) if (k !== 'talentBb' && k !== 'talentMods' && JSON.stringify(v) !== JSON.stringify(base[k])) diff[k] = v;
  const mods = staticDelta(base, risen);
  if (Object.keys(mods).length) {
    const trait = diff.talentTrait ?? base.talentTrait ?? {};
    diff.talentTrait = { ...trait, whiles: [...(trait.whiles ?? []), { when: 'inSkill', mods }] };
  }
  return Object.keys(diff).length ? diff : null;
}
