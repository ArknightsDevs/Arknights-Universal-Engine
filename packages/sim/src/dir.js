// The four deploy directions (spec 方向-1…方向-4), with the names and functions of the Stronghold-compatible content
// interface (ADR 0012). Row 0 is the nearest row, so UP is +row; forward vectors are [dRow, dCol]. Range grids and other
// relative offsets [dr, dc] are written facing RIGHT and turned with the facing. Results never hold −0.
import { DIR } from '@aue/schema';

export const DIRS = Object.freeze(['UP', 'RIGHT', 'DOWN', 'LEFT']);
export const DEFAULT_DIR = 'RIGHT';
/** Forward vector [dRow, dCol] of each direction. */
export const DIR_VEC = Object.freeze({
  UP: Object.freeze([1, 0]), RIGHT: Object.freeze([0, 1]), DOWN: Object.freeze([-1, 0]), LEFT: Object.freeze([0, -1]),
});
const OPPOSITE = Object.freeze({ UP: 'DOWN', DOWN: 'UP', RIGHT: 'LEFT', LEFT: 'RIGHT' });
const MIRROR = Object.freeze({ UP: 'UP', DOWN: 'DOWN', RIGHT: 'LEFT', LEFT: 'RIGHT' });

/** @typedef {'UP' | 'RIGHT' | 'DOWN' | 'LEFT'} Dir */

/** @param {unknown} d @returns {d is Dir} */
export const isDir = (d) => d === 'UP' || d === 'RIGHT' || d === 'DOWN' || d === 'LEFT';

/**
 * A direction from what a caller holds: a name in any case, a legacy facing sign (< 0 LEFT, > 0 RIGHT), else `fallback`.
 * @param {unknown} d @param {unknown} [fallback] @returns {Dir}
 */
export function normDir(d, fallback = DEFAULT_DIR) {
  if (isDir(d)) return d;
  if (typeof d === 'string') { const u = d.trim().toUpperCase(); if (isDir(u)) return u; }
  if (typeof d === 'number' && Number.isFinite(d) && d !== 0) return d < 0 ? 'LEFT' : 'RIGHT';
  return isDir(fallback) ? fallback : DEFAULT_DIR;
}

/** @param {unknown} d */
export const dirVec = (d) => DIR_VEC[normDir(d)];

/**
 * A facing-RIGHT offset turned to direction `d` (spec 方向-2): RIGHT (dr, dc), UP (dc, −dr), LEFT (−dr, −dc), DOWN (−dc, dr).
 * @param {number} dr @param {number} dc @param {unknown} d @returns {[number, number]}
 */
export function rotateOffset(dr, dc, d) {
  switch (normDir(d)) {
    case 'UP': return [dc, 0 - dr];
    case 'LEFT': return [0 - dr, 0 - dc];
    case 'DOWN': return [0 - dc, dr];
    default: return [dr, dc];
  }
}

/** The inverse of rotateOffset: an absolute delta in the facing-RIGHT frame of `d`. @param {number} ar @param {number} ac @param {unknown} d @returns {[number, number]} */
export function toLocal(ar, ac, d) {
  switch (normDir(d)) {
    case 'UP': return [0 - ac, ar];
    case 'LEFT': return [0 - ar, 0 - ac];
    case 'DOWN': return [ac, 0 - ar];
    default: return [ar, ac];
  }
}

/** Horizontal sign for flipping a sprite: LEFT −1, others +1. @param {unknown} d */
export const hSign = (d) => (normDir(d) === 'LEFT' ? -1 : 1);
/** RIGHT ↔ LEFT; UP and DOWN stay. @param {unknown} d @returns {Dir} */
export const mirrorDir = (d) => /** @type {Dir} */ (MIRROR[normDir(d)]);
/** @param {unknown} d @returns {Dir} */
export const oppositeDir = (d) => /** @type {Dir} */ (OPPOSITE[normDir(d)]);
/** @param {unknown} a @param {unknown} b */
export const perpendicular = (a, b) => { const [ar, ac] = dirVec(a), [br, bc] = dirVec(b); return ar * br + ac * bc === 0; };

/**
 * The direction of a delta (spec 方向-3): the dominant axis, ties horizontal; a zero delta gives `fallback`.
 * @param {unknown} dRow @param {unknown} dCol @param {unknown} [fallback] @returns {Dir}
 */
export function dirFromDelta(dRow, dCol, fallback = DEFAULT_DIR) {
  const r = Number(dRow) || 0, c = Number(dCol) || 0;
  if (r === 0 && c === 0) return normDir(fallback);
  if (Math.abs(c) >= Math.abs(r)) return c > 0 ? 'RIGHT' : 'LEFT';
  return r > 0 ? 'UP' : 'DOWN';
}

/** The tile reached from (r, c) by the facing-RIGHT offset [dr, dc] of a unit facing `d`. @param {number} r @param {number} c @param {number} dr @param {number} dc @param {unknown} d @returns {[number, number]} */
export function offsetTile(r, c, dr, dc, d) {
  const [a, b] = rotateOffset(dr, dc, d);
  return [r + a, c + b];
}

/** The tile `k` steps in front of (r, c) (k < 0: behind). @param {number} r @param {number} c @param {unknown} d @param {number} [k] @returns {[number, number]} */
export function frontOf(r, c, d, k = 1) {
  const [fr, fc] = dirVec(d);
  return [r + fr * k, c + fc * k];
}

/** A tile's tie-break order relative to a unit: its delta in the unit's facing-RIGHT frame (spec 方向-4). @param {number} dRow @param {number} dCol @param {unknown} d */
export const localOrder = (dRow, dCol, d) => toLocal(dRow, dCol, d);
/** Lexicographic a < b of two localOrder pairs (b null: true). @param {readonly number[]} a @param {readonly number[] | null | undefined} b */
export const localBefore = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/** @type {Readonly<Record<number, Dir>>} the protocol's direction codes (schema DIR) */
const BY_CODE = Object.freeze({ [DIR.RIGHT]: 'RIGHT', [DIR.UP]: 'UP', [DIR.LEFT]: 'LEFT', [DIR.DOWN]: 'DOWN' });
/** A direction from its protocol code (schema DIR). @param {number} code @returns {Dir} */
export const dirOfCode = (code) => BY_CODE[code] ?? DEFAULT_DIR;
/** The protocol code (schema DIR) of a direction. @param {unknown} d @returns {number} */
export const codeOfDir = (d) => DIR[normDir(d)];
