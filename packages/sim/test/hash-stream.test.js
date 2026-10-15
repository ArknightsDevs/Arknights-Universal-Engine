import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { HASH_START, hashNumbers, hashValue } from '../src/hash.js';
import { pushValue, stateHash, createWorld, step } from '../src/world.js';
import { tinyContent } from '@aue/testkit';

/** The previous encoding, kept as a byte-level reference. @param {unknown} v */
function previous(v) {
  const nums = /** @type {number[]} */ ([]); pushValue(nums, v);
  return hashNumbers(HASH_START, nums);
}

test('[同步-1] streaming hashes retain the previous encoding for arbitrary JSON and numeric edge cases', () => {
  fc.assert(fc.property(fc.jsonValue(), (v) => hashValue(HASH_START, v) === previous(v)), { seed: 20261013, numRuns: 500 });
  for (const v of [-0, 0, NaN, Infinity, -Infinity, { a: 1, omit: undefined, b: -0 }, '叙拉古\ud800', [true, false, null]]) {
    assert.equal(hashValue(HASH_START, v), previous(v));
  }
  for (const v of [undefined, () => 0, [undefined]]) assert.throws(() => hashValue(HASH_START, v), /not plain data/);
});

test('[同步-1] every frame of a real battle has the same hash as the previous state encoder', () => {
  const c = tinyContent(), w = createWorld(c, { seed: 7, players: 2 });
  for (let f = 0; f < 400; f++) {
    step(w, c, f === 0 ? [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]] : []);
    assert.equal(stateHash(w), previous({ frame: w.frame, rng: w.rng, nextId: w.nextId, sched: w.sched, predefined: w.predefined,
      result: w.result, stage: w.stage, players: w.players, units: w.units, shots: w.shots, blasts: w.blasts, bolts: w.bolts }));
  }
});
