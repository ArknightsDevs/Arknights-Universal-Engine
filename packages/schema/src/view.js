// The render state, version 1 (ADR 0053): one Float64Array per simulated frame, transferred from the worker to the
// main thread without a copy. Layout: the header, then each player's fields, then each unit's fields.
// Positions are in tile coordinates of the level: x = column, y = row (row 0 the nearest), z = the height level of the
// tile under the unit (0 ground, 1 high ground); the renderer turns them into world coordinates. `owner` is the player
// index of an operator, −1 for enemies.

export const VIEW_VERSION = 1;

/** The header fields, in order. */
export const VIEW_HEADER = Object.freeze(['version', 'frame', 'units', 'players']);
/** Each player's fields, in order. */
export const VIEW_PLAYER = Object.freeze(['life', 'cost']);
/** Each unit's fields, in order. */
export const VIEW_UNIT = Object.freeze(['id', 'kind', 'owner', 'x', 'y', 'z', 'dir', 'hp', 'maxHp', 'anim']);

/** Unit kinds. */
export const KIND = Object.freeze({ OPERATOR: 0, ENEMY: 1 });
/** What a unit is doing, for the renderer's animation choice. */
export const ANIM = Object.freeze({ IDLE: 0, MOVE: 1, ATTACK: 2, DIE: 3 });
/** Operator facing: the four deploy directions. */
export const DIR = Object.freeze({ RIGHT: 0, UP: 1, LEFT: 2, DOWN: 3 });

/** @typedef {{ life: number, cost: number }} ViewPlayer */
/** @typedef {{ id: number, kind: number, owner: number, x: number, y: number, z: number, dir: number, hp: number, maxHp: number, anim: number }} ViewUnit */
/** @typedef {{ frame: number, players: ViewPlayer[], units: ViewUnit[] }} View */

/** The length in numbers of a view. @param {number} units @param {number} players */
export function viewLength(units, players) {
  return VIEW_HEADER.length + players * VIEW_PLAYER.length + units * VIEW_UNIT.length;
}

/**
 * Writes a view; returns the array (a new one when `out` is missing or too short).
 * @param {View} view @param {Float64Array} [out] @returns {Float64Array}
 */
export function writeView(view, out) {
  const n = viewLength(view.units.length, view.players.length);
  const a = out && out.length >= n ? out : new Float64Array(n);
  let i = 0;
  for (const v of [VIEW_VERSION, view.frame, view.units.length, view.players.length]) a[i++] = v;
  for (const p of view.players) for (const k of VIEW_PLAYER) a[i++] = p[/** @type {keyof ViewPlayer} */ (k)];
  for (const u of view.units) for (const k of VIEW_UNIT) a[i++] = u[/** @type {keyof ViewUnit} */ (k)];
  return a;
}

/** @template T @param {Float64Array} a @param {number} at @param {readonly string[]} fields @returns {T} */
function record(a, at, fields) {
  /** @type {Record<string, number>} */
  const r = {};
  fields.forEach((k, j) => { r[k] = a[at + j]; });
  return /** @type {T} */ (r);
}

/**
 * Reads a view written by writeView.
 * @param {Float64Array} a @returns {View}
 */
export function readView(a) {
  if (a[0] !== VIEW_VERSION) throw new RangeError(`render state version ${a[0]}, expected ${VIEW_VERSION}`);
  const frame = a[1], units = a[2], players = a[3];
  if (a.length < viewLength(units, players)) throw new RangeError('render state shorter than its header says');
  const p0 = VIEW_HEADER.length, u0 = p0 + players * VIEW_PLAYER.length;
  return {
    frame,
    players: Array.from({ length: players }, (_, i) => record(a, p0 + i * VIEW_PLAYER.length, VIEW_PLAYER)),
    units: Array.from({ length: units }, (_, i) => record(a, u0 + i * VIEW_UNIT.length, VIEW_UNIT)),
  };
}
