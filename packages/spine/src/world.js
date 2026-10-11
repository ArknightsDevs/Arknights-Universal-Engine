// A pose's world transforms (docs/spec/spine.md 骨骼-11): the bones and constraints in update order. Our own
// implementation of the Spine 3.8 semantics; no Spine runtime code.
import { updateBone } from './pose.js';
import { applyIk } from './ik.js';
import { applyTransform } from './transform.js';
import { applyPath } from './path.js';

/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./pose.js').Pose} Pose @typedef {import('./order.js').Order} Order */

/**
 * Every bone's world transform with the constraints applied (骨骼-11): the bones a constraint reads before they are
 * updated get their local values as applied values first; then each step in order.
 * @param {Pose} p @param {Skeleton} s @param {Order} order @param {number | null} [skin] the named skin in use
 */
export function updateWorld(p, s, order, skin = null) {
  for (const i of order.reset) {
    const b = p.bones[i];
    Object.assign(b.applied, { x: b.x, y: b.y, rotation: b.rotation, scaleX: b.scaleX, scaleY: b.scaleY, shearX: b.shearX, shearY: b.shearY });
    b.valid = true;
  }
  for (const step of order.steps) {
    if (step.kind === 'bone') updateBone(p, s, step.index);
    else if (step.kind === 'ik') applyIk(p, s, step.index);
    else if (step.kind === 'transform') applyTransform(p, s, step.index);
    else applyPath(p, s, step.index, skin);
  }
}
