// The attack swing and projectiles (docs/spec/combat.md 攻击-2, 攻击-3): the wind-up from the clip's OnAttack time and
// its speed-up, the cooldown from the attack's start, targets locked at the start, interruptions, 麻痹's 2 s cut, skills
// counting the attack when it lands, projectiles homing, fizzling and hitting without their shooter; snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { windupFrames, SHOT_SPEED, PALSY_CUT_FRAMES } from '../src/swing.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** The tiny level without spawns; `tweak` changes the content first; `foe` adds a rooted enemy. @param {(c: any) => void} [tweak] */
function arena(tweak) {
  const c = tinyContent();
  c.level.spawns = [];
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, ...over };
    e.hp = e.maxHp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  return { w, c, foe };
}
/** Runs n frames; the events with their frame. Bare commands are seat 0's. @param {World} w @param {any} c @param {number} n @param {any[]} [cmds] */
function run(w, c, n, cmds = []) {
  const first = /** @type {[number, any][]} */ (cmds.map((x) => (Array.isArray(x) ? x : [0, x])));
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c, i === 0 ? first : [])) out.push({ ...e, f: w.frame - 1 });
  return out;
}
const of = (/** @type {any[]} */ ev, /** @type {string} */ type) => ev.filter((e) => e.type === type).map((e) => e.f);
const guardAt = (/** @type {number} */ col) => ({ type: 'deploy', op: 'guard', row: 1, col, dir: 0 });

test('[攻击-2] the wind-up: the OnAttack frame; sped up with the clip when the interval is shorter; none without timing', () => {
  const t = { duration: 1, hit: 0.4 };
  assert.equal(windupFrames(t, 30), 12, '0.4 s, the interval as long as the clip');
  assert.equal(windupFrames(t, 45), 12, 'a longer interval: the clip at its speed');
  assert.equal(windupFrames(t, 20), 8, '12 × 20 / 30');
  assert.equal(windupFrames({ duration: 1, hit: 0.5 }, 21), 11, '15 × 21 / 30 = 10.5, halves up');
  assert.equal(windupFrames({ duration: 0.5, hit: 2 }, 30), 15, 'at most the clip');
  assert.equal(windupFrames(null, 30), 0);
  assert.equal(windupFrames({ duration: 1.1666666269302368, hit: 0.46666666865348816 }, 36), 14, 'float32 times from the clip: 35 and 14 frames');
});

test('[攻击-2] an operator: the attack starts at cooldown 0, lands at the OnAttack frame, the next starts an interval after the first', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.guard.attack = { duration: 1, hit: 0.4 }; });
  run(w, c, 1, [guardAt(1)]);
  foe(1, 2);
  const ev = run(w, c, 70);
  assert.deepEqual(of(ev, 'attack'), [1, 31, 61], 'interval 1 s from each start');
  assert.deepEqual(of(ev, 'hit'), [13, 43], '0.4 s = 12 frames after each start');
});

test('[攻击-2] targets are locked at the start: one that leaves the range is still hit; one that falls is not', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.guard.attack = { duration: 1, hit: 0.5 }; cc.operators.guard.range = [{ row: 0, col: 1 }]; });
  run(w, c, 1, [guardAt(1)]);
  const e = foe(1, 2);
  run(w, c, 2);
  assert.ok(w.units[0].swing, 'swinging at it');
  e.x = 4.5;
  let ev = run(w, c, 14);
  assert.deepEqual(ev.filter((x) => x.type === 'hit').map((x) => x.target), [e.id], 'out of range, still hit');
  e.x = 2;
  run(w, c, 15);
  assert.ok(w.units[0].swing);
  e.hp = 0;
  ev = run(w, c, 15);
  assert.equal(of(ev, 'hit').length, 0, 'it fell: nothing lands');
});

test('[攻击-2] a stun during the wind-up cancels the attack; its cooldown is already running', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.guard.attack = { duration: 1, hit: 0.5 }; });
  run(w, c, 1, [guardAt(1)]);
  foe(1, 2);
  run(w, c, 5);
  applyStatus(w.units[0], 'stun', { frames: 3 });
  const ev = run(w, c, 45);
  assert.deepEqual(of(ev, 'attack'), [33], 'the cooldown from frame 1 paused two frames (6, 7) while stunned');
  assert.deepEqual(of(ev, 'hit'), [48], 'the cut attack never lands; the next one does, 15 frames after it starts');
});

test('[攻击-2] [技能-2] a skill starts with the attack and counts it when it lands; a cut attack gives no SP', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.attack = { duration: 1, hit: 0.5 };
    cc.operators.guard.skill = { id: 's', type: 'AUTO', sp: 'attack', cost: 9, init: 0, charges: 1, duration: 5, ammo: false, bb: {} };
  });
  run(w, c, 1, [guardAt(1)]);
  foe(1, 2);
  run(w, c, 10);
  assert.equal(w.units[0].skill?.sp, 0, 'not landed yet');
  run(w, c, 6);
  assert.equal(w.units[0].skill?.sp, 1);
  run(w, c, 20);
  applyStatus(w.units[0], 'stun', { frames: 2 });
  run(w, c, 16);
  assert.equal(w.units[0].skill?.sp, 1, 'the second was cut');
});

test('[攻击-3] a ranged attack launches a projectile at the OnAttack frame; it homes on the target and hits on arrival', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.sniper.attack = { duration: 1, hit: 0.2 }; });
  run(w, c, 1, [{ type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }]);
  const e = foe(1, 3);
  const ev = run(w, c, 15);
  assert.deepEqual(of(ev, 'shot'), [7], '0.2 s after the start in frame 1');
  assert.deepEqual(of(ev, 'hit'), [10], `√2 tiles at ${SHOT_SPEED.operator} tiles/s`);
  assert.equal(e.hp, e.maxHp - 30);
});

test('[攻击-3] a projectile vanishes with its target; one whose shooter left hits without a source', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.sniper.attack = { duration: 1, hit: 0.2 }; });
  run(w, c, 1, [{ type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }]);
  const e = foe(1, 3);
  run(w, c, 7);
  assert.equal(w.shots.length, 1);
  e.hp = 0;
  run(w, c, 1);
  assert.equal(w.shots.length, 0, 'its target fell');
  const f = foe(1, 3);
  for (let i = 0; i < 60 && w.shots.length === 0; i++) run(w, c, 1);
  assert.equal(w.shots.length, 1, 'the next attack: interval 1.5 s from the first');
  const sn = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.OPERATOR));
  run(w, c, 1, [{ type: 'retreat', unit: sn.id }]);
  const ev = run(w, c, 5);
  assert.deepEqual(ev.filter((x) => x.type === 'hit').map((x) => [x.id, x.target]), [[-1, f.id]], 'no source once its shooter left');
});

test('[攻击-2] [状态-8] an enemy’s long wind-up: 麻痹 cuts it 2 s in; a ranged enemy stands while it swings', () => {
  const { w, c } = arena((cc) => {
    Object.assign(cc.enemies.slime, { atk: 100, baseAttackTime: 5, attack: { duration: 3, hit: 2.5 }, applyWay: 'RANGED', rangeRadius: 3, moveSpeed: 1 });
  });
  run(w, c, 1, [guardAt(4)]);
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = 1; e.y = 1;
  w.units.push(e);
  run(w, c, 1);
  assert.ok(e.swing, 'the guard 3 tiles away is in its reach (3 + 0.25): it begins to swing');
  const x = e.x, y = e.y;
  run(w, c, 10);
  assert.deepEqual([e.x, e.y], [x, y], 'standing through the wind-up');
  applyStatus(e, 'palsy');
  const since = /** @type {any} */ (e.swing).since;
  const ev = run(w, c, PALSY_CUT_FRAMES - since + 1);
  assert.equal(e.swing, null, 'cut 2 s in');
  assert.equal(of(ev, 'hit').length, 0);
  assert.equal(e.buffs.some((b) => b.key === 'palsy'), false);
});

test('[攻击-2] [攻击-3] [同步-1] a snapshot in a swing and with a projectile in flight restores to the same hash and runs on the same', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.sniper.attack = { duration: 1, hit: 0.2 }; cc.operators.guard.attack = { duration: 1, hit: 0.5 }; });
  run(w, c, 1, [{ type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }]);
  run(w, c, 1, [guardAt(2)]);
  foe(1, 3);
  run(w, c, 8);
  assert.ok(w.shots.length > 0 || w.units.some((u) => u.swing));
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  assert.equal(stateHash(copy), stateHash(w));
  run(w, c, 60);
  run(copy, c, 60);
  assert.equal(stateHash(copy), stateHash(w));
});
