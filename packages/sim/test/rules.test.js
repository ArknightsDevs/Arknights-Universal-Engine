// The skeleton's rules on the tiny level (docs/spec: deploy, enemies, combat). Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, physicalDamage, rangeCell, deployProblem } from '../src/index.js';
import { tinyContent } from '@aue/testkit';

const c = tinyContent();
/** @param {number} [players] */
const fresh = (players = 2) => createWorld(c, { seed: 1, players });
/** @param {Partial<import('@aue/schema').DeployCommand>} o @returns {import('@aue/schema').DeployCommand} */
const deploy = (o) => ({ type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0, ...o });
/** @param {ReturnType<typeof fresh>} w @param {number} n */
const run = (w, n) => { for (let i = 0; i < n; i++) step(w, c); };

test('[费用-1] each player starts with the initial cost and gains 1 per costIncreaseTime, up to maxCost', () => {
  const w = fresh();
  assert.deepEqual(w.players.map((p) => p.cost), [10, 10]);
  run(w, 29);
  assert.equal(w.players[0].cost, 10);
  run(w, 1);
  assert.deepEqual(w.players.map((p) => p.cost), [11, 11]);
  run(w, 300);
  assert.equal(w.players[1].cost, 12);
});

test('[部署-1] melee operators stand on melee tiles, ranged ones on ranged tiles', () => {
  const w = fresh();
  assert.equal(deployProblem(w, c, 0, deploy({})), null);
  assert.equal(deployProblem(w, c, 0, deploy({ row: 0, col: 2 })), 'tile not buildable for this operator');
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'sniper', row: 0, col: 2 })), null);
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'sniper' })), 'tile not buildable for this operator');
  assert.equal(deployProblem(w, c, 0, deploy({ row: 9, col: 9 })), 'tile not buildable for this operator');
});

test('[部署-2] cost, occupied tiles, one copy of each operator, the deploy limit; refused commands change nothing', () => {
  const w = fresh();
  step(w, c, [[0, deploy({})]]);
  assert.equal(w.players[0].cost, 5);
  assert.equal(deployProblem(w, c, 1, deploy({})), 'tile occupied');
  assert.equal(deployProblem(w, c, 0, deploy({ col: 3 })), 'already deployed');
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'nobody' })), 'unknown operator or seat');
  assert.equal(deployProblem(w, c, 5, deploy({})), 'unknown operator or seat');
  const poor = fresh();
  poor.players[0].cost = 4;
  assert.equal(deployProblem(poor, c, 0, deploy({})), 'not enough cost');
  step(w, c, [[0, deploy({ op: 'sniper', row: 0, col: 3 })]]);
  const limited = { ...c, level: { ...c.level, options: { ...c.level.options, characterLimit: 2 } } };
  assert.equal(deployProblem(w, limited, 0, deploy({ op: 'guard', col: 4 })), 'already deployed');
  const before = JSON.stringify(w.units);
  step(w, c, [[1, deploy({ col: 2 })]]);
  assert.equal(JSON.stringify(w.units.map((u) => ({ ...u, atkCd: 0, anim: 0 }))), JSON.stringify(JSON.parse(before).map((/** @type {any} */ u) => ({ ...u, atkCd: 0, anim: 0 }))));
});

test('[部署-2] the deploy limit counts each player separately', () => {
  const tight = { ...c, level: { ...c.level, options: { ...c.level.options, characterLimit: 1 } } };
  const w = createWorld(tight, { seed: 1, players: 2 });
  step(w, tight, [[0, deploy({})], [1, deploy({ op: 'sniper', row: 0, col: 2 })]]);
  assert.equal(deployProblem(w, tight, 0, deploy({ op: 'sniper', row: 0, col: 3 })), 'deploy limit reached');
});

test('[撤退-1] a player retreats only their own operators, which may then be deployed again', () => {
  const w = fresh();
  step(w, c, [[0, deploy({})]]);
  const id = w.units[0].id;
  step(w, c, [[1, { type: 'retreat', unit: id }]]);
  assert.equal(w.units.length, 1);
  const ev = step(w, c, [[0, { type: 'retreat', unit: id }]]);
  assert.equal(w.units.filter((u) => u.kind === 0).length, 0);
  assert.deepEqual(ev.filter((e) => e.type === 'retreat'), [{ type: 'retreat', id }]);
  assert.equal(deployProblem(w, c, 0, deploy({})), null);
});

test('[出怪-1] enemies appear at their spawn time, at the start of their route', () => {
  const w = fresh();
  run(w, 15);
  assert.equal(w.units.length, 0);
  const ev = step(w, c);
  assert.deepEqual(ev, [{ type: 'spawn', id: 1, key: 'slime' }]);
  assert.equal(w.units[0].y + w.units[0].x > 0, true);
  run(w, 44);
  assert.equal(w.units.length, 1);
  run(w, 1);
  assert.equal(w.units.length, 2);
});

test('[移动-1] enemies walk straight between MOVE checkpoints at moveSpeed tiles per second', () => {
  const w = fresh();
  run(w, 16);
  const e = w.units[0];
  assert.deepEqual([e.x, e.y], [0, 2 - 1 / 30]);
  run(w, 29);
  assert.ok(Math.abs(e.y - 1) < 1e-12 && e.x < 1e-12, `${e.x},${e.y}`);
  run(w, 30);
  assert.ok(Math.abs(e.x - 1) < 1e-12 && Math.abs(e.y - 1) < 1e-12, `${e.x},${e.y}`);
});

test('[目标-1] an enemy at the goal costs one life of the player the goal belongs to and leaves without dying', () => {
  const w = fresh();
  /** @type {any[]} */
  const events = [];
  for (let i = 0; i < 260; i++) events.push(...step(w, c));
  assert.deepEqual(w.players.map((p) => p.life), [3, 1]);
  assert.equal(events.filter((e) => e.type === 'goal').length, 2);
  assert.equal(events.filter((e) => e.type === 'death').length, 0);
  assert.equal(w.units.length, 0);
  const solo = fresh(1);
  run(solo, 260);
  assert.deepEqual(solo.players.map((p) => p.life), [1]);
});

test('[伤害-1] [伤害-2] physical damage: attack minus defence, at least 5 % of the attack', () => {
  assert.equal(physicalDamage(232, 50), 182);
  assert.equal(physicalDamage(100, 300), 5);
  assert.equal(physicalDamage(240, 240), 12);
  assert.equal(physicalDamage(269, 0), 269);
});

test('[攻击-1] range offsets turn with the facing; four turns come back', () => {
  const op = /** @type {any} */ ({ x: 3, y: 1, dir: 'RIGHT' }), off = { row: 1, col: 2 };
  const cells = ['RIGHT', 'UP', 'LEFT', 'DOWN'].map((dir) => rangeCell({ ...op, dir }, off));
  assert.deepEqual(cells, [{ row: 2, col: 5 }, { row: 3, col: 2 }, { row: 0, col: 1 }, { row: -1, col: 4 }]);
});

test('[攻击-1] an operator hits the earliest enemy in range once per attack interval', () => {
  const w = fresh();
  step(w, c, [[0, deploy({ row: 1, col: 1, dir: 0 })]]);
  /** @type {any[]} */
  const hits = [];
  for (let f = 1; f < 200; f++) for (const e of step(w, c)) if (e.type === 'hit') hits.push({ f, ...e });
  assert.ok(hits.length >= 2, 'the guard attacks');
  const gaps = hits.slice(1).map((h, i) => h.f - hits[i].f).filter((g) => g < 60);
  assert.ok(gaps.every((g) => g === 30), `attack interval 1 s = 30 frames: ${gaps}`);
  assert.ok(hits.every((h) => h.damage === 40), 'guard 50 atk vs slime 10 def');
});
