// Talents at a training (docs/spec/operators.md 干员-6): each talent's last candidate unlocked, and their always-on
// parts — the leading clauses that only raise the operator's own attributes — as one blackboard. A module may upgrade a
// talent (干员-7, operators.js).

import powerTable from '../data/powers.json' with { type: 'json' };

/** @typedef {import('./operators.js').Build} Build @typedef {import('./operators.js').TalentCandidate} TalentCandidate */
/** A talent candidate as far as 干员-6 reads it. @typedef {{ description: string | null, bb: Record<string, number>, hidden: boolean }} Talent */

/**
 * Whether a candidate (of a trait, a talent or a module part) is unlocked at a training (干员-3): its elite phase and
 * level reached, its potential (0–5) at most the build's potential − 1.
 * @param {{ phase: number, level: number, potential: number }} c @param {Build} b
 */
export const unlockedAt = (c, b) => (c.phase < b.elite || (c.phase === b.elite && c.level <= b.level)) && c.potential <= b.potential - 1;

/**
 * Each talent's last candidate unlocked at a training (干员-6), by the talent's index; null for a talent with none.
 * @param {{ talents?: TalentCandidate[][] }} t @param {Build} b @returns {(TalentCandidate | null)[]}
 */
export const talentsAt = (t, b) => (t.talents ?? []).map((cands) => cands.filter((c) => unlockedAt(c, b)).at(-1) ?? null);

/** The attribute words of a description and the blackboard key each names (干员-6). */
const WORDS = Object.freeze(/** @type {Record<string, string>} */ ({
  攻击力: 'atk', 防御力: 'def', 生命上限: 'max_hp', 最大生命值: 'max_hp', 生命值: 'max_hp', 攻击速度: 'attack_speed', 攻速: 'attack_speed',
  法术抗性: 'magic_resistance', 技力自然回复速度: 'sp_recovery_per_sec', 再部署时间: 'respawn_time', 部署费用: 'cost',
}));
const ATTR = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|');
/** One clause: (但, 自身) attributes joined by 和 or 、, then (各) a signed number, maybe with %, 秒 or /秒. */
const CLAUSE = new RegExp(`^但?(?:自身的?)?((?:${ATTR})(?:[和、](?:${ATTR}))*)各?[+＋\\-－]\\d+(?:\\.\\d+)?(?:%|秒|/秒)?$`);
const ATTR_G = new RegExp(ATTR, 'g');

/**
 * The blackboard keys the leading clauses of a text name, while they only raise the operator's own attributes (干员-6),
 * and how many clauses those are: from the first clause between ，on, each that is attributes and a signed number.
 * @param {string} sentence @returns {{ keys: Set<string>, n: number }}
 */
function leadingKeys(sentence) {
  const keys = new Set(), clauses = sentence.split('，');
  let n = 0;
  for (; n < clauses.length; n++) {
    const m = CLAUSE.exec(clauses[n].trim());
    if (!m) break;
    for (const w of m[1].match(ATTR_G) ?? []) keys.add(WORDS[w]);
  }
  return { keys, n };
}

/**
 * The always-on part of a talent (干员-6): its description's rich-text tags and bracketed potential differences
 * removed, the leading clauses of the first sentence (up to 。 or ；) that only raise the operator's own attributes —
 * at least one, every key they name in the blackboard; those keys and their values. When nothing follows them, every
 * other key must be 0; the rest of their sentence must not speak of an 效果 (it may change theirs). Null when the
 * talent has no such part; hidden talents have none.
 * @param {Talent} c @returns {Record<string, number> | null}
 */
export function alwaysOn(c) {
  if (c.hidden || !c.description) return null;
  const text = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').replace(/[。；]+$/, '');
  const first = text.split(/[。；]/)[0], { keys, n } = leadingKeys(first);
  if (!n || ![...keys].every((k) => Number.isFinite(c.bb[k]))) return null;
  const lead = first.split('，').slice(0, n).join('，');
  if (text.length > lead.length ? first.slice(lead.length).includes('效果') : !Object.entries(c.bb).every(([k, v]) => keys.has(k) || v === 0)) return null;
  return Object.fromEntries([...keys].map((k) => [k, c.bb[k]]));
}

/**
 * The always-on blackboard of a training's talents (干员-6): their always-on parts' keys summed, the zeros left out.
 * @param {(Talent | null)[]} talents @returns {Record<string, number>}
 */
export function alwaysOnBb(talents) {
  /** @type {Record<string, number>} */
  const bb = {};
  for (const c of talents) for (const [k, v] of Object.entries((c && alwaysOn(c)) ?? {})) if (v !== 0) bb[k] = (bb[k] ?? 0) + v;
  return bb;
}

/** The professions a team talent names (干员-9), by their Chinese names. */
const PROFESSIONS = Object.freeze(/** @type {Record<string, string>} */ ({
  先锋: 'PIONEER', 近卫: 'WARRIOR', 重装: 'TANK', 狙击: 'SNIPER', 术师: 'CASTER', 医疗: 'MEDIC', 辅助: 'SUPPORT', 特种: 'SPECIAL',
}));
const TEAM_WORDS = Object.freeze(/** @type {Record<string, string>} */ ({ ...WORDS, 初始技力: 'sp' }));
const TEAM_ATTR = Object.keys(TEAM_WORDS).sort((a, b) => b.length - a.length).join('|');
const PROF = Object.keys(PROFESSIONS).join('|');
/** The factions by name (干员-10). */
const POWERS = Object.freeze(Object.fromEntries(Object.entries(/** @type {Record<string, string>} */ (powerTable.powers)).map(([id, name]) => [name, id])));
/** 编入队伍时 or 在场时, then 所有（友方）【profession or faction】（职业 / 势力的）干员（的）. */
const TEAM_HEAD = new RegExp(`^(编入队伍时|在场时)，?所有(?:友方)?(?:【([^】]+)】|(${PROF}))(?:职业|势力的?)?干员的?`);
/** One team clause: attributes joined by 和 or 、, then (各) a signed number — or 提升 and a number — maybe with %, 秒 or /秒. */
const TEAM_CLAUSE = new RegExp(`^((?:${TEAM_ATTR})(?:[和、](?:${TEAM_ATTR}))*)各?(?:提升[+＋]?|[+＋\\-－])\\d+(?:\\.\\d+)?(?:%|秒|/秒)?$`);
const TEAM_ATTR_G = new RegExp(TEAM_ATTR, 'g');
/** A team clause of 生命回复: 每秒回复 N 点生命. */
const REGEN = /^每秒回复\d+(?:\.\d+)?点生命$/;
/** The keys an on-field team talent may carry: attributes a buff can hold (技能-5). */
const FIELD_KEYS = Object.freeze(['atk', 'def', 'max_hp', 'attack_speed', 'magic_resistance', 'sp_recovery_per_sec', 'hp_recovery_per_sec']);

/**
 * The keys the leading team clauses name, and how many clauses those are (干员-9).
 * @param {string[]} clauses @returns {{ keys: Set<string>, n: number }}
 */
function teamKeys(clauses) {
  const keys = new Set();
  let n = 0;
  for (; n < clauses.length; n++) {
    const cl = clauses[n].trim(), m = TEAM_CLAUSE.exec(cl);
    if (REGEN.test(cl)) keys.add('hp_recovery_per_sec');
    else if (m) for (const w of m[1].match(TEAM_ATTR_G) ?? []) keys.add(TEAM_WORDS[w]);
    else break;
  }
  return { keys, n };
}

/**
 * Whom a team talent names (干员-9): a profession, or a faction (干员-10); null for another name.
 * @param {string} name @returns {{ profession: string } | { power: string } | null}
 */
function whomOf(name) {
  if (Object.hasOwn(PROFESSIONS, name)) return { profession: PROFESSIONS[name] };
  return Object.hasOwn(POWERS, name) ? { power: POWERS[name] } : null;
}

/**
 * The team part of a talent (干员-9): its first sentence begins 「编入队伍时」 (the deck) or 「在场时」 (on the field),
 * then 「所有（友方）【profession or faction】（职业 / 势力的）干员（的）」, then leading clauses as in 干员-6 — attributes
 * with a signed number (or 提升 and a number), or 「每秒回复N点生命」 — every key they name in the blackboard, the rest of
 * the sentence not speaking of an 效果. An on-field one carries only attributes a buff can hold. Null otherwise;
 * hidden talents have none.
 * @param {Talent} c
 * @returns {({ when: 'deck' | 'field', bb: Record<string, number> } & ({ profession: string } | { power: string })) | null}
 */
export function teamPart(c) {
  if (c.hidden || !c.description) return null;
  const first = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').split(/[。；]/)[0], head = TEAM_HEAD.exec(first);
  const whom = head ? whomOf(head[2] ?? head[3]) : null;
  if (!head || !whom) return null;
  const clauses = first.slice(head[0].length).split('，'), { keys, n } = teamKeys(clauses), when = head[1] === '在场时' ? 'field' : 'deck';
  if (!n || ![...keys].every((k) => Number.isFinite(c.bb[k])) || clauses.slice(n).join('，').includes('效果')) return null;
  if (when === 'field' && ![...keys].every((k) => FIELD_KEYS.includes(k))) return null;
  return { when, ...whom, bb: Object.fromEntries([...keys].map((k) => [k, c.bb[k]])) };
}
