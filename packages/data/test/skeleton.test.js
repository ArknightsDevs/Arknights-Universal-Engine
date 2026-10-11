// The skeleton extractor, on small inline fixtures, plus the real extraction when AUE_GAMEDATA points at a checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractSkeleton } from '../src/index.js';
import { extractFromCheckout } from '../src/cli/skeleton.js';

const tile = (/** @type {string} */ tileKey) => ({ tileKey, heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL', playerSideMask: 'ALL' });
const pos = (/** @type {number} */ row, /** @type {number} */ col) => ({ row, col });
const wrap = (/** @type {unknown} */ m_value) => ({ m_defined: true, m_value });

/**
 * A 3 columns x 4 rows level; the map lists rows from the top, so the start tiles are on the top row.
 * @returns {any}
 */
function makeLevel() {
  const spawn = (/** @type {string} */ key, /** @type {number} */ count, /** @type {number} */ interval, /** @type {number} */ preDelay, /** @type {number} */ routeIndex) => ({
    actionType: 'SPAWN', key, count, interval, preDelay, routeIndex,
  });
  return {
    options: { maxLifePoint: 3, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 6, moveMultiplier: 0.5 },
    mapData: {
      tiles: [tile('tile_start_cooperate'), tile('tile_road'), tile('tile_end_cooperate')],
      map: [[0, 0, 0], [1, 1, 1], [1, 1, 1], [2, 2, 2]],
    },
    routes: [
      { motionMode: 'WALK', startPosition: pos(3, 0), endPosition: pos(0, 0), checkpoints: null },
      { motionMode: 'WALK', startPosition: pos(3, 1), endPosition: pos(0, 1), allowDiagonalMove: false, spawnOffset: { x: 0.3, y: 0 },
        checkpoints: [{ type: 'MOVE', time: 0, position: pos(2, 1), reachOffset: { x: 0, y: -0.25 } }, { type: 'WAIT_FOR_SECONDS', time: 4, position: pos(0, 0) }] },
      { motionMode: 'WALK', startPosition: pos(3, 2), endPosition: pos(0, 2), checkpoints: [{ type: 'MOVE', position: pos(1, 2), reachOffset: null }] },
    ],
    waves: [
      { preDelay: 100, fragments: [{ preDelay: 1, actions: [spawn('e_a', 1, 1, 0, 0)] }] },
      {
        preDelay: 2,
        fragments: [
          { preDelay: 1, actions: [{ actionType: 'ACTIVATE_PREDEFINED' }, spawn('e_a', 1, 1, 0, 0)] },
          { preDelay: 3, actions: [spawn('e_b', 3, 2, 1, 2), spawn('e_a', 2, 5, 0, 1), spawn('e_b', 1, 1, 9, 2), spawn('e_a', 1, 1, 0, 0)] },
        ],
      },
    ],
  };
}

const enemy = (/** @type {string} */ key, /** @type {string} */ name) => ({
  Key: key,
  Value: [{ level: 0, enemyData: {
    name: wrap(name), levelType: wrap('NORMAL'), rangeRadius: wrap(0), applyWay: wrap('MELEE'), motion: wrap('WALK'),
    attributes: { maxHp: wrap(100.5), atk: wrap(10), def: wrap(5), magicResistance: wrap(0), moveSpeed: wrap(0.65), baseAttackTime: wrap(1.2), massLevel: wrap(1),
      blockCnt: key === 'e_b' ? wrap(2) : { m_defined: false, m_value: 0 },
      epResistance: key === 'e_b' ? wrap(15) : { m_defined: false, m_value: 0 }, epDamageResistance: { m_defined: false, m_value: 0 },
      palsyImmune: wrap(key === 'e_b'), stunImmune: { m_defined: false, m_value: true }, silenceImmune: wrap(key === 'e_b') },
  } }],
});

const makeEnemyDb = () => ({ enemies: [enemy('e_a', 'Alpha'), enemy('e_b', 'Beta'), enemy('e_x', 'Unused')] });

const makeCharacters = () => ({
  char_500_noirc: {
    name: 'Noir', position: 'MELEE', profession: 'TANK', subProfessionId: 'protector', trait: null,
    phases: [{ rangeId: '0-1', attributesKeyFrames: [
      { level: 1, data: { maxHp: 1, atk: 1, def: 1, magicResistance: 0, cost: 1, blockCnt: 1, baseAttackTime: 1, respawnTime: 70 } },
      { level: 30, data: { maxHp: 1670, atk: 240, def: 315, magicResistance: 0, cost: 14, blockCnt: 3, baseAttackTime: 1.2, respawnTime: 70 } },
    ] }],
  },
});

const ranges = { '0-1': { id: '0-1', grids: [pos(0, 0), pos(-1, 2)] } };

/**
 * @param {{ level?: unknown, enemyDb?: unknown, characters?: unknown }} [over]
 * @returns {any}
 */
function run(over = {}) {
  const characters = over.characters ?? makeCharacters();
  const chars = /** @type {Record<string, unknown>} */ (characters);
  // the real extractor asks for three operators; the fixture reuses one entry for all of them
  const three = { char_500_noirc: chars.char_500_noirc, char_502_nblade: chars.char_500_noirc, char_503_rang: chars.char_500_noirc };
  return extractSkeleton({ level: over.level ?? makeLevel(), enemyDb: over.enemyDb ?? makeEnemyDb(), characters: three, ranges, commit: 'abc' });
}

test('tiles are flipped so that row 0 is the bottom row', () => {
  const s = run();
  assert.equal(s.level.width, 3);
  assert.equal(s.level.height, 4);
  assert.equal(s.level.tiles[3][0].key, 'tile_start_cooperate');
  assert.equal(s.level.tiles[0][0].key, 'tile_end_cooperate');
  assert.deepEqual(s.level.tiles[1].map((/** @type {any} */ t) => t.key), ['tile_road', 'tile_road', 'tile_road']);
  assert.deepEqual(Object.keys(s.level.tiles[0][0]), ['key', 'height', 'buildable', 'passable', 'side']);
});

test('route starts sit on start tiles of the top rows', () => {
  const s = run();
  for (const r of s.level.routes) assert.equal(s.level.tiles[r.start.row][r.start.col].key, 'tile_start_cooperate');
});

test('spawn times add wave and fragment delays, action delay and count times interval; each knows its fragment start', () => {
  const { spawns } = run().level;
  // fragment start = 2 (wave) + 1 + 3 (fragments up to the second one) = 6; ties keep the action order
  assert.deepEqual(spawns, [
    { at: 6, enemy: 'e_a', route: 1, fragment: 6 },
    { at: 6, enemy: 'e_a', route: 2, fragment: 6 },
    { at: 7, enemy: 'e_b', route: 0, fragment: 6 },
    { at: 9, enemy: 'e_b', route: 0, fragment: 6 },
    { at: 11, enemy: 'e_b', route: 0, fragment: 6 },
    { at: 11, enemy: 'e_a', route: 1, fragment: 6 },
    { at: 15, enemy: 'e_b', route: 0, fragment: 6 },
  ]);
});

test('the first fragment with at least four spawn actions is used, limited to six actions', () => {
  const level = makeLevel();
  const frag = level.waves[1].fragments[1];
  for (const preDelay of [50, 60, 70]) frag.actions.push({ actionType: 'SPAWN', key: 'e_b', count: 1, interval: 0, preDelay, routeIndex: 0 });
  const ats = run({ level }).level.spawns.map((/** @type {any} */ s) => s.at);
  assert.equal(ats.includes(66), true);
  assert.equal(ats.includes(76), false);
});

test('routes are copied in first-use order and spawns refer to the new indices', () => {
  const { routes, spawns } = run().level;
  assert.equal(routes.length, 3);
  assert.deepEqual(routes.map((/** @type {any} */ r) => r.start), [pos(3, 2), pos(3, 1), pos(3, 0)]);
  const first = spawns.find((/** @type {any} */ s) => s.enemy === 'e_b' && s.at === 7);
  assert.equal(first.route, 0);
  assert.deepEqual(routes[1].checkpoints, [{ type: 'MOVE', row: 2, col: 1, time: 0, dx: 0, dy: -0.25 }, { type: 'WAIT_FOR_SECONDS', row: 0, col: 0, time: 4, dx: 0, dy: 0 }]);
  assert.deepEqual(routes[0].checkpoints, [{ type: 'MOVE', row: 1, col: 2, time: 0, dx: 0, dy: 0 }]);
  assert.deepEqual(routes[2].checkpoints, []);
  assert.equal(routes[0].motion, 'WALK');
  assert.deepEqual([routes[0].allowDiagonal, routes[1].allowDiagonal], [true, false]);
  assert.deepEqual([routes[0].spawnOffset, routes[1].spawnOffset], [{ x: 0, y: 0 }, { x: 0.3, y: 0 }]);
});

test('only the enemies that spawn are exported, with level 0 attributes unrounded', () => {
  const s = run();
  assert.deepEqual(Object.keys(s.enemies), ['e_a', 'e_b']);
  assert.equal(s.enemies.e_a.maxHp, 100.5);
  assert.equal(s.enemies.e_a.name, 'Alpha');
  assert.equal(s.enemies.e_a.res, 0);
  assert.deepEqual([s.enemies.e_a.applyWay, s.enemies.e_a.motion, s.enemies.e_a.blockCnt, s.enemies.e_b.blockCnt], ['MELEE', 'WALK', undefined, 2]);
});

test('an enemy carries its 损伤抵抗 and 元素抗性 when defined, and its immunities as status flags (状态-7, 元素-2)', () => {
  const s = run();
  assert.deepEqual([s.enemies.e_a.epResistance, s.enemies.e_b.epResistance, s.enemies.e_b.epDamageResistance], [undefined, 15, undefined]);
  assert.equal(s.enemies.e_a.immune, undefined, 'none defined as true: an undefined true does not count');
  assert.deepEqual(s.enemies.e_b.immune, ['silence', 'palsy']);
});

test('an operator takes the last keyframe of elite 0 and its range grids', () => {
  const s = run();
  assert.deepEqual(s.operators.char_500_noirc, {
    name: 'Noir', position: 'MELEE', cost: 14, blockCnt: 3, baseAttackTime: 1.2, maxHp: 1670, atk: 240, def: 315, res: 0,
    range: [pos(0, 0), pos(-1, 2)], profession: 'TANK', branch: 'protector', respawnTime: 70, traitBb: {},
  });
  assert.deepEqual(Object.keys(s), ['source', 'level', 'enemies', 'operators']);
  assert.deepEqual(s.source, { repo: 'Kengxxiao/ArknightsGameData', commit: 'abc', server: 'zh_CN' });
  assert.deepEqual(s.level.options, { maxLifePoint: 3, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 6, moveMultiplier: 0.5 });
});

test('the same input gives the same output', () => {
  assert.equal(JSON.stringify(run()), JSON.stringify(run()));
});

test('bad input is rejected with the path of the field', () => {
  const badMap = makeLevel();
  badMap.mapData.map[1][1] = 7;
  assert.throws(() => run({ level: badMap }), /level\.mapData\.map\[1\]\[1\]/);

  const ragged = makeLevel();
  ragged.mapData.map[2] = [1, 1];
  assert.throws(() => run({ level: ragged }), /equal length/);

  const badCount = makeLevel();
  badCount.waves[1].fragments[1].actions[0].count = 0;
  assert.throws(() => run({ level: badCount }), /count/);

  const badRoute = makeLevel();
  badRoute.waves[1].fragments[1].actions[0].routeIndex = 9;
  assert.throws(() => run({ level: badRoute }), /route 9 does not exist/);

  const noWave = makeLevel();
  noWave.waves = [];
  assert.throws(() => run({ level: noWave }), /no fragment with at least 4/);

  assert.throws(() => run({ level: 'nope' }), /level: expected an object/);
  assert.throws(() => run({ enemyDb: { enemies: [] } }), /no enemy e_a/);
});

test('bad enemy and operator data is rejected', () => {
  const db = makeEnemyDb();
  /** @type {any} */ (db.enemies[0].Value[0].enemyData.attributes.maxHp).m_value = 'many';
  assert.throws(() => run({ enemyDb: db }), /maxHp\.m_value: expected a finite number/);

  const ch = makeCharacters();
  ch.char_500_noirc.position = 'FLYING';
  assert.throws(() => run({ characters: ch }), /expected MELEE or RANGED/);

  const empty = makeCharacters();
  empty.char_500_noirc.phases[0].attributesKeyFrames = [];
  assert.throws(() => run({ characters: empty }), /attributesKeyFrames: empty/);

  const nan = makeCharacters();
  /** @type {any} */ (nan.char_500_noirc.phases[0].attributesKeyFrames[1].data).atk = Number.NaN;
  assert.throws(() => run({ characters: nan }), /atk: expected a finite number/);
});

test('the real extraction satisfies the contract', { skip: process.env.AUE_GAMEDATA ? false : 'AUE_GAMEDATA is not set' }, () => {
  const s = /** @type {any} */ (extractFromCheckout(/** @type {string} */ (process.env.AUE_GAMEDATA)));
  const { level } = s;
  assert.equal(level.id, 'act1multi_01');
  assert.equal(level.tiles.length, level.height);
  assert.equal(level.spawns.length > 0, true);
  for (const r of level.routes) assert.equal(level.tiles[r.start.row][r.start.col].key, 'tile_start_cooperate');
  const topRow = level.tiles[level.height - 1].map((/** @type {any} */ t) => t.key);
  assert.equal(topRow.includes('tile_start_cooperate'), true);
  for (const sp of level.spawns) {
    assert.equal(sp.route >= 0 && sp.route < level.routes.length, true);
    assert.equal(sp.enemy in s.enemies, true);
  }
  assert.deepEqual(level.spawns.map((/** @type {any} */ x) => x.at), level.spawns.map((/** @type {any} */ x) => x.at).toSorted((/** @type {number} */ a, /** @type {number} */ b) => a - b));
  assert.deepEqual(Object.keys(s.operators), ['char_500_noirc', 'char_502_nblade', 'char_503_rang']);
});

test('the trait blackboard of an operator: the last candidate unlocked at elite 0 and potential 0 (职业-7)', () => {
  const chars = makeCharacters();
  const cand = (/** @type {string} */ phase, /** @type {number} */ pot, /** @type {number} */ v) => ({ unlockCondition: { phase, level: 1 }, requiredPotentialRank: pot, blackboard: [{ key: 'cost', value: v }] });
  /** @type {any} */ (chars.char_500_noirc).trait = { candidates: [cand('PHASE_0', 0, 1), cand('PHASE_0', 0, 2), cand('PHASE_0', 4, 3), cand('PHASE_1', 0, 4)] };
  assert.deepEqual(run({ characters: chars }).operators.char_500_noirc.traitBb, { cost: 2 });
  /** @type {any} */ (chars.char_500_noirc).trait = { candidates: [cand('PHASE_2', 0, 1)] };
  assert.deepEqual(run({ characters: chars }).operators.char_500_noirc.traitBb, {});
});
