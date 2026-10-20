// The direction a unit's model faces (docs/spec/render.md 渲染-4). A unit attacking something turns to face it when the
// attack clip starts and goes back to its deploy direction when that clip is over — PRTS「作战机制」§3.2.2 敌人朝向与
// 相对方位（https://prts.wiki/index.php?title=作战机制&oldid=441625）：「进行攻击时：如背对攻击目标，则会先面向攻击
// 目标再进行攻击」，且「具有面向判定的敌人只有左右两种朝向」。干员侧的细节见该条款的实测与推断 INF-0272。
//
// 实测（model B）：只有目标落在**正上方的窄带**里才用背面模型；其余（含正下方、水平、斜向）都是正面。窄带内左右不变
// （优先同侧）。窄带宽度与贴身距离是设计决定，没有量过：为推断 INF-0272。
import { DIR } from '@aue/schema';
import { faceTurns } from './faceModes.js';

/** 目标横向偏移占距离的比例不超过它时算「正上/正下方」，左右不变 —— 推断 INF-0272。 */
export const FACING_DEAD_ZONE = 0.2;
/** 目标距离小于它时不判方向 —— 推断 INF-0272。 */
export const FACING_CLOSE = 0.25;

/** @typedef {{ dir: number, flip: boolean }} Facing */

/**
 * The facing a model takes for a target offset (dx = right, dy = up, in tiles), or null when the target is too close to
 * judge: only a target inside the band around straight up takes the back model, every other one faces the side it is on
 * with the front model, and inside the band the left / right the model already had is kept.
 * @param {number} dx @param {number} dy @param {boolean} flipped the left / right the model has now
 * @returns {Facing | null}
 */
export function facingDir(dx, dy, flipped = false) {
  const x = Number(dx) || 0, y = Number(dy) || 0;
  const d = Math.sqrt(x * x + y * y);
  if (d < FACING_CLOSE) return null;
  if (Math.abs(x) / d <= FACING_DEAD_ZONE) return { dir: y > 0 ? DIR.UP : DIR.DOWN, flip: flipped };
  return { dir: x < 0 ? DIR.LEFT : DIR.RIGHT, flip: x < 0 };
}

/**
 * The facing a model takes for an attack on a target, honouring the per-operator table (渲染-4): null when the operator
 * does not turn in the state it is in, or when the target is too close to tell.
 * @param {string} key the operator's content key @param {boolean} skillRunning whether its skill is running
 * @param {number} dx @param {number} dy @param {boolean} flipped @returns {Facing | null}
 */
export function facingFor(key, skillRunning, dx, dy, flipped = false) {
  if (!faceTurns(key, skillRunning)) return null;
  return facingDir(dx, dy, flipped);
}

/** Whether a model facing `dir` alone is mirrored (渲染-4): facing left is. Used where no target is in play. @param {number} dir */
export const flipOf = (dir) => dir === DIR.LEFT;
