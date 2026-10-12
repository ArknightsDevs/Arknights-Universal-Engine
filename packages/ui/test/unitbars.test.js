// Grid layout groups and the units' bars (docs/spec/ui.md 界面-3, 界面-19, 界面-20) on a small pack, in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createUnitBars, copyRect, DEF_RT, gridColumns, refNode } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode @typedef {import('../src/node.js').UiNode} UiNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @param {any} [rt] @returns {PackNode} */
const N = (name, comps = {}, children = [], rt = undefined) => ({ name, active: true, comps, children, ...(rt ? { rt } : {}) });
/** @param {Record<string, any>} [more] */
const img = (more = {}) => ({ img: { kind: 'image', ref: null, color: [1, 1, 1, 1], type: 0, ...more } });
/** @param {string} fill */
const slider = (fill) => ({ slider: { fill, handle: null, dir: 0, min: 0, max: 1, value: 1, whole: 0 } });
/** A slider named `name` filling `fill_area/fill` (a filled image when `filled`), with more children. @param {string} name @param {string} at its path @param {PackNode[]} [more] @param {boolean} [filled] */
const bar = (name, at, more = [], filled = false) => N(name, slider(`@${at}/fill_area/fill`), [N('fill_area', {}, [N('fill', img(filled ? { type: 3 } : {}))]), ...more]);
const GRID = { pad: [0, 0, 0, 0], cell: [125, 7], spacing: [0, 0], corner: 0, axis: 0, align: 4, constraint: 0, count: 2 };
const EL = (/** @type {number} */ i) => ({ color: [i / 10, 0, 0, 1], icon: `sprite/ep${i}`, burst: [0, 0, i / 10, 1] });

const screens = {
  battle: N('UI', {}, [N('panel_hud')]),
  unit: N('hud_unit', {}, [N('plugins', { grid: GRID, csf: [0, 2] }, [N('SliderGroupA'), N('SliderGroupB'), N('normalPlugin', { le: { ignore: 1, min: [-1, -1], pref: [-1, -1], flex: [-1, -1] } })],
    R({ size: [100, 0] }))]),
  'bar.charHp': N('char_hp_slider', {}, [bar('hp_slider', 'hp_slider', [bar('slider_back', 'hp_slider/slider_back')])]),
  'bar.enemyHp': N('enemy_hp_slider', {}, [bar('hp_slider', 'hp_slider', [bar('slider_back', 'hp_slider/slider_back')])]),
  'bar.bossHp': N('enemy_boss_hp_slider', {}, [N('hp_slider', slider('@hp_slider/fill_area/fill'), [
    N('fill_area', {}, [N('fill', img(), [bar('slider_back', 'hp_slider/fill_area/fill/slider_back')])])])]),
  'bar.charSp': N('char_sp_slider', {}, [bar('sp_slider', 'sp_slider')]),
  'bar.charCast': N('char_sp_cast_slider', {}, [bar('sp_cast_slider', 'sp_cast_slider')]),
  'bar.charBack': N('char_slider_background', img()),
  'bar.enemyBack': N('enemy_slider_background', img()),
  'bar.charEp': N('char_ep_slider', {}, [bar('ep_slider', 'ep_slider', [N('ep_hit_spread', img()), N('ep_center_color', img()), bar('slider_back', 'ep_slider/slider_back', [], true),
    N('ep_icon', img())], true)]),
  'bar.enemyEp': N('enemy_ep_slider', {}, [bar('ep_slider', 'ep_slider', [N('ep_center_color', img()), N('ep_break_spread', img())], true)]),
};
const units = {
  plugins: '@plugins', groupA: '@plugins/SliderGroupA', groupB: '@plugins/SliderGroupB', normal: '@plugins/normalPlugin',
  bars: {
    'bar.charHp': { slider: '@hp_slider', back: '@hp_slider/slider_back', end: 0 }, 'bar.enemyHp': { slider: '@hp_slider', back: '@hp_slider/slider_back', end: 0 },
    'bar.bossHp': { slider: '@hp_slider', back: '@hp_slider/fill_area/fill/slider_back', end: 1 },
    'bar.charSp': { slider: '@sp_slider' }, 'bar.charCast': { slider: '@sp_cast_slider' },
    'bar.charEp': { slider: '@ep_slider', back: '@ep_slider/slider_back', end: 0, hit: '@ep_slider/ep_hit_spread', icon: '@ep_slider/ep_icon', color: '@ep_slider/ep_center_color' },
    'bar.enemyEp': { slider: '@ep_slider', burst: '@ep_slider/ep_break_spread', color: '@ep_slider/ep_center_color' },
  },
  charElements: [1, 2, 3, 4, 5].map(EL), enemyElements: [6, 7, 8, 9, 10].map(EL),
};

const setup = () => {
  const ui = createUi({ pack: /** @type {any} */ ({ version: 1, ref: [1920, 1080], sprites: {}, clips: {}, screens, hud: { units } }), host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  const scr = ui.open('battle');
  return { ui, scr, bars: /** @type {NonNullable<ReturnType<typeof createUnitBars>>} */ (createUnitBars(scr, units)) };
};
/** A slider's fill share (anchored or filled). @param {UiNode} root @param {string} ref */
const share = (root, ref) => {
  const s = /** @type {UiNode} */ (refNode(root, ref)), f = /** @type {UiNode} */ (refNode(s, s.n.comps.slider.fill));
  return f.fill ?? f.rt.amax[0];
};
/** How many nodes of the screen have a name. @param {import('../src/screen.js').Screen} scr @param {string} name */
const count = (scr, name) => scr.all.filter((s) => s.n.name === name).length;
/** @param {UiNode} n @param {string} name */
const kid = (n, name) => /** @type {UiNode} */ (n.kids.find((k) => k.n.name === name));
const CHAR = /** @type {import('../src/index.js').UnitBar} */ ({ id: 1, at: [960, 640], kind: 'char', hp: 0.5, sp: { state: 'charging', share: 0.4 }, el: null });

test('[界面-3] a grid places its children cell by cell, row by row; a fitter sizes it to its rows; a free child is not placed', () => {
  assert.deepEqual([gridColumns(GRID, 2, 100), gridColumns(GRID, 3, 400), gridColumns({ ...GRID, constraint: 1, count: 2 }, 5, 0),
    gridColumns({ ...GRID, constraint: 2, count: 2 }, 5, 0)], [1, 3, 2, 3], 'as many as fit (at least one), fixed columns, fixed rows');
  const { ui, bars } = setup();
  bars.update([CHAR], [1920, 1080]);
  ui.tick(0);
  const plugins = kid(/** @type {any} */ (bars.huds.get(1)).root, 'plugins'), [back, a, b] = plugins.kids;
  assert.equal(back.free, true, 'the plate the page put first');
  assert.equal(back.lgRect, null);
  assert.deepEqual([a.lgRect, b.lgRect], [{ x: -12.5, y: 0, w: 125, h: 7 }, { x: -12.5, y: 7, w: 125, h: 7 }], 'one 125-wide column in 100, centred');
  assert.equal(plugins.box?.[3], 14, 'two rows of 7');
});

test('[界面-19] each unit its panel at its feet: HP bar, plate, SP bar by the skill state, the trailing slider without a trail', () => {
  const { scr, bars } = setup();
  bars.update([CHAR, { id: 2, at: [100, 100], kind: 'boss', hp: 0.25, sp: null, el: null }], [1920, 1080]);
  const c = /** @type {any} */ (bars.huds.get(1)), boss = /** @type {any} */ (bars.huds.get(2));
  assert.deepEqual(c.root.rt.pos, [0, -100], 'feet 100 px below the centre');
  assert.deepEqual([share(c.hp, '@hp_slider'), share(c.hp, '@hp_slider/slider_back')], [0.5, 0.5], 'trailing behind the fill: the same value');
  assert.deepEqual([share(boss.hp, '@hp_slider'), share(boss.hp, '@hp_slider/fill_area/fill/slider_back')], [0.25, 0], 'appended to the fill: empty');
  assert.equal(c.hp.parent.n.name, 'SliderGroupA');
  assert.deepEqual([c.sp.parent.n.name, c.spName, share(c.sp, '@sp_slider')], ['SliderGroupB', 'bar.charSp', 0.4]);
  assert.equal(count(scr, 'char_slider_background'), 1, 'the operator a plate, the leader none');
  bars.update([{ ...CHAR, sp: { state: 'running', share: 0.7 } }], [1920, 1080]);
  assert.deepEqual([c.spName, share(c.sp, '@sp_cast_slider')], ['bar.charCast', 0.7], 'running: the cast bar');
  assert.equal(count(scr, 'sp_slider'), 0);
  bars.update([{ ...CHAR, sp: { state: 'ready', share: 0.2 } }], [1920, 1080]);
  assert.equal(share(c.sp, '@sp_slider'), 1, 'ready: full');
  assert.equal(bars.huds.has(2), false, 'a unit no longer given loses its panel');
  bars.update([{ ...CHAR, kind: 'enemy', sp: null }], [1920, 1080]);
  assert.notEqual(bars.huds.get(1), c, 'a new kind, a new panel');
  assert.deepEqual([count(scr, 'enemy_hp_slider'), count(scr, 'char_hp_slider'), count(scr, 'enemy_slider_background')], [1, 0, 1]);
});

test('[界面-20] the element dial: the share, the element colour, the operator its icon, an enemy its burst ring in a burst', () => {
  const { bars } = setup();
  bars.update([{ ...CHAR, el: { element: 3, share: 0.25, burst: false } }, { id: 2, at: [0, 0], kind: 'enemy', hp: 1, sp: null, el: { element: 2, share: 0.5, burst: true } }], [1920, 1080]);
  const c = /** @type {any} */ (bars.huds.get(1)), e = /** @type {any} */ (bars.huds.get(2)), at = (/** @type {any} */ h, /** @type {string} */ r) => /** @type {any} */ (refNode(h.ep, r));
  assert.equal(c.ep.parent.n.name, 'normalPlugin');
  assert.deepEqual([share(c.ep, '@ep_slider'), share(c.ep, '@ep_slider/slider_back')], [0.25, 0.25]);
  assert.deepEqual([at(c, '@ep_slider/ep_center_color').color, at(c, '@ep_slider/ep_icon').sprite], [[0.3, 0, 0, 1], 'sprite/ep3']);
  assert.equal(at(c, '@ep_slider/ep_hit_spread').active, false, 'no hit animation');
  assert.deepEqual([at(e, '@ep_slider/ep_center_color').color, at(e, '@ep_slider/ep_break_spread').active, at(e, '@ep_slider/ep_break_spread').color],
    [[0.7, 0, 0, 1], true, [0, 0, 0.7, 1]], 'an enemy: its own colours, the burst ring');
  bars.update([{ ...CHAR, el: null }, { id: 2, at: [0, 0], kind: 'enemy', hp: 1, sp: null, el: { element: 2, share: 0.5, burst: false } }], [1920, 1080]);
  assert.equal(c.ep, null, 'every value full: no dial');
  assert.equal(at(e, '@ep_slider/ep_break_spread').active, false);
});
