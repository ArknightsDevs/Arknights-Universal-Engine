// Stands in for Stronghold's server/sim/constants.js (兼容-2): the names its operator kits import. COLS and ROWS are
// the level's (兼容-1); TICK is the engine's frame (时间-1); the others are Stronghold v0.2.4's values, each to be
// checked against the official one when the kits using it are compared with the oracle.
export { COLS, ROWS } from '../grid.js';

/** Seconds per simulated frame (时间-1: 30 frames a second). */
export const TICK = 1 / 30;
/** Tiles a second = move speed × MOVE_SCALE. */
export const MOVE_SCALE = 0.5;
/** The least damage of a hit, as a share of the attack (伤害-2: 5%). */
export const MIN_DAMAGE_RATIO = 0.05;
/** The most 麻痹 layers. */
export const PALSY_MAX = 3;
/** Projectile speeds in tiles a second, by kind. */
export const PROJECTILE_SPEEDS = Object.freeze({ arrow: 14, bolt: 11, bomb: 8, lob: 8, orb: 10, drone: 16, enemy: 10, boomerang: 15, droneBomb: 5 });
/** Skills whose push is a 推 (not a 拉). */
export const PUSH_EFFECT_SKILLS = Object.freeze(new Set(['skchr_forcer_1', 'skchr_forcer_2']));
/** A pull stops this close to its point. */
export const PULL_STOP_RADIUS = 0.6708;
/** A push closer than this goes along the pusher's facing. */
export const PUSH_DIRECTIONAL_MIN_DIST = 0.25;
/** The reason an enemy leaves the field without reaching a goal. */
export const FORCED_EXIT = 'forcedExit';
/** How direct bonuses of one kind combine. */
export const DIRECT_BONUS_STACKING = 'add';
