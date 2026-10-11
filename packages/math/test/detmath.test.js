// Deterministic math (docs/spec/numbers.md 数值-2…5): bit for bit what the pinned Stronghold oracle computes, on random
// doubles of the whole range and on the special values ECMA-262 fixes.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadOracle } from '@aue/testkit';
import { hypot, powi, sin, cos, atan2 } from '../src/index.js';

const SEED = 20261011;
/** @type {any} */
let sh;
before(async () => { sh = await loadOracle('server/sim/detmath.js'); });

/** Same bits (−0 ≠ 0, NaN = NaN). @param {number} a @param {number} b */
const same = (a, b) => Object.is(a, b);
const anyDouble = fc.double();
const angle = fc.oneof(fc.double({ min: -7, max: 7, noNaN: true }), fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  fc.tuple(fc.integer({ min: -2000, max: 2000 }), fc.double({ min: -1e-6, max: 1e-6, noNaN: true })).map(([k, e]) => (k * Math.PI) / 2 + e));
const SPECIAL = [0, -0, 1, -1, Infinity, -Infinity, NaN, 5e-324, -5e-324, Number.MAX_VALUE, -Number.MAX_VALUE, 2 ** -1022, Math.PI, -Math.PI];

test('[数值-2] hypot: the oracle\'s bits on any pair; the special values of Math.hypot', () => {
  fc.assert(fc.property(anyDouble, anyDouble, (x, y) => same(hypot(x, y), sh.hypot(x, y))), { seed: SEED, numRuns: 20000 });
  for (const x of SPECIAL) for (const y of SPECIAL) assert.ok(same(hypot(x, y), sh.hypot(x, y)), `${x}, ${y}`);
  assert.equal(hypot(Infinity, NaN), Infinity);
  assert.equal(hypot(NaN, -Infinity), Infinity);
  assert.ok(Number.isNaN(hypot(NaN, 1)));
  assert.equal(hypot(3, 4), 5);
  assert.equal(hypot(1e300, 1e300), 1e300 * Math.SQRT2);
  assert.ok(same(hypot(-0, -0), 0));
});

test('[数值-3] powi: the oracle\'s bits for integer exponents on its domain; outside it, refused', () => {
  // −0 with an odd exponent is a registered difference (DIF-0002): the oracle loses the sign there
  const base = fc.double({ min: -(2 ** 500), max: 2 ** 500, noNaN: true }).filter((x) => !Object.is(x, -0));
  fc.assert(fc.property(base, fc.integer({ min: -80, max: 80 }), (x, n) => same(powi(x, n), sh.powi(x, n))), { seed: SEED, numRuns: 20000 });
  fc.assert(fc.property(fc.double({ min: 0.5, max: 2, noNaN: true }), fc.integer({ min: -1100, max: 1100 }), (x, n) => same(powi(x, n), sh.powi(x, n))), { seed: SEED, numRuns: 5000 });
  assert.equal(powi(2, 10), 1024);
  assert.equal(powi(1.5, 2), 2.25);
  assert.equal(powi(7, 0), 1);
  for (const n of [-3, -2, -1, 0, 1, 2, 3]) for (const z of [0, -0]) assert.ok(same(powi(z, n), Math.pow(z, n)), `${Object.is(z, -0) ? '-0' : 0} ** ${n}`);
  assert.equal(powi(10, -3), 0.001);
  for (const [x, n] of [[2, 0.5], [Infinity, 2], [NaN, 2], [2 ** 501, 2], [2, 2 ** 32]]) assert.throws(() => powi(x, n), RangeError, `${x} ** ${n}`);
});

test('[数值-4] sin and cos: the oracle\'s bits on any double and on hard angles; signed zero, NaN, ∞', () => {
  fc.assert(fc.property(fc.oneof(anyDouble, angle), (x) => same(sin(x), sh.sin(x)) && same(cos(x), sh.cos(x))), { seed: SEED, numRuns: 40000 });
  for (const x of SPECIAL) assert.ok(same(sin(x), sh.sin(x)) && same(cos(x), sh.cos(x)), String(x));
  assert.ok(same(sin(-0), -0) && same(sin(0), 0) && cos(-0) === 1);
  for (const x of [NaN, Infinity, -Infinity]) assert.ok(Number.isNaN(sin(x)) && Number.isNaN(cos(x)));
  fc.assert(fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true }), (x) => Math.abs(sin(x) * sin(x) + cos(x) * cos(x) - 1) < 1e-15), { seed: SEED, numRuns: 5000 });
});

test('[数值-5] atan2: the oracle\'s bits on any pair; ECMA-262\'s special values; the range [−π, π]', () => {
  fc.assert(fc.property(anyDouble, anyDouble, (y, x) => same(atan2(y, x), sh.atan2(y, x))), { seed: SEED, numRuns: 40000 });
  for (const y of SPECIAL) for (const x of SPECIAL) assert.ok(same(atan2(y, x), sh.atan2(y, x)), `${y}, ${x}`);
  // ECMA-262 fixes these exactly, so Math.atan2 of any conforming engine is a reference for them
  const exact = [[0, 0], [-0, 0], [0, -0], [-0, -0], [1, 0], [1, -0], [-1, 0], [0, 1], [0, -1], [-0, -1], [Infinity, Infinity],
    [Infinity, -Infinity], [-Infinity, Infinity], [-Infinity, -Infinity], [1, Infinity], [1, -Infinity], [-1, -Infinity], [Infinity, 3], [-Infinity, 3]];
  for (const [y, x] of exact) assert.ok(same(atan2(y, x), Math.atan2(y, x)), `${y}, ${x}`);
  fc.assert(fc.property(fc.double({ noNaN: true }), fc.double({ noNaN: true }), (y, x) => { const a = atan2(y, x); return a >= -Math.PI && a <= Math.PI; }), { seed: SEED, numRuns: 5000 });
});
