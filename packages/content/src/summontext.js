// What a summoner's and a summon's texts say of the summon (docs/spec/summons.md 召唤-8…召唤-10): the copies a skill
// gives and when, how long a summon stays, and what the end of a skill does to it. Read from the descriptions at the
// training's levels, their rich text and bracketed potential differences removed.
import { talentsAt } from './talents.js';

/** @typedef {import('./operators.js').Training} Training @typedef {import('./operators.js').Build} Build */

/** A count of copies a skill gives (召唤-8): after 获得 or 可以使用, a number of 个 or 枚, not of something 持续…. */
const GIVES = /(?:获得|可以使用)(一|两|二|三|四|五|\d+|\{cnt(?::[^}]*)?\})(?:个|枚)(?!持续)/;
/** @type {Readonly<Record<string, number>>} */
const WORD = Object.freeze({ 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5 });
/** A text's sentences: split at 。 and ；, a line break or a written \n. */
const SENTENCE = /[\n；。]|\\n/;
/** The words a summoner's text names its summons with besides their names (召唤-10). */
const KINDS = Object.freeze(['召唤物', '装置', '无人机']);

/** A description as it reads: rich text and bracketed potential differences removed. @param {string | null | undefined} d */
export const plainText = (d) => (d ?? '').replace(/<[^>]*>/g, '').replace(/（[+＋][^）]*）|\([+＋][^)]*\)/g, '');
/** A summon's name without its quotes. @param {string} name */
const bare = (name) => name.replace(/^[“"]|[”"]$/g, '');
/** @param {string} s */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether the skill an owner brings is about a summon (召唤-8): the skill summons it, or the skill summons none and the
 * owner's talents name it and no other.
 * @param {Training} owner @param {NonNullable<Training['skills'][number]>} slot @param {string} id @param {Readonly<Record<string, unknown>>} known the summons there are
 */
function skillOf(owner, slot, id, known) {
  if (slot.token) return slot.token === id;
  const named = new Set(owner.talents.flat().map((c) => c.token).filter((t) => t !== null && Object.hasOwn(known, t)));
  return named.size === 1 && named.has(id);
}

/**
 * The level of the skill an owner brings when it is about a summon (skillOf), or null.
 * @param {Training} owner @param {Build} b @param {string} id @param {Readonly<Record<string, unknown>>} known
 */
function skillLevel(owner, b, id, known) {
  const slot = b.skill >= 0 ? owner.skills[b.skill] : null;
  if (!slot || !skillOf(owner, slot, id, known)) return null;
  return slot.levels[Math.min(Math.max(1, b.skillLevel), slot.levels.length) - 1];
}

/**
 * When the clause a skill gives copies in says it happens (召唤-8): 技能结束时 or 技能结束后 at the skill's end, 部署后 at
 * its owner's deployment, else at its start.
 * @param {string} text @param {number} at @returns {'start' | 'end' | 'deploy'}
 */
function givenWhen(text, at) {
  const clause = text.slice(0, at).split(SENTENCE).at(-1) ?? '';
  return clause.includes('技能结束') ? 'end' : clause.includes('部署后') ? 'deploy' : 'start';
}

/**
 * The copies of a summon its owner's skill gives (召唤-8): when the skill the owner brings is about it, its description
 * at the skill's level — a count of 个 or 枚 after 获得 or 可以使用 (the blackboard's cnt for {cnt}), not of something
 * 持续…, or 获得 and the summon's name for one — and when; null for none.
 * @param {Training} owner @param {Build} b @param {string} id @param {string} name @param {Readonly<Record<string, unknown>>} known
 * @returns {{ n: number, at: 'start' | 'end' | 'deploy' } | null}
 */
export function grantAt(owner, b, id, name, known) {
  const lv = skillLevel(owner, b, id, known);
  if (!lv) return null;
  const text = plainText(lv.description), m = GIVES.exec(text);
  if (m) {
    const cnt = lv.blackboard.find((e) => e.key === 'cnt')?.value ?? 0;
    return { n: m[1].startsWith('{') ? cnt : WORD[m[1]] ?? Number(m[1]), at: givenWhen(text, m.index) };
  }
  const i = text.indexOf(`获得${name}`);
  return i >= 0 ? { n: 1, at: givenWhen(text, i) } : null;
}

/**
 * The seconds a summon stays on the field (召唤-9), 0 for no end: the N of its owner's skill's 「N秒后自动销毁」, else of
 * its owner's skill or talents' 「持续N秒的<summon>」 or 「<summon>（持续N秒）」, else — but for a tactical point — the
 * duration of its own talent that says 部署后…持续 or has no name.
 * @param {Training} token @param {string} id @param {Training} owner @param {Build} b
 * @param {{ known: Readonly<Record<string, unknown>>, tactical: boolean, tb: Build }} o its build (召唤-2)
 */
export function lifeAt(token, id, owner, b, o) {
  const skill = plainText(skillLevel(owner, b, id, o.known)?.description), n = escape(bare(token.name));
  const own = /(\d+(?:\.\d+)?)秒后自动销毁/.exec(skill);
  if (own) return Number(own[1]);
  const says = [new RegExp(`持续(?:时间)?(\\d+(?:\\.\\d+)?)秒的[“"]?${n}`), new RegExp(`${n}[”"]?（持续(\\d+(?:\\.\\d+)?)秒）`)];
  for (const t of [skill, ...talentsAt(owner, b).map((c) => plainText(c?.description))]) {
    const m = says.map((re) => re.exec(t)).find(Boolean);
    if (m) return Number(m[1]);
  }
  return o.tactical ? 0 : ownLife(token, o.tb);
}

/**
 * A summon's time by its own talents (召唤-9): the duration of the one that says 部署后…持续 or has no name; 0 for none.
 * @param {Training} token @param {Build} tb its build (召唤-2)
 */
function ownLife(token, tb) {
  for (const c of talentsAt(token, tb)) {
    const d = c?.bb.duration ?? c?.bb['skill@duration'], text = plainText(c?.description);
    if (c && d !== undefined && (c.name === null || (text.includes('部署后') && text.includes('持续')))) return d;
  }
  return 0;
}

/**
 * What the end of its owner's skill does to a summon (召唤-10): a sentence of the skill the owner brings, about the
 * summon, that says 技能结束 and 回收, 销毁 or 自动撤退 and names it (its name, 召唤物, 装置, 无人机) — those on the field
 * leave, recovered (回收) or not; only those under half their HP for 生命值低于一半的. Null for none.
 * @param {Training} owner @param {Build} b @param {string} id @param {string} name @param {Readonly<Record<string, unknown>>} known
 * @returns {{ recover: boolean, below?: number } | null}
 */
export function skillEndAt(owner, b, id, name, known) {
  const words = [bare(name), ...KINDS];
  for (const s of plainText(skillLevel(owner, b, id, known)?.description).split(SENTENCE)) {
    if (!s.includes('技能结束') || !/回收|销毁|自动撤退/.test(s) || !words.some((w) => s.includes(w))) continue;
    return { recover: s.includes('回收'), ...(s.includes('生命值低于一半') ? { below: 0.5 } : {}) };
  }
  return null;
}
