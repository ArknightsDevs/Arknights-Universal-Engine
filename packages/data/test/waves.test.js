// A level's waves, hidden groups and predefined units as the engine's (docs/spec/waves.md 波次-1, 波次-4, 波次-6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWaves, hiddenGroupsOf, predefinesOf, maskCovers, stagesOf } from '../src/index.js';

const act = (/** @type {string} */ actionType, /** @type {Record<string, unknown>} */ more = {}) => ({
  actionType, managedByScheduler: true, key: 'k', count: 1, preDelay: 0, interval: 0, routeIndex: 0, blockFragment: false,
  autoPreviewRoute: false, autoDisplayEnemyInfo: false, isUnharmfulAndAlwaysCountAsKilled: false, hiddenGroup: null, randomSpawnGroupKey: null,
  randomSpawnGroupPackKey: null, randomType: 'ALWAYS', refreshType: 'ALWAYS', weight: 0, dontBlockWave: false, ...more,
});

test('[波次-1] the data\'s action types become SPAWN, ACTIVATE, WITHDRAW or NONE; invalid actions are left out; routes are mapped', () => {
  const waves = extractWaves([{ preDelay: 1, postDelay: 2, maxTimeWaitingForNextWave: -1, fragments: [{ preDelay: 3, actions: [
    act('SPAWN', { key: 'enemy_a', count: 2, interval: 1.5, preDelay: 4, routeIndex: 7, dontBlockWave: true }),
    act('ACTIVATE_PREDEFINED', { key: 'trap#1' }), act('TRIGGER_PREDEFINED', { key: 'trap#2' }), act('WITHDRAW_PREDEFINED', { key: 'trap#1' }),
    act('PREVIEW_CURSOR', { preDelay: 9 }), act('SPAWN', { isValid: false }),
    act('SPAWN', { key: 'enemy_b', hiddenGroup: 'raid', randomSpawnGroupKey: 'g1', randomSpawnGroupPackKey: 'a1', weight: 33 }),
    act('SPAWN', { key: 'enemy_c', randomSpawnGroupPackKey: 'a1', weight: 50, isUnharmfulAndAlwaysCountAsKilled: true }),
  ] }] }], (i) => i * 10);
  assert.deepEqual(waves, [{ preDelay: 1, postDelay: 2, maxWait: -1, fragments: [{ preDelay: 3, actions: [
    { type: 'SPAWN', key: 'enemy_a', route: 70, count: 2, preDelay: 4, interval: 1.5, dontBlockWave: true },
    { type: 'ACTIVATE', key: 'trap#1', route: -1, count: 1, preDelay: 0, interval: 0 },
    { type: 'ACTIVATE', key: 'trap#2', route: -1, count: 1, preDelay: 0, interval: 0 },
    { type: 'WITHDRAW', key: 'trap#1', route: -1, count: 1, preDelay: 0, interval: 0 },
    { type: 'NONE', key: '', route: -1, count: 1, preDelay: 9, interval: 0 },
    { type: 'SPAWN', key: 'enemy_b', route: 0, count: 1, preDelay: 0, interval: 0, hidden: 'raid', group: 'g1', pack: 'a1', weight: 33 },
    { type: 'SPAWN', key: 'enemy_c', route: 0, count: 1, preDelay: 0, interval: 0, unharmful: true, pack: 'a1' },
  ] }] }]);
  assert.deepEqual(extractWaves([{ fragments: [] }], (i) => i), [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [] }], 'missing delays are 0, no cap');
  assert.throws(() => extractWaves([{ fragments: [{ actions: [act('SPAWN', { preDelay: -1 })] }] }], (i) => i), /preDelay/);
});

test('[波次-4] hidden groups enabled at a difficulty: the runes whose mask names it, ALL, or a number with its bit', () => {
  const rune = (/** @type {unknown} */ mask, /** @type {string} */ key) => ({ key: 'level_hidden_group_enable', difficultyMask: mask, blackboard: [{ key: 'key', value: 0, valueStr: key }] });
  const runes = [rune('NORMAL', 'normal'), rune('FOUR_STAR', 'raid'), rune('ALL', 'always'), rune(3, 'old'), rune(2, 'old_raid'),
    { key: 'global_lifepoint', difficultyMask: 'FOUR_STAR', blackboard: [{ key: 'value', value: 5, valueStr: null }] }];
  assert.deepEqual(hiddenGroupsOf(runes, 'NORMAL'), ['normal', 'always', 'old']);
  assert.deepEqual(hiddenGroupsOf(runes, 'FOUR_STAR'), ['raid', 'always', 'old', 'old_raid']);
  assert.deepEqual(hiddenGroupsOf(null, 'NORMAL'), []);
  assert.deepEqual([maskCovers('NONE', 'NORMAL'), maskCovers(4, 'NORMAL'), maskCovers(1, 'NORMAL')], [false, false, true]);
});

test('[波次-6] predefined units: the instances with an alias, their key, whether they start hidden', () => {
  const inst = (/** @type {string | null} */ alias, /** @type {string} */ key, /** @type {boolean} */ hidden) => ({ alias, hidden, position: { row: 0, col: 0 }, inst: { characterKey: key } });
  assert.deepEqual(predefinesOf({ characterInsts: [inst('op#1', 'char_x', false)], tokenInsts: [inst('trap#1', 'trap_179_muctrl', true), inst(null, 'trap_y', false)], characterCards: [] }), [
    { alias: 'op#1', key: 'char_x', hidden: false }, { alias: 'trap#1', key: 'trap_179_muctrl', hidden: true },
  ]);
  assert.deepEqual(predefinesOf(null), []);
});

test('[合作-6] [合作-7] stages from the stage controllers\' blackboards: objective, minimum and advanced targets, time limit, rest', () => {
  const ctrl = (/** @type {string} */ alias, /** @type {Record<string, number | string>} */ bb) => ({
    alias, hidden: true, inst: { characterKey: 'trap_179_muctrl' },
    overrideSkillBlackboard: Object.entries(bb).map(([key, v]) => (typeof v === 'string' ? { key, value: 0, valueStr: v } : { key, value: v, valueStr: null })),
  });
  const stages = stagesOf({ characterInsts: [], tokenInsts: [
    ctrl('m#1', { ability_name: 'protect', protect_y1: 4, protect_y2: 9, basic: 1, time_x: 150 }),
    ctrl('m#2', { ability_name: 'protect', protect_y1: 3, protect_y2: 5, time_x: 210, rest_time: 10 }),
    ctrl('m#3', { ability_name: 'target', kill_y1: 20, kill_y2: 40, enemy_key: 'enemy_x', time_x: 210, rest_time: 10 }),
    ctrl('m#4', { ability_name: 'kill', cnt_y1: 45, cnt_y2: 55, time_x: 220, rest_time: 10 }),
    ctrl('m#5', { ability_name: 'survive', time_x1: 150, time_x2: 180, rest_time: 10 }),
    ctrl('m#6', { ability_name: 'survive', time_x1: 150, time_x2: 150, basic: 1 }),
    ctrl('m#7', { ability_name: 'boss', hp_x1: 0.5, hp_max: 150000, time_x: 240, rest_time: 10 }),
    ctrl('m#8', { ability_name: 'boss', hp_x1: 1, hp_max: 100000, time_x: 180, basic: 1 }),
    ctrl('m#9', { ability_name: 'tower', tower_y1: 4, tower_y2: 5, tower_type: 0, time_x: 150, rest_time: 10 }),
    ctrl('m#10', { ability_name: 'car', distance_y1: 15, time_x: 180, rest_time: 10 }),
    { alias: 'other', hidden: false, inst: { characterKey: 'trap_x' } },
  ] });
  assert.deepEqual(stages, [
    { alias: 'm#1', objective: 'protect', goal: 4, time: 150, rest: 0 },
    { alias: 'm#2', objective: 'protect', goal: 3, advanced: 5, time: 210, rest: 10 },
    { alias: 'm#3', objective: 'target', goal: 20, advanced: 40, time: 210, rest: 10, enemy: 'enemy_x' },
    { alias: 'm#4', objective: 'kill', goal: 45, advanced: 55, time: 220, rest: 10 },
    { alias: 'm#5', objective: 'survive', goal: 150, advanced: 180, time: 180, rest: 10 },
    { alias: 'm#6', objective: 'survive', goal: 150, time: 150, rest: 0 },
    { alias: 'm#7', objective: 'boss', goal: 0.5, advanced: 1, time: 240, rest: 10, hpMax: 150000 },
    { alias: 'm#8', objective: 'boss', goal: 1, time: 180, rest: 0, hpMax: 100000 },
    { alias: 'm#9', objective: 'tower', goal: 4, advanced: 5, time: 150, rest: 10 },
    { alias: 'm#10', objective: 'car', goal: 15, time: 180, rest: 10 },
  ]);
  assert.deepEqual(stagesOf(null), []);
  assert.throws(() => stagesOf({ tokenInsts: [ctrl('m#1', { ability_name: 'football', time_x: 1 })] }), /unknown stage objective football/);
  assert.throws(() => stagesOf({ tokenInsts: [ctrl('m#1', { ability_name: 'kill', time_x: 1 })] }), /cnt_y1/);
});

