// Stands in for Stronghold's server/sim/targeting.js (兼容-2): the names its operator kits import — the range keys and
// a unit's tile key from the engine's own (索敌-1, 体积-1); the rest still gaps.
import { targeting, body } from '@aue/sim';
import { COLS, ROWS } from '../grid.js';
import { gap } from './gap.js';

/**
 * The keys of the tiles a facing-RIGHT grid of [dRow, dCol] covers from tile (r, c) facing `d`, stretched `extend`
 * tiles ahead (索敌-1), in the grid's order.
 * @param {readonly number[][] | null} grid @param {number} r @param {number} c @param {unknown} d @param {number} [extend] @returns {number[]}
 */
export function absoluteRangeKeys(grid, r, c, d, extend = 0) {
  const offsets = (grid ?? []).map(([row, col]) => ({ row, col }));
  return [...targeting.rangeKeys({ rows: ROWS, cols: COLS }, { x: c, y: r, dir: d }, offsets, extend)];
}

/** The key of the tile a unit stands on (体积-1). @param {{ x: number, y: number }} u */
export function tileKeyOf(u) {
  const [r, c] = body.tileOf(u);
  return r * COLS + c;
}

export const aggroCmp = gap('targeting.aggroCmp');
export const canTargetEnemy = gap('targeting.canTargetEnemy');
export const enemyStealthed = gap('targeting.enemyStealthed');
export const sortEnemyTargets = gap('targeting.sortEnemyTargets');
