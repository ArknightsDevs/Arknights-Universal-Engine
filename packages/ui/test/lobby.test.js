// The lobby pack's kinds (docs/spec/ui.md 界面-2, 界面-8, 界面-9, 界面-24–界面-26, 界面-28–界面-34), in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, copyRect, DEF_RT, FULL_RT, nodeAt } from '../src/index.js';
import { applyCurve } from '../src/curves.js';
import { drawable, blendOf, arcMask } from '../src/paint.js';
import { fitSize, ringCss } from '../src/text.js';
import { aspectSize } from '../src/fit.js';
import { ease, tweenAt } from '../src/tween.js';
import { passes } from '../src/anim.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @param {any} [rt] @param {boolean} [active] @returns {PackNode} */
const N = (name, comps = {}, children = [], rt = undefined, active = true) => ({ name, active, comps, children, ...(rt ? { rt } : {}) });
/** @param {Record<string, any>} [more] */
const img = (more = {}) => ({ img: { kind: 'image', ref: null, color: [1, 1, 1, 1], type: 0, ...more } });
const COLORS = { normal: [1, 1, 1, 1], pressed: [0.5, 0.5, 0.5, 1], disabled: [0.3, 0.3, 0.3, 0.5] };
const row = { dir: 'h', pad: [0, 0, 0, 0], spacing: 0, align: 0, cw: 0, ch: 0, fw: 0, fh: 0, rev: 0 };
/** @param {string} t @param {Record<string, any>} [more] */
const text = (t, more = {}) => ({ text: { text: t, size: 24, style: 0, align: 0, color: [0, 0, 0, 1], best: 0, hwrap: 0, min: 2, max: 40, font: 'NotoSansHans-Medium', ...more } });

/** A lobby-like pack (its graphics say whether they take taps). @returns {any} */
const pack = () => ({
  version: 1, ref: [1280, 720], sprites: {}, sounds: { click: { 0: 'ui.ON_DEFAULT_BTN_CLICK' } },
  clips: {
    show: { wrap: 0, length: 1, curves: [], events: [{ t: 0, kind: 'start' }, { t: 0.5, kind: 'sound', bank: 'ui.ON_MULTIV3_PICK' }, { t: 1, kind: 'end' }, { t: 0.7, kind: 'call', data: 'next' }] },
  },
  screens: {
    main: N('main', {}, [
      N('hit', img({ ray: 1 })), N('plain', img()), N('area', { nodraw: 'raycast' }),
      N('off', { group: { alpha: 1, blocks: 0 } }, [N('inside', img({ ray: 1 }))]),
      N('locked', { group: { alpha: 1, interactable: 0 } }, [N('btn', { button: { transition: 1, colors: COLORS, target: '@locked/btn/bg' }, nodraw: 'raycast' }, [N('bg', img())])]),
      N('hot', { button: { transition: 1, colors: COLORS, target: '@hot' }, colorSet: { color: [1, 1, 1, 1], targets: ['@hot_bg', '@hot_text'] }, nodraw: 'raycast', click: { type: 0 } }),
      N('hot_bg', img()), N('hot_text', text('go')),
      N('sw', { switch: { on: '@sw/on', off: '@sw/off', awake: 0 } }, [N('on', {}, [], undefined, false), N('off')]),
      N('swf', { switch: { on: '@swf/on', off: '@swf/off', awake: 0, fade: 0.5 } }, [N('on', {}, [], undefined, false), N('off')]),
      N('items', { list: { template: 'screen:item' }, lg: row }, [], R({ size: [500, 50] })),
      N('rec', { recycle: { dir: 'h', viewport: '@', content: '@rec', pad: [10, 0, 0, 0], spacing: 5 } }, [], R({ size: [500, 50] })),
      N('slot', { mark: { screen: 'screen:dot', visible: 0 } }, [], R({ size: [0, 0] })), N('slot2', { inst: { screen: 'screen:dot', at: '@slot2' } }),
      N('gone', { mark: { screen: 'screen:missing', visible: 1 } }),
      N('dup', {}, [N('box')]), N('dup', {}, [N('box', {}, [N('deep')])]),
      N('fit', { bestFit: { min: 2 }, ...text('twenty characters!!!') }, [], R({ size: [100, 200] })),
      N('ring', text('x', { mat: { kind: 'outline', width: 5, color: [0, 0, 0, 1] } })),
      N('fx', img({ ref: 'logo', mat: { kind: 'none', fx: 'dissolve', add: true } })), N('fxBare', img({ mat: { kind: 'none', fx: 'dissolve' } })), N('grey', img({ mat: { kind: 'grey' } })),
      N('field', { input: { text: '@field/value', placeholder: '@field/hint', limit: 6, caret: [0, 0, 0, 1] }, nodraw: 'raycast' }, [N('value', text('')), N('hint', text('输入赛事ID'))]),
      N('tw', { group: { alpha: 1 }, tween: { kind: 'fade', from: 0, to: 1, startFrom: 1, time: 1, delay: 0, ease: 1, loop: -1, loopType: 1, auto: 1 } }),
      N('arc', { ...img({ fill: 1, fillMethod: 4 }), circle: { start: -90, span: 270 } }),
      N('cover', { bgFit: { ratio: 2 } }, [], R({ amin: [0, 0], amax: [1, 1], size: [0, 0] })),
      N('nest', {}, [N('full', { fullscreen: true })], R({ size: [100, 100], pos: [200, 0] })),
      N('scaled', { scaler: { target: '@scaled', steps: [{ rt: '@scaled', pos: [0, 0], size: [200, 100] }, { rt: '@scaled/kid', pos: [20, 10], size: [40, 20], text: { size: 20 } }] } },
        [N('kid', text('k', { size: 20 }), [], R({ size: [40, 20], pos: [20, 10] }))], R({ size: [100, 50] })),
      N('box', {}, [], R({ size: [300, 200] })),
    ]),
    item: N('item', {}, [N('label', text(''))], R({ size: [40, 50] })),
    dot: N('dot', img(), [], R({ size: [35, 35] })),
    canvasRoot: N('canvasRoot', { canvas: {} }, [N('a')], R({ scale: [0, 0], size: [0, 0], amin: [0, 0], amax: [0, 0] })),
  },
});

const setup = () => {
  const sounds = /** @type {string[]} */ ([]), doc = fakeDocument();
  const ui = createUi({ pack: pack(), host: fakeHost(doc), sound: (b) => sounds.push(b) });
  ui.resize(1280, 720);
  const s = ui.open('main');
  ui.tick(0);
  return { ui, s, sounds, doc };
};
/** @param {any} el */
const css = (el) => /** @type {Record<string, string>} */ (el.style);
/** @param {any} el @param {string} t @param {Record<string, unknown>} [more] */
const fire = (el, t, more) => el.fire(t, more);

test('[界面-24] a pack marking tap targets: marked graphics and tap-only areas take the pointer, the rest lets it through; a group that does not block takes its subtree out', () => {
  const { ui, s } = setup();
  assert.equal(ui.ctx.rays, true);
  assert.deepEqual(['hit', 'plain', 'area', 'off/inside'].map((t) => css(/** @type {any} */ (s.one(t)).el).pointerEvents), ['auto', 'none', 'auto', 'none']);
  const off = /** @type {any} */ (s.one('off'));
  off.blocks = true;
  ui.tick(0);
  assert.equal(css(/** @type {any} */ (s.one('off/inside')).el).pointerEvents, 'auto', 'its clip let it block again');
  const battle = createUi({ pack: /** @type {any} */ ({ ...pack(), screens: { m: N('m', {}, [N('x', { nodraw: 'raycast' })]) } }), host: fakeHost(fakeDocument()) });
  assert.equal(battle.ctx.rays, false, 'a pack without marks (the battle pack)');
  const bs = battle.open('m');
  battle.tick(0);
  assert.equal(css(/** @type {any} */ (bs.one('x')).el).pointerEvents, undefined, 'no pointer style of its own');
});

test('[界面-24] [界面-25] a group that is not interactable: its buttons do nothing, in their disabled colour; a usable one tints its colour set\'s targets while pressed and plays its click', () => {
  const { ui, s, sounds } = setup();
  let taps = 0;
  s.tap('locked/btn', () => { taps++; });
  s.tap('hot', () => { taps++; });
  ui.tick(0);
  assert.deepEqual(/** @type {any} */ (s.one('locked/btn/bg')).tint, COLORS.disabled);
  const btn = /** @type {any} */ (s.one('locked/btn')), hot = /** @type {any} */ (s.one('hot'));
  fire(btn.el, 'pointerdown');
  assert.deepEqual(/** @type {any} */ (s.one('locked/btn/bg')).tint, COLORS.disabled, 'not pressed when it does not work');
  fire(btn.el, 'click');
  fire(hot.el, 'pointerdown');
  assert.deepEqual([/** @type {any} */ (s.one('hot_bg')).tint, /** @type {any} */ (s.one('hot_text')).tint], [COLORS.pressed, COLORS.pressed]);
  fire(hot.el, 'pointerup');
  ui.tick(0);
  assert.equal(/** @type {any} */ (s.one('hot_bg')).tint, null);
  fire(hot.el, 'click');
  assert.equal(taps, 1);
  assert.deepEqual(sounds, ['ui.ON_DEFAULT_BTN_CLICK'], '界面-32: its type\'s bank');
  s.state('hot', 2);
  ui.tick(0);
  assert.deepEqual(/** @type {any} */ (s.one('hot_text')).tint, COLORS.disabled, 'a state the page set holds');
  fire(hot.el, 'click');
  assert.equal(taps, 1, 'disabled by the page');
  s.state('locked/btn', 0);
  fire(btn.el, 'click');
  assert.equal(taps, 2, 'enabled by the page');
});

test('[界面-24] in a pack that does not mark tap targets (the battle pack) a button saved as not interactable still works', () => {
  const battle = createUi({ pack: /** @type {any} */ ({ ...pack(), screens: { m: N('m', {}, [N('pause', { button: { interactable: 0, transition: 1, colors: COLORS, target: '@pause' }, ...img() })]) } }), host: fakeHost(fakeDocument()) });
  const bs = battle.open('m');
  battle.tick(0);
  let taps = 0;
  bs.tap('pause', () => { taps++; });
  fire(/** @type {any} */ (bs.one('pause')).el, 'click');
  assert.equal(taps, 1);
});

test('[界面-25] a switch shows its on or off part; with a fade time both fade, the hidden one turning off at the end', () => {
  const { ui, s } = setup();
  s.state('sw', 1);
  assert.deepEqual([s.one('sw/on')?.active, s.one('sw/off')?.active], [true, false]);
  s.state('sw', 0);
  assert.deepEqual([s.one('sw/on')?.active, s.one('sw/off')?.active], [false, true]);
  s.state('swf', 1);
  const on = /** @type {any} */ (s.one('swf/on')), off = /** @type {any} */ (s.one('swf/off'));
  ui.tick(0.25);
  assert.equal(on.active, true);
  assert.ok(Math.abs(on.alpha - 0.5) < 1e-9 && Math.abs(off.alpha - 0.5) < 1e-9);
  ui.tick(0.3);
  assert.deepEqual([on.alpha, off.alpha, off.active], [1, 0, false]);
});

test('[界面-26] a list made from its template: n items filled, fewer later, removed ones gone; a recycling list is a row from its padding with its spacing', () => {
  const { ui, s } = setup();
  /** @type {number[]} */
  const seen = [];
  const items = s.list('items', 3, (it, i) => { seen.push(i); s.text('label', `#${i}`, it); });
  assert.deepEqual([items.length, seen], [3, [0, 1, 2]]);
  assert.equal(s.q('label', items[2])[0]?.txt, '#2');
  const gone = items[2];
  assert.equal(s.list('items', 1).length, 1);
  assert.equal(gone.gone, true);
  assert.equal(s.q('items/item#').length + s.all.filter((x) => x === gone).length, 0);
  assert.deepEqual(s.list('nothing', 2), [], 'no list there');
  const rec = s.list('rec', 2, undefined, undefined, 'screen:item');
  ui.tick(0);
  assert.deepEqual(rec.map((r) => r.box?.[0]), [10, 55], 'from the left padding, 40 wide, 5 apart');
});

test('[界面-28] [界面-8] nested prefabs made where marked (named by their root, a hidden mark hidden); a missing one not made; duplicate names searched through', () => {
  const { ui, s } = setup();
  assert.equal(s.one('slot/dot')?.active, false);
  assert.equal(s.one('slot2/dot')?.active, true);
  assert.equal(s.one('gone')?.kids.length, 0);
  assert.equal(nodeAt(s.root, 'dup/box/deep')?.n.name, 'deep', 'the second dup holds it');
  const inner = ui.open('dot', { into: /** @type {any} */ (s.one('box')) });
  ui.tick(0);
  assert.deepEqual([inner.root.w, inner.root.h], [35, 35]);
  assert.equal(inner.wrap.parentNode, /** @type {any} */ (s.one('box')).el);
  /** @type {any} */ (s.one('box')).active = false;
  ui.tick(0);
  assert.equal(inner.root.shown, false, 'hidden with its node');
});

test('[界面-2] a root canvas saved at scale 0 fills the canvas', () => {
  const { ui } = setup();
  const c = ui.open('canvasRoot');
  ui.tick(0);
  assert.deepEqual([c.root.rt.amin, c.root.rt.amax, c.root.w, c.root.h], [FULL_RT.amin, FULL_RT.amax, 1280, 720]);
});

test('[界面-29] multiline best fit: the largest size not above the text\'s own that fits its box; an outline material as a ring of shadows', () => {
  const { s } = setup();
  // the test document measures 10 px a character at 20 px: 20 characters fit 100 px at size 10
  assert.equal(css(/** @type {any} */ (s.one('fit')).t).fontSize, '10px');
  assert.equal(fitSize((z) => z <= 7, 2, 24), 7);
  assert.equal(fitSize(() => false, 2, 24), 2);
  assert.equal(fitSize(() => true, 2, 24), 24);
  const ring = css(/** @type {any} */ (s.one('ring')).t).textShadow;
  assert.equal(ring.split(', ').length, 16);
  assert.ok(ring.startsWith('5.00px 0.00px 0 rgba(0,0,0,1)'));
  assert.equal(ringCss({}).split(', ').length, 16);
});

test('[界面-9] an image whose material is not drawn but carries an effect hint is drawn by its blending, unless it has no sprite of its own; grey is grey', () => {
  const { s } = setup();
  assert.equal(drawable({ kind: 'none' }), false);
  assert.equal(drawable({ kind: 'none', fx: 'disturb' }), true);
  assert.equal(blendOf({ kind: 'none', fx: 'dissolve', add: true }), 'plus-lighter');
  assert.ok(/** @type {any} */ (s.one('fx')).g, 'drawn');
  assert.equal(/** @type {any} */ (s.one('fxBare')).g, null, 'its look is all the effect\'s: not drawn');
  assert.equal(css(/** @type {any} */ (s.one('grey')).g).filter, 'grayscale(1)');
});

test('[界面-30] fitters: aspect modes, a background covering its parent, a full-screen picture, a scaler keeping its subtree in proportion', () => {
  assert.deepEqual(aspectSize(1, 2, [100, 10], 0, 0), [100, 50]);
  assert.deepEqual(aspectSize(2, 2, [100, 10], 0, 0), [20, 10]);
  assert.deepEqual(aspectSize(3, 2, [0, 0], 1000, 400), [800, 400], 'fit inside a wide parent');
  assert.deepEqual(aspectSize(4, 2, [0, 0], 1000, 400), [1000, 500], 'cover it');
  assert.equal(aspectSize(0, 2, [1, 1], 1, 1), null);
  const { s } = setup();
  const cover = /** @type {any} */ (s.one('cover')), full = /** @type {any} */ (s.one('nest/full')), kid = /** @type {any} */ (s.one('scaled/kid'));
  assert.deepEqual([cover.w, cover.h], [1440, 720]);
  assert.deepEqual([full.w, full.h, full.box[0] + /** @type {any} */ (s.one('nest')).box[0]], [1280, 720, 0]);
  assert.deepEqual([kid.rt.pos, kid.rt.size, kid.fontK], [[10, 5], [20, 10], 0.5], 'the scaler made at 200 × 100 now 100 × 50');
});

test('[界面-31] an input field gets a text box in its text\'s style: placeholder, limit, changes, Enter, focus on tap', () => {
  const { s, doc } = setup();
  /** @type {string[]} */
  const log = [];
  const box = /** @type {any} */ (s.input('field', { value: '12', onChange: (v) => log.push(`change ${v}`), onEnter: (v) => log.push(`enter ${v}`) }));
  const el = box.el;
  assert.deepEqual([el.tagName, el.value, el.placeholder, el.maxLength, el.style.fontSize], ['INPUT', '12', '输入赛事ID', 6, '24px']);
  assert.equal(el.parentNode, /** @type {any} */ (s.one('field/value')).el);
  assert.equal(/** @type {any} */ (s.one('field/hint')).t.style.visibility, 'hidden');
  el.value = '123';
  el.fire('input');
  el.fire('keydown', { key: 'Enter' });
  assert.deepEqual(log, ['change 123', 'enter 123']);
  fire(/** @type {any} */ (s.one('field')).el, 'click');
  assert.equal(/** @type {any} */ (doc).focused, el);
  box.set('9');
  assert.equal(el.value, '9');
  assert.equal(s.input('hit', { value: '', onChange() {} }), null);
});

test('[界面-32] clip events as the playhead passes them: start at once, a sound, a call by name, the end; a loop each time round', async () => {
  const { ui, s, sounds } = setup();
  /** @type {string[]} */
  const log = [];
  const done = s.play('', 'show', { onStart: () => log.push('start'), onEnd: () => log.push('end'), onEvent: (n) => log.push(n) });
  assert.deepEqual(log, ['start']);
  ui.tick(0.6);
  assert.deepEqual(sounds, ['ui.ON_MULTIV3_PICK']);
  ui.tick(0.5);
  await done;
  assert.deepEqual(log, ['start', 'next', 'end']);
  assert.equal(passes(0.5, 0, 2.6, 1, true), 3, 'three times round');
  assert.equal(passes(0.5, -1, 3, 1, false), 1);
  assert.equal(passes(0.5, 0.6, 1, 1, false), 0);
});

test('[界面-33] tweens: eased, back and forth, for ever; a fade on a group from the clock', () => {
  assert.equal(ease(1, 0.25), 0.25);
  assert.ok(Math.abs(ease(4, 0.5) - 0.5) < 1e-12 && ease(4, 0.25) < 0.25);
  assert.equal(ease(0, 0.5), 0.75, 'none given: out quadratic');
  assert.equal(ease(99, 0.3), 0.3);
  const yoyo = { kind: /** @type {const} */ ('fade'), from: 0, to: 1, time: 1, ease: 1, loop: -1, loopType: 1 };
  assert.deepEqual([tweenAt(yoyo, 0.25).u, tweenAt(yoyo, 1.25).u, tweenAt(yoyo, 9.5).done], [0.25, 0.75, false]);
  assert.deepEqual(tweenAt({ ...yoyo, loop: 2 }, 5), { u: 0, done: true }, 'two plays, back at the start');
  const { ui, s } = setup();
  ui.tick(0.4);
  assert.ok(Math.abs(/** @type {any} */ (s.one('tw')).alpha - 0.4) < 1e-9);
});

test('[界面-34] a circle bar shows its arc from its start over its span, counter-clockwise from the right; clips move them', () => {
  assert.equal(arcMask({ start: -90, span: 270 }), 'conic-gradient(from -90deg, #000 270deg, transparent 0)');
  assert.equal(arcMask({ start: 0, span: 400 }), 'conic-gradient(from -270deg, #000 360deg, transparent 0)');
  const { ui, s } = setup();
  const arc = /** @type {any} */ (s.one('arc'));
  assert.equal(css(arc.g).maskImage, 'conic-gradient(from -90deg, #000 270deg, transparent 0)');
  applyCurve(arc, { kind: 'float', path: '', attr: 'circle.span', keys: [[0, 90, 0, 0]] }, 0);
  ui.tick(0);
  assert.equal(css(arc.g).maskImage, 'conic-gradient(from 90deg, #000 90deg, transparent 0)');
});
