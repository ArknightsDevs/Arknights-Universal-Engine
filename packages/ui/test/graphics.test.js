// Graphics, texts and what is not drawn (docs/spec/ui.md 界面-4, 界面-9), and auto layout (界面-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillCss, gradientCss, sliceOf, isSliced, drawable, blendOf, uvSpeed, rgba, drawNine, richHtml, isRich, faceOf, alignCss, shadowCss, bestFit, DEFAULT_FONTS } from '../src/index.js';

test('[界面-4] filled images: horizontal, vertical, radial from each origin either way', () => {
  assert.deepEqual(fillCss(0.25, 0, 0, true), [['clipPath', 'inset(0 75% 0 0)']]);
  assert.deepEqual(fillCss(0.25, 0, 1, true), [['clipPath', 'inset(0 0 0 75%)']]);
  assert.deepEqual(fillCss(0.5, 1, 0, true), [['clipPath', 'inset(50% 0 0 0)']]);
  assert.deepEqual(fillCss(2, 1, 1, true), [['clipPath', 'inset(0 0 0% 0)']]);
  assert.deepEqual(fillCss(0.25, 4, 2, true)[0], ['maskImage', 'conic-gradient(from 0deg, #000 90deg, transparent 0)']);
  assert.deepEqual(fillCss(0.25, 4, 0, false)[0], ['maskImage', 'conic-gradient(from 180deg, transparent 270deg, #000 0)']);
  assert.equal(fillCss(0.5, 4, 9, true)[1][1], 'conic-gradient(from 180deg, #000 180deg, transparent 0)');
});

test('[界面-4] gradients, nine-slice borders, colours', () => {
  assert.equal(gradientCss({ dir: 1, points: [[[1, 0, 0, 1], 0], [[0, 0, 1, 0.5], 1]] }, [1, 1, 1, 0.5]), 'linear-gradient(to right, rgba(255,0,0,0.5) 0%, rgba(0,0,255,0.25) 100%)');
  assert.equal(gradientCss({ dir: 0, points: [] }, [0, 0, 0, 1]), 'rgba(0,0,0,1)');
  assert.equal(gradientCss({ dir: 0, points: [[[1, 1, 1, 1], 0.5]] }, [1, 1, 1, 1]), 'linear-gradient(to top, rgba(255,255,255,1) 50%)');
  assert.deepEqual(sliceOf({ kind: 'image', border: [1, 2, 3, 4] }, undefined), [1, 3, 4, 2]);
  assert.deepEqual(sliceOf({ kind: 'atlas', slice: [0.25, 0.1, 0.75, 0.9] }, { w: 40, h: 20 }), [10, 10, 2, 2]);
  assert.deepEqual(sliceOf({ kind: 'raw' }, undefined), [0, 0, 0, 0]);
  assert.ok(isSliced({ kind: 'image', type: 1, border: [0, 0, 4, 0] }));
  assert.ok(!isSliced({ kind: 'image', type: 1, border: [0, 0, 0, 0] }));
  assert.ok(isSliced({ kind: 'atlas', mesh: 1 }));
  assert.equal(rgba([0.5, 0, 1, 0.12345]), 'rgba(128,0,255,0.123)');
});

test('[界面-4] nine-slice drawing: corners kept, shrunk in proportion when they do not fit', () => {
  /** @type {number[][]} */
  const calls = [];
  const x = /** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ ({ drawImage: (/** @type {unknown[]} */ ...a) => calls.push(/** @type {number[]} */ (a.slice(1))) }));
  const img = /** @type {HTMLImageElement} */ (/** @type {unknown} */ ({ width: 30, height: 30 }));
  drawNine(x, img, [10, 10, 10, 10], [0, 0, 100, 50]);
  assert.equal(calls.length, 9);
  assert.deepEqual(calls[0], [0, 0, 10, 10, 0, 0, 10, 10]);
  assert.deepEqual(calls[8], [20, 20, 10, 10, 90, 40, 10, 10]);
  calls.length = 0;
  drawNine(x, img, [10, 10, 10, 10], [0, 0, 10, 40]);
  assert.deepEqual(calls[0], [0, 0, 10, 10, 0, 0, 5, 10], 'corners halve across when the width is half the borders');
  assert.equal(calls.length, 6, 'no centre column');
});

test('[界面-4] texts: rich text, faces, alignment, outlines and shadows, best fit', () => {
  assert.ok(isRich('a<color=#ff0000>b</color>'));
  assert.ok(!isRich('a < b'));
  assert.equal(richHtml('<b>x</b> & <color=#ff0000>y</color><size=20>z</size><i>w</i> <q>'),
    '<b>x</b> &amp; <span style="color:#ff0000">y</span><span style="font-size:20px">z</span><i>w</i> &lt;q&gt;');
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'Novecentowide-Normal', '12', 0), ['var(--aue-ui-latin)', 400]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'Novecentowide-Normal', '12', 1), ['var(--aue-ui-latin)', 700]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, undefined, 'PAUSE 2×', 0), ['var(--aue-ui-latin)', 500]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'Unknown', '暂停中', 1), ['var(--aue-ui-cjk)', 700]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'SourceHanSansCN-Heavy', '房间', 0), ['var(--aue-ui-cjk)', 900]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'JovannyLemonad-Bender', '2', 0), ['var(--aue-ui-bender)', 400], 'the lobby\'s name for Bender');
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'AEwide', '1', 0), ['var(--aue-ui-latin)', 400], 'no AEwide: the Latin wide face');
  assert.deepEqual(alignCss(4), { justifyContent: 'center', alignItems: 'center', textAlign: 'center' });
  assert.deepEqual(alignCss(6), { justifyContent: 'flex-start', alignItems: 'flex-end', textAlign: 'left' });
  assert.equal(shadowCss({ color: [0, 0, 0, 1], d: [1, -2], kind: 'shadow' }), '1px 2px 0 rgba(0,0,0,1)');
  assert.equal(shadowCss({ color: [0, 0, 0, 1], d: [1, 1], kind: 'outline' }).split(', ').length, 4);
  assert.equal(bestFit([200, 50], 70, [100, 92], [1, 70]), 35);
  assert.equal(bestFit([50, 20], 70, [100, 92], [1, 70]), 70);
  assert.equal(bestFit([1000, 50], 70, [100, 92], [10, 70]), 10);
  assert.equal(bestFit([0, 0], 70, [100, 92], [1, 70]), 70);
});

test('[界面-9] materials: the ones not drawn, additive blending, scrolling UVs', () => {
  assert.ok(drawable(undefined));
  assert.ok(drawable({ kind: 'add' }));
  assert.ok(!drawable({ kind: 'none' }));
  assert.equal(blendOf({ kind: 'add' }), 'plus-lighter');
  assert.equal(blendOf({ kind: 'uv', uv: [1, 0], add: true }), 'plus-lighter');
  assert.equal(blendOf({ kind: 'blend' }), '');
  assert.equal(blendOf(undefined), '');
  assert.deepEqual(uvSpeed({ kind: 'uv', uv: [0.225, 0] }), [0.225, 0]);
  assert.equal(uvSpeed({ kind: 'add' }), null);
});
