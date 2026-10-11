// Co-op rules (docs/spec/coop.md): goal sides, 共同敌手, a fallen goal passing its enemies to the mate, going down and
// coming back after 30 s without an enemy entering — with operators out of play meanwhile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, deployProblem, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { goalSeats, enemyAtGoal, isDown, REVIVE_FRAMES } from '../src/coop.js';
import { makeEnemy } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { selectable } from '../src/targeting.js';
import { canBlock } from '../src/blocking.js';

/** The tiny level for two players; its goal (1, 5) on side `goal`. @param {string} goal */
function arena(goal) {
  const c = tinyContent();
  c.level.spawns = [];
  c.level.tiles[1][5] = { ...c.level.tiles[1][5], goal };
  const w = createWorld(c, { seed: 1, players: 2 });
  return { w, c };
}
/** An enemy of the tiny level, on route 0, shared or not. @param {any} w @param {any} c @param {boolean} [shared] */
const foe = (w, c, shared = false) => {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.base = { ...e.base, shared };
  return e;
};
const lives = (/** @type {any} */ w) => w.players.map((/** @type {any} */ p) => p.life);

test('[合作-1] a goal belongs to its side: A to seat 0, B to seat 1, shared to both; no side: by map half', () => {
  for (const [side, seats] of [['A', [0]], ['B', [1]], ['Shared', [0, 1]], ['', [1]]]) {
    const { c } = arena(/** @type {string} */ (side));
    assert.deepEqual(goalSeats(c, 2, { row: 1, col: 5 }), seats, String(side));
    assert.deepEqual(goalSeats(c, 1, { row: 1, col: 5 }), [0], 'one player: theirs');
  }
  const { c } = arena('');
  assert.deepEqual(goalSeats(c, 2, { row: 1, col: 2 }), [0], 'the left half');
});

test('[合作-1] [合作-2] an enemy at a goal costs its side a life; a 共同敌手 costs both', () => {
  const { w, c } = arena('B');
  assert.deepEqual(enemyAtGoal(w, c, foe(w, c)), [1]);
  assert.deepEqual(lives(w), [3, 2]);
  assert.deepEqual(enemyAtGoal(w, c, foe(w, c, true)), [0, 1]);
  assert.deepEqual(lives(w), [2, 1]);
  const shared = arena('Shared');
  enemyAtGoal(shared.w, shared.c, foe(shared.w, shared.c));
  assert.deepEqual(lives(shared.w), [2, 2], 'a shared goal costs both');
});

test('[合作-2] [目标-1] a walking enemy reaches the goal: its side loses a life and a goal event names it', () => {
  const { c } = arena('A');
  c.level.spawns = [{ at: 0, enemy: 'slime', route: 0 }];
  c.enemies.slime.moveSpeed = 4;
  const w = createWorld(c, { seed: 1, players: 2 });
  /** @type {any[]} */
  const ev = [];
  for (let f = 0; f < 600 && w.players[0].life === 3; f++) ev.push(...step(w, c));
  assert.deepEqual(lives(w), [2, 3]);
  assert.deepEqual(ev.filter((e) => e.type === 'goal').map((e) => e.owner), [0]);
});

test('[合作-4] [合作-3] at 0 a player goes down: no deploying, their operators out of play; an enemy at their goal passes on', () => {
  const { w, c } = arena('A');
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }], [1, { type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }]]);
  w.players[0].life = 1;
  w.events = [];
  enemyAtGoal(w, c, foe(w, c));
  assert.ok(isDown(w.players[0]));
  assert.deepEqual([w.players[0].life, w.players[0].revive, w.players[0].downs], [0, REVIVE_FRAMES, 1]);
  assert.deepEqual(w.events, [{ type: 'down', owner: 0 }]);
  const [guard, sniper] = w.units.filter((u) => u.kind === KIND.OPERATOR);
  const gs = statsOf(guard);
  assert.deepEqual([gs.disabled, selectable(guard), canBlock(gs)], [true, false, false], 'out of play');
  assert.equal(statsOf(sniper).disabled, false, 'the mate’s operators play on');
  assert.equal(deployProblem(w, c, 0, { type: 'deploy', op: 'sniper', row: 2, col: 3, dir: 0 }), 'player down');
  w.players[0].revive = 100;
  assert.deepEqual(enemyAtGoal(w, c, foe(w, c)), [1], 'a fallen goal: the mate loses the life');
  assert.deepEqual([w.players[0].revive, w.players[1].life], [REVIVE_FRAMES, 2], 'and the countdown starts over');
});

test('[合作-4] back after 30 s without an enemy at their goal: life full, operators in play again', () => {
  const { w, c } = arena('A');
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  w.players[0].life = 1;
  enemyAtGoal(w, c, foe(w, c));
  /** @type {any[]} */
  const ev = [];
  for (let f = 0; f < REVIVE_FRAMES - 1; f++) ev.push(...step(w, c));
  assert.ok(isDown(w.players[0]), 'not yet');
  ev.push(...step(w, c));
  assert.ok(!isDown(w.players[0]));
  assert.deepEqual([w.players[0].life, w.players[0].revive, w.players[0].downs], [3, -1, 1]);
  assert.deepEqual(ev.filter((e) => e.type === 'revive'), [{ type: 'revive', owner: 0 }]);
  assert.equal(statsOf(w.units[0]).disabled, false);
});

test('[合作-4] [同步-1] revival state is state: a snapshot of a down player restores to the same hash and runs on the same', () => {
  const { w, c } = arena('A');
  w.players[0].life = 1;
  enemyAtGoal(w, c, foe(w, c));
  for (let f = 0; f < 50; f++) step(w, c);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  assert.equal(stateHash(copy), stateHash(w));
  for (let f = 0; f < REVIVE_FRAMES; f++) { step(w, c); step(copy, c); }
  assert.equal(stateHash(copy), stateHash(w));
  assert.equal(copy.players[0].life, 3);
});
