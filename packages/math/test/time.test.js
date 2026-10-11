// Time and decimals (docs/spec/time.md, docs/spec/numbers.md). Test names carry the clause ids they verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { FPS, secondsToFrames, decimalOf } from '../src/index.js';

const SEED = 20261011;

test('[时间-1] the battle runs at 30 frames per second', () => {
  assert.equal(FPS, 30);
});

test('[时间-2] durations from the data become whole frames, halves rounded up', () => {
  const cases = [[0, 0], [0.3, 9], [0.1, 3], [1.2, 36], [1, 30], [0.05, 2], [0.15, 5], [0.01, 0], [0.0166, 0], [0.0167, 1], [2.5, 75], [100, 3000]];
  for (const [s, f] of cases) assert.equal(secondsToFrames(s), f, `${s} s`);
});

test('[时间-2] exact on every decimal with up to 4 fractional digits (integer oracle)', () => {
  // round-half-up(n × 30 / 10^4) for n ≥ 0 is ⌊(n × 30 + 5000) / 10^4⌋, computed here with plain integers
  fc.assert(fc.property(fc.integer({ min: 0, max: 10_000_000 }), (n) => {
    const seconds = Number(`${Math.floor(n / 10_000)}.${String(n % 10_000).padStart(4, '0')}`);
    return secondsToFrames(seconds) === Math.floor((n * 30 + 5000) / 10_000);
  }), { seed: SEED, numRuns: 5000 });
});

test('[时间-2] monotonic and within half a frame of seconds × 30', () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), fc.double({ min: 0, max: 1e6, noNaN: true }), (a, b) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const f = secondsToFrames(lo);
    return f <= secondsToFrames(hi) && Math.abs(f - lo * FPS) <= 0.5 + 1e-6 * Math.max(1, lo * FPS);
  }), { seed: SEED, numRuns: 5000 });
});

test('[时间-2] large and tiny inputs: exponent forms are read exactly', () => {
  assert.equal(secondsToFrames(1e21), 3e22);
  assert.equal(secondsToFrames(1e-7), 0);
  assert.equal(secondsToFrames(5e-324), 0);
});

test('[数值-1] a number reads back as the shortest decimal that names it', () => {
  assert.deepEqual(decimalOf(0.3), { mantissa: 3n, exponent: -1 });
  assert.deepEqual(decimalOf(1200), { mantissa: 1200n, exponent: 0 });
  assert.deepEqual(decimalOf(1.5e-7), { mantissa: 15n, exponent: -8 });
  assert.deepEqual(decimalOf(2e21), { mantissa: 2n, exponent: 21 });
});

test('[数值-1] negative, infinite and NaN inputs are refused', () => {
  for (const x of [-1, -0.5, Infinity, -Infinity, NaN]) assert.throws(() => decimalOf(x), RangeError, String(x));
  assert.throws(() => secondsToFrames(-0.1), RangeError);
});
