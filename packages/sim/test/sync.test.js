// Determinism, snapshots and the render state (docs/spec/battle.md): same seed and commands → same hashes; a snapshot
// restored at any frame runs on bit for bit; the random sequence is pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { readView, KIND, eventProblems } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot, toView, nextUint32, seedState, hashNumbers, HASH_START, status } from '../src/index.js';
import { pushValue } from '../src/world.js';
import { tinyContent } from '@aue/testkit';

const c = tinyContent(), SEED = 20261011;
/** @typedef {[number, number, import('@aue/schema').Command]} Timed frame, seat, command */

/** @param {Timed[]} script @param {number} frames @param {number} [snapAt] restore from a snapshot taken there */
function hashes(script, frames, snapAt = -1) {
  let w = createWorld(c, { seed: 7, players: 2 });
  const out = [];
  for (let f = 0; f < frames; f++) {
    if (f === snapAt) w = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
    step(w, c, script.filter(([at]) => at === f).map(([, seat, cmd]) => [seat, cmd]));
    out.push(stateHash(w));
  }
  return out;
}

const command = fc.oneof(
  fc.record({ type: fc.constant('deploy'), op: fc.constantFrom('guard', 'sniper'), row: fc.integer({ min: 0, max: 2 }), col: fc.integer({ min: 0, max: 5 }), dir: fc.integer({ min: 0, max: 3 }) }),
  fc.record({ type: fc.constant('retreat'), unit: fc.integer({ min: 1, max: 4 }) }),
);
const script = fc.array(fc.tuple(fc.integer({ min: 0, max: 199 }), fc.integer({ min: 0, max: 1 }), command), { maxLength: 8 });

test('[随机-1] mulberry32: the sequence equals the published reference implementation', () => {
  // the reference (Tommy Ettinger's mulberry32, as commonly published), returning uint32 instead of a float
  /** @param {number} a */
  const reference = (a) => () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  for (const seed of [0, 1, 7, 0xdeadbeef, -1, 2 ** 31]) {
    const ref = reference(seed);
    let s = seedState(seed);
    for (let i = 0; i < 100; i++) { const [v, next] = nextUint32(s); assert.equal(v, ref(), `seed ${seed} draw ${i}`); s = next; }
  }
  assert.equal(seedState(-1), 0xffffffff);
});

test('[同步-1] the same seed and commands give the same hashes; another command gives others', () => {
  /** @type {Timed[]} */
  const a = [[3, 0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]];
  assert.deepEqual(hashes(a, 120), hashes(a, 120));
  /** @type {Timed[]} */
  const b = [[3, 0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]];
  assert.notDeepEqual(hashes(a, 120).at(-1), hashes(b, 120).at(-1));
});

test('[同步-1] [同步-2] any commands: a snapshot restored at any frame runs on bit for bit', () => {
  fc.assert(fc.property(script, fc.integer({ min: 0, max: 199 }), (s, at) => {
    const whole = hashes(s, 200), resumed = hashes(s, 200, at);
    return whole.every((h, i) => h === resumed[i]);
  }), { seed: SEED, numRuns: 60 });
});

test('[同步-2] malformed snapshots are refused', () => {
  const w = createWorld(c, { seed: 1, players: 1 }), snap = takeSnapshot(w);
  assert.throws(() => restoreSnapshot({ ...snap, v: 9 }), /version/);
  assert.throws(() => restoreSnapshot({ ...snap, frame: 5 }), /envelope's frame/);
  assert.throws(() => restoreSnapshot(null), /not an object/);
});

test('[帧-1] commands of a frame act in that frame: a deploy at frame 0 is on the field after the first step', () => {
  const w = createWorld(c, { seed: 1, players: 1 });
  const ev = step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  assert.equal(ev[0].type, 'deploy');
  assert.equal(w.frame, 1);
  const view = readView(toView(w));
  assert.equal(view.frame, 1);
  assert.deepEqual(view.players, [{ life: 3, cost: 5 }]);
  assert.equal(view.units[0].kind, KIND.OPERATOR);
  assert.deepEqual([view.units[0].x, view.units[0].y, view.units[0].z], [1, 1, 0]);
});

test('[帧-1] every presentation event the simulation emits is well formed (schema events v1)', () => {
  const w = createWorld(c, { seed: 3, players: 2 }), problems = [];
  for (let f = 0; f < 300; f++) {
    /** @type {[number, import('@aue/schema').Command][]} */
    const cmds = f === 0 ? [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }], [1, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 1 }]] : f === 250 ? [[0, { type: 'retreat', unit: 1 }]] : [];
    for (const e of step(w, c, cmds)) problems.push(...eventProblems(e));
  }
  assert.deepEqual(problems, []);
});

test('[同步-1] the hash sees IEEE-754 bits: −0 differs from 0, every NaN is one value', () => {
  const h = (/** @type {number[]} */ xs) => hashNumbers(HASH_START, xs);
  assert.notEqual(h([0]), h([-0]));
  assert.equal(h([NaN]), h([0 / 0]));
  assert.equal(h([NaN]), h([Number.NaN * -1]));
  assert.equal(h([]), 0x811c9dc5);
  assert.equal(h([1, 2]), h([1, 2]));
  assert.notEqual(h([1, 2]), h([2, 1]));
});

test('[同步-1] the state hash: tagged plain data, −0 as 0, undefined keys skipped, key order counts', () => {
  /** @param {unknown} v */
  const h = (v) => {
    /** @type {number[]} */
    const out = [];
    pushValue(out, v);
    return hashNumbers(HASH_START, out);
  };
  assert.equal(h({ a: -0 }), h({ a: 0 }));
  assert.equal(h({ a: 1, b: undefined }), h({ a: 1 }));
  assert.notEqual(h({ a: 1, b: 2 }), h({ b: 2, a: 1 }));
  assert.notEqual(h(['1']), h([1]));
  assert.notEqual(h([true]), h([1]));
  assert.notEqual(h([null]), h([]));
  assert.notEqual(h([[1], 2]), h([1, [2]]));
  assert.throws(() => h({ f: () => 0 }), TypeError);
  const w = createWorld(c, { seed: 3, players: 1 });
  for (let f = 0; f < 20; f++) step(w, c);
  const before = stateHash(w);
  status.applyStatus(w.units[0], 'stun', { frames: 30 });
  assert.notEqual(stateHash(w), before, 'buffs are in the hash');
});

test('[同步-2] [状态-3] a snapshot with buffs (fractional time left, no end) restores and runs on bit for bit', () => {
  const run = (/** @type {number} */ snapAt) => {
    let w = createWorld(c, { seed: 5, players: 1 });
    const out = [];
    for (let f = 0; f < 120; f++) {
      if (f === 20) { status.applyStatus(w.units[0], 'buffres', {}); status.applyStatus(w.units[0], 'stun', { frames: 31 }); status.applyStatus(w.units[0], 'sluggish', {}); }
      if (f === snapAt) w = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
      step(w, c);
      out.push(stateHash(w));
    }
    return out;
  };
  const straight = run(-1);
  for (const at of [21, 30, 36]) assert.deepEqual(run(at), straight, `restored at ${at}`);
});

