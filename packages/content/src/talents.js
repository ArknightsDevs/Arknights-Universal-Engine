// Talents at a training (docs/spec/operators.md 干员-6): each talent's last candidate unlocked, and of those the ones
// whose description says nothing but a raise of the operator's own attributes — always on — as one blackboard.

/** @typedef {import('./operators.js').Build} Build @typedef {import('./operators.js').TalentCandidate} TalentCandidate */

/**
 * Whether a candidate (of a trait or a talent) is unlocked at a training (干员-3): its elite phase and level reached,
 * its potential (0–5) at most the build's potential − 1.
 * @param {{ phase: number, level: number, potential: number }} c @param {Build} b
 */
export const unlockedAt = (c, b) => (c.phase < b.elite || (c.phase === b.elite && c.level <= b.level)) && c.potential <= b.potential - 1;

/**
 * Each talent's last candidate unlocked at a training (干员-6); a talent with none unlocked is left out.
 * @param {{ talents?: TalentCandidate[][] }} t @param {Build} b @returns {TalentCandidate[]}
 */
export const talentsAt = (t, b) => (t.talents ?? []).flatMap((cands) => cands.filter((c) => unlockedAt(c, b)).slice(-1));

/** The attribute words of a description and the blackboard key each names (干员-6). */
const WORDS = Object.freeze(/** @type {Record<string, string>} */ ({
  攻击力: 'atk', 防御力: 'def', 生命上限: 'max_hp', 最大生命值: 'max_hp', 生命值: 'max_hp', 攻击速度: 'attack_speed', 攻速: 'attack_speed',
  法术抗性: 'magic_resistance', 技力自然回复速度: 'sp_recovery_per_sec', 再部署时间: 'respawn_time', 部署费用: 'cost',
}));
const ATTR = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|');
/** One clause: attributes joined by 和 or 、, then (各) a signed number, maybe with %, 秒 or /秒. */
const CLAUSE = new RegExp(`^(?:自身的?)?((?:${ATTR})(?:[和、](?:${ATTR}))*)各?[+＋\\-－]\\d+(?:\\.\\d+)?(?:%|秒|/秒)?$`);
const ATTR_G = new RegExp(ATTR, 'g');

/**
 * The blackboard keys a description names when it only raises the operator's own attributes (干员-6): its rich-text
 * tags and the bracketed potential differences removed, every clause between ，is attributes and a signed number.
 * Null when any clause is something else.
 * @param {string} description @returns {Set<string> | null}
 */
function selfKeys(description) {
  const text = description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '');
  const keys = new Set();
  for (const clause of text.split('，')) {
    const m = CLAUSE.exec(clause.trim());
    if (!m) return null;
    for (const w of m[1].match(ATTR_G) ?? []) keys.add(WORDS[w]);
  }
  return keys;
}

/**
 * Whether a candidate always raises its operator's own attributes and nothing else (干员-6): the description reads so,
 * every key it names is in the blackboard, and every other key there is 0.
 * @param {TalentCandidate} c
 */
export function alwaysOn(c) {
  const keys = !c.hidden && c.description ? selfKeys(c.description) : null;
  return !!keys && [...keys].every((k) => Number.isFinite(c.bb[k])) && Object.entries(c.bb).every(([k, v]) => keys.has(k) || v === 0);
}

/**
 * The always-on talents' blackboard at a training (干员-6): their keys summed, the zeros left out.
 * @param {{ talents?: TalentCandidate[][] }} t @param {Build} b @returns {Record<string, number>}
 */
export function alwaysOnBb(t, b) {
  /** @type {Record<string, number>} */
  const bb = {};
  for (const c of talentsAt(t, b).filter(alwaysOn)) for (const [k, v] of Object.entries(c.bb)) if (v !== 0) bb[k] = (bb[k] ?? 0) + v;
  return bb;
}
