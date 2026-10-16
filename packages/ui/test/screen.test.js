// Screens on a page (docs/spec/ui.md 界面-1, 界面-3–界面-9), in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, copyRect, DEF_RT, refNode } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @param {any} [rt] @param {boolean} [active] @returns {PackNode} */
const N = (name, comps = {}, children = [], rt = undefined, active = true) => ({ name, active, comps, children, ...(rt ? { rt } : {}) });
/** @param {string | null} ref @param {Record<string, any>} [more] */
const img = (ref, more = {}) => ({ img: { kind: 'image', ref, color: [1, 1, 1, 1], type: 0, ...more } });
const row = { dir: 'h', pad: [10, 10, 0, 0], spacing: 5, align: 4, cw: 0, ch: 0, fw: 0, fh: 0, rev: 0 };
const col = { dir: 'v', pad: [0, 0, 0, 0], spacing: 0, align: 0, cw: 0, ch: 0, fw: 0, fh: 0, rev: 0 };
const PRESS = { transition: 1, colors: { normal: [1, 1, 1, 1], pressed: [0.5, 0.5, 0.5, 1], disabled: [0.5, 0.5, 0.5, 0.5] }, target: '@btn' };

/** @returns {import('../src/node.js').UiPack} */
const pack = () => ({
  version: 1, ref: [1920, 1080],
  sprites: { 'sprite/a': { w: 10, h: 10, uri: 'sprites/a.webp', border: [0, 0, 0, 0] } },
  clips: { fade: { wrap: 0, length: 1, curves: [{ kind: 'float', path: 'icon', attr: 'm_Alpha', keys: [[0, 0, 0, 0], [1, 1, 0, 0]] }] },
    spin_loop: { wrap: 0, length: 2, curves: [{ kind: 'euler', path: '', keys: [[0, [0, 0, 0], [0, 0, 180], [0, 0, 180]], [2, [0, 0, 360], [0, 0, 180], [0, 0, 180]]] }] } },
  screens: {
    main: N('main', {}, [
      N('row', { lg: row }, [N('a', {}, [], R({ size: [20, 20] })), N('b', {}, [], R({ size: [30, 20] })), N('off', {}, [], R({ size: [99, 9] }), false)],
        R({ amin: [0, 0], amax: [1, 0], size: [0, 40], pivot: [0.5, 0] })),
      N('icon', img('sprite/a'), [], R({ size: [50, 50] })),
      N('plain', img(null, { color: [1, 0, 0, 0.5] })),
      N('gone', img('sprite/missing')),
      N('hidden', img('sprite/a', { mat: { kind: 'none' } })),
      N('add', img('sprite/a', { mat: { kind: 'add' } })),
      N('label', { text: { text: 'hi', size: 20, style: 0, align: 4, color: [1, 1, 1, 1], best: 0, hwrap: 1, font: 'Novecentowide-Normal' } }),
      N('fit', { text: { text: '12345', size: 70, style: 0, align: 4, color: [1, 1, 1, 1], best: 1, min: 1, max: 70, hwrap: 0 }, csf: [0, 0] }, [], R({ size: [100, 92] })),
      N('btn', { button: PRESS, ...img('sprite/a') }, [N('collider', { nodraw: 'raycast' })]),
      N('bar', { slider: { fill: '@bar/area/fill', dir: 0, min: 0, max: 10, value: 0, whole: 0 } }, [N('area', {}, [N('fill', img('sprite/a'))])]),
      N('back', { slider: { fill: '@back/fill', dir: 3, min: 0, max: 1, value: 0, whole: 1 } }, [N('fill', img('sprite/a'))]),
      N('ring', { slider: { fill: '@ring/fill', dir: 0, min: 0, max: 1, value: 0, whole: 0 } }, [N('fill', img('sprite/a', { type: 3, fill: 0, fillMethod: 4 }))]),
      N('list', { lg: col }, [], R({ size: [100, 300] })),
      N('masked', { mask: 'rect' }),
      N('mask', { mask: 'mask', maskHide: true, ...img('sprite/a') }),
      N('world', { canvas: {} }, [N('persp', {}, [N('dot', img('sprite/a'))])], R({ size: [100, 100], scale: [0.01, 0.01] })),
      N('screen', { canvas: {} }, [], R({ size: [0, 0] })),
      N('wrapping', { text: { text: 'a b c', size: 20, style: 0, align: 3, color: [1, 1, 1, 1], best: 0, hwrap: 0, vwrap: 1 } }, [], R({ size: [50, 100] })),
      N('fitted', { text: { text: 'a b c', size: 20, style: 0, align: 3, color: [1, 1, 1, 1], best: 0, hwrap: 0, vwrap: 1 }, csf: [2, 0] }, [], R({ size: [0, 30] })),
      N('oneline', { text: { text: 'a b c', size: 20, style: 0, align: 3, color: [1, 1, 1, 1], best: 0, hwrap: 0, vwrap: 0 } }, [], R({ size: [50, 30] })),
      N('laid', { lg: { ...row, cw: 1 } }, [N('cell', { text: { text: 'a b c', size: 20, style: 0, align: 3, color: [1, 1, 1, 1], best: 0, hwrap: 0, vwrap: 1 } })]),
    ]),
    bar: N('bar', {}, [], R({ amin: [0, 1], amax: [1, 1], size: [0, 1], pivot: [0, 1] })),
    item: N('item', { slider: { fill: '@x', dir: 0, min: 0, max: 1, value: 0, whole: 0 } }, [N('x', img('sprite/a'))], R({ size: [40, 40] })),
  },
});

const setup = () => {
  const doc = fakeDocument(), host = fakeHost(doc), ui = createUi({ pack: pack(), host, base: '/u/' });
  ui.resize(960, 540);
  return { ui, host, scr: ui.open('main') };
};
/** @param {any} el */
const css = (el) => /** @type {Record<string, string>} */ (el.style);

test('[界面-1] screens fill the canvas and scale to the page', () => {
  const { ui, scr } = setup();
  ui.tick(0);
  assert.deepEqual(ui.canvas, { k: 0.5, w: 1920, h: 1080 });
  assert.equal(css(scr.wrap).transform, 'scale(0.5)');
  assert.equal(css(scr.wrap).width, '1920px');
  const world = /** @type {any} */ (scr.one('world')), screen = /** @type {any} */ (scr.one('screen'));
  assert.equal(world.w, 100, 'a canvas with its own size keeps it');
  assert.equal(screen.w, 1920, 'a canvas without one fills its parent');
  const sub = ui.open('main', { at: 'world/persp', frame: [100, 100], z: 3 });
  ui.tick(0);
  assert.equal(css(sub.wrap).width, '100px');
  assert.equal(css(sub.wrap).zIndex, '3');
  assert.equal(css(sub.wrap).transform, undefined, 'a framed screen is placed by the page');
  assert.ok(refNode(/** @type {any} */ (sub.one('dot')), '@world/persp/dot'));
  assert.equal(refNode(/** @type {any} */ (sub.one('dot')), '@row'), null);
  assert.equal(refNode(sub.root, '@world/persp'), sub.root);
  assert.throws(() => ui.open('main', { at: 'nothing' }));
  const top = ui.open('bar');
  ui.tick(0);
  assert.deepEqual(top.root.box, [0, 0, 1920, 1], 'a prefab root with its own rect keeps it: a strip along the top');
  ui.close(sub);
  assert.equal(ui.screens.length, 2);
});

test('[界面-3] a layout group places its active children', () => {
  const { ui, scr } = setup();
  ui.tick(0);
  const a = /** @type {any} */ (scr.one('row/a')), b = /** @type {any} */ (scr.one('row/b'));
  // 1920 wide, padding 10 + 10, children 20 + 5 + 30 = 55 centred
  assert.deepEqual(a.box, [10 + (1900 - 55) / 2, 10, 20, 20]);
  assert.deepEqual(b.box, [10 + (1900 - 55) / 2 + 25, 10, 30, 20]);
  assert.equal(/** @type {any} */ (scr.one('row/off')).lgRect, null);
  const fit = /** @type {any} */ (scr.one('fit'));
  assert.equal(css(fit.t).fontSize, '40px', 'best fit: 175 px wide at 70 → 70 × 100 / 175');
});

test('[界面-4] texts that wrap at their width, and those sized to their own width or one line high that do not', () => {
  const { scr } = setup();
  const ws = (/** @type {string} */ name) => css(/** @type {any} */ (scr.one(name)).t).whiteSpace ?? '';
  assert.equal(ws('wrapping'), 'pre-wrap');
  assert.deepEqual([ws('fitted'), ws('oneline'), ws('laid/cell')], ['', '', ''], 'a content size fitter, a truncating one-line rect, a layout group setting widths');
});

test('[界面-4] images: the sprite tinted, the colour without one, nothing for a missing sprite, a page picture', () => {
  const { ui, scr } = setup();
  scr.color('icon', [1, 1, 1, 0.5]);
  ui.tick(0);
  const icon = /** @type {any} */ (scr.one('icon')), plain = /** @type {any} */ (scr.one('plain')), gone = /** @type {any} */ (scr.one('gone'));
  assert.equal(css(icon.g).backgroundImage, 'url("/u/sprites/a.webp")');
  assert.equal(css(icon.g).opacity, '0.5');
  assert.equal(css(plain.g).backgroundColor, 'rgba(255,0,0,1)');
  assert.equal(css(plain.g).opacity, '0.5');
  assert.equal(css(gone.g).backgroundImage, 'none');
  scr.picture('plain', '/avatar.png');
  scr.sprite('gone', 'sprite/a');
  ui.tick(0);
  assert.equal(css(plain.g).backgroundImage, 'url("/avatar.png")');
  assert.equal(css(gone.g).backgroundImage, 'url("/u/sprites/a.webp")');
  assert.equal(css(/** @type {any} */ (scr.one('add')).g).mixBlendMode, 'plus-lighter');
  assert.equal(css(/** @type {any} */ (scr.one('masked')).el).overflow, 'hidden');
  scr.text('label', '<b>x</b>');
  assert.equal(/** @type {any} */ (scr.one('label')).t.textContent, 'x');
  assert.equal(css(/** @type {any} */ (scr.one('label')).t).fontFamily, 'var(--aue-ui-latin)');
});

test('[界面-9] graphics not drawn: an unknown material, a hidden mask graphic, a raycast-only graphic', () => {
  const { scr } = setup();
  assert.equal(/** @type {any} */ (scr.one('hidden')).g, null);
  assert.equal(/** @type {any} */ (scr.one('mask')).g, null);
  assert.equal(/** @type {any} */ (scr.one('btn/collider')).g, null);
});

test('[界面-5] clips play on the clock: once then held, looping, delayed, reversed', async () => {
  const { ui, scr } = setup();
  const icon = /** @type {any} */ (scr.one('icon'));
  let done = false;
  scr.play('', 'fade').then(() => { done = true; });
  assert.equal(icon.alpha, 0, 'the first frame at once');
  ui.tick(0.5);
  assert.equal(icon.alpha, 0.5);
  ui.tick(0.6);
  await Promise.resolve();
  assert.equal(icon.alpha, 1);
  assert.ok(done);
  scr.play('', 'fade', { reverse: true, delay: 0.5 });
  assert.equal(icon.alpha, 1, 'nothing before the delay');
  ui.tick(0.75);
  assert.equal(icon.alpha, 0.84375, 'reversed: the curve at 0.75');
  scr.play('', 'spin_loop');
  ui.tick(3);
  assert.ok(Math.abs(scr.root.rt.rotz - 180) < 1e-9, 'looping');
  assert.equal(await scr.play('', 'missing'), undefined);
  ui.close(scr);
  assert.equal(ui.anim.playing.length, 0);
});

test('[界面-6] a tap on a shown node; pressing tints the button\'s target graphic', () => {
  const { ui, scr } = setup();
  ui.tick(0);
  /** @type {string[]} */
  const taps = [];
  scr.tap('btn/collider', (_, s) => taps.push(s.n.name));
  const collider = /** @type {any} */ (scr.one('btn/collider')), btn = /** @type {any} */ (scr.one('btn'));
  assert.ok(collider.el.classList.contains('aue-hot'));
  collider.el.fire('pointerdown');
  assert.deepEqual(btn.tint, [0.5, 0.5, 0.5, 1]);
  collider.el.fire('pointerup');
  assert.equal(btn.tint, null);
  collider.el.fire('click');
  assert.deepEqual(taps, ['collider']);
  scr.show('btn', false);
  ui.tick(0);
  collider.el.fire('click');
  assert.deepEqual(taps, ['collider'], 'a hidden node does not answer');
  /** @type {string[]} */
  const downs = [];
  scr.on('icon', 'pointerdown', () => downs.push('down'));
  /** @type {any} */ (scr.one('icon')).el.fire('pointerdown');
  assert.deepEqual(downs, ['down']);
});

test('[界面-7] sliders: the fill rect\'s anchors, reversed, whole numbers, a filled image', () => {
  const { scr } = setup();
  scr.slider('bar', 2.5);
  assert.deepEqual(/** @type {any} */ (scr.one('bar/area/fill')).rt.amax, [0.25, 1]);
  scr.slider('bar', 20);
  assert.deepEqual(/** @type {any} */ (scr.one('bar/area/fill')).rt.amax, [1, 1]);
  scr.slider('back', 0.4);
  assert.deepEqual(/** @type {any} */ (scr.one('back/fill')).rt.amin, [0, 1], 'whole numbers: 0.4 rounds to 0, from the top');
  scr.slider('back', 0.6);
  assert.deepEqual(/** @type {any} */ (scr.one('back/fill')).rt.amin, [0, 0]);
  scr.slider('ring', 0.3);
  assert.equal(/** @type {any} */ (scr.one('ring/fill')).fill, 0.3);
  scr.fill('ring/fill', 0.7);
  assert.equal(/** @type {any} */ (scr.one('ring/fill')).fill, 0.7);
  scr.slider('icon', 1);
});

test('[界面-8] templates instantiated into a list, their references resolved in the instance, removed', () => {
  const { ui, scr } = setup();
  const list = /** @type {any} */ (scr.one('list'));
  const a = scr.instantiate(list, 'item'), b = scr.instantiate(list, 'item'), c = scr.instantiate(list, 'item', 0);
  assert.deepEqual(list.kids, [c, a, b]);
  ui.tick(0);
  assert.deepEqual([c.box?.[1], a.box?.[1], b.box?.[1]], [0, 40, 80]);
  scr.slider('', 0.5, b);
  assert.deepEqual(/** @type {any} */ (scr.one('x', b)).rt.amax, [0.5, 1]);
  assert.deepEqual(/** @type {any} */ (scr.one('x', a)).rt.amax, [0.5, 0.5], 'the other instance untouched');
  scr.remove(a);
  assert.deepEqual(list.kids, [c, b]);
  assert.equal(scr.all.filter((s) => s.n.name === 'x').length, 2, 'the removed instance has left the screen');
  assert.throws(() => scr.instantiate(list, 'nothing'));
});
