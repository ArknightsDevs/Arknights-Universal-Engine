// An operator's attack range now (docs/spec/skills.md 技能-8, 攻击-1): its skill's while the skill runs and has one, its
// own otherwise — the one content gave it, else its record's —, turned with it, extended by its 攻击距离.
import { statsOf } from './attrs.js';
import { rangeKeys } from './targeting.js';
import { traitOfDef } from './traits.js';
import { dirOfCode } from './dir.js';

/** @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/**
 * The tile keys an operator's attack reaches now (攻击-1, 技能-8): every tile of the map while a skill that reaches it
 * runs; the skill's range while one with a range runs; else the operator's range — with the extra tiles content gave it.
 * The same set as the last time while nothing it is worked out from changed: read it, never change it.
 * @param {Content} c @param {Unit} op @returns {Set<number>}
 */
export function reachKeys(c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, d = c.operators[op.key], sk = op.skill && op.skill.active ? d.skill : undefined;
  if (sk && sk.rangeAll) return new Set(Array.from({ length: grid.rows * grid.cols }, (_, k) => k));
  const range = (sk && sk.range) || op.range || d.range, extend = statsOf(op).rangeExtend, m = reachMemo.get(op);
  if (m !== undefined && sameReach(m, c, op, range, extend)) return m.keys;
  const keys = rangeKeys(grid, op, range, extend);
  for (const k of op.reachExtra ?? []) keys.add(k);
  reachMemo.set(op, { c, x: op.x, y: op.y, dir: op.dir, cells: range.flatMap((x) => [x.row, x.col]), extend, extra: op.reachExtra ? [...op.reachExtra] : undefined, keys });
  return keys;
}

/**
 * Each operator's last reach and what it was worked out from — content, position, facing, the range's cells (row, col
 * pairs: content may change a cell in place), 攻击距离, extra tiles — given again while they are the same (targeting
 * asks every frame). Not part of the state; never change the set.
 * @type {WeakMap<Unit, { c: Content, x: number, y: number, dir: unknown, cells: number[], extend: number, extra: number[] | undefined, keys: Set<number> }>}
 */
const reachMemo = new WeakMap();

/**
 * Whether an operator's last reach was worked out from what it stands on now.
 * @param {{ c: Content, x: number, y: number, dir: unknown, cells: number[], extend: number, extra: number[] | undefined }} m
 * @param {Content} c @param {Unit} op @param {readonly { row: number, col: number }[]} range @param {number} extend
 */
const sameReach = (m, c, op, range, extend) => m.c === c && m.x === op.x && m.y === op.y && m.dir === op.dir && Object.is(m.extend, extend)
  && sameCells(m.cells, range) && sameList(m.extra, op.reachExtra);

/** Whether a range's cells are still these row, col pairs. @param {readonly number[]} cells @param {readonly { row: number, col: number }[]} range */
function sameCells(cells, range) {
  if (cells.length !== range.length * 2) return false;
  for (let i = 0; i < range.length; i++) if (range[i].row !== cells[2 * i] || range[i].col !== cells[2 * i + 1]) return false;
  return true;
}

/** Whether two lists of tile keys are the same (both none, or the same keys in order). @param {readonly number[] | undefined} a @param {readonly number[] | undefined} b */
function sameList(a, b) {
  if (!a || !b) return !a === !b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Content gives an operator extra tiles its attack reaches (攻击-1): tile keys (row × width + col) of the map, kept until
 * content sets them again; none takes them away.
 * @param {Content} c @param {Unit} op @param {readonly number[] | null} keys
 */
export function setExtraRange(c, op, keys) {
  const n = c.level.width * c.level.height, out = [...new Set((keys ?? []).filter((k) => Number.isInteger(k) && k >= 0 && k < n))];
  op.reachExtra = out.length ? out : undefined;
}

/**
 * Content changes an operator's own attack range (攻击-1): offsets as its record gives them, facing right; none brings
 * back its record's.
 * @param {Unit} op @param {readonly { row: number, col: number }[] | null} cells
 */
export function setRange(op, cells) {
  if (cells) op.range = cells.map((x) => ({ row: x.row, col: x.col }));
  else delete op.range;
}

/**
 * What an operator would reach deployed on a tile facing a direction (渲染-9): its own range turned with it, and whether
 * its normal attack heals (职业-2).
 * @param {Content} c @param {string} key @param {number} row @param {number} col @param {number} dir the protocol's direction code (schema DIR)
 * @returns {{ keys: Set<number>, heal: boolean }}
 */
export function placedReach(c, key, row, col, dir) {
  const d = c.operators[key];
  return { keys: rangeKeys({ rows: c.level.height, cols: c.level.width }, { x: col, y: row, dir: dirOfCode(dir) }, d.range), heal: traitOfDef(d).heal === true };
}
