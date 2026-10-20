// The direction a unit's model faces (docs/spec/render.md 渲染-4). A unit attacking something turns to face it before
// the attack lands — PRTS「作战机制」§3.2.2 敌人朝向与相对方位（https://prts.wiki/index.php?title=作战机制&oldid=441625）：「进行攻击时：如背对攻击目标，则会先面向攻击目标再进行攻击」，
// 且「具有面向判定的敌人只有左右两种朝向」。干员打完回正与下面两个阈值的取法见该条款与推断 INF-0272。
//
// The rule is derived from what the game can be seen to do (an operator faces the side its target is on, and does not
// flicker while a target sits near the boundary between two directions) plus one design decision of ours: the thresholds
// below are not measured from anything, they are registered as inference INF-0272 in docs/registry/inferences.json.
import { DIR } from '@aue/schema';
import { faceTurns } from './faceModes.js';

/**
 * 目标横向偏移占距离的比例不超过它时，左右不变（防抖）—— 为推断 INF-0272：没有量过，先按“靠近正上/正下时不翻面”
 * 的观感取 0.2。
 */
export const FACING_DEAD_ZONE = 0.2;
/** 目标距离小于它时不判方向，保持当前朝向 —— 同为推断 INF-0272，按“贴着身体的目标不转身”的观感取 0.25 格。 */
export const FACING_CLOSE = 0.25;

/** @typedef {{ dir: number, flip: boolean }} Facing */

/**
 * The facing a model takes for a target offset (dx = right, dy = up, in tiles), or null when the target is too close to
 * tell: the larger of the two offsets picks the axis, the sign of the horizontal one picks left / right, and a target
 * almost straight above or below keeps the left / right it already had (the dead zone).
 * @param {number} dx @param {number} dy @param {boolean} flipped the left / right the model has now
 * @returns {Facing | null}
 */
export function facingDir(dx, dy, flipped = false) {
  const x = Number(dx) || 0, y = Number(dy) || 0;
  const d = Math.sqrt(x * x + y * y);
  if (d < FACING_CLOSE) return null;
  const ax = Math.abs(x), ay = Math.abs(y);
  // 轴按较大的分量取（45° 为界）：实测朝右部署时右上不到 45° 的目标不转身，左下/后方来怪会转。
  if (ax > ay) return { dir: x < 0 ? DIR.LEFT : DIR.RIGHT, flip: x < 0 };
  // vertical: the axis of the swing, with the left / right carried over unless the target leans clearly to one side
  const flip = ax / d > FACING_DEAD_ZONE ? x < 0 : flipped;
  return { dir: y < 0 ? DIR.DOWN : DIR.UP, flip };
}

/**
 * Whether a model facing `dir` alone is mirrored (渲染-4): facing left is. Used where no target is in play.
 * @param {number} dir @returns {boolean}
 */
export const flipOf = (dir) => dir === DIR.LEFT;

/**
 * The facing a model takes for an attack on a target, honouring the per-operator overrides (渲染-4): null when the
 * operator's table row says it does not turn, or when the target is too close to tell.
 * @param {string} key the operator's content key @param {boolean} skillRunning whether its skill is running
 * @param {number} dx @param {number} dy @param {boolean} flipped @returns {Facing | null}
 */
export function facingFor(key, skillRunning, dx, dy, flipped = false) {
  if (!faceTurns(key, skillRunning)) return null;
  return facingDir(dx, dy, flipped);
}
