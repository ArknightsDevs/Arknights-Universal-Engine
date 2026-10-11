// Small skeletons built as data, for tests of poses: bones, slots, constraints, skins and animations with defaults
// for everything a test does not set.

/** @typedef {import('../src/skeleton.js').Skeleton} Skeleton */

/**
 * A bone: a name, a parent (−1 for the root) and any setup values.
 * @param {string} name @param {number} parent @param {Record<string, number | boolean>} [v]
 */
export const bone = (name, parent, v = {}) => ({
  name, parent, rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, length: 0, transform: 0, skinRequired: false, color: 0, ...v,
});

/** A slot on a bone, white, with an attachment key or none. @param {string} name @param {number} b @param {string | null} [attachment] */
export const slot = (name, b, attachment = null) => ({ name, bone: b, color: -1, dark: -1, attachment, blend: 0 });

/**
 * A skeleton from its parts; constraints and skins empty unless given.
 * @param {Partial<Skeleton> & { bones: Skeleton['bones'] }} parts @returns {Skeleton}
 */
export function skeleton(parts) {
  return /** @type {Skeleton} */ ({
    hash: '', version: '3.8.99', x: 0, y: 0, width: 0, height: 0, nonessential: null, slots: [],
    constraints: { ik: [], transform: [], path: [] }, skins: [], events: [], animations: [], ...parts,
  });
}

/** An IK constraint. @param {number[]} bones @param {number} target @param {Record<string, unknown>} [v] */
export const ik = (bones, target, v = {}) => ({
  name: 'ik', order: 0, skinRequired: false, bones, target, mix: 1, softness: 0, bend: 1, compress: false, stretch: false, uniform: false, ...v,
});

/** A transform constraint, world and absolute unless set. @param {number[]} bones @param {number} target @param {Record<string, unknown>} [v] */
export const transform = (bones, target, v = {}) => ({
  name: 'tc', order: 0, skinRequired: false, bones, target, local: false, relative: false, offsetRotation: 0, offsetX: 0, offsetY: 0,
  offsetScaleX: 0, offsetScaleY: 0, offsetShearY: 0, rotateMix: 1, translateMix: 1, scaleMix: 1, shearMix: 1, ...v,
});

/** The default skin with attachments by slot and key. @param {{ slot: number, key: string, attachment: Record<string, unknown> }[]} attachments */
export const defaultSkin = (attachments) => ({ name: 'default', bones: [], ik: [], transform: [], path: [], attachments });

/** Close enough for floating point. @param {number} a @param {number} b @param {number} [eps] */
export const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
