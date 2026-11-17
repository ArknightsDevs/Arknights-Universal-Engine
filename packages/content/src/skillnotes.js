// What a skill's extras get beyond its description's sentences (docs/spec/skills.md 技能-4, 技能-9): the flags a PRTS remark gives a
// skill whose description does not say it, and the bonus that wears off (statdecay.js). Kept apart from skills.js, which reads
// the sentences.
import { statDecayOf } from './statdecay.js';

/** @typedef {import('@aue/sim').SkillDef} SkillDef */

/**
 * Skills whose description does not say it but whose PRTS remark does: while they run (a next-attack skill: until its attack) the
 * trait's lowered attack is not applied (职业-8) — 断崖's 多导向散射弹丸, 「技能生效时，不会应用特性的“攻击降低”」 (PRTS 断崖 revid
 * 393007, 技能 1 备注; the page has no such remark on her 技能 2).
 */
const LIFTS_BY_REMARK = new Set(['skchr_ayer_1']);

/**
 * A skill's extras with what its PRTS remark adds and its bonus that wears off.
 * @param {string} id @param {Record<string, number>} bb @param {string} text the description, tags removed, its placeholders with their formats
 * @param {{ extra?: NonNullable<SkillDef['extra']> }} found what skills.js read of the skill @returns {{ extra?: NonNullable<SkillDef['extra']> }}
 */
export function skillNotes(id, bb, text, found) {
  const lifted = LIFTS_BY_REMARK.has(id) ? { flags: { ...found.extra?.flags, noUnblockedScale: true } } : {}, decay = statDecayOf(text, bb);
  return Object.keys(lifted).length || decay.decay ? { extra: { ...found.extra, ...lifted, ...decay } } : found;
}
