// 阵地足球锦标's battle UI (docs/spec/ui.md 界面-42) on a small pack, in a minimal document: the top bar, the kickoff and
// penalty count-downs, the penalty marks, the start and score banners one after another, the finish panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createCupHud, countText, shotBanner } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {PackNode[]} [children] @param {Record<string, any>} [comps] @param {boolean} [active] @returns {PackNode} */
const N = (name, children = [], comps = {}, active = true) => ({ name, active, comps, children });
const T = (/** @type {string} */ name) => N(name, [], { text: { text: '', size: 20, style: 0, align: 4, line: 1, best: 0, min: 2, max: 40, rich: 0, hwrap: 0, color: [1, 1, 1, 1], font: '' } });
const marks = () => N('part_penalty', [N('item_01'), N('item_02'), N('item_03')], {}, false);
const side = (/** @type {string} */ name) => N(name, [T('text_team_name'), T('text_score'), N('team_icon'), marks()]);
const TOP = N('football_cup_battle_ui_topbar', [N('football_battle_ui_topbar', [N('pane_football_status', [
  N('penalty_count_down', [N('penalty_my', [T('text_countdown')]), N('penalty_enemy')], {}, false),
  N('game_start_count_down', [T('text_countdown')], {}, false),
  N('container_info', [side('group_my'), side('group_enemy'), N('count_down', [N('bg', [T('text_count_down')])])]),
])])]);
const group = (/** @type {string} */ name) => N(name, [N('bg'), N('text')], {}, false);
const container = (/** @type {string} */ name) => N(name, [N('group_middle', [N('part_maininfo', [N('stage', [T('text_stage')])])])], {}, false);
const STAGE = N('football_cup_battle_ui_stage_start_panel', [N('football_battle_ui_stage_wave_start_panel', [container('container_game_start'), container('container_penalty_start')])], {}, false);
const SCORE = N('football_cup_battle_ui_score_panel', [N('panel_root', ['group_enemy', 'group_ally', 'group_draw', 'group_penalty', 'group_penalty_enemy', 'group_penalty_success'].map(group))]);
const DONE = N('football_cup_battle_ui_accomplished_panel', [N('image_back_slide')]);

const P = '@football_battle_ui_topbar/pane_football_status';
const sideHud = (/** @type {string} */ g, /** @type {string[]} */ order) => ({
  name: `${P}/container_info/${g}/text_team_name`, score: `${P}/container_info/${g}/text_score`, icon: `${P}/container_info/${g}/team_icon`,
  marks: `${P}/container_info/${g}/part_penalty`, scored: { node: `${P}/container_info/${g}/text_score`, clip: 'score_add' },
  shots: order.map((i) => `${P}/container_info/${g}/part_penalty/item_0${i}`), win: 'penalty_win', lose: 'penalty_lose',
});
const HUD = {
  cup: {
    top: { ally: sideHud('group_my', ['3', '2', '1']), enemy: sideHud('group_enemy', ['1', '2', '3']), timer: `${P}/container_info/count_down/bg/text_count_down`,
      penaltyOn: { node: P, clip: 'penalty_mode_on' },
      kickoff: { count: `${P}/game_start_count_down/text_countdown`, show: { node: `${P}/game_start_count_down`, clip: 'kick_show' }, hide: { node: `${P}/game_start_count_down`, clip: 'kick_off' } },
      penalty: { count: `${P}/penalty_count_down/penalty_my/text_countdown`, ours: `${P}/penalty_count_down/penalty_my`, theirs: `${P}/penalty_count_down/penalty_enemy`,
        show: { node: `${P}/penalty_count_down`, clip: 'pen_show' }, hide: { node: `${P}/penalty_count_down`, clip: 'pen_off' } } },
    stage: { match: { node: '@football_battle_ui_stage_wave_start_panel/container_game_start', clip: 'stage' },
      penalty: { node: '@football_battle_ui_stage_wave_start_panel/container_penalty_start', clip: 'stage' } },
    score: { ally: '@panel_root/group_ally', enemy: '@panel_root/group_enemy', draw: '@panel_root/group_draw', ourKick: '@panel_root/group_penalty',
      theirKick: '@panel_root/group_penalty_enemy', success: '@panel_root/group_penalty_success', clip: { node: '@', clip: 'score' } },
    done: { clip: { node: '@', clip: 'done' } },
  },
};
const clip = (/** @type {number} */ length) => ({ wrap: 0, length, curves: [] });
const CLIPS = Object.fromEntries([['score_add', 0.3], ['penalty_win', 0.3], ['penalty_lose', 0.3], ['penalty_mode_on', 0.5], ['kick_show', 0.3], ['kick_off', 0.3],
  ['pen_show', 0.3], ['pen_off', 0.3], ['stage', 2], ['score', 1.5], ['done', 2]].map(([k, l]) => [k, clip(/** @type {number} */ (l))]));

const setup = () => {
  const pack = { version: 1, ref: [1920, 1080], sprites: {}, clips: CLIPS, screens: { 'cup.topbar': TOP, 'cup.stage': STAGE, 'cup.score': SCORE, 'cup.done': DONE }, hud: HUD };
  const ui = createUi({ pack: /** @type {any} */ (pack), host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return ui;
};
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Plays `t` seconds of the UI in steps, the clips' ends handled. @param {ReturnType<typeof setup>} ui @param {number} t */
const play = async (ui, t) => { for (let i = 0; i < Math.round(t / 0.1); i++) { ui.tick(0.1); await flush(); } };
const cupOf = (/** @type {Partial<import('../src/index.js').CupTask>} */ o = {}) => ({ ours: '罗德岛队', theirs: '业余组', wait: 0, pk: null, code: 'PF-1', over: false, ...o });
/** @param {ReturnType<typeof createCupHud>} h */
const screens = (h) => /** @type {any} */ (/** @type {any} */ (h).screens());
/** @param {any} s @param {string} path */
const at = (s, path) => /** @type {any} */ (s.one(path));

test('[界面-42] the score functions: a count-down in whole seconds up; a penalty round\'s banner by whose kick and whether it went in', () => {
  assert.deepEqual([countText(2.1), countText(3), countText(-1)], ['3', '3', '0']);
  assert.deepEqual([shotBanner(0, 1), shotBanner(0, 0), shotBanner(1, 0), shotBanner(1, 1)], ['ally', 'enemy', 'success', 'enemy']);
});

test('[界面-42] the top bar: the sides\' names and goals, the time; the match\'s start banner first, the kickoff count-down; a goal\'s banner after it', async () => {
  const ui = setup(), h = /** @type {NonNullable<ReturnType<typeof createCupHud>>} */ (createCupHud(ui));
  assert.equal(h.screens(), null, 'nothing open before a score');
  h.update({ home: 0, away: 0, left: 299.2, cup: cupOf({ wait: 2.5 }) });
  const s = screens(h), top = s.top;
  const text = (/** @type {string} */ path) => at(top, path).txt;
  assert.deepEqual([text('group_my/text_team_name'), text('group_enemy/text_team_name'), text('group_my/text_score'), text('count_down/bg/text_count_down')],
    ['罗德岛队', '业余组', '0', '05:00']);
  const kick = at(top, 'game_start_count_down');
  assert.deepEqual([kick.active, text('game_start_count_down/text_countdown')], [true, '3'], '准备开球 with its seconds');
  const match = at(s.stage, 'container_game_start');
  assert.deepEqual([s.stage.root.active, match.active, at(s.stage, 'container_game_start/group_middle/part_maininfo/stage/text_stage').txt], [true, true, 'PF-1']);
  h.update({ home: 1, away: 0, left: 290, cup: cupOf({ wait: 0 }) });
  await play(ui, 0.5);
  assert.equal(kick.active, false, 'the wait over: its hide clip played, then gone');
  assert.equal(s.score.root.active, false, 'the goal waits for the start banner');
  await play(ui, 1.6);
  assert.deepEqual([s.stage.root.active, s.score.root.active, s.groups.ally.active], [false, true, true], '进球！ after it');
  await play(ui, 1.6);
  assert.equal(s.score.root.active, false);
  h.update({ home: 1, away: 1, left: 280, cup: cupOf() });
  assert.deepEqual([s.score.root.active, s.groups.enemy.active, s.groups.ally.active], [true, true, false], '失球！');
});

test('[界面-42] the shootout: 平局！ then its start banner, each round\'s kick, our count-down, the marks in or out with their banners; 比赛结束 at the end', async () => {
  const ui = setup(), h = /** @type {NonNullable<ReturnType<typeof createCupHud>>} */ (createCupHud(ui));
  h.update({ home: 1, away: 1, left: 1, cup: cupOf() });
  const s = screens(h);
  await play(ui, 2.1);
  h.update({ home: 1, away: 1, left: 0, cup: cupOf({ pk: { round: 0, on: true, left: 9.5, shots: [] } }) });
  const pen = at(s.top, 'penalty_count_down');
  assert.deepEqual([pen.active, at(s.top, 'penalty_my').active, at(s.top, 'penalty_enemy').active, at(s.top, 'penalty_my/text_countdown').txt], [true, true, false, '10']);
  assert.deepEqual([s.score.root.active, s.groups.draw.active], [true, true], '平局！ first');
  assert.deepEqual([at(s.top, 'group_my/part_penalty').active, at(s.top, 'group_enemy/part_penalty').active], [true, true], 'the marks shown');
  await play(ui, 1.6);
  assert.deepEqual([s.score.root.active, s.stage.root.active, at(s.stage, 'container_penalty_start').active], [false, true, true], 'then 点球 决胜！');
  await play(ui, 2.1);
  assert.deepEqual([s.score.root.active, s.groups.ourKick.active], [true, true], 'then 本方点球');
  await play(ui, 1.6);
  const was = s.top.anim.playing.length;
  h.update({ home: 2, away: 1, left: 0, cup: cupOf({ pk: { round: 1, on: false, left: -1, shots: [1] } }) });
  assert.ok(s.top.anim.playing.some((/** @type {any} */ p) => p.s === at(s.top, 'group_my/part_penalty/item_03')), 'our mark nearest the middle plays');
  assert.ok(s.top.anim.playing.length > was);
  assert.deepEqual([s.groups.ally.active, s.score.root.active], [true, true], 'ours in: 进球！');
  await play(ui, 0.5);
  assert.equal(pen.active, false, 'between rounds the count-down goes');
  h.update({ home: 2, away: 1, left: 0, cup: cupOf({ pk: { round: 1, on: true, left: -1, shots: [1] } }) });
  assert.deepEqual([pen.active, at(s.top, 'penalty_my').active, at(s.top, 'penalty_enemy').active], [true, false, true], '部署守门员以阻止对方进球');
  await play(ui, 1.1);
  assert.deepEqual([s.groups.theirKick.active], [true], '对方点球 after 进球！');
  await play(ui, 1.6);
  h.update({ home: 2, away: 1, left: 0, cup: cupOf({ pk: { round: 2, on: false, left: -1, shots: [1, 0] } }) });
  assert.deepEqual([s.groups.success.active], [true], 'theirs kept out: 成功！');
  h.update({ home: 2, away: 1, left: 0, cup: cupOf({ pk: { round: 2, on: false, left: -1, shots: [1, 0] }, over: true }) });
  assert.equal(s.done.root.active, false, 'the finish panel waits its turn');
  await play(ui, 1.6);
  assert.equal(s.done.root.active, true, '比赛结束');
});
