// 堡垒守御 on the battle HUD (docs/spec/ui.md 界面-39) on a small pack, in a minimal document: the wave on the co-op top
// bar, the last wave's damage, the rest panel with its button and both sides' marks, the builders' counted cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createCoopTop, createResting, restText, cardViews, OBJECTIVES, copyRect, DEF_RT } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @returns {PackNode} */
const N = (name, comps = {}, children = []) => ({ name, active: true, comps, children });
const img = { img: { kind: 'image', ref: 'sprite/a', color: [1, 1, 1, 1], type: 0 } };
const text = { text: { text: '', size: 30, style: 0, align: 4, color: [1, 1, 1, 1], best: 0, hwrap: 1 } };
const button = { img: { kind: 'image', ref: 'sprite/a', color: [1, 1, 1, 1], type: 0 }, button: { interactable: 1, transition: 1, target: '@btn_skip_rest', colors: { normal: [1, 1, 1, 1], pressed: [0.8, 0.8, 0.8, 1], disabled: [0.5, 0.5, 0.5, 1], fade: 0.1, mul: 1 } } };
/** @param {number} alpha */
const group = (alpha) => ({ group: { alpha } });

const task = N('task', {}, [
  { ...N('fortress', img, [N('info', text), N('maxEnemy', text, [N('split', text), N('enemyCnt', text)]), N('curWave', text, [N('maxWave', text, [N('split', text), N('waveCnt', text)])])]), active: false },
  { ...N('fortress_lastWave', img, [N('info', text), N('waveDmg', text), N('lastWave', text)]), active: false },
  N('normal', {}, [N('text_stage_info_01', text)]),
  N('taskInfo', {}, OBJECTIVES.map((o) => ({ ...N(o, img, [N('info', text)]), active: false }))),
  N('group_timer', {}, [N('group_timeout', img), N('text_timer', text), N('text_timer_normal', text)]),
]);
const top = { ...N('coop', {}, [
  N('btn_speed_level', img, [N('btn_speed_level_icon', img, [N('hotspot', { nodraw: 'raycast' })]), N('pause_on_me', img), N('pause_on_mate', img)]),
  N('btn_multiplayer_pause', {}, [N('image_pause', img), N('image_resume', img), N('collider', { nodraw: 'raycast' })]),
  { ...N('status', img, [N('[my]icon_life_point', img, [N('text_life_point', text)]), N('[you]icon_life_point', img, [N('text_life_point', text)]), task]), active: false },
]), rt: R({ amin: [0, 1], amax: [1, 1], size: [0, 1], pivot: [0, 1] }) };
/** A side of the rest panel. @param {'left' | 'right'} w */
const restSide = (w) => N(`group_${w}`, {}, [N(`panel_wait_${w}`, group(1), [N(`icon_skip_${w}`, img), N(`text_skip_${w}`, text)]),
  N(`panel_skip_${w}`, group(0), [N(`icon_skip_${w}`, img), N(`text_skip_${w}`, text)])]);
const resting = { ...N('cooperate_battle_ui_resting', { canvas: { sort: 6000 } }, [N('panel_bottom', img), N('text_count', { text: { ...text.text, rich: 1 } }), N('text_str_resting_time', text),
  N('btn_skip_rest', button, [N('Text', text)]), restSide('left'), restSide('right')]), active: false, rt: R({ amin: [0.5, 1], amax: [0.5, 1], size: [800, 187] }) };
const coopTop = { pause: '@btn_multiplayer_pause', pauseImage: '@btn_multiplayer_pause/image_pause', resumeImage: '@btn_multiplayer_pause/image_resume',
  status: { panel: '@status', life: '@status/[my]icon_life_point/text_life_point' }, timerWarn: 10,
  speed: { me: '@btn_speed_level/pause_on_me', mate: '@btn_speed_level/pause_on_mate', image: '@btn_speed_level/btn_speed_level_icon', x1: 'sprite/s1', x2: 'sprite/s2' } };
const setup = () => {
  const ui = createUi({ pack: /** @type {any} */ ({ version: 1, ref: [1920, 1080], sprites: {}, clips: {}, screens: { 'coop.topbar': top, 'coop.resting': resting }, hud: { coopTop } }),
    host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return ui;
};
/** @param {any} n */
const node = (n) => /** @type {import('../src/node.js').UiNode} */ (n);
const side = { life: 3, fast: false, revive: -1 };
const wave = { wave: 3, waves: 8, out: 5, total: 12, left: 75, last: false, damage: 0 };

test('[界面-39] 堡垒守御\'s wave on the co-op top bar: the wave of the waves, the enemies gone of the wave\'s, the time; the last wave\'s damage', () => {
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} }), s = co.screen;
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, fortress: wave });
  ui.tick(0);
  assert.deepEqual(['task', 'fortress', 'fortress_lastWave', 'normal'].map((n) => node(s.one(n)).active), [true, true, false, false]);
  assert.deepEqual(['curWave/maxWave/waveCnt', 'curWave/maxWave', 'maxEnemy/enemyCnt', 'maxEnemy'].map((n) => node(s.one(n)).txt), ['3', '8', '5', '12']);
  assert.deepEqual([node(s.one('text_timer_normal')).txt, node(s.one('group_timeout')).active], ['01:15', false]);
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, fortress: { ...wave, wave: 8, last: true, damage: 123456.7, left: 8 } });
  ui.tick(0);
  assert.deepEqual(['fortress', 'fortress_lastWave'].map((n) => node(s.one(n)).active), [false, true]);
  assert.equal(node(s.one('fortress_lastWave/waveDmg')).txt, '123456');
  assert.deepEqual([node(s.one('text_timer')).txt, node(s.one('group_timeout')).active], ['00:08', true]);
});

test('[界面-39] the rest panel: shown only in a rest, its seconds left, the skip button once, each side waiting or agreed', () => {
  const ui = setup();
  let skips = 0;
  const r = createResting(ui, { skip: () => { skips++; } }), s = r.screen;
  assert.equal(restText(64.2), '65<size=48>s</size>');
  r.update(null);
  ui.tick(0);
  assert.equal(s.root.active, false);
  r.update({ left: 64.2, me: false, mate: true });
  ui.tick(0);
  assert.equal(s.root.active, true);
  assert.equal(node(s.one('text_count')).txt, '65<size=48>s</size>');
  assert.deepEqual(['panel_wait_left', 'panel_skip_left', 'panel_wait_right', 'panel_skip_right'].map((n) => node(s.one(n)).alpha), [1, 0, 0, 1]);
  /** @type {any} */ (s.one('btn_skip_rest')).el.fire('click');
  assert.equal(skips, 1);
  r.update({ left: 60, me: true, mate: true });
  /** @type {any} */ (s.one('btn_skip_rest')).el.fire('click');
  assert.equal(skips, 1, 'agreed: no second skip');
  assert.deepEqual(['panel_wait_left', 'panel_skip_left'].map((n) => node(s.one(n)).alpha), [0, 1]);
});

test('[界面-39] counted cards: shown with the cards left while there are some; usable only while builders may be deployed and the cost is paid', () => {
  const deck = [{ id: 'op', avatar: null, profession: 'WARRIOR', rarity: 4, phase: 0, respawn: 60 },
    { id: 'w#0', avatar: null, profession: 'TRAP', rarity: 1, phase: 0, respawn: 0, pool: true }, { id: 'w2#0', avatar: null, profession: 'TRAP', rarity: 1, phase: 0, respawn: 0, pool: true }];
  const s = { frame: 0, fps: 30, cost: 3, cards: { op: { cost: 10, ready: 0 }, 'w#0': { cost: 0, ready: 0 }, 'w2#0': { cost: 5, ready: 0 } }, deployed: [], slots: 1, counts: { 'w#0': 3, 'w2#0': 0 }, building: true };
  assert.deepEqual(cardViews(deck, s).map((v) => [v.id, v.count, v.usable]), [['op', -1, false], ['w#0', 3, true]]);
  assert.deepEqual(cardViews(deck, { ...s, counts: { 'w#0': 3, 'w2#0': 1 }, building: false }).map((v) => [v.id, v.count, v.usable]), [['op', -1, false], ['w#0', 3, false], ['w2#0', 1, false]]);
  assert.deepEqual(cardViews(deck, { ...s, counts: { 'w#0': 1, 'w2#0': 1 } }).map((v) => v.usable), [false, true, false], 'the advanced one costs 5 of 3');
});
