// Stands in for Stronghold's server/sim/ai.js (兼容-2): the names its operator kits import — a unit's attack profile now
// (its trait's, compat/unit.js, with its running skill spec's attack and targeting, as Stronghold's effectiveProfile);
// the rest still gaps.
import { gap } from './gap.js';

export const acquireTargets = gap('ai.acquireTargets');
export const chainHealNext = gap('ai.chainHealNext');
export const performAttack = gap('ai.performAttack');

/** The targeting keys a skill spec may override. */
const TARGETING = Object.freeze(['maxTargets', 'priority', 'allInRange', 'canHitFly']);
/** A spec's attack keys under the profile's own names. @type {Readonly<Record<string, string>>} */
const RENAMED = Object.freeze({ onHit: 'skillOnHit', onEachHit: 'skillOnEachHit' });

/**
 * A spec's attack override on a profile: its keys (the hit callbacks under the profile's names, a numeric damage
 * multiplier as `skillDmgMul`), a heal for an attack that heals, none for one that deals damage.
 * @param {Record<string, any>} p @param {Record<string, any>} ov
 */
function overAttack(p, ov) {
  for (const [k, v] of Object.entries(ov)) {
    if (k !== 'dmgMul') p[RENAMED[k] ?? k] = v;
    else if (typeof v === 'number') p.skillDmgMul = v;
  }
  if (ov.dmgType === 'heal' && !p.heal) p.heal = { mode: 'single' };
  if (ov.dmgType && ov.dmgType !== 'heal' && !ov.heal) p.heal = null;
}

/**
 * A unit's attack profile now (Stronghold's effectiveProfile): its own; while its skill runs and its spec overrides the
 * attack or the targeting, a copy with them.
 * @param {{ profile: Record<string, any>, skill?: { active: boolean, spec: Record<string, any> | null } | null }} u
 * @returns {Record<string, any>}
 */
export function effectiveProfile(u) {
  const spec = u.skill?.active ? u.skill.spec : null, ov = spec?.attack ?? null, tg = spec?.targeting ?? null;
  if (!ov && !tg) return u.profile;
  /** @type {Record<string, any>} */
  const p = { ...u.profile, isSkill: true };
  if (ov) overAttack(p, ov);
  for (const k of TARGETING) if (tg?.[k] != null) p[k] = tg[k];
  return p;
}
