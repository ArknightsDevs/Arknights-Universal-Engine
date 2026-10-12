// Stands in for Stronghold's server/sim/buffs.js (兼容-2): the names its operator kits import; aggregateMods ported from
// it (GPL-3.0-or-later, Stronghold Protocol v0.2.4) over the buffs a kit sees (compat/unit.js ShBuff: modifier keys as
// Stronghold names them, ADR 0012).
import { powi } from '@aue/math';

/** The statuses a 抵抗 shortens (Stronghold's list). */
export const RESIST_STATUSES = Object.freeze(new Set(['stun', 'freeze', 'cold', 'sleep', 'fear', 'tremble', 'attract', 'levitate',
  'bind', 'silence', 'disarm', 'sluggish', 'slow', 'groundbind']));

/** @typedef {{ mods?: Record<string, unknown> | null, stacks?: number, flags?: Record<string, boolean> | null, shield?: number, persist?: boolean, duration?: number }} AnyBuff */
/** @typedef {{ count: number, p: number, miss: number }} Dodge */
/** @typedef {{ add: Record<string, number>, mul: Record<string, number>, dodge: Record<string, Dodge | null>, perm: number }} Sums */

/**
 * A dodge chance into the sums: sources are independent rolls (Stronghold's rule).
 * @param {Sums} acc @param {string} k @param {number} v @param {number} st
 */
function addDodge(acc, k, v, st) {
  const p = Math.min(1, v), d = acc.dodge[k];
  if (!d) acc.dodge[k] = { count: st, p, miss: powi(1 - p, st) };
  else { d.count += st; d.miss *= powi(1 - p, st); }
}

/**
 * One buff's modifiers into the sums (Stronghold's rules): `…Mul` keys multiply (to the power of the stacks), dodge
 * chances combine as independent rolls, the others add × stacks; a lasting rangeExtend also counts as permanent.
 * @param {AnyBuff} b @param {Sums} acc
 */
function addBuff(b, acc) {
  const st = b.stacks ?? 1, lasting = !!b.persist && b.duration === Infinity;
  for (const [k, v] of Object.entries(b.mods ?? {})) if (typeof v === 'number' && Number.isFinite(v) && k !== 'shield') addKey(acc, k, v, { st, lasting });
}

/**
 * One modifier into the sums. @param {Sums} acc @param {string} k @param {number} v
 * @param {{ st: number, lasting: boolean }} o its buff's stacks, and whether the buff lasts for good
 */
function addKey(acc, k, v, o) {
  if (k.endsWith('Mul')) acc.mul[k] = (acc.mul[k] ?? 1) * (o.st === 1 ? v : powi(v, o.st));
  else if ((k === 'dodgePhys' || k === 'dodgeArts') && v > 0) addDodge(acc, k, v, o.st);
  else {
    acc.add[k] = (acc.add[k] ?? 0) + v * o.st;
    if (k === 'rangeExtend' && o.lasting) acc.perm += v * o.st;
  }
}

/**
 * The aggregated modifiers of a buff list (Stronghold's aggregateMods): sums, products, flags, shield and the permanent
 * rangeExtend.
 * @param {AnyBuff[]} list
 */
export function aggregateMods(list) {
  /** @type {Record<string, boolean>} */
  const flags = {};
  /** @type {Sums} */
  const acc = { add: {}, mul: {}, dodge: { dodgePhys: null, dodgeArts: null }, perm: 0 };
  let shield = 0;
  for (const b of list) {
    addBuff(b, acc);
    for (const [k, on] of Object.entries(b.flags ?? {})) if (on) flags[k] = true;
    if ((b.shield ?? 0) > 0) shield += /** @type {number} */ (b.shield);
  }
  for (const k of ['dodgePhys', 'dodgeArts']) {
    const d = acc.dodge[k];
    if (d) acc.add[k] = (acc.add[k] ?? 0) + (d.count === 1 ? d.p : 1 - d.miss);
  }
  return { add: acc.add, mul: acc.mul, flags, shield, permRangeExtend: acc.perm };
}
