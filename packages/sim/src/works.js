// 玉门天灾工事 (docs/spec/field.md 地图-3): the raised ground tiles; while the level's 地形增伤控制 is in effect, a ground
// unit on one deals more damage to the ground units on ordinary tiles and takes less from them, and the two kinds of
// tile do not block each other's units.
import { keyAt } from './paths.js';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */

/** The tiles that are 玉门天灾工事, deployable or not (地图-3). */
const WORKS = Object.freeze(['tile_passable_wall', 'tile_passable_wall_forbidden']);

/**
 * Where a unit stands for the 工事 rule (地图-3): null for a flying one or one off the map, else whether its tile is a
 * 工事.
 * @param {Content} c @param {Unit} u @returns {boolean | null}
 */
export function onWorks(c, u) {
  const m = c.level, k = keyAt(m, u.x, u.y);
  if (k < 0 || statsOf(u).flying) return null;
  return WORKS.includes(m.tiles[Math.floor(k / m.width)][k % m.width].key);
}

/** Whether a unit's tile is a 工事, flying or not (false off the map). @param {Content} c @param {Unit} u */
function onWorksTile(c, u) {
  const m = c.level, k = keyAt(m, u.x, u.y);
  return k >= 0 && WORKS.includes(m.tiles[Math.floor(k / m.width)][k % m.width].key);
}

/**
 * Whether the 工事 rule can tell two units apart (地图-3): only when one of them stands on a 工事 — otherwise each is off
 * the map, flying, or on an ordinary tile, and the rule treats them alike.
 * @param {Content} c @param {Unit} a @param {Unit} b
 */
const worksBetween = (c, a, b) => onWorksTile(c, a) || onWorksTile(c, b);

/**
 * The 工事 damage multiplier of a hit (地图-3, 伤害-7): with the rule in effect and both units on the ground, the level's
 * `dealt` when the source is on a 工事 and the target is not, its `taken` the other way round, else 1.
 * @param {Content} c @param {Unit} src @param {Unit} target
 */
export function worksMul(c, src, target) {
  const rule = c.level.works;
  if (!rule || !worksBetween(c, src, target)) return 1;
  const a = onWorks(c, src), b = onWorks(c, target);
  return a === null || b === null || a === b ? 1 : a ? rule.dealt : rule.taken;
}

/**
 * Whether a unit may block an enemy as far as the 工事 go (地图-3): always without the rule or when either flies; with
 * it, otherwise only when both stand on 工事 or both do not.
 * @param {Content} c @param {Unit} blocker @param {Unit} e
 */
export function sameGround(c, blocker, e) {
  if (!c.level.works || !worksBetween(c, blocker, e)) return true;
  const a = onWorks(c, blocker), b = onWorks(c, e);
  return a === null || b === null || a === b;
}
