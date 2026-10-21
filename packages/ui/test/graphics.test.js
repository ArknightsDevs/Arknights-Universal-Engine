// Graphics, texts and what is not drawn (docs/spec/ui.md 界面-4, 界面-9), and auto layout (界面-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillCss, gradientCss, sliceOf, isSliced, drawable, blendOf, uvSpeed, rgba, ringAlpha, ringMask, wipeAlpha, drawNine, richHtml, isRich, faceOf, alignCss, shadowCss, bestFit, DEFAULT_FONTS,
  shaded, noiseOffset, warpUv, fadeAlpha, createUi, setText, copyRect, DEF_RT } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

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
  // pivot on the bottom edge: the tape starts at 0.5 there (a shade over the bottom half, clear above)
  assert.equal(gradientCss({ dir: 0, points: [[[0, 0, 0, 0.8], 0.5], [[0, 0, 0, 0], 1]] }, [1, 1, 1, 1], [0.5, 0]), 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 50%)');
  assert.equal(gradientCss({ dir: 1, points: [[[0, 0, 0, 0], 0], [[0, 0, 0, 1], 0.5]] }, [1, 1, 1, 1], [1, 0.5]), 'linear-gradient(to right, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 100%)');
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
  // borders that meet (each half the width): the middle column is the line of pixels where they meet, stretched
  calls.length = 0;
  const bar = /** @type {HTMLImageElement} */ (/** @type {unknown} */ ({ width: 63, height: 59 }));
  drawNine(x, bar, [31.5, 31.5, 1, 1], [0, 0, 346, 1000]);
  assert.equal(calls.length, 9);
  assert.deepEqual(calls[3].slice(0, 4), [31, 0, 1, 1], 'the middle column, top row');
  assert.deepEqual(calls[4], [31, 1, 1, 57, 31.5, 1, 283, 998]);
});

test('[界面-4] texts: rich text, faces, alignment, outlines and shadows, best fit', () => {
  assert.ok(isRich('a<color=#ff0000>b</color>'));
  assert.ok(!isRich('a < b'));
  assert.equal(richHtml('<b>x</b> & <color=#ff0000>y</color><size=20>z</size><i>w</i> <q>'),
    '<b>x</b> &amp; <span style="color:#ff0000">y</span><span style="font-size:20px">z</span><i>w</i> &lt;q&gt;');
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'Novecentowide-Normal', '12', 0), ['var(--aue-ui-latin)', 400, true], 'a capitals-only font: in capitals');
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'Novecentowide-Normal', '12', 1), ['var(--aue-ui-latin)', 700, true]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, undefined, 'PAUSE 2×', 0), ['var(--aue-ui-latin)', 500, false]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'Unknown', '暂停中', 1), ['var(--aue-ui-cjk)', 700, false]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'SourceHanSansCN-Heavy', '房间', 0), ['var(--aue-ui-cjk)', 900, false]);
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'JovannyLemonad-Bender', '2', 0), ['var(--aue-ui-bender)', 400, false], 'the lobby\'s name for Bender');
  assert.deepEqual(faceOf(DEFAULT_FONTS, 'AEwide', '1', 0), ['var(--aue-ui-latin)', 400, false], 'no AEwide: the Latin wide face');
  assert.deepEqual(alignCss(4), { justifyContent: 'center', alignItems: 'center', textAlign: 'center' });
  assert.deepEqual(alignCss(6), { justifyContent: 'flex-start', alignItems: 'flex-end', textAlign: 'left' });
  assert.equal(shadowCss({ color: [0, 0, 0, 1], d: [1, -2], kind: 'shadow' }), '1px 2px 0 rgba(0,0,0,1)');
  assert.equal(shadowCss({ color: [0, 0, 0, 1], d: [1, 1], kind: 'outline' }).split(', ').length, 4);
  assert.equal(bestFit([200, 50], 70, [100, 92], [1, 70]), 35);
  assert.equal(bestFit([50, 20], 70, [100, 92], [1, 70]), 70);
  assert.equal(bestFit([1000, 50], 70, [100, 92], [10, 70]), 10);
  assert.equal(bestFit([0, 0], 70, [100, 92], [1, 70]), 70);
});

test('[界面-9] a circle shape on a shown image: a ring between its radii, softened; one radius a disk', () => {
  // a ground's edge: clear in the middle, opaque from half way out (outer 1, inner 0.49 softened over 0.5)
  const edge = [1, 0.49, 0.005, 0.5];
  assert.ok(ringAlpha(edge, 0) < 0.01);
  assert.ok(ringAlpha(edge, 0.25) > 0.4 && ringAlpha(edge, 0.25) < 0.6);
  assert.equal(ringAlpha(edge, 0.5), 1);
  // a thin ring: opaque between 0.392 and 0.475 only
  const ring = [0.475, 0.392, 0.005, 0.005];
  assert.deepEqual([0.3, 0.43, 0.5].map((d) => ringAlpha(ring, d)), [0, 1, 0]);
  assert.deepEqual([0.2, 0.6].map((d) => ringAlpha([0.42], d)), [1, 0], 'a disk');
  const m = ringMask(edge);
  assert.match(m, /^radial-gradient\(ellipse 100% 100% at 50% 50%, rgba\(0,0,0,0(\.\d+)?\) 0%, /);
  assert.match(m, /rgba\(0,0,0,1\) 71%\)$/);
});

test('[界面-9] a wipe: nothing at green 0, all at green 0.94 and up; between, the texels further along its texture first', () => {
  const soft = { soft: 0.5, di: 0, rgb: 0 }, hard = { soft: 0, di: 0, rgb: 0 };
  assert.deepEqual([0, 0.5, 1].map((n) => wipeAlpha(soft, 0, n)), [0, 0, 0], 'not begun');
  assert.deepEqual([0, 0.5, 1].map((n) => wipeAlpha(soft, 0.94, n)), [1, 1, 1], 'done');
  assert.deepEqual([0, 0.5, 1].map((n) => wipeAlpha(soft, 1, n)), [1, 1, 1], 'at rest (white) the image shows');
  const mid = [0, 0.25, 0.5, 0.75, 1].map((n) => wipeAlpha(hard, 0.5, n));
  assert.deepEqual(mid, [...mid].sort((x, y) => x - y), 'more of it shows the higher the texture');
  assert.ok(mid[0] < 0.5 && mid[4] > 0.5);
  assert.equal(wipeAlpha({ soft: 0, di: 0.9, rgb: 1 }, 0, 0.5), wipeAlpha({ soft: 0, di: 0.9, rgb: 1 }, 1, 0.5), 'colour-tinted: its intensity, not the green');
});

test("[界面-36] a warp: the UVs pulled toward the noise by its amount, the noise scrolling; both times twice the colour's red and green", () => {
  // the prepare page's background: the noise scrolls 0.01 a second each way, the UVs pulled 0.02 toward it
  const bg = { kind: /** @type {const} */ ('none'), fx: 'warp', noise: 'sprite/fxnoise/flow', speed: [0.01, 0.01], amount: [0.02, 0.02] }, white = [1, 1, 1, 1];
  assert.ok(shaded(bg));
  assert.ok(!shaded({ kind: 'none', fx: 'warp' }), 'no noise: drawn plainly');
  assert.ok(!shaded({ kind: 'none', fx: 'disturb', noise: 'n' }), 'other effects: drawn plainly');
  const uv = warpUv(bg, white, 0, [0.5, 1], 0.25);
  assert.ok(Math.abs(uv[0] - (0.5 + 0.04 * (0.25 - 0.5))) < 1e-12 && Math.abs(uv[1] - (1 + 0.04 * (0.25 - 1))) < 1e-12, `${uv}`);
  assert.deepEqual(warpUv(bg, [0, 1, 1, 1], 0, [0.5, 1], 0.25), [0.5, 1], 'a colour of no red: no pull');
  const o = noiseOffset(bg, white, 10);
  assert.ok(Math.abs(o[0] - 0.2) < 1e-9 && Math.abs(o[1] - 0.2) < 1e-9, `${o}`);
  assert.deepEqual(noiseOffset(bg, white, 0), [0, 0]);
  const w = noiseOffset(bg, white, 75);
  assert.ok(w[0] >= 0 && w[0] < 1 && Math.abs(w[0] - 0.5) < 1e-9, 'wrapped');
  assert.deepEqual(warpUv({ ...bg, scroll: [0.1, 0] }, white, 1, [0, 0], 0), [0.1 * 0.96, 0], 'the image scrolled, then pulled');
});

test("[界面-36] a fade: the image's alpha times the gain and how far the noise is past the threshold, at most 1; all of it with no threshold", () => {
  // the countdown circle's line: threshold 0.047 over a width of 1, gain 1.2
  const ring = { kind: /** @type {const} */ ('none'), fx: 'fade', noise: 'sprite/fxnoise/flow', speed: [0.4, -0.3], di: 0.047, border: 1, opacity: 1.2 };
  assert.ok(shaded(ring));
  assert.ok(Math.abs(fadeAlpha(ring, 1, 0.5) - 1.2 * (0.5 - 0.047)) < 1e-9);
  assert.equal(fadeAlpha(ring, 1, 0.04), 0, 'short of the threshold');
  assert.equal(fadeAlpha(ring, 1, 1), 1, 'at most 1');
  assert.ok(Math.abs(fadeAlpha(ring, 0.5, 0.5) - 0.6 * 0.453) < 1e-9, "times the image's alpha");
  assert.equal(fadeAlpha({ ...ring, di: 0, opacity: 1 }, 0.8, 0), 0.8, 'no threshold: all of it');
  assert.ok(Math.abs(fadeAlpha({ ...ring, di: 0.5, border: 0.1 }, 1, 0.55) - 0.6) < 1e-9, 'half way past the threshold over the width');
  const o = noiseOffset(ring, [0, 0, 0, 1], 1);
  assert.ok(Math.abs(o[0] - 0.4) < 1e-9 && Math.abs(o[1] - 0.7) < 1e-9, "its scroll is the material's, not the colour's");
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

test('[界面-4] a rich text is one inline run in its text box, so its coloured parts wrap with the rest', () => {
  const text = { text: '', size: 16, style: 0, align: 0, line: 1, best: 0, min: 1, max: 40, rich: 1, hwrap: 0, vwrap: 0, color: [1, 1, 1, 1] };
  const pack = { version: 1, ref: [100, 100], sprites: {}, clips: {}, screens: { main: { name: 'main', active: true, comps: {}, rt: copyRect(DEF_RT),
    children: [{ name: 'desc', active: true, comps: { text }, children: [], rt: copyRect(DEF_RT) }] } } };
  const ui = createUi(/** @type {any} */ ({ pack, host: fakeHost(fakeDocument()) })), s = /** @type {any} */ (ui.open('main').one('desc'));
  setText(s, '攻击力提高至<color=#0098DC>290%</color>');
  assert.equal(s.t.innerHTML, '<span class="aue-r">攻击力提高至<span style="color:#0098DC">290%</span></span>');
  setText(s, '没有标签');
  assert.equal(s.t.textContent, '没有标签', 'a plain text as it is');
});
