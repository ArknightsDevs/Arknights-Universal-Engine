// 替身 (docs/spec/traits.md 职业-15, 职业-16) on the tiny level: the switch at 0 HP, the 替身 for its time, the switch
// back; a 替身's own range and flying units, one that does not attack, one with an aura. Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, takeSnapshot, restoreSnapshot, stateHash } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { dealDamage, setHp } from '../src/damage.js';
import { dollPhase, DOLL_PHASE } from '../src/doll.js';
import { applyStatus } from '../src/status.js';
import { targetsOf } from '../src/combat.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/**
 * The tiny level without spawns, the guard (on (1, 1) facing right) a 傀儡师: 1 s switches, a 2 s 替身 with attack +15 %
 * and HP +20 %, and `more` (职业-16).
 * @param {Record<string, unknown>} [more]
 */
function arena(more = {}) {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.guard.trait = { doll: { duration: 2, switch: 1, atk: 0.15, maxHp: 0.2, ...more } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = /** @type {Unit} */ (w.units[0]);
  return { w, c, guard };
}
/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/**
 * A rooted enemy without resistance and with HP to spare at (row, col).
 * @param {World} w @param {any} c @param {number} row @param {number} col @param {Record<string, unknown>} [over] @returns {Unit}
 */
function foe(w, c, row, col, over = {}) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = col; e.y = row;
  e.base = { ...e.base, maxHp: 1e5, ...over };
  e.hp = statsOf(e).maxHp;
  applyStatus(e, 'root', {});
  w.units.push(e);
  return e;
}
/** The 3 × 3 around the operator (range x-4). */
const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));
/** Brings the guard to its 替身: 0 HP, then the 1 s switch. @param {World} w @param {any} c @param {Unit} guard */
const toDoll = (w, c, guard) => { setHp(guard, 0); run(w, c, 31); assert.equal(dollPhase(guard), DOLL_PHASE.DOLL); };
/** The ids of a list, in order. @param {Unit[]} list */
const ids = (list) => list.map((u) => u.id);

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

test('[职业-16] a 替身 with its own range fights in it and selects flying units; its own form, before and after, does not', () => {
  const { w, c, guard } = arena({ range: AROUND, antiAir: true });
  const walker = foe(w, c, 0, 0), flyer = foe(w, c, 2, 2, { motion: 'FLY' });
  assert.deepEqual(targetsOf(w, c, guard), [], 'its own form: (1, 1) and (1, 2)');
  toDoll(w, c, guard);
  assert.deepEqual(ids(targetsOf(w, c, guard)).sort((a, b) => a - b), [walker.id, flyer.id], 'its 替身: the 3 × 3 around it, the flying one too');
  run(w, c, 60);
  assert.deepEqual([dollPhase(guard), targetsOf(w, c, guard)], [DOLL_PHASE.OUT, []], 'switching back: its own range');
  const plain = arena({ range: AROUND });
  const f2 = foe(plain.w, plain.c, 2, 2, { motion: 'FLY' }), w2 = foe(plain.w, plain.c, 0, 0);
  toDoll(plain.w, plain.c, plain.guard);
  assert.deepEqual(ids(targetsOf(plain.w, plain.c, plain.guard)), [w2.id], 'without antiAir: ground units only');
  assert.ok(!targetsOf(plain.w, plain.c, plain.guard).includes(f2));
});

test('[职业-16] a 替身 that does not attack holds noAttack and makes no attack while it fights', () => {
  for (const attack of [false, true]) {
    const { w, c, guard } = arena({ attack });
    foe(w, c, 1, 2);
    toDoll(w, c, guard);
    /** @type {any[]} */
    const ev = [];
    for (let i = 0; i < 59; i++) ev.push(...step(w, c));
    assert.equal(dollPhase(guard), DOLL_PHASE.DOLL);
    assert.equal(!!statsOf(guard).flags.noAttack, !attack);
    assert.equal(ev.some((x) => x.type === 'hit' && x.id === guard.id), attack, attack ? 'one that attacks hits (1, 2)' : 'none');
  }
});

test('[职业-16] a 替身\'s aura: the ground enemies in its range slowed (最终乘算) and hit each second for scale × its attack; not flying ones, not those out of range; gone with the 替身', () => {
  const { w, c, guard } = arena({ range: AROUND, antiAir: true, attack: false, aura: { moveMul: 0.6, scale: 0.4 } });
  const near = foe(w, c, 2, 2), flyer = foe(w, c, 2, 0, { motion: 'FLY' }), far = foe(w, c, 1, 4);
  toDoll(w, c, guard);
  const hp = () => [near.hp, flyer.hp, far.hp];
  assert.deepEqual([statsOf(near).moveSpeed, statsOf(flyer).moveSpeed, statsOf(far).moveSpeed], [0.6, 1, 1], 'slowed in its range, on the ground');
  const before = hp();
  run(w, c, 29);
  assert.deepEqual(hp(), before, 'no hit within the first second');
  const snap = restoreSnapshot(takeSnapshot(w));
  step(w, c);
  assert.deepEqual(hp(), [before[0] - 57.5 * 0.4, before[1], before[2]], 'a second in: 0.4 × its attack (50 × 1.15) as arts damage');
  run(w, c, 30);
  assert.equal(near.hp, before[0] - 2 * 23, 'each second');
  run(snap, c, 31);
  assert.equal(stateHash(snap), stateHash(w), 'a snapshot keeps the aura\'s second');
  run(w, c, 1);
  assert.deepEqual([dollPhase(guard), statsOf(near).moveSpeed, near.buffs.some((b) => b.key.startsWith('doll:'))], [DOLL_PHASE.OUT, 1, false], 'the 替身 gone, the slow too');
});
