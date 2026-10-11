// A level's waves, hidden groups and predefined units as the engine's (docs/spec/waves.md 波次-1, 波次-4, 波次-6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWaves, hiddenGroupsOf, predefinesOf, maskCovers } from '../src/index.js';

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
    act('SPAWN', { key: 'enemy_c', randomSpawnGroupPackKey: 'a1', weight: 50 }),
  ] }] }], (i) => i * 10);
  assert.deepEqual(waves, [{ preDelay: 1, postDelay: 2, maxWait: -1, fragments: [{ preDelay: 3, actions: [
    { type: 'SPAWN', key: 'enemy_a', route: 70, count: 2, preDelay: 4, interval: 1.5, dontBlockWave: true },
    { type: 'ACTIVATE', key: 'trap#1', route: -1, count: 1, preDelay: 0, interval: 0 },
    { type: 'ACTIVATE', key: 'trap#2', route: -1, count: 1, preDelay: 0, interval: 0 },
    { type: 'WITHDRAW', key: 'trap#1', route: -1, count: 1, preDelay: 0, interval: 0 },
    { type: 'NONE', key: '', route: -1, count: 1, preDelay: 9, interval: 0 },
    { type: 'SPAWN', key: 'enemy_b', route: 0, count: 1, preDelay: 0, interval: 0, hidden: 'raid', group: 'g1', pack: 'a1', weight: 33 },
    { type: 'SPAWN', key: 'enemy_c', route: 0, count: 1, preDelay: 0, interval: 0, pack: 'a1' },
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
