/**
 * The facing state machine (render/facing.js, 渲染-4): a re-acquired target decides the side from the 45° rule, the same
 * target only switches it inside the narrow band, and the per-operator table can hold an operator out of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DIR } from '@aue/schema';
import { operatorFacing } from '../src/roles.js';
import { facingStep, sideOf, flipOf, FACING_CLOSE, FACING_DEAD_ZONE } from '../src/facing.js';
import { FACE_OVERRIDES } from '../src/faceModes.js';

const front = { side: /** @type {const} */ ('front'), flip: false };
const back = { side: /** @type {const} */ ('back'), flip: false };

test('the two thresholds are ours, registered as INF-0272 (渲染-4)', () => {
  assert.equal(FACING_CLOSE, 0.25);
  assert.equal(FACING_DEAD_ZONE, 0.2);
});

test('a new target above 45° is the back model, anything else the front (渲染-4)', () => {
  assert.deepEqual(facingStep(front, 1, 3, true), { side: 'back', flip: false }, '1 aside 3 up is steeper than 45°');
  assert.deepEqual(facingStep(front, 3, 1, true), { side: 'front', flip: false }, '1 up 3 aside is shallower');
  assert.deepEqual(facingStep(back, 3, -1, true), { side: 'front', flip: false }, 'below is the front model');
  assert.deepEqual(facingStep(front, 0, -3, true), { side: 'front', flip: false }, 'straight below too');
});

test('a new target mirrors by the side it is on, however small (渲染-4)', () => {
  assert.deepEqual(facingStep(front, -0.01, 5, true), { side: 'back', flip: true });
  assert.deepEqual(facingStep(back, 0.01, 5, true), { side: 'back', flip: false });
});

test('the same target keeps its side outside the band and only mirrors (渲染-4)', () => {
  assert.deepEqual(facingStep(back, 2, 1, false), { side: 'back', flip: false }, 'shallow above keeps the back');
  assert.deepEqual(facingStep(front, 1, 3, false), { side: 'front', flip: false }, 'steep above keeps the front');
  assert.deepEqual(facingStep(front, -2, 1, false), { side: 'front', flip: true });
});

test('the same target switches only inside the narrow band, and keeps its mirror there (渲染-4)', () => {
  assert.deepEqual(facingStep(front, 0.1, 1, false), { side: 'back', flip: false }, 'straight above: to the back');
  assert.deepEqual(facingStep(back, 0.1, 1, false), { side: 'back', flip: false }, 'already back: stays back');
  assert.deepEqual(facingStep(back, 0.1, -1, false), { side: 'front', flip: false }, 'straight below: back to front');
  assert.deepEqual(facingStep(front, -0.1, 1, false), { side: 'back', flip: false }, 'the mirror is left alone in the band');
});

test('a target too close judges nothing (渲染-4)', () => {
  assert.deepEqual(facingStep(back, 0, 0, true), back);
  assert.deepEqual(facingStep(front, 0.1, 0.2, true), front);
  assert.equal(facingStep(front, 0, 0.25, true).side, 'back', 'just outside it: a side again');
});

test('operatorFacing: the back only when the model has one (渲染-4)', () => {
  const m = { back: true, backDies: true, dying: false };
  assert.deepEqual(operatorFacing({ side: 'back', flip: false }, m), { side: 'back', flip: false });
  assert.deepEqual(operatorFacing({ side: 'back', flip: true }, m), { side: 'back', flip: true });
  assert.deepEqual(operatorFacing({ side: 'back', flip: false }, { back: false, backDies: false, dying: false }), { side: 'front', flip: false });
  assert.deepEqual(operatorFacing({ side: 'front', flip: true }, m), { side: 'front', flip: true });
});

test('sideOf and flipOf are the deploy direction alone (渲染-4)', () => {
  assert.equal(sideOf(DIR.UP), 'back');
  for (const d of [DIR.RIGHT, DIR.LEFT, DIR.DOWN]) assert.equal(sideOf(d), 'front');
  assert.equal(flipOf(DIR.LEFT), true);
});

test('the per-operator table holds 野鬃 out only while its skill runs (渲染-4)', () => {
  assert.equal(typeof FACE_OVERRIDES, 'object');
  assert.equal(FACE_OVERRIDES.char_496_wildmn.when, 'skill');
});
