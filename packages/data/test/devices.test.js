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
    talentBb: { move_speed: 1.15, attack_speed: 25 } } });
  assert.deepEqual(devicesOf(table, null), {});
});
