// The co-op HUD's clips as its state changes (docs/spec/ui.md 界面-40) on a small pack, in a minimal document: a side
// going down and coming back, the 2× marks, the task's timer warning, goals and a new stage, the pause confirm panel,
// the stage banner's training and 堡垒守御 variants, the cost request, the rest panel's sides, the emote button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createCoopTop, createCostAsk, createBanner, createResting, createBattleEmotes, holdText, copyRect, DEF_RT } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @returns {PackNode} */
const N = (name, comps = {}, children = []) => ({ name, active: true, comps, children });
const img = { img: { kind: 'image', ref: 'sprite/a', color: [1, 1, 1, 1], type: 0 } };
const text = { text: { text: '', size: 30, style: 0, align: 4, color: [1, 1, 1, 1], best: 0, hwrap: 1 } };
/** A clip fading a node in over a second. @param {string} path */
const fade = (path) => ({ wrap: 0, length: 1, curves: [{ kind: 'float', path, attr: 'm_Alpha', keys: [[0, 0, 0, 0], [1, 1, 0, 0]] }] });
const CLIPS = ['revive_my', 'revive_you', 'life_my', 'life_you', 'me_sel', 'me_show', 'me_hide', 'mate_sel', 'accomplish', 'revert', 'next_stage', 'timer_hint', 'confirm_show',
  'banner', 'banner_training', 'first', 'first_training', 'wave', 'last', 'accept', 'response', 'rest_left', 'rest_right', 'btn_show'];
const clips = Object.fromEntries(CLIPS.map((c) => [c, fade('')]));

const task = N('task', {}, [N('normal', {}, [N('text_stage_info_01', text), N('text_stage_info_02', text), N('text_stage_info_middle', text),
  N('split_line', {}, [N('group_text', {}, [N('text_monster', text)])]), N('group_text_02', {}, [N('text_monster', text)])]),
N('group_timer', {}, [N('group_timeout', img), N('text_timer', text), N('text_timer_normal', text)])]);
const top = { ...N('coop', {}, [
  N('btn_speed_level', img, [N('btn_speed_level_icon', img), N('pause_on_me', img), N('pause_on_mate', img)]),
  N('status', img, [N('[my]icon_life_point', img, [N('text_life_point', text)]), N('[you]icon_life_point', img, [N('text_life_point', text)]),
    N('[my]revive_timer', {}, [N('timer', text)]), N('[you]revive_timer', {}, [N('timer', text)]), task]),
  { ...N('panel_pause_confirm', {}, [N('slider_progress', {})]), active: false },
]), rt: copyRect(DEF_RT) };
const ref = (/** @type {string} */ node, /** @type {string} */ clip) => ({ node, clip });
const coopTop = { pauseConfirm: '@panel_pause_confirm', pauseConfirmShow: ref('@panel_pause_confirm', 'confirm_show'),
  status: { panel: '@status', life: '@status/[my]icon_life_point/text_life_point' }, timerWarn: 10,
  enter: { reviveMe: ref('@status', 'revive_my'), reviveMate: ref('@status', 'revive_you'), lifeMe: ref('@status', 'life_my'), lifeMate: ref('@status', 'life_you') },
  taskClips: { basic: ref('@status/task/normal/split_line/group_text', 'accomplish'), basicRevert: ref('@status/task/normal/split_line/group_text', 'revert'),
    advanced: ref('@status/task/normal/group_text_02', 'accomplish'), stage: ref('@status/task/normal', 'next_stage'), timer: ref('@status/task/group_timer', 'timer_hint') },
  speed: { me: '@btn_speed_level/pause_on_me', mate: '@btn_speed_level/pause_on_mate', image: '@btn_speed_level/btn_speed_level_icon', x1: 'sprite/s1', x2: 'sprite/s2',
    clips: { meSelect: 'me_sel', meLightShow: 'me_show', meLightHide: 'me_hide', mateSelect: 'mate_sel' }, fade: 0.467 } };
const W = (/** @type {string} */ name, /** @type {string} */ clip, /** @type {PackNode[]} */ kids = []) => N(name, { anim: { clips: [clip], default: null, auto: false } }, kids);
const cost = N('cost', {}, ['state_none_button', 'state_request', 'state_reject', 'state_ignore', 'state_wait', 'state_forbid'].map((n) => N(n, img, [N('cost_text', text)]))
  .concat([W('state_accept', 'accept', [N('cost_text', text)]), W('state_response', 'response', [N('cost_text', text)])]));
const T = (/** @type {string} */ name) => N(name, text);
const banner = N('banner', {}, [N('info', {}, [N('container_conventional_mode', {}, [T('text_title'), T('text_num'), T('basic'), T('advanced')]),
  N('first', {}, [T('cur'), T('max'), T('target')]), N('wave', {}, [T('cur'), T('max')]), N('last', {}, [T('info')])])]);
const coopStage = { panel: '@info/container_conventional_mode', clip: 'banner', trainingClip: 'banner_training', title: '@info/container_conventional_mode/text_title',
  stage: '@info/container_conventional_mode/text_num', basic: '@info/container_conventional_mode/basic', advanced: '@info/container_conventional_mode/advanced',
  defence: { first: { panel: '@info/first', clip: 'first', trainingClip: 'first_training', cur: '@info/first/cur', max: '@info/first/max', target: '@info/first/target' },
    wave: { panel: '@info/wave', clip: 'wave', cur: '@info/wave/cur', max: '@info/wave/max' }, last: { panel: '@info/last', clip: 'last', info: '@info/last/info' } } };
const resting = N('resting', {}, [N('text_count', text), N('btn_skip_rest', img), W('group_left', 'rest_left', [N('panel_wait_left', {}), N('panel_skip_left', {})]),
  W('group_right', 'rest_right', [N('panel_wait_right', {}), N('panel_skip_right', {})])]);
const plugin = N('plugin', {}, [N('cooperate_battle_emoticon_panel', {}, [N('btn_normal', img, [N('hotspot', { nodraw: 'raycast' })])]), N('states', {}), N('panel_anchor', {}), N('pop_emoticon_item_self', {})]);
const hud = { coopTop, coopStage, coopCost: { acceptAnim: '@state_accept', responseAnim: '@state_response' }, coopResting: { left: '@group_left', right: '@group_right' },
  coopEmotes: { button: '@cooperate_battle_emoticon_panel/btn_normal', hotspot: '@cooperate_battle_emoticon_panel/btn_normal/hotspot', show: { animationWrapper: '@cooperate_battle_emoticon_panel', animationName: 'btn_show' } } };
const setup = () => {
  const ui = createUi({ pack: /** @type {any} */ ({ version: 1, ref: [1920, 1080], sprites: {}, clips, screens: { 'coop.topbar': top, 'coop.cost': cost, 'coop.stage': banner, 'coop.resting': resting, 'coop.plugin': plugin }, hud }),
    host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return ui;
};
/** The clips playing on a UI, by name, reversed ones marked '-'. @param {any} scr */
const playing = (scr) => scr.anim.playing.filter((/** @type {any} */ p) => p.t >= 0).map((/** @type {any} */ p) => `${p.rev ? '-' : ''}${CLIPS.find((c) => clips[c] === p.clip)}`).sort();
const side = { life: 3, fast: false, revive: -1 };
/** @param {Record<string, any>} [o] */
const state = (o = {}) => ({ me: side, mate: side, speed: 1, paused: false, asking: -1, task: { stage: 1, objective: 'kill', count: 0, goal: 10, left: 60 }, ...o });

test('[界面-40] a side going down brings its revive timer in, coming back its lives; nothing on the first frame shown', () => {
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} });
  co.update(state({ mate: { ...side, revive: 20 } }));
  assert.deepEqual(playing(co.screen), [], 'as it is on the first frame');
  co.update(state({ me: { ...side, revive: 30 }, mate: { ...side, revive: 19 } }));
  assert.deepEqual(playing(co.screen), ['revive_my']);
  co.update(state({ mate: side }));
  assert.deepEqual(playing(co.screen), ['life_my', 'life_you', 'revive_my']);
});

test('[界面-40] a 2× switch turned on brings its mark in and flashes its light, which fades after the fade time; off takes the mark away', () => {
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} });
  co.update(state());
  co.update(state({ me: { ...side, fast: true } }));
  assert.deepEqual(playing(co.screen), ['me_sel', 'me_show'], 'the hide waits for the fade time');
  ui.tick(0.5);
  assert.ok(playing(co.screen).includes('me_hide'));
  co.update(state({ me: side, mate: { ...side, fast: true } }));
  assert.ok(playing(co.screen).includes('-me_sel') && playing(co.screen).includes('mate_sel'));
});

test('[界面-40] the task: the timer pulses through its warning; a goal reached is marked, taken back below it; a new stage sweeps its label', () => {
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} }), at = (/** @type {string} */ p) => /** @type {any} */ (co.screen.one(p));
  co.update(state());
  co.update(state({ task: { stage: 1, objective: 'kill', count: 10, goal: 10, left: 9 } }));
  assert.deepEqual(playing(co.screen), ['accomplish', 'timer_hint'], 'no advanced goal: the right-hand count marked; the warning');
  assert.ok(co.screen.anim.playing.some((/** @type {any} */ p) => p.s === at('group_text_02')), 'on the right-hand count');
  assert.ok(co.screen.anim.playing.some((/** @type {any} */ p) => p.s === at('group_timer') && p.loop), 'the warning loops');
  co.update(state({ task: { stage: 1, objective: 'kill', count: 9, goal: 10, left: 30 } }));
  assert.ok(playing(co.screen).includes('revert') && !playing(co.screen).includes('timer_hint'), 'taken back; the warning over');
  co.update(state({ task: { stage: 2, objective: 'kill', count: 0, goal: 10, advanced: 20, left: 60 } }));
  assert.ok(playing(co.screen).includes('next_stage'));
  assert.deepEqual([at('text_stage_info_01').txt, at('text_stage_info_02').txt, at('text_stage_info_middle').txt], ['STAGE.1', 'STAGE.2', 'STAGE.1']);
  co.update(state({ task: { stage: 2, objective: 'kill', count: 20, goal: 10, advanced: 20, left: 60 } }));
  assert.ok(co.screen.anim.playing.some((/** @type {any} */ p) => p.s === at('split_line/group_text')) && co.screen.anim.playing.some((/** @type {any} */ p) => p.s === at('group_text_02') && !p.rev),
    'with an advanced goal: the left count for the goal, the right one for the advanced goal');
});

test('[界面-40] the mate\'s pause request comes in with its clip', () => {
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} });
  co.update(state());
  co.update(state({ confirm: 0.9 }));
  assert.deepEqual(playing(co.screen), ['confirm_show']);
  co.update(state({ confirm: 0.8 }));
  assert.deepEqual(playing(co.screen), ['confirm_show'], 'once');
});

test('[界面-40] [界面-22] the banner: a training\'s clip in a training; 堡垒守御\'s first, later and last waves each their own, once a wave', () => {
  const ui = setup(), b = /** @type {NonNullable<ReturnType<typeof createBanner>>} */ (createBanner(ui)), at = (/** @type {string} */ p) => /** @type {any} */ (b.screen.one(p));
  b.update({ stage: 1, title: '规则', basic: 'x', training: true });
  assert.deepEqual(playing(b.screen), ['banner_training']);
  ui.tick(1.1);
  b.update({ stage: 1, title: '', basic: '', defence: { wave: 1, waves: 7, last: false } });
  assert.deepEqual([playing(b.screen), at('first').active, at('first/target').txt, at('first/cur').txt, at('first/max').txt], [['first'], true, holdText(7), '1', '7']);
  ui.tick(1.1);
  b.update({ stage: 1, title: '', basic: '', defence: { wave: 3, waves: 7, last: false } });
  assert.deepEqual([playing(b.screen), at('wave/cur').txt, at('first').active], [['wave'], '3', false]);
  b.update({ stage: 1, title: '', basic: '', defence: { wave: 3, waves: 7, last: false } });
  ui.tick(1.1);
  assert.deepEqual(playing(b.screen), [], 'once a wave');
  b.update({ stage: 1, title: '', basic: '', defence: { wave: 7, waves: 7, last: true } });
  assert.deepEqual(playing(b.screen), ['last']);
});

test('[界面-40] the cost received and the mate\'s request come in with their own clips; the rest panel\'s sides; the emote button after its cool-down', () => {
  const ui = setup(), c = createCostAsk(ui, { ask() {}, answer() {} });
  c.update({ state: 'none', amount: 15, share: 0, wait: 0 });
  c.update({ state: 'response', amount: 9, share: 1, wait: 0 });
  assert.deepEqual(playing(c.screen), ['response']);
  c.update({ state: 'accept', amount: 9, share: 0, wait: 0 });
  assert.ok(playing(c.screen).includes('accept'));
  const r = createResting(ui, { skip() {} });
  r.update({ left: 30, me: false, mate: false });
  ui.tick(1.1);
  r.update({ left: 29, me: false, mate: true });
  assert.ok(playing(r.screen).includes('rest_right') && !playing(r.screen).includes('rest_left'));
  const e = createBattleEmotes(ui, { themes: [], emotes: [], picture: () => null, send() {} });
  ui.tick(1.1);
  e.rest(true);
  e.rest(false);
  assert.ok(playing(e.screen).includes('btn_show'));
});
