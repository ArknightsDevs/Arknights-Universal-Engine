// Official constants (docs/spec/constants.md): the values of the sources, equal to the pinned Stronghold oracle's.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadOracle } from '@aue/testkit';
import { constants as K } from '../src/index.js';

/** @type {any} */
let sh;
before(async () => { sh = await loadOracle('server/sim/constants.js'); });

test('[常量-1] the minimum damage ratio is 5 %', () => {
  assert.equal(K.MIN_DAMAGE_RATIO, 0.05);
  assert.equal(K.MIN_DAMAGE_RATIO, sh.MIN_DAMAGE_RATIO);
});

test('[常量-2] an allied unit\'s collider radius is 0.25 tiles', () => {
  assert.equal(K.ALLY_COLLIDER_RADIUS, 0.25);
  assert.equal(K.ALLY_COLLIDER_RADIUS, sh.ALLY_COLLIDER_RADIUS);
});

test('[常量-3] block radii, and their squares as the official client compares them', () => {
  assert.deepEqual(K.BLOCK_RADIUS, { ground: 0.70709997, fly: 0.8944 });
  assert.deepEqual(K.BLOCK_RADIUS_SQ, { ground: 0.49999037, fly: 0.79995137 });
  for (const k of ['ground', 'fly']) {
    assert.equal(K.BLOCK_RADIUS[/** @type {'ground'} */ (k)], sh.BLOCK_RADIUS[k]);
    assert.equal(K.BLOCK_RADIUS_SQ[/** @type {'ground'} */ (k)], sh.BLOCK_RADIUS_SQ[k]);
    // the official squares are the float32 squares, not the float64 ones
    assert.equal(Math.fround(K.BLOCK_RADIUS_SQ[/** @type {'ground'} */ (k)]), Math.fround(Math.fround(K.BLOCK_RADIUS[/** @type {'ground'} */ (k)]) ** 2));
  }
});

test('[常量-4] the attack speed attribute stays within 20 and 600', () => {
  assert.deepEqual([K.ASPD_MIN, K.ASPD_MAX], [20, 600]);
  assert.deepEqual([K.ASPD_MIN, K.ASPD_MAX], [sh.ASPD_MIN, sh.ASPD_MAX]);
});

test('[常量-5] the default move multiplier is 0.5; a frame is 1/30 s', () => {
  assert.equal(K.MOVE_SCALE, 0.5);
  assert.equal(K.MOVE_SCALE, sh.MOVE_SCALE);
  assert.equal(K.TICK, 1 / 30);
  assert.equal(K.TICK, sh.TICK);
});
