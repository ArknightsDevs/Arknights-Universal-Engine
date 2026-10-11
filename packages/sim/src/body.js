// Where a unit can be hit (spec 体积-1…体积-4), with the functions of the Stronghold-compatible content interface
// (ADR 0012). A regular unit is a point: it is on the tile of its position, rounded half to even as the official client
// does. A huge unit (`hitArea` { w, h, dx, dy } in tiles) is a rectangle w columns × h rows centred on its position
// moved dx columns and dy rows; it is on every tile the rectangle overlaps. The grid's size is a parameter (levels
// differ), not a constant. Tile keys are row × cols + col.
import { hypot, roundHalfEven } from '@aue/math';

/** @typedef {{ rows: number, cols: number }} Grid */
/** @typedef {{ w: number, h: number, dx: number, dy: number }} HitArea */
/** @typedef {{ x: number, y: number, hitArea?: HitArea | null }} Body */

const EPS = 1e-9;

/** A validated hit area, or null for a point unit. @param {any} a @returns {Readonly<HitArea> | null} */
export function normHitArea(a) {
  if (!a || typeof a !== 'object') return null;
  const w = Number(a.w), h = Number(a.h), dx = Number(a.dx ?? 0), dy = Number(a.dy ?? 0);
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return Object.freeze({ w, h, dx, dy });
}

/** The rectangle of a huge unit, or null for a point unit. @param {Body} u */
export function hitRect(u) {
  const a = u && u.hitArea;
  if (!a) return null;
  const cx = u.x + a.dx, cy = u.y + a.dy;
  return { x0: cx - a.w / 2, x1: cx + a.w / 2, y0: cy - a.h / 2, y1: cy + a.h / 2 };
}

/** The tile of a position (spec 体积-1). @param {Body} u @returns {[number, number]} [row, col] */
export const tileOf = (u) => [roundHalfEven(u.y), roundHalfEven(u.x)];

/** Tile key of a point unit's tile, −1 off the grid. @param {Body} u @param {Grid} g */
function posKey(u, g) {
  const [r, c] = tileOf(u);
  return r < 0 || r >= g.rows || c < 0 || c >= g.cols ? -1 : r * g.cols + c;
}

/** The tile keys a unit occupies (spec 体积-1, 体积-2). @param {Body} u @param {Grid} g @returns {number[]} */
export function bodyKeys(u, g) {
  const R = hitRect(u);
  if (!R) { const k = posKey(u, g); return k < 0 ? [] : [k]; }
  const out = [];
  const r0 = Math.max(0, Math.floor(R.y0 + 0.5 + EPS)), r1 = Math.min(g.rows - 1, Math.ceil(R.y1 - 0.5 - EPS));
  const c0 = Math.max(0, Math.floor(R.x0 + 0.5 + EPS)), c1 = Math.min(g.cols - 1, Math.ceil(R.x1 - 0.5 - EPS));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * g.cols + c);
  return out;
}

/** Is the unit on tile (r, c)? @param {Body} u @param {number} r @param {number} c */
export function bodyOnTile(u, r, c) {
  const R = hitRect(u);
  if (!R) { const [ur, uc] = tileOf(u); return ur === r && uc === c; }
  return c + 0.5 > R.x0 + EPS && c - 0.5 < R.x1 - EPS && r + 0.5 > R.y0 + EPS && r - 0.5 < R.y1 - EPS;
}

/** Is the unit on any tile of `keys` (anything with `has`, or an array)? @param {Body} u @param {{ has(k: number): boolean } | number[]} keys @param {Grid} g */
export function bodyInKeys(u, keys, g) {
  if (!u || !keys) return false;
  const has = Array.isArray(keys) ? (/** @type {number} */ k) => keys.includes(k) : (/** @type {number} */ k) => keys.has(k);
  if (!u.hitArea) { const k = posKey(u, g); return k >= 0 && has(k); }
  return bodyKeys(u, g).some(has);
}

/** The distance from point (x, y) to the unit's body, 0 inside a rectangle (spec 体积-3). @param {Body} u @param {number} x @param {number} y */
export function bodyDist(u, x, y) {
  const R = hitRect(u);
  if (!R) return hypot(u.x - x, u.y - y);
  const dx = x < R.x0 ? R.x0 - x : x > R.x1 ? x - R.x1 : 0;
  const dy = y < R.y0 ? R.y0 - y : y > R.y1 ? y - R.y1 : 0;
  return hypot(dx, dy);
}

/** Is the unit's body within r tiles of (x, y)? @param {Body} u @param {number} x @param {number} y @param {number} r */
export const bodyInRadius = (u, x, y, r) => bodyDist(u, x, y) <= r + EPS;

/** Chebyshev reach in tiles from tile (r, c) to the body: 0 on it, 1 on the eight around … (spec 体积-4). @param {Body} u @param {number} r @param {number} c @param {Grid} g */
export function bodyTileReach(u, r, c, g) {
  if (!u.hitArea) { const [ur, uc] = tileOf(u); return Math.max(Math.abs(ur - r), Math.abs(uc - c)); }
  let best = Infinity;
  for (const k of bodyKeys(u, g)) {
    const kr = Math.floor(k / g.cols), kc = k % g.cols, d = Math.max(Math.abs(kr - r), Math.abs(kc - c));
    if (d < best) best = d;
  }
  return best;
}
