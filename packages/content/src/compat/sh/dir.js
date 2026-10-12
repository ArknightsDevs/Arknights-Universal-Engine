// Stands in for Stronghold's server/sim/dir.js (兼容-2), ported from it (GPL-3.0-or-later, Stronghold Protocol v0.2.4):
// the four facings as names. Row 0 is the bottom row, so UP is +row, as in the engine (方向-1). Offsets [dRow, dCol] are
// authored facing RIGHT and turned a quarter per step: RIGHT (dr, dc) · UP (dc, −dr) · LEFT (−dr, −dc) · DOWN (−dc, dr).

const DEFAULT_DIR = 'RIGHT';
/** Forward vector [dRow, dCol] per facing. */
const DIR_VEC = Object.freeze(/** @type {Record<string, readonly number[]>} */ ({
  UP: Object.freeze([1, 0]), RIGHT: Object.freeze([0, 1]), DOWN: Object.freeze([-1, 0]), LEFT: Object.freeze([0, -1]),
}));

/** @param {unknown} d */
const isDir = (d) => d === 'UP' || d === 'RIGHT' || d === 'DOWN' || d === 'LEFT';

/**
 * A facing from a name (any case), a sign (−1 LEFT, +1 RIGHT) or anything else (the fallback).
 * @param {unknown} d @param {string} [fallback] @returns {string}
 */
export function normDir(d, fallback = DEFAULT_DIR) {
  if (isDir(d)) return /** @type {string} */ (d);
  if (typeof d === 'string') { const u = d.trim().toUpperCase(); if (isDir(u)) return u; }
  if (typeof d === 'number' && Number.isFinite(d) && d !== 0) return d < 0 ? 'LEFT' : 'RIGHT';
  return isDir(fallback) ? fallback : DEFAULT_DIR;
}

/** The forward vector [dRow, dCol] of a facing. @param {unknown} d */
export const dirVec = (d) => DIR_VEC[normDir(d)];

/** A facing-RIGHT offset turned to a facing (never −0). @param {number} dr @param {number} dc @param {unknown} d @returns {number[]} */
export function rotateOffset(dr, dc, d) {
  switch (normDir(d)) {
    case 'UP': return [dc, 0 - dr];
    case 'LEFT': return [0 - dr, 0 - dc];
    case 'DOWN': return [0 - dc, dr];
    default: return [dr, dc];
  }
}

/** An absolute delta in the facing-RIGHT frame of a facing (rotateOffset's inverse). @param {number} ar @param {number} ac @param {unknown} d @returns {number[]} */
export function toLocal(ar, ac, d) {
  switch (normDir(d)) {
    case 'UP': return [0 - ac, ar];
    case 'LEFT': return [0 - ar, 0 - ac];
    case 'DOWN': return [ac, 0 - ar];
    default: return [ar, ac];
  }
}

/**
 * The facing of a (row, col) delta: its longer axis, horizontal on a tie; a zero delta gives the fallback.
 * @param {unknown} dRow @param {unknown} dCol @param {string} [fallback]
 */
export function dirFromDelta(dRow, dCol, fallback = DEFAULT_DIR) {
  const r = Number(dRow) || 0, c = Number(dCol) || 0;
  if (r === 0 && c === 0) return normDir(fallback);
  if (Math.abs(c) >= Math.abs(r)) return c > 0 ? 'RIGHT' : 'LEFT';
  return r > 0 ? 'UP' : 'DOWN';
}

/** The tile a facing-RIGHT offset reaches from (r, c) for a facing. @param {number} r @param {number} c @param {number} dr @param {number} dc @param {unknown} d */
export function offsetTile(r, c, dr, dc, d) {
  const [a, b] = rotateOffset(dr, dc, d);
  return [r + a, c + b];
}

/** The tile k steps in front of (r, c) (behind for k < 0). @param {number} r @param {number} c @param {unknown} d @param {number} [k] */
export function frontOf(r, c, d, k = 1) {
  const [fr, fc] = dirVec(d);
  return [r + fr * k, c + fc * k];
}

/** A tile's order relative to a unit, in the unit's facing-RIGHT frame (compared lexicographically). @param {number} dRow @param {number} dCol @param {unknown} d */
export const localOrder = (dRow, dCol, d) => toLocal(dRow, dCol, d);
