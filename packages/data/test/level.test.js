// A whole level as content (docs/spec/level.md): enemies at the level's database level with its overrides, what each
// difficulty's runes change; and, with AUE_GAMEDATA, the committed act1multi_01 equals a fresh extraction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractLevel, difficultyOf, mergeEnemyData } from '../src/index.js';
import { sharedEnemies } from '../src/enemies.js';
import { extractLevelFromCheckout } from '../src/cli/level.js';

const wrap = (/** @type {unknown} */ m_value) => ({ m_defined: true, m_value });
const undef = (/** @type {unknown} */ m_value) => ({ m_defined: false, m_value });
const tile = (/** @type {string} */ tileKey) => ({ tileKey, heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL', playerSideMask: 'ALL' });
const pos = (/** @type {number} */ row, /** @type {number} */ col) => ({ row, col });

/** An enemy_database entry; `levels` adds higher levels' enemyData. @param {string} key @param {Record<string, unknown>[]} [levels] */
const entry = (key, levels = []) => ({
  Key: key,
  Value: [{ level: 0, enemyData: {
    name: wrap(key), levelType: wrap('NORMAL'), rangeRadius: wrap(0), applyWay: wrap('MELEE'), motion: wrap('WALK'), lifePointReduce: wrap(1),
    talentBlackboard: null,
    attributes: { maxHp: wrap(1000), atk: wrap(100), def: wrap(50), magicResistance: wrap(0), moveSpeed: wrap(1), baseAttackTime: wrap(2), massLevel: wrap(1),
      blockCnt: undef(1), epDamageResistance: undef(0), epResistance: undef(0) },
  } }, ...levels.map((enemyData, i) => ({ level: i + 1, enemyData }))],
});
const rune = (/** @type {string} */ key, /** @type {unknown} */ mask, /** @type {Record<string, number | string>} */ bb) => ({
  key, difficultyMask: mask, blackboard: Object.entries(bb).map(([k, v]) => (typeof v === 'string' ? { key: k, value: 0, valueStr: v } : { key: k, value: v, valueStr: null })),
});
const spawn = (/** @type {string} */ key, /** @type {number} */ routeIndex) => ({ actionType: 'SPAWN', key, count: 1, preDelay: 0, interval: 0, routeIndex });

function makeLevel() {
  return {
    options: { maxLifePoint: 8, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 6, moveMultiplier: 0.5 },
    mapData: { tiles: [tile('tile_start'), tile('tile_road'), tile('tile_end')], map: [[0, 1, 2], [1, 1, 1]] },
    routes: [
      { motionMode: 'WALK', startPosition: pos(1, 0), endPosition: pos(1, 2), checkpoints: null },
      { motionMode: 'WALK', startPosition: pos(1, 0), endPosition: pos(0, 2), checkpoints: null },
    ],
    waves: [{ preDelay: 0, postDelay: 0, maxTimeWaitingForNextWave: -1, fragments: [{ preDelay: 0, actions: [spawn('e_b', 1), spawn('e_a', 1), spawn('e_c', 0)] }] }],
    enemyDbRefs: [
      { id: 'e_a', level: 1, useDb: true, overwrittenData: { name: undef(null), attributes: { maxHp: wrap(5000), atk: undef(0) } } },
      { id: 'e_c', level: 0, useDb: false, overwrittenData: entry('e_c').Value[0].enemyData },
    ],
    runes: [
      rune('level_hidden_group_enable', 'NORMAL', { key: 'normal' }), rune('level_hidden_group_enable', 'FOUR_STAR', { key: 'raid' }),
      rune('level_hidden_group_enable', 'ALL', { key: 'both' }), rune('level_hidden_group_disable', 'FOUR_STAR', { key: 'both' }),
      rune('global_lifepoint', 'FOUR_STAR', { value: 5 }), rune('enemy_attribute_mul', 'FOUR_STAR', { atk: 1.4, def: 1.2, max_hp: 1.2 }),
      rune('enemy_attribute_mul', 'FOUR_STAR', { move_speed: 1.5, enemy: 'e_a|e_b' }), rune('enemy_attribute_mul', 'NORMAL', { atk: 2, enemy_exclude: 'e_a' }),
      rune('level_enemy_replace', 'FOUR_STAR', { key: 'e_b', value: 'e_d' }),
      rune('env_gbuff_new_with_verify', 'ALL', { enemy: 'e_b', key: 'cooperate_enemy_side_shared' }), rune('env_system_new', 'FOUR_STAR', { value: 1 }),
    ],
    predefines: { characterInsts: [], tokenInsts: [] },
  };
}
const db = () => ({ enemies: [entry('e_a', [{ attributes: { atk: wrap(300) }, levelType: wrap('ELITE'), talentBlackboard: [{ key: 'x', value: 1, valueStr: null }] }]), entry('e_b'), entry('e_d')] });

test('[关卡-1] enemies: level 0, then the level the level asks for, then its overwrittenData; useDb false: overwrittenData alone', () => {
  const s = /** @type {any} */ (extractLevel({ id: 'lv', level: makeLevel(), enemyDb: db(), commit: 'abc' }));
  assert.deepEqual(Object.keys(s.enemies), ['e_a', 'e_b', 'e_c', 'e_d'], 'spawned and replacement enemies, sorted');
  assert.deepEqual([s.enemies.e_a.maxHp, s.enemies.e_a.atk, s.enemies.e_a.def, s.enemies.e_a.levelType, s.enemies.e_a.name], [5000, 300, 50, 'ELITE', 'e_a'],
    'the level\'s 5000 HP, level 1\'s 300 ATK and ELITE, level 0\'s DEF; an undefined override changes nothing');
  assert.deepEqual([s.enemies.e_b.atk, s.enemies.e_b.shared, s.enemies.e_c.maxHp, s.enemies.e_b.lifePointReduce], [100, true, 1000, 1]);
  assert.deepEqual(s.level.routes.map((/** @type {any} */ r) => r.end), [pos(0, 2), pos(1, 2)], 'first-use order');
  assert.deepEqual(s.level.waves[0].fragments[0].actions.map((/** @type {any} */ a) => [a.key, a.route]), [['e_b', 0], ['e_a', 0], ['e_c', 1]]);
  assert.deepEqual([s.level.stages, s.level.predefines, s.source.commit], [[], [], 'abc']);
  const missing = makeLevel();
  missing.enemyDbRefs[0].level = 3;
  assert.throws(() => extractLevel({ id: 'lv', level: missing, enemyDb: db(), commit: '' }), /no level 3/);
  assert.deepEqual(mergeEnemyData({ a: wrap(1), attributes: { x: wrap(1) } }, { a: undef(9), b: wrap(2), attributes: null }, 'p'), { a: wrap(1), b: wrap(2), attributes: { x: wrap(1) } });
});

test('[关卡-2] a difficulty\'s runes: hidden groups enabled and disabled, the life point, enemy multipliers with their filters, replacements', () => {
  const runes = makeLevel().runes;
  assert.deepEqual(difficultyOf(runes, 'NORMAL'), { hiddenGroups: ['normal', 'both'], enemyMul: [{ mods: { atk: 2 }, exclude: ['e_a'] }], replace: {}, unsupported: [] });
  assert.deepEqual(difficultyOf(runes, 'FOUR_STAR'), {
    hiddenGroups: ['raid'], lifePoint: 5, replace: { e_b: 'e_d' }, unsupported: ['env_system_new'],
    enemyMul: [{ mods: { atk: 1.4, def: 1.2, max_hp: 1.2 } }, { mods: { move_speed: 1.5 }, enemy: ['e_a', 'e_b'] }],
  });
  assert.deepEqual(difficultyOf(null, 'NORMAL'), { hiddenGroups: [], enemyMul: [], replace: {}, unsupported: [] });
});

test('[关卡-1] [关卡-2] [关卡-3] [关卡-4] the committed act1multi_01 is a fresh extraction of the pinned data (AUE_GAMEDATA, AUE_LEVEL_MAP)', {
  skip: process.env.AUE_GAMEDATA && process.env.AUE_LEVEL_MAP ? false : 'AUE_GAMEDATA or AUE_LEVEL_MAP is not set',
}, () => {
  const committed = readFileSync(new URL('../../content/data/levels/act1multi_01.json', import.meta.url), 'utf8');
  const map = { file: /** @type {string} */ (process.env.AUE_LEVEL_MAP), source: JSON.parse(committed).source.view };
  const fresh = `${JSON.stringify(extractLevelFromCheckout(/** @type {string} */ (process.env.AUE_GAMEDATA), 'act1multi_01', map), null, 2)}\n`;
  assert.equal(fresh, committed);
});

test('[关卡-3] a camera view vector: three finite numbers, kept with its source; anything else refused', () => {
  const out = /** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', view: { vector: [0, -6.1, -9.76], source: 'repo@sha:map.json' } }));
  assert.deepEqual([out.level.view, out.source.view], [[0, -6.1, -9.76], 'repo@sha:map.json']);
  assert.throws(() => extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', view: { vector: [0, 1], source: 's' } }), /three finite numbers/);
  assert.equal(/** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c' })).level.view, undefined);
});

test('[关卡-4] a stage\'s code and name from its stage table entry; none without one; a malformed entry refused', () => {
  const out = /** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', stage: { code: 'IG-1', name: '逃离火线', stageType: 'ACTIVITY' } }));
  assert.deepEqual([out.level.code, out.level.name], ['IG-1', '逃离火线']);
  const none = /** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c' }));
  assert.deepEqual(['code' in none.level, 'name' in none.level], [false, false]);
  assert.throws(() => extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', stage: { code: 1 } }));
});

test('[关卡-2] runes: the max cost, the operators\' block count, shared enemies written as their own rune', () => {
  const rune = (/** @type {string} */ key, /** @type {Record<string, number | string>} */ bb, mask = 'ALL') => ({ key, difficultyMask: mask, blackboard: Object.entries(bb).map(([k, v]) => (typeof v === 'string' ? { key: k, value: 0, valueStr: v } : { key: k, value: v, valueStr: null })) });
  const runes = [rune('cbuff_max_cost', { max_cost: 30, max_cost_ceil: 99 }), rune('char_blockcnt_add', { value: -1 }, 'FOUR_STAR'), rune('cooperate_enemy_side_shared', { enemy: 'e_a|e_b' }, 'NORMAL')];
  assert.deepEqual(difficultyOf(runes, 'NORMAL'), { hiddenGroups: [], maxCost: 30, enemyMul: [], replace: {}, unsupported: [] });
  assert.deepEqual(difficultyOf(runes, 'FOUR_STAR'), { hiddenGroups: [], maxCost: 30, blockAdd: -1, enemyMul: [], replace: {}, unsupported: [] });
  assert.deepEqual([...sharedEnemies(runes)], ['e_a', 'e_b']);
});
