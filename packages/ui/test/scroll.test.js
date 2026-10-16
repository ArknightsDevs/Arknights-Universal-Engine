// Scroll views (docs/spec/ui.md 界面-27): the motion after Unity's ScrollRect, and drags, the wheel, scroll bars, drag
// parts and a pager in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, copyRect, DEF_RT } from '../src/index.js';
import { ELASTIC, CLAMPED, UNRESTRICTED, smoothDamp, range, outOf, rubber, dragged, settle, normalized, handleSpan, pageOf } from '../src/scrollmath.js';
import { setBar, DRAG_START } from '../src/scroll.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @param {any} [rt] @returns {PackNode} */
const N = (name, comps = {}, children = [], rt = undefined) => ({ name, active: true, comps, children, ...(rt ? { rt } : {}) });
const col = { dir: 'v', pad: [0, 0, 0, 0], spacing: 0, align: 0, cw: 0, ch: 0, fw: 0, fh: 0, rev: 0 };
const row = { ...col, dir: 'h' };
const SCROLL = { h: 0, v: 1, move: ELASTIC, elasticity: 0.1, inertia: 1, decel: 0.135, sens: 1, hvis: 1, vvis: 0 };
const bar = N('bar', { scrollbar: { handle: '@sv/bar/handle', dir: 2, value: 0, size: 1 } }, [N('handle')], R({ size: [10, 300] }));

/** A vertical view of 300 over 800 of content (two items of 400), and a pager of two pages of 400 across. @returns {any} */
const pack = () => ({
  version: 1, ref: [1000, 500], sprites: {}, clips: {},
  screens: {
    main: N('main', {}, [
      N('sv', { img: { kind: 'image', ref: null, color: [1, 1, 1, 1], type: 0, ray: 1 }, scroll: { ...SCROLL, content: '@sv/vp/ct', viewport: '@sv/vp', vbar: '@sv/bar' },
        dragFit: { hide: '@sv/more', arrows: { top: '@sv/up', down: '@sv/down', left: null, right: null } } },
      [N('vp', {}, [N('ct', { lg: col, csf: [0, 2] }, [N('a', {}, [], R({ size: [100, 400] })), N('b', {}, [], R({ size: [100, 400] }))],
        R({ amin: [0, 1], amax: [1, 1], pivot: [0.5, 1], size: [0, 0] }))], R({ amin: [0, 0], amax: [1, 1], size: [0, 0] })), bar, N('more'), N('up'), N('down')],
      R({ size: [400, 300] })),
      N('pg', { scroll: { ...SCROLL, h: 1, v: 0, content: '@pg/vp/ct', viewport: '@pg/vp' }, pager: { scroll: '@pg', time: 0.3 } },
        [N('vp', {}, [N('ct', { lg: row, csf: [2, 0] }, [N('p1', {}, [], R({ size: [400, 100] })), N('p2', {}, [], R({ size: [400, 100] }))],
          R({ amin: [0, 0], amax: [0, 1], pivot: [0, 0.5], size: [0, 0] }))], R({ amin: [0, 0], amax: [1, 1], size: [0, 0] }))], R({ size: [400, 100], pos: [0, -200] })),
      N('small', { scroll: { ...SCROLL, content: '@small/ct' }, dragFit: { hide: '@small/more', arrows: {} } },
        [N('ct', {}, [], R({ amin: [0, 1], amax: [1, 1], pivot: [0.5, 1], size: [0, 100] })), N('more')], R({ size: [200, 300], pos: [300, 0] })),
    ]),
  },
});

const setup = () => {
  const ui = createUi({ pack: pack(), host: fakeHost(fakeDocument()) });
  ui.resize(1000, 500);
  const s = ui.open('main');
  ui.tick(0.016); ui.tick(0.016);
  return { ui, s };
};
/** @param {any} n @param {string} t @param {number} x @param {number} y */
const ptr = (n, t, x, y) => n.el.fire(t, { clientX: x, clientY: y, pointerId: 1 });

test('[界面-27] the offsets a view allows: the content inside the viewport\'s edges; a small content at its pivot', () => {
  assert.deepEqual(range(-500, 800, 300, 1), [0, 500], 'content below the viewport\'s top: 0 up to 500');
  assert.deepEqual(range(200, 100, 300, 1), [0, 0], 'a small content at its top pivot stays');
  assert.deepEqual(range(0, 100, 300, 0.5), [100, 100]);
  assert.deepEqual([outOf(-5, [0, 9]), outOf(12, [0, 9]), outOf(4, [0, 9])], [5, -3, 0]);
  assert.ok(Math.abs(rubber(300, 300) - (1 - 1 / 1.55) * 300) < 1e-9);
  assert.equal(rubber(-10, 0), -0);
});

test('[界面-27] dragging: elastic past the edge by the rubber band, clamped inside, unrestricted as dragged', () => {
  assert.equal(dragged(50, [0, 100], 300, ELASTIC), 50);
  assert.ok(Math.abs(dragged(-60, [0, 100], 300, ELASTIC) + rubber(60, 300)) < 1e-9);
  assert.equal(dragged(-60, [0, 100], 300, CLAMPED), 0);
  assert.equal(dragged(-60, [0, 100], 300, UNRESTRICTED), -60);
});

test('[界面-27] let go: springs back over its elasticity, coasts and slows by its deceleration rate, stops below 1 a second; clamped stays inside', () => {
  const o = { move: ELASTIC, elasticity: 0.1, inertia: 1, decel: 0.135 };
  const back = { off: -40, vel: 0 };
  for (let i = 0; i < 60; i++) settle(back, [0, 100], o, 1 / 60);
  assert.ok(Math.abs(back.off) < 0.05 && back.vel === 0, `${back.off}`);
  const coast = { off: 50, vel: 200 };
  settle(coast, [0, 1000], o, 1);
  assert.ok(Math.abs(coast.vel - 200 * 0.135) < 1e-9 && Math.abs(coast.off - (50 + 27)) < 1e-9);
  const slow = { off: 0, vel: 1.2 };
  settle(slow, [0, 1000], o, 1);
  assert.equal(slow.vel, 0);
  const clamped = { off: 990, vel: 500 };
  settle(clamped, [0, 1000], { ...o, move: CLAMPED }, 1);
  assert.equal(clamped.off, 1000);
  const none = { off: 0, vel: 9 };
  settle(none, [0, 10], { ...o, inertia: 0 }, 1);
  assert.equal(none.vel, 0);
  assert.deepEqual(smoothDamp(0, 10, 1000, 0.1, 0.1), [10, 0], 'no overshoot');
  assert.ok(smoothDamp(0, 10, 0, 0.1, 0.05)[0] < 10);
});

test('[界面-27] scroll bars and pages: the normalized position, the handle\'s span, the page a pager settles on', () => {
  assert.equal(normalized(250, -500, 800, 300), 0.5);
  assert.equal(normalized(0, 0, 100, 300), 0);
  assert.deepEqual(handleSpan(0.5, 0.5, false), [0.25, 0.75]);
  assert.deepEqual(handleSpan(0, 0.25, true), [0.75, 1]);
  const r = /** @type {[number, number]} */ ([-400, 0]);
  assert.deepEqual([pageOf(-150, r, 400, 0), pageOf(-250, r, 400, 0), pageOf(-100, r, 400, -500), pageOf(-300, r, 400, 500)], [0, -400, -400, 0]);
});

test('[界面-27] a drag moves the content past the start distance; a tap that turned into a drag is no tap; it coasts, then stays inside', () => {
  const { ui, s } = setup();
  const sv = /** @type {any} */ (s.one('sv')), ct = /** @type {any} */ (s.one('sv/vp/ct'));
  /** @type {number[]} */
  const caps = [];
  sv.el.setPointerCapture = (/** @type {number} */ id) => caps.push(id);
  ptr(sv, 'pointerdown', 10, 200);
  ptr(sv, 'pointermove', 10, 200 - DRAG_START + 1);
  assert.equal(ct.rt.pos[1], 0, 'not yet a drag');
  assert.deepEqual(caps, [], 'a press keeps its click for the buttons in the view');
  for (let y = 180; y >= 100; y -= 20) { ptr(sv, 'pointermove', 10, y); ui.tick(0.016); }
  assert.deepEqual(caps, [1], 'the drag takes the pointer once');
  assert.equal(ct.rt.pos[1], 100);
  ptr(sv, 'pointerup', 10, 100);
  let stopped = false;
  sv.el.fire('click', { stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
  for (let i = 0; i < 300; i++) ui.tick(0.05);
  assert.ok(ct.rt.pos[1] > 100 && ct.rt.pos[1] <= 500, `${ct.rt.pos[1]}`);
  sv.el.fire('wheel', { deltaY: 1000, deltaX: 0 });
  for (let i = 0; i < 100; i++) ui.tick(0.05);
  assert.ok(Math.abs(ct.rt.pos[1] - 500) < 0.5, 'past the end, back to it');
});

test('[界面-27] its scroll bar follows; drag parts hide when the content fits; arrows show where there is more; a pager settles on a page', () => {
  const { ui, s } = setup();
  const handle = /** @type {any} */ (s.one('sv/bar/handle'));
  assert.deepEqual([handle.rt.amin[1], handle.rt.amax[1]], [0.625, 1], 'vertical, from the bottom: at the top end, 300 of 800');
  assert.deepEqual([s.one('sv/more')?.active, s.one('sv/up')?.active, s.one('sv/down')?.active], [true, false, true]);
  assert.equal(s.one('small/more')?.active, false, 'its content fits');
  const small = /** @type {any} */ (s.one('small'));
  ptr(small, 'pointerdown', 400, 100);
  ptr(small, 'pointermove', 400, 50);
  ui.tick(0.016);
  assert.equal(/** @type {any} */ (s.one('small/ct')).rt.pos[1], 0, 'no drag when it fits');
  const pg = /** @type {any} */ (s.one('pg')), pct = /** @type {any} */ (s.one('pg/vp/ct'));
  ptr(pg, 'pointerdown', 300, 400);
  for (let x = 280; x >= 160; x -= 20) { ptr(pg, 'pointermove', x, 400); ui.tick(0.016); }
  ptr(pg, 'pointerup', 160, 400);
  for (let i = 0; i < 30; i++) ui.tick(0.02);
  assert.equal(pct.rt.pos[0], -400, 'the next page');
  setBar(/** @type {any} */ (s.one('sv')), 0, 1);
  setBar(handle, 0, 1);
});
