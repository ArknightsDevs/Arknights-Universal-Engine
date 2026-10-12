// The co-op stage start banner (docs/spec/ui.md 界面-22) on a small pack, in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createBanner, bannerTitle } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {PackNode[]} [children] @param {Record<string, any>} [comps] @param {boolean} [active] @returns {PackNode} */
const N = (name, children = [], comps = {}, active = true) => ({ name, active, comps, children });
const T = (/** @type {string} */ name, /** @type {string} */ text) => N(name, [], { text: { text, size: 20, style: 0, align: 4, line: 1, best: 0, min: 2, max: 40, rich: 0, hwrap: 0, color: [1, 1, 1, 1], font: '' } });

const panel = N('container_conventional_mode', [N('content', [T('text_title', '目标·存活'), T('text_num', ''),
  N('mission_layout_max_01', [T('info', 'x')]), N('mission_layout_max_02', [T('info', 'y')])])], {}, false);
const screen = N('banner', [N('info', [panel])]);
const coopStage = { panel: '@info/container_conventional_mode', clip: 'show', title: '@info/container_conventional_mode/content/text_title',
  stage: '@info/container_conventional_mode/content/text_num', basic: '@info/container_conventional_mode/content/mission_layout_max_01/info',
  advanced: '@info/container_conventional_mode/content/mission_layout_max_02/info', advancedField: '@info/container_conventional_mode/content/mission_layout_max_02' };
const setup = (withPanel = true) => {
  const pack = { version: 1, ref: [1920, 1080], sprites: {}, clips: { show: { wrap: 0, length: 4, curves: [{ kind: 'float', path: 'content', attr: 'm_Alpha', keys: [[0, 0, 0, 0], [4, 1, 0, 0]] }] } },
    screens: withPanel ? { 'coop.stage': screen } : {}, hud: withPanel ? { coopStage } : {} };
  const ui = createUi({ pack: /** @type {any} */ (pack), host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return ui;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

test('[界面-22] a stage begins: its task on the banner once — title, number, basic and advanced tasks — then the banner goes', async () => {
  const ui = setup(), b = /** @type {NonNullable<ReturnType<typeof createBanner>>} */ (createBanner(ui));
  const text = (/** @type {string} */ path) => /** @type {any} */ (b.screen.one(path)).txt;
  assert.equal(b.panel.active, false, 'hidden until a stage begins');
  b.update(null);
  assert.equal(b.panel.active, false);
  b.update({ stage: 1, title: '营救', basic: '保护4位乌萨斯平民进入目标点' });
  assert.deepEqual([b.panel.active, text('text_title'), text('text_num'), text('mission_layout_max_01/info')], [true, '目标·营救', '1', '保护4位乌萨斯平民进入目标点']);
  assert.equal(/** @type {any} */ (b.screen.one('mission_layout_max_02')).active, false, 'no advanced goal: no second line');
  ui.tick(4.1);
  await flush();
  assert.equal(b.panel.active, false, 'its clip played: gone');
  b.update({ stage: 1, title: '营救', basic: '保护4位乌萨斯平民进入目标点' });
  assert.equal(b.panel.active, false, 'once per stage');
  b.update({ stage: 2, title: '营救', basic: '保护3位乌萨斯平民进入目标点', advanced: '保护5位乌萨斯平民进入目标点' });
  assert.deepEqual([b.shown(), text('text_num'), /** @type {any} */ (b.screen.one('mission_layout_max_02')).active, text('mission_layout_max_02/info')],
    [2, '2', true, '保护5位乌萨斯平民进入目标点']);
  assert.equal(bannerTitle('生存'), '目标·生存');
  assert.equal(createBanner(setup(false)), null, 'no banner without the pack\'s');
});
