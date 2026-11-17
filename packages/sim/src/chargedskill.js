// Skills with a 蓄力 part (docs/spec/skills.md 技能-4): a skill that holds up to twice its cost in SP, and that does more when it
// starts with all of it. Whatever the moment it starts, it takes all the SP it holds. The content reads which keys and effects
// belong to the 蓄力 part (packages/content/src/chargedskill.js); this decides when they are in effect.
//
// A skill the content runs itself (技能-6) is not touched: its behaviour knows its own 蓄力 and its own SP.

/** @typedef {import('./types.js').SkillDef} SkillDef @typedef {import('./types.js').SkillState} SkillState @typedef {import('./skills.js').AttackMods} AttackMods */

/**
 * The skill takes its SP as it starts (技能-4): all of it when it has a 蓄力 part, and the skill is charged when that was all it
 * could hold. Set before its seconds and its blackboard are asked for. A free start (content's own) takes none and is not
 * charged. Returns whether the skill takes all its SP.
 * @param {SkillDef} def @param {SkillState} st @param {boolean} owned the content runs the skill itself @param {boolean} free
 */
export function chargeStart(def, st, owned, free) {
  if (!def.charged || owned) return false;
  if (!free && st.sp >= st.cap) st.charged = true;
  else delete st.charged;
  return !free;
}

/**
 * The blackboard a skill's generic effects read (技能-4, 技能-5): without the keys only its 蓄力 part uses, unless it started
 * charged.
 * @param {SkillDef} def @param {SkillState | null} st @param {boolean} owned @returns {Record<string, number>}
 */
export function chargedBb(def, st, owned) {
  if (!def.charged || owned || st?.charged) return def.bb;
  const only = def.charged.keys;
  return Object.fromEntries(Object.entries(def.bb).filter(([k]) => !only.includes(k)));
}

/** The modifiers a charged start adds (技能-4). @param {SkillDef} def @param {SkillState | null} st @returns {Record<string, number>} */
export const chargedMods = (def, st) => (st?.charged ? def.charged?.mods ?? {} : {});

/** The seconds a charged start runs, or undefined (技能-4). @param {SkillDef} def @param {SkillState | null} st */
export const chargedSeconds = (def, st) => (st?.charged ? def.charged?.seconds : undefined);

/** The shots a charged start holds, or undefined (技能-4). @param {SkillDef} def @param {SkillState | null} st */
export const chargedShots = (def, st) => (st?.charged && def.charged?.ammo ? def.bb[def.charged.ammo] : undefined);

/**
 * An attack's mods under a charged start (技能-4): its 倍率, hits and the status each hit gives in place of the skill's own.
 * @param {SkillDef} def @param {SkillState} st @param {AttackMods} mods @returns {AttackMods}
 */
export function chargedAttack(def, st, mods) {
  const a = st.charged ? def.charged?.attack : undefined;
  if (!a) return mods;
  return { ...mods, ...(a.scale !== undefined ? { scale: a.scale } : {}), ...(a.times ? { times: a.times } : {}), ...(a.hitStatus ? { hitStatus: a.hitStatus } : {}) };
}
