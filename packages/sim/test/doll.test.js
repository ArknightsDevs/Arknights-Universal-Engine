// 替身 (docs/spec/traits.md 职业-15) on the tiny level: the switch at 0 HP, the 替身 for its time, the switch back.
// Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, takeSnapshot, restoreSnapshot, stateHash } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { dealDamage, setHp } from '../src/damage.js';
import { dollPhase, DOLL_PHASE } from '../src/doll.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** The tiny level without spawns, the guard a 傀儡师: 1 s switches, a 2 s 替身 with attack +15 % and HP +20 %. */
function arena() {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.guard.trait = { doll: { duration: 2, switch: 1, atk: 0.15, maxHp: 0.2 } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = /** @type {Unit} */ (w.units[0]);
  return { w, c, guard };
}
/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };

test('[职业-15] at 0 HP in its own form: a switch with its buffs cleared and HP full, then its 替身 for its time, then a switch back to its own form', () => {
  const { w, c, guard } = arena();
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = 1; e.y = 1; e.hp = statsOf(e).maxHp;
  w.units.push(e);
  e.blockedBy = guard.id;
  addBuff(guard, makeBuff({ key: 'mine', src: guard.id, mods: { defFlat: 5 } }));
  addBuff(guard, makeBuff({ key: 'theirs', src: e.id, left: 900, mods: { atkPct: 0.5 } }));
  setHp(guard, 0);
  step(w, c);
  let s = statsOf(guard);
  assert.deepEqual([w.units.includes(guard), dollPhase(guard), guard.hp, s.blockCnt, e.blockedBy], [true, DOLL_PHASE.IN, 1000, 0, -1]);
  assert.deepEqual([s.invincible, s.flags.undying, s.flags.noSp, s.flags.healFree, s.flags.noAllyHeal, s.flags.noAttack], [true, true, true, true, true, true]);
  assert.deepEqual(guard.buffs.map((b) => b.key).filter((k) => k !== 'doll'), ['mine'], 'others\' and timed buffs cleared, its own lasting one kept');
  assert.equal(dealDamage(w, e, guard, { type: 'true', amount: 5000 }, c), 0, 'invincible while it switches');
  run(w, c, 29);
  assert.equal(dollPhase(guard), DOLL_PHASE.IN);
  step(w, c);
  s = statsOf(guard);
  assert.deepEqual([dollPhase(guard), Math.round(s.atk * 1000) / 1000, s.maxHp, guard.hp, s.blockCnt, s.flags.noSp, s.invincible], [DOLL_PHASE.DOLL, 57.5, 1200, 1200, 0, true, false], 'its 替身: attack and HP up, 阻回, no block');
  run(w, c, 60);
  s = statsOf(guard);
  assert.deepEqual([dollPhase(guard), s.blockCnt, s.invincible, s.maxHp, guard.hp], [DOLL_PHASE.OUT, 2, true, 1000, 1000], '2 s later the switch back: blocking again');
  run(w, c, 30);
  assert.deepEqual([dollPhase(guard), guard.hp, statsOf(guard).invincible], [0, 1000, false], 'its own form');
});

test('[职业-15] its 替身 at 0 HP falls; with 不死 it never switches; the phase is state', () => {
  const { w, c, guard } = arena();
  setHp(guard, 0);
  run(w, c, 31);
  assert.equal(dollPhase(guard), DOLL_PHASE.DOLL);
  const again = restoreSnapshot(takeSnapshot(w));
  run(w, c, 20);
  run(again, c, 20);
  assert.equal(stateHash(again), stateHash(w), 'a snapshot runs on the same');
  setHp(guard, 0);
  step(w, c);
  assert.equal(w.units.includes(guard), false, 'the 替身 falls');
  const b = arena();
  addBuff(b.guard, makeBuff({ key: 'held', flags: { undying: true } }));
  dealDamage(b.w, null, b.guard, { type: 'true', amount: 1e6 }, b.c);
  step(b.w, b.c);
  assert.deepEqual([b.guard.hp, dollPhase(b.guard)], [1, 0]);
});
