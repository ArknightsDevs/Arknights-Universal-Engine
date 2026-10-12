// The co-op start panel (docs/spec/ui.md 界面-21) on a small pack, in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createStart } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {PackNode[]} [children] @param {Record<string, any>} [comps] @returns {PackNode} */
const N = (name, children = [], comps = {}) => ({ name, active: true, comps, children });
const T = (/** @type {string} */ name, /** @type {string} */ text) => N(name, [], { text: { text, size: 20, style: 0, align: 4, line: 1, best: 0, min: 2, max: 40, rich: 0, hwrap: 0, color: [1, 1, 1, 1], font: '' } });
/** A clip of `length` s fading a path in. @param {number} length @param {string} path @param {number} [wrap] */
const fade = (length, path, wrap = 0) => ({ wrap, length, curves: [{ kind: 'float', path, attr: 'm_Alpha', keys: [[0, 0, 0, 0], [length, 1, 0, 0]] }] });

const panel = { ...N('start', [N('panel_stage_info', [T('text_operation', 'Operation'), T('text_stage_no', '2-10'), T('text_stage_name', '…'), T('text_waiting_0', '正在等待协作者完成战斗加载')])]), active: false };
const coopStart = { info: '@panel_stage_info', start: 'in', loop: 'wait', end: 'out', code: '@panel_stage_info/text_stage_no', name: '@panel_stage_info/text_stage_name', operation: '@panel_stage_info/text_operation' };
const setup = (withPanel = true) => {
  const pack = { version: 1, ref: [1920, 1080], sprites: {}, clips: { in: fade(1, ''), wait: fade(1.3, 'panel_stage_info/text_waiting_0', 2), out: fade(0.5, '') },
    screens: withPanel ? { 'coop.start': panel } : {}, hud: withPanel ? { coopStart } : {} };
  const ui = createUi({ pack: /** @type {any} */ (pack), host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return ui;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

test('[界面-21] the start panel: the stage\'s code and name, its start clip, then waiting for the mate; the end clip once the battle begins', async () => {
  const ui = setup(), s = /** @type {NonNullable<ReturnType<typeof createStart>>} */ (createStart(ui, { code: 'IG-1', name: '逃离火线' }));
  const text = (/** @type {string} */ n) => /** @type {any} */ (s.screen.one(n)).txt;
  assert.deepEqual([text('text_stage_no'), text('text_stage_name'), text('text_operation')], ['IG-1', '逃离火线', 'Operation']);
  assert.deepEqual([s.screen.root.active, s.phase()], [true, 'start']);
  ui.tick(1.1);
  await flush();
  assert.equal(s.phase(), 'wait', 'its start clip over, the battle not begun: waiting');
  ui.tick(5);
  assert.equal(s.phase(), 'wait', 'the waiting loop goes on');
  s.begin();
  s.begin();
  assert.equal(s.phase(), 'end');
  ui.tick(0.6);
  await flush();
  assert.deepEqual([s.phase(), s.screen.root.active], ['gone', false], 'its end clip over: gone');
});

test('[界面-21] begun during the start clip: straight to the end; no panel without the pack\'s', async () => {
  const ui = setup(), s = /** @type {NonNullable<ReturnType<typeof createStart>>} */ (createStart(ui, { code: 'IG-10', name: '匪帮集会' }));
  ui.tick(0.3);
  s.begin();
  await flush();
  assert.equal(s.phase(), 'end', 'the start clip replaced, no waiting');
  ui.tick(0.6);
  await flush();
  assert.equal(s.phase(), 'gone');
  assert.equal(createStart(setup(false), { code: 'x', name: 'y' }), null);
});
