// The direction a unit's model faces (docs/spec/render.md 渲染-4). A unit attacking something faces it while the attack clip
// plays and goes back to its deploy direction when the clip is over — PRTS「作战机制」§3.2.2 敌人朝向与相对方位
// （https://prts.wiki/index.php?title=作战机制&oldid=441625）：「进行攻击时：如背对攻击目标，则会先面向攻击目标再进行
// 攻击」，且「具有面向判定的敌人只有左右两种朝向」。干员侧的细节见该条款的实测与推断 INF-0272。
//
// 实测：重新索敌时按 45° 判一次（目标在上方且 |dy| > |dx| 用背面，其余用正面，左右按目标在哪一侧）；同一个目标持续
// 期间只在**正上/正下的窄带**（横向偏移占距离 ≤ 0.2）里换侧，窄带内不动左右。两个阈值是设计决定，没有量过：INF-0272。
import { DIR } from '@aue/schema';
import { faceTurns } from './faceModes.js';

/** 窄带：目标横向偏移占距离不超过它时算「正上/正下方」，此时才换侧、且不动左右 —— 推断 INF-0272。 */
export const FACING_DEAD_ZONE = 0.2;
/** 目标距离小于它时不判方向 —— 推断 INF-0272。 */
export const FACING_CLOSE = 0.25;

/** @typedef {{ side: 'front' | 'back', flip: boolean }} Facing */

/**
 * One step of the facing state machine (渲染-4).
 *
 * A target that is not the one the model already faces — a re-acquisition — decides the side from the 45° rule and the
 * mirror from which side the target is on. While the same target persists the side only changes inside the narrow band
 * around straight up / straight down, and inside the band the mirror is left alone.
 * @param {Facing} prev the side and mirror the model has now
 * @param {number} dx right-positive offset @param {number} dy up-positive offset
 * @param {boolean} newTarget whether this is a different target than before
 * @returns {Facing}
 */
export function facingStep(prev, dx, dy, newTarget) {
  const x = Number(dx) || 0, y = Number(dy) || 0;
  const d = Math.sqrt(x * x + y * y);
  if (d < FACING_CLOSE) return { side: prev.side, flip: prev.flip };
  if (newTarget) {
    return { side: y > 0 && Math.abs(y) > Math.abs(x) ? 'back' : 'front', flip: x < 0 };
  }
  if (Math.abs(x) / d <= FACING_DEAD_ZONE) return { side: y > 0 ? 'back' : 'front', flip: prev.flip };
  return { side: prev.side, flip: x < 0 };
}

/** The side a deploy direction alone gives (渲染-4): straight up is the back model. @param {number} dir */
export const sideOf = (dir) => (dir === DIR.UP ? 'back' : 'front');
/** Whether a deploy direction alone is mirrored (渲染-4). @param {number} dir */
export const flipOf = (dir) => dir === DIR.LEFT;
/** Whether an operator turns toward a target at all (the per-operator table). */
export { faceTurns };
