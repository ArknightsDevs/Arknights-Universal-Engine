// Co-op rules (docs/spec/coop.md): goal sides, 共同敌手, a fallen goal passing its enemies to the mate, going down and
// coming back after 30 s without an enemy entering — with operators out of play meanwhile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, deployProblem, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { goalSeats, enemyAtGoal, isDown, REVIVE_FRAMES, ASK_FRAMES, DEFAULT_COST_TRANSFER, askProblem, answerCost } from '../src/coop.js';
import { makeEnemy } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { selectable } from '../src/targeting.js';
import { canBlock } from '../src/blocking.js';

/** The tiny level for two players; its goal (1, 5) on side `goal`. @param {string} goal */
function arena(goal) {
  const c = tinyContent();
  c.level.waves = [];
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
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
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

test('[合作-5] a cost request: who may ask, the transfer capped by the level, the mate and the room left, the cooldown', () => {
  const { w, c } = arena('A');
  const [a, b] = w.players;
  c.level.options.maxCost = 99;
  a.cost = 90; b.cost = 40;
  assert.equal(askProblem(w, c, 0), null);
  step(w, c, [[0, { type: 'ask' }]]);
  assert.deepEqual([a.ask, a.askCd], [ASK_FRAMES - 1, ASK_FRAMES - 1]);
  assert.equal(askProblem(w, c, 1), 'request open', 'one request at a time, either way');
  assert.equal(askProblem(w, c, 0), 'request open');
  const ev = step(w, c, [[1, { type: 'answer', accept: 1 }]]);
  assert.deepEqual(ev.filter((e) => e.type === 'answer'), [{ type: 'answer', owner: 0, accept: 1, amount: 9 }], 'only the room left moves');
  assert.equal(a.ask, -1);
  assert.equal(askProblem(w, c, 0), 'cost full');
  a.cost = 10;
  assert.equal(askProblem(w, c, 0), 'cooling down');
  for (let f = 0; f < ASK_FRAMES; f++) step(w, c);
  a.cost = 10; b.cost = 40;
  assert.equal(askProblem(w, c, 0), null, 'after 15 s it may ask again');
  step(w, c, [[0, { type: 'ask' }]]);
  step(w, c, [[1, { type: 'answer', accept: 1 }]]);
  assert.deepEqual([a.cost - 10 > 0, b.cost], [true, 40 - DEFAULT_COST_TRANSFER], 'at most 15 by default');
  b.cost = 3; a.ask = -1; a.askCd = 0;
  c.level.options.costTransfer = 25;
  step(w, c, [[0, { type: 'ask' }]]);
  const out = step(w, c, [[1, { type: 'answer', accept: 1 }]]).find((e) => e.type === 'answer');
  assert.equal(out?.amount, 3, 'never more than the mate has');
});

test('[合作-5] refused, ignored, out of turn: nothing moves', () => {
  const { w, c } = arena('A');
  const [a, b] = w.players;
  a.cost = 0; b.cost = 20;
  step(w, c, [[0, { type: 'ask' }]]);
  let ev = step(w, c, [[0, { type: 'answer', accept: 1 }], [1, { type: 'answer', accept: 0 }]]);
  assert.deepEqual(ev.filter((e) => e.type === 'answer'), [{ type: 'answer', owner: 0, accept: 0, amount: 0 }], 'the asker cannot answer itself');
  assert.deepEqual([a.cost, b.cost], [0, 20]);
  a.askCd = 0;
  step(w, c, [[0, { type: 'ask' }]]);
  ev = [];
  for (let f = 0; f < ASK_FRAMES; f++) ev.push(...step(w, c));
  assert.deepEqual(ev.filter((e) => e.type === 'answer'), [{ type: 'answer', owner: 0, accept: -1, amount: 0 }], 'unanswered for 15 s: ignored');
  assert.equal(a.ask, -1);
});

test('[合作-5] no request without a mate, from a down player, or to a down mate', () => {
  const c = tinyContent();
  c.level.waves = [];
  const solo = createWorld(c, { seed: 1, players: 1 });
  assert.equal(askProblem(solo, c, 0), 'no mate');
  answerCost(solo, c, 0, true);
  const { w } = arena('A');
  w.players[0].cost = 0;
  w.players[1].revive = 10;
  assert.equal(askProblem(w, c, 0), 'mate down');
  assert.equal(askProblem(w, c, 1), 'player down');
});
