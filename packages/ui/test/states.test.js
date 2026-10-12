// The end, down and rejoining panels (docs/spec/ui.md 界面-18) on a small pack, in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createStates } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {PackNode[]} [children] @param {boolean} [active] @returns {PackNode} */
const N = (name, children = [], active = true) => ({ name, active, comps: { img: { kind: 'image', ref: 'sprite/a', color: [1, 1, 1, 1], type: 0 } }, children });
/** @param {number} length */
const fade = (length) => ({ wrap: 0, length, curves: [{ kind: 'float', path: '', attr: 'm_Alpha', keys: [[0, 0, 0, 0], [length, 1, 0, 0]] }] });

const battle = N('UI', [N('panel_battlefailed', [N('page_default', [N('image_background'), N('panel_layout', [N('panel_practice_hint'), N('panel_tips')])]), N('text_continue')], false)]);
const done = N('done', [N('image_back_slide')], false);
const unstable = N('unstable', [
  N('act_multi_v3_battle_state_alldead', [N('container', [N('container_main'), N('container_tips')])], false),
  N('act_multi_v3_battle_state_loading', [N('container', [N('container_down')])], false),
]);
/** @param {boolean} withCoop */
const setup = (withCoop) => {
  const screens = { battle, ...(withCoop ? { 'coop.done': done, 'coop.unstable': unstable } : {}) };
  const clips = { anim_act3vmulti_mission_accomplished: fade(3.5), act3vmulti_battle_state_alldead_in: fade(0.75), act3vmulti_battle_state_loading_in: fade(0.75) };
  const ui = createUi({ pack: /** @type {any} */ ({ version: 1, ref: [1920, 1080], sprites: {}, clips, screens, hud: {} }), host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return { ui, scr: ui.open('battle') };
};
/** @param {any} n */
const on = (n) => /** @type {import('../src/node.js').UiNode} */ (n).active;

test('[界面-18] the end: the co-op finished banner whatever the result; alone, the failed panel without its tips when lost', async () => {
  const { ui, scr } = setup(true), st = createStates(ui, scr, true);
  const d = /** @type {NonNullable<typeof st.done>} */ (st.done);
  st.update({ result: -1, down: false, offline: false });
  assert.equal(d.root.active, false);
  st.update({ result: 1, down: false, offline: false });
  assert.equal(d.root.active, true);
  assert.equal(d.root.alpha, 0, 'its clip starts');
  assert.deepEqual(d.root.rt.amax, [1, 1], 'over the whole canvas');
  ui.tick(2);
  assert.ok(d.root.alpha > 0.5, 'playing');
  ui.tick(1.6);
  await Promise.resolve();
  assert.equal(d.root.active, false, 'gone when its clip has played');
  const lost = setup(true), ls = createStates(lost.ui, lost.scr, true);
  ls.update({ result: 0, down: false, offline: false });
  assert.deepEqual([on(lost.scr.one('panel_battlefailed')), /** @type {any} */ (ls.done).root.active], [false, true], 'lost in a match of two: the finished banner');
});

test('[界面-18] down and rejoining: on while they last, their clips played as they start', () => {
  const { ui, scr } = setup(true), st = createStates(ui, scr, true), u = /** @type {NonNullable<typeof st.unstable>} */ (st.unstable);
  const down = u.one('act_multi_v3_battle_state_alldead'), rejoin = u.one('act_multi_v3_battle_state_loading');
  assert.equal(on(u.one('container_tips')), false, 'the tip is not shown');
  st.update({ result: -1, down: true, offline: false });
  assert.deepEqual([on(down), on(rejoin)], [true, false]);
  assert.equal(/** @type {any} */ (u.one('container', /** @type {any} */ (down))).alpha, 0);
  st.update({ result: -1, down: false, offline: true });
  assert.deepEqual([on(down), on(rejoin)], [false, true]);
  st.update({ result: -1, down: false, offline: false });
  assert.equal(on(rejoin), false);
});

test('[界面-18] alone or without the co-op panels: only the failed panel', () => {
  const { ui, scr } = setup(false), st = createStates(ui, scr, false);
  assert.deepEqual([st.done, st.unstable], [null, null]);
  st.update({ result: 1, down: true, offline: true });
  assert.equal(on(scr.one('panel_battlefailed')), false, 'won alone: no panel');
  const lost = setup(false), ls = createStates(lost.ui, lost.scr, false);
  ls.update({ result: 0, down: false, offline: false });
  assert.deepEqual(['panel_battlefailed', 'image_background', 'panel_tips', 'panel_practice_hint', 'text_continue'].map((n) => on(lost.scr.one(n))), [true, true, false, false, false]);
});
