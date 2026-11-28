// A kit's splash radius and aftershock count on the engine's attack (docs/spec/compat.md 兼容-4, docs/spec/traits.md 职业-8).
// The count is Stronghold's bombarder formula; the engine only sees a radius and a count, and settles them on its own.
import { buffs, traits } from '@aue/sim';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').TraitDef} TraitDef */

/**
 * A finite number. The predicate is what `tsc` needs to narrow `unknown` (a kit may write anything).
 * @param {unknown} v
 * @returns {v is number}
 */
const finiteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * A finite `splashRadius` ≥ 0, or null when the field is absent or not one. 0 is kept: the main splash uses it, and
 * an aftershock widens it to 1 (职业-8, Stronghold's `splashRadius || 1`).
 * @param {Record<string, any> | null | undefined} set @returns {number | null}
 */
function radiusOf(set) {
  if (!set || !Object.hasOwn(set, 'splashRadius')) return null;
  const v = set.splashRadius;
  return finiteNum(v) && v >= 0 ? v : null;
}

/**
 * Engine aftershocks for one written `shockTimes` (Stronghold professions.js: `max(1, (shockTimes ?? 2) − 1)`).
 * `null` and a negative number are 1. Anything else that is not a finite number ≥ 0 is not an override (a kit's
 * empty restore). The result is at most {@link traits.SHOCK_COUNT_CAP}.
 * @param {unknown} v @returns {number | null}
 */
function cappedCount(v) {
  if (v === null || (finiteNum(v) && v < 0)) return 1;
  if (!finiteNum(v)) return null;
  return Math.min(traits.SHOCK_COUNT_CAP, Math.max(1, Math.floor(v) - 1));
}

/**
 * The engine's aftershock count for a written `shockTimes`, or null when the field is absent.
 * @param {Record<string, any> | null | undefined} set @returns {number | null}
 */
function countOf(set) {
  if (!set || !Object.hasOwn(set, 'shockTimes')) return null;
  return cappedCount(set.shockTimes);
}

/**
 * Puts the profile's splash radius and aftershock count on the unit (职业-8): the `profileShock` buff, or none when both
 * match the trait's own or are not finite numbers. The engine applies a radius only to a splash the attack already has,
 * and a count only when the attack already has an aftershock.
 * @param {Unit} u @param {Record<string, any> | null} set @param {TraitDef | null} trait
 */
export function syncShock(u, set, trait) {
  let value = radiusOf(set), n = countOf(set);
  if (value !== null && trait?.splash && value === trait.splash.radius) value = null;
  if (n !== null && trait && trait.aftershock > 0 && n === trait.aftershocks) n = null;
  buffs.removeBuff(u, traits.SHOCK_BUFF);
  if (value === null && n === null) return;
  buffs.addBuff(u, buffs.makeBuff({ key: traits.SHOCK_BUFF, src: u.id, value: value ?? -1, n: n ?? -1 }));
}
