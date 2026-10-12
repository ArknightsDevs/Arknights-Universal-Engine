// The canvas and RectTransform geometry (docs/spec/ui.md 界面-1, 界面-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasSize, rectBox, transformCss, originCss, copyRect, DEF_RT, FULL_RT } from '../src/index.js';

const REF = [1920, 1080];

test('[界面-1] the canvas: the whole reference area on the page, the longer side grows', () => {
  assert.deepEqual(canvasSize(1920, 1080, REF), { k: 1, w: 1920, h: 1080 });
  assert.deepEqual(canvasSize(960, 540, REF), { k: 0.5, w: 1920, h: 1080 });
  const wide = canvasSize(2400, 1080, REF);
  assert.equal(wide.k, 1); assert.equal(wide.w, 2400); assert.equal(wide.h, 1080);
  const square = canvasSize(1440, 1080, REF);
  assert.equal(square.k, 0.75); assert.equal(square.w, 1920); assert.equal(square.h, 1440);
});

/** @param {Partial<import('../src/rect.js').Rect>} r */
const rt = (r) => ({ ...copyRect(DEF_RT), ...r });

test('[界面-2] a point-anchored rect: its pivot at the anchored position from the anchor, y turned down', () => {
  // a 100 × 50 rect anchored at the parent's top-right corner, pivot at its centre, 20 left and 30 down
  const b = rectBox(rt({ amin: [1, 1], amax: [1, 1], pos: [-20, -30], size: [100, 50] }), 400, 200, [0.5, 0.5]);
  assert.deepEqual(b, { left: 330, top: 5, w: 100, h: 50 });
  // pivot at the bottom-left
  const c = rectBox(rt({ amin: [0, 0], amax: [0, 0], pos: [10, 10], size: [100, 50], pivot: [0, 0] }), 400, 200, [0.5, 0.5]);
  assert.deepEqual(c, { left: 10, top: 140, w: 100, h: 50 });
});

test('[界面-2] a stretched rect: the anchors span plus the size delta; an animated local position from the parent pivot', () => {
  const s = rt({ amin: [0, 0], amax: [1, 0], pos: [0, 10], size: [-40, 30], pivot: [0.5, 0] });
  assert.deepEqual(rectBox(s, 400, 200, [0.5, 0.5]), { left: 20, top: 160, w: 360, h: 30 });
  const full = rectBox(copyRect(FULL_RT), 400, 200, [0.5, 0.5]);
  assert.deepEqual(full, { left: 0, top: 0, w: 400, h: 200 });
  // local position (25, −50) puts the pivot 25 right of and 50 below the parent's pivot
  const p = rectBox(rt({ size: [10, 10] }), 400, 200, [0.5, 0.5], [25, -50]);
  assert.deepEqual(p, { left: 220, top: 145, w: 10, h: 10 });
  const half = rectBox(rt({ size: [10, 10], pos: [5, 5] }), 400, 200, [0.5, 0.5], [null, 0]);
  assert.deepEqual(half, { left: 200, top: 95, w: 10, h: 10 });
});

test('[界面-2] rotation and scale about the pivot; no transform when there is none', () => {
  assert.equal(transformCss(rt({})), '');
  assert.equal(transformCss(rt({ rotz: 90, scale: [2, 1] })), 'rotate(-90.00deg) scale(2.0000, 1.0000)');
  assert.equal(transformCss(rt({}), 0.5), 'rotate(0.00deg) scale(0.5000, 0.5000)');
  assert.equal(originCss(rt({ pivot: [0, 1] })), '0% 0%');
  assert.equal(originCss(rt({ pivot: [0.5, 0] })), '50% 100%');
});
