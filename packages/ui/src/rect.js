// RectTransform geometry (docs/spec/ui.md 界面-1, 界面-2): the canvas a screen is laid out on, and a rect's box in its
// parent — Unity's anchors, pivot, size delta and anchored position, with y up turned into the page's y down.

/** @typedef {{ amin: number[], amax: number[], pos: number[], size: number[], pivot: number[], scale: number[], rotz: number, q?: number[] }} Rect */
/** @typedef {{ left: number, top: number, w: number, h: number }} Box */

/** A transform without a RectTransform: a 100 × 100 rect at its parent's centre. @type {Readonly<Rect>} */
export const DEF_RT = Object.freeze({ amin: [0.5, 0.5], amax: [0.5, 0.5], pos: [0, 0], size: [100, 100], pivot: [0.5, 0.5], scale: [1, 1], rotz: 0 });
/** A rect filling its parent: a screen's root, a nested screen-space canvas. @type {Readonly<Rect>} */
export const FULL_RT = Object.freeze({ amin: [0, 0], amax: [1, 1], pos: [0, 0], size: [0, 0], pivot: [0.5, 0.5], scale: [1, 1], rotz: 0 });

/** A rect's own copy (animations and the page change it). @param {Readonly<Rect>} rt @returns {Rect} */
export const copyRect = (rt) => ({ amin: [...rt.amin], amax: [...rt.amax], pos: [...rt.pos], size: [...rt.size], pivot: [...rt.pivot], scale: [...rt.scale], rotz: rt.rotz });

/**
 * The canvas for a page of `width` × `height` pixels (界面-1): scaled by k = min(width / refW, height / refH), so the whole
 * reference area stays on the page and the longer side grows.
 * @param {number} width @param {number} height @param {readonly number[]} ref the reference resolution
 * @returns {{ k: number, w: number, h: number }} the scale and the canvas size in reference units
 */
export function canvasSize(width, height, ref) {
  const k = Math.min(width / ref[0], height / ref[1]);
  return { k, w: width / k, h: height / k };
}

/**
 * A rect's box in its parent of `PW` × `PH` (界面-2), from the top-left corner: the width is the anchors' span of the parent
 * plus the size delta; the pivot sits at the anchored position from the anchors' reference point. `lp` (an animated
 * local position, either axis optional) places the pivot from the parent's pivot instead.
 * @param {Rect} rt @param {number} PW @param {number} PH @param {readonly number[]} ppivot the parent's pivot
 * @param {(number | null)[] | null} [lp]
 * @returns {Box}
 */
export function rectBox(rt, PW, PH, ppivot, lp) {
  const w = (rt.amax[0] - rt.amin[0]) * PW + rt.size[0], h = (rt.amax[1] - rt.amin[1]) * PH + rt.size[1];
  const px = lp?.[0] != null ? lp[0] - (rt.amin[0] + (rt.amax[0] - rt.amin[0]) * rt.pivot[0] - ppivot[0]) * PW : rt.pos[0];
  const py = lp?.[1] != null ? lp[1] - (rt.amin[1] + (rt.amax[1] - rt.amin[1]) * rt.pivot[1] - ppivot[1]) * PH : rt.pos[1];
  const left = rt.amin[0] * PW + px - rt.size[0] * rt.pivot[0];
  const bottom = rt.amin[1] * PH + py - rt.size[1] * rt.pivot[1];
  return { left, top: PH - bottom - h, w, h };
}

/**
 * The CSS transform of a rect: its rotation and scale about the pivot, times a press scale (1 unpressed).
 * @param {Rect} rt @param {number} press
 */
export function transformCss(rt, press = 1) {
  if (!rt.rotz && rt.scale[0] === 1 && rt.scale[1] === 1 && press === 1) return '';
  return `rotate(${(-rt.rotz).toFixed(2)}deg) scale(${(rt.scale[0] * press).toFixed(4)}, ${(rt.scale[1] * press).toFixed(4)})`;
}

/** The CSS transform origin of a rect's pivot (y down). @param {Rect} rt */
export const originCss = (rt) => `${rt.pivot[0] * 100}% ${(1 - rt.pivot[1]) * 100}%`;
