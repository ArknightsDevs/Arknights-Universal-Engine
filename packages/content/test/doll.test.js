// 傀儡师 替身 from the real data (docs/spec/traits.md 职业-16, docs/spec/operators.md 干员-3, 干员-15): the 替身's own range
// from the trait or talent candidate with talent_override_rangeid_flag, flying units with it, a module's trait parts;
// the talents that stop its attack or give it an aura, a module's two talent parts merged in order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traits } from '@aue/sim';
import rangeTable from '../data/ranges.json' with { type: 'json' };
import { loadTraining, operatorAt } from '../src/index.js';
import { dollPart } from '../src/talents.js';
import { mergedTalentsAt } from '../src/doll.js';
import { moduleAt } from '../src/operators.js';

const RANGES = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges);
/** A training: elite, level, and a module at a level when given. @param {number} elite @param {number} level @param {number} [module] @param {number} [moduleLevel] */
const build = (elite, level, module, moduleLevel) => ({ elite, level, potential: 1, trust: 0, skill: 0, skillLevel: 1, ...(module === undefined ? {} : { module, moduleLevel }) });
/** The trait's `doll` of an operator at a training. @param {string} id @param {ReturnType<typeof build>} b */
const dollAt = async (id, b) => /** @type {import('@aue/sim').Doll} */ (traits.traitOfDef(operatorAt(await loadTraining(id), b)).doll);

test('[职业-16] [干员-3] a 替身\'s own range: the flagged trait candidate\'s (风丸, 维荻, 双月, 若叶睦) or talent\'s (贝娜, 归溟); 结城理 has none; flying units with it', async () => {
  const cases = [['char_4016_kazema', 'x-4'], ['char_4107_vrdant', 'x-4'], ['char_4124_iana', 'x-1'], ['char_4183_mortis', '1-1'], ['char_369_bena', 'x-4'], ['char_1023_ghost2', 'x-4']];
  for (const [id, range] of cases) {
    const d = await dollAt(id, build(0, 1));
    assert.deepEqual([d.range, d.antiAir], [RANGES[range], true], id);
  }
  const makoto = await dollAt('char_4217_makoto', build(0, 1));
  assert.deepEqual([makoto.range, makoto.antiAir, makoto.attack, makoto.aura], [null, false, true, null], '结城理: a trait range id without the flag');
});

test('[职业-16] [干员-7] module trait parts: 风丸\'s PUM-X keeps x-4; 归溟\'s PUM-Y flags its trait without a range id of its own, so the trait candidate\'s', async () => {
  const kazema = await loadTraining('char_4016_kazema'), ghost = await loadTraining('char_1023_ghost2');
  const pumX = kazema.modules.findIndex((m) => m.type === 'PUM-X'), pumY = ghost.modules.findIndex((m) => m.type === 'PUM-Y');
  assert.deepEqual((await dollAt('char_4016_kazema', build(2, 60, pumX, 3))).range, RANGES['x-4']);
  const part = moduleAt(ghost, build(2, 60, pumY, 1))?.parts.find((p) => p.target.startsWith('TRAIT'))?.trait[0];
  assert.deepEqual([part?.rangeId, part?.bb.talent_override_rangeid_flag], [null, 1], 'the data: the flag, no range id');
  assert.deepEqual((await dollAt('char_1023_ghost2', build(2, 60, pumY, 1))).range, RANGES['x-4']);
});

test('[干员-15] 归溟\'s 拥抱自我: no attack, and the aura at each training — PUM-X\'s two talent parts merged in order', async () => {
  const ghost = await loadTraining('char_1023_ghost2'), pumX = ghost.modules.findIndex((m) => m.type === 'PUM-X');
  const builds = [build(0, 1), build(1, 1), build(2, 1), build(2, 60, pumX, 2), build(2, 60, pumX, 3)];
  const got = await Promise.all(builds.map(async (b) => (await dollAt('char_1023_ghost2', b))));
  assert.deepEqual(got.map((d) => [d.attack, d.aura]), [[false, { moveMul: 0.8, scale: 0.2 }], [false, { moveMul: 0.7, scale: 0.3 }], [false, { moveMul: 0.6, scale: 0.4 }],
    [false, { moveMul: 0.5, scale: 0.6 }], [false, { moveMul: 0.4, scale: 0.8 }]]);
  const merged = mergedTalentsAt(ghost, build(2, 60, pumX, 2), moduleAt(ghost, build(2, 60, pumX, 2)))[0];
  assert.deepEqual([merged?.rangeId, merged?.bb], ['x-4', { move_speed: -0.5, atk_scale: 0.6, talent_override_rangeid_flag: 1, sp: 8 }], 'the data-only part, then the one with the text');
});

test('[干员-15] 「<替身>不攻击」: 若叶睦\'s 替身 makes no attack; 风丸\'s and 贝娜\'s talents are no 替身 part; hidden ones have none', async () => {
  assert.deepEqual([(await dollAt('char_4183_mortis', build(0, 1))).attack, (await dollAt('char_4183_mortis', build(0, 1))).aura], [false, null]);
  for (const id of ['char_4016_kazema', 'char_369_bena']) assert.equal((await dollAt(id, build(2, 1))).attack, true, id);
  const aura = { description: '<替身>使周围敌人移动速度-20%<@ba.talpu>（+5%）</>且每秒造成相当于20%攻击力的法术伤害', bb: { move_speed: -0.2, atk_scale: 0.2 }, hidden: false };
  assert.deepEqual(dollPart(aura), { attack: false, aura: { moveMul: 0.8, scale: 0.2 } }, 'potential differences in tags and brackets left out');
  assert.equal(dollPart({ ...aura, hidden: true }), null);
  assert.deepEqual(dollPart({ ...aura, bb: {} }), null, 'without its blackboard');
});
