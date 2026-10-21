// The devices of a level (docs/spec/level.md 关卡-6) from a small character table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devicesOf } from '../src/index.js';

const frame = (/** @type {number} */ level, /** @type {number} */ hp) => ({ level, data: { maxHp: hp, atk: 0, def: 150, magicResistance: 20, blockCnt: 0, baseAttackTime: 1, attackSpeed: 100, tauntLevel: -1, massLevel: 0 } });
const table = {
  trap_x: { name: 'x', phases: [{ attributesKeyFrames: [frame(1, 1000), frame(11, 2000)] }],
    talents: [{ candidates: [{ unlockCondition: { phase: 'PHASE_0', level: 1 }, blackboard: [{ key: 'move_speed', value: 1.15 }, { key: 'attack_speed', value: 25 }] }] }] },
  trap_179_muctrl: { name: 'ctrl', phases: [{ attributesKeyFrames: [frame(1, 1)] }], talents: null },
};

test('[关卡-6] a level\'s devices: attributes at their training, their talents\' blackboard; never the stage control', () => {
  const pre = { characterInsts: [{ alias: 'x#1', position: { row: 1, col: 2 }, inst: { characterKey: 'trap_x', level: 6, phase: 'PHASE_0' } }],
    tokenInsts: [{ alias: 'c#1', hidden: true, inst: { characterKey: 'trap_179_muctrl', level: 1, phase: 'PHASE_0' } }] };
  assert.deepEqual(devicesOf(table, pre), { trap_x: { name: 'x', maxHp: 1500, atk: 0, def: 150, res: 20, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: -1, massLevel: 0,
    talentBb: { move_speed: 1.15, attack_speed: 25 }, talents: [{ move_speed: 1.15, attack_speed: 25 }] } });
  assert.deepEqual(devicesOf(table, null), {});
});

test("[守御-3] [守御-4] a token card's device has a record too: each talent's blackboard in order (a facility's modes), its deploy cost", () => {
  const card = { ...frame(1, 100), data: { ...frame(1, 100).data, cost: 5 } };
  const bb = (/** @type {number} */ cost) => ({ candidates: [{ unlockCondition: { phase: 'PHASE_0', level: 1 }, blackboard: [{ key: 'cost', value: cost }, { key: 'sp', value: 1 }] }] });
  const t = { trap_f: { name: 'f', phases: [{ attributesKeyFrames: [card] }], talents: [bb(10), bb(20)] } };
  const out = devicesOf(t, { tokenCards: [{ initialCnt: 2, inst: { characterKey: 'trap_f', level: 1, phase: 'PHASE_0' } }] });
  assert.deepEqual(out.trap_f.talents, [{ cost: 10, sp: 1 }, { cost: 20, sp: 1 }]);
  assert.deepEqual(out.trap_f.talentBb, { cost: 20, sp: 1 });
  assert.equal(out.trap_f.cost, 5);
});
