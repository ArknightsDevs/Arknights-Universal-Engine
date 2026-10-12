// An operator's attack range now (docs/spec/skills.md 技能-8, 攻击-1): its skill's while the skill runs and has one, its
// own otherwise — turned with it, extended by its 攻击距离.
import { statsOf } from './attrs.js';
import { rangeKeys } from './targeting.js';

/** @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/**
 * The tile keys an operator's attack reaches now (攻击-1, 技能-8): every tile of the map while a skill that reaches it
 * runs; the skill's range while one with a range runs; else the operator's range.
 * @param {Content} c @param {Unit} op @returns {Set<number>}
 */
export function reachKeys(c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, d = c.operators[op.key], sk = op.skill && op.skill.active ? d.skill : undefined;
  if (sk && sk.rangeAll) return new Set(Array.from({ length: grid.rows * grid.cols }, (_, k) => k));
  return rangeKeys(grid, op, (sk && sk.range) || d.range, statsOf(op).rangeExtend);
}
