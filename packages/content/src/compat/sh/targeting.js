// Stands in for Stronghold's server/sim/targeting.js (兼容-2): the names its operator kits import — the range keys, a
// unit's tile key and whether an ability may select an enemy, by the engine's own rules (索敌-1, 索敌-2, 体积-1); the rest
// still gaps.
import { targeting, body, attrs } from '@aue/sim';
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

/** @typedef {{ alive: boolean, u: import('@aue/sim').Unit | null }} Target a kit's unit (compat/unit.js) */

/** Whether an enemy is 隐匿 now (索敌-2). @param {Target} e */
export const enemyStealthed = (e) => !!e.u && attrs.statsOf(e.u).flags.stealth === true;

/**
 * Whether an ability with Stronghold's profile may select an enemy (索敌-2): on the field with HP, not disappeared,
 * 无法选中, 隐匿 or out of the battle; asleep only for a profile that hits sleepers; flying only for one that can hit
 * flying units and is not ground-only; never one the profile skips.
 * @param {unknown} _attacker @param {Target} e @param {Record<string, any> | null | undefined} profile
 */
export function canTargetEnemy(_attacker, e, profile) {
  const u = e?.u, p = profile ?? {};
  if (!u || !e.alive || u.hidden) return false;
  const s = attrs.statsOf(u), f = s.flags;
  if (f.untargetable || f.stealth || f.sidelined || (f.sleep && !p.hitSleep)) return false;
  if (s.flying && (!p.canHitFly || p.groundOnly)) return false;
  return !(typeof p.skipEnemy === 'function' && p.skipEnemy(e));
}

export const aggroCmp = gap('targeting.aggroCmp');
export const sortEnemyTargets = gap('targeting.sortEnemyTargets');
