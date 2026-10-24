// 阵地足球's settings as extracted (docs/spec/football.md 足球-1, 足球-6): a level with both goals reads the co-op battle
// table — the kickoff tables, the four co-op teams and their players, the players' wait — its match time, the stamps'
// net goals from the missions' texts, and the waves' tags; another level reads nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { footballField, footballPlayers, isFootball, COOP_TEAMS } from '../src/football.js';
import { extractWaves } from '../src/waves.js';
import { extractTiles } from '../src/skeleton-world.js';

const T = (/** @type {string} */ key) => ({ key });
const FIELD = [[T('tile_forbidden'), T('tile_forbidden')], [T('tile_allygoal'), T('tile_enemygoal')]];

/** A co-op battle table with the seven teams of today's data. */
const COOP = {
  footballAheadGoalCntFactor: [{ aheadCnt: 0, level: 0 }, { aheadCnt: 2, level: 1 }],
  footballLevelOfWaveFactor: { 0: [{ wave: 0, weight: 100 }, { wave: 1, weight: 50 }], 1: [{ wave: 1, weight: 100 }, { wave: 0, weight: 0 }] },
  footballTeamWeights: ['normal', 'shooter', 'hurrier', 'kungfuer', 'superer', 'bigbroer', 'liner'].map((teamName, i) => ({ teamName, weight: 10 + i, teamType: 1 })),
  footballTeamPlayers: Object.fromEntries(['normal', 'shooter', 'hurrier', 'kungfuer', 'superer', 'bigbroer', 'liner'].map((n) => [n, { forward: `${n}_f`, goalkeeper: `${n}_g`, muscleman: `${n}_m` }])),
  footballPlayersName: { mumssi: 'forward', mubufn: 'goalkeeper', mugnfu: 'muscleman' },
  footballPlayersWaitTimeOnWaveStart: 3,
};
const MISSIONS = [{ description: '争取1个净胜球' }, { description: '争取2个净胜球' }, { description: '争取4个净胜球' }, { description: '别的' }];

test('[足球-1] [足球-6] a level with both goals reads its settings: time, wait, stamps, kickoff tables, the four co-op teams', () => {
  assert.equal(isFootball(FIELD), true);
  const f = /** @type {any} */ (footballField(FIELD, { options: { maxPlayTime: 300 } }, COOP, MISSIONS).football);
  assert.deepEqual([f.time, f.wait, f.stamps], [300, 3, [1, 2, 4]]);
  assert.deepEqual(f.ahead, [[0, 0], [2, 1]]);
  assert.deepEqual(f.weights, { 0: [100, 50], 1: [0, 100] });
  assert.deepEqual(f.teams.map((/** @type {any} */ t) => [t.name, t.weight, t.players.forward]), COOP_TEAMS.map((n, i) => [n, 10 + i, `${n}_f`]));
  assert.deepEqual(f.roles, COOP.footballPlayersName);
  assert.deepEqual(footballPlayers({ football: f }).length, 12);
});

test('[足球-6] the elite players of each team: the `_2` of its players that the enemy references of the level name', () => {
  const named = new Set(['normal_f_2', 'normal_g_2', 'normal_m_2', 'shooter_f_2', 'hurrier_g_2']);
  const f = /** @type {any} */ (footballField(FIELD, { options: { maxPlayTime: 300 } }, COOP, MISSIONS, (k) => named.has(k)).football);
  assert.deepEqual(f.teams.map((/** @type {any} */ t) => t.elite), [
    { forward: 'normal_f_2', goalkeeper: 'normal_g_2', muscleman: 'normal_m_2' }, { forward: 'shooter_f_2' }, { goalkeeper: 'hurrier_g_2' }, undefined]);
  assert.equal(footballPlayers({ football: f }).length, 12 + 5);
});

test('[足球-17] the catch-up global buff: what each goal of our lead adds to the players; none when it adds nothing', () => {
  const buff = (/** @type {number[]} */ [hp, atk, ms, as]) => [{ prefabKey: 'cooperate_enemy_catch_up', blackboard: [
    { key: 'max_hp', value: hp }, { key: 'atk', value: atk }, { key: 'move_speed', value: ms }, { key: 'attack_speed', value: as }] }, { prefabKey: 'other', blackboard: [] }];
  const at = (/** @type {unknown} */ globalBuffs) => /** @type {any} */ (footballField(FIELD, { options: { maxPlayTime: 300 }, globalBuffs }, COOP, MISSIONS).football).catchUp;
  assert.deepEqual(at(buff([0.2, 0.15, 0.01, 0])), { maxHp: 0.2, atk: 0.15, moveSpeed: 0.01 });
  assert.equal(at(buff([0, 0, 0, 0])), undefined);
  assert.equal(at(undefined), undefined);
  assert.throws(() => at(buff([0, 0, 0, 0.1])), /attack_speed/);
});

test('[足球-1] a level without both goals, or without the table, has none', () => {
  assert.deepEqual(footballField([[T('tile_road'), T('tile_allygoal')]], { options: { maxPlayTime: 300 } }, COOP, MISSIONS), {});
  assert.deepEqual(footballField(FIELD, { options: { maxPlayTime: 300 } }, undefined, MISSIONS), {});
  assert.deepEqual(footballPlayers({}), []);
  assert.throws(() => footballField(FIELD, { options: { maxPlayTime: 300 } }, { ...COOP, footballTeamWeights: [] }, MISSIONS), /no normal/);
});

test('[足球-6] a wave\'s advancedWaveTag of digits is its tag; a wave without one, or with a word there as other levels have, has none', () => {
  const raw = [{ advancedWaveTag: '7', fragments: [] }, { advancedWaveTag: null, fragments: [] }, { fragments: [] }, { advancedWaveTag: 'stage', fragments: [] }, { advancedWaveTag: '', fragments: [] }];
  assert.deepEqual(extractWaves(raw, (i) => i).map((w) => w.tag), [7, undefined, undefined, undefined, undefined]);
});

test('[足球-14] a tile whose blackboard says landball is one of our half a ball card may be deployed on', () => {
  const t = (/** @type {string} */ key, /** @type {unknown[] | null} */ blackboard) => ({ tileKey: key, heightType: 'LOWLAND', buildableType: 'MELEE', passableMask: 'ALL', playerSideMask: 'ALL', blackboard });
  const m = extractTiles({ tiles: [t('tile_football', [{ key: 'tile', value: 0, valueStr: 'landball' }]), t('tile_football', null)], map: [[0, 1]] });
  assert.deepEqual(m.tiles[0].map((x) => x.landball), [true, undefined]);
});
