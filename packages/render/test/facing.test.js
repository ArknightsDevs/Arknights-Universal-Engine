/**
 * The facing rule (render/facing.js, 渲染-4): a model turns to the side its target is on, keeps its left / right while the
 * target is almost straight above or below, and judges nothing at all when the target is too close.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DIR } from '@aue/schema';
import { operatorFacing } from '../src/roles.js';
import { facingDir, facingFor, flipOf, FACING_CLOSE, FACING_DEAD_ZONE } from '../src/facing.js';
import { FACE_OVERRIDES, faceTurns } from '../src/faceModes.js';

test('the thresholds are ours, registered as INF-0272 (渲染-4)', () => {
  assert.equal(FACING_CLOSE, 0.25);
  assert.equal(FACING_DEAD_ZONE, 0.2);
});

test('a target to a side faces that side (渲染-4)', () => {
  assert.deepEqual(facingDir(3, 0), { dir: DIR.RIGHT, flip: false });
  assert.deepEqual(facingDir(-3, 0), { dir: DIR.LEFT, flip: true });
  assert.deepEqual(facingDir(3, 1), { dir: DIR.RIGHT, flip: false });
});

test('only a target inside the narrow band around straight up takes the back model (渲染-4)', () => {
  assert.deepEqual(facingDir(0, 3), { dir: DIR.UP, flip: false });
  assert.deepEqual(facingDir(0, -3), { dir: DIR.DOWN, flip: false }, 'straight below is the front model');
  assert.equal(facingDir(1, 3)?.dir, DIR.RIGHT, '1 up 3 aside is 18 degrees off: not the band');
  assert.equal(facingDir(0.1, 1)?.dir, DIR.UP, '5.7 degrees off: the band');
});

test('almost straight above or below keeps the left / right the model had (渲染-4)', () => {
  // 0.1 / sqrt(1 + 0.01) = 0.0995 of the distance, inside the dead zone
  assert.equal(facingDir(0.1, 1, true)?.flip, true);
  assert.equal(facingDir(0.1, 1, false)?.flip, false);
  // 0.3 / sqrt(1.09) = 0.287 is clearly to one side, so it takes that side
  assert.equal(facingDir(0.3, 1, true)?.flip, false);
  assert.equal(facingDir(-0.3, 1, false)?.flip, true);
});

test('a target too close judges no direction (渲染-4)', () => {
  assert.equal(facingDir(0, 0), null);
  assert.equal(facingDir(0.1, 0.2), null);
  assert.equal(facingDir(0.15, 0.15), null);
  assert.equal(facingDir(0, 0.25)?.dir, DIR.UP, 'just outside it: a direction again');
});

test('operatorFacing: the back has two orientations (渲染-4)', () => {
  const m = { back: true, backDies: true, dying: false };
  assert.deepEqual(operatorFacing(DIR.UP, m), { side: 'back', flip: false }, 'a deploy direction alone faces right');
  assert.deepEqual(operatorFacing(DIR.UP, m, true), { side: 'back', flip: true }, 'a turn can make the back face left');
  assert.deepEqual(operatorFacing(DIR.LEFT, m), { side: 'front', flip: true });
  assert.deepEqual(operatorFacing(DIR.DOWN, m), { side: 'front', flip: false });
});

test('the per-operator table starts empty and turns by default (渲染-4)', () => {
  assert.equal(typeof FACE_OVERRIDES, 'object');
  assert.equal(faceTurns('char_496_wildmn', false), true, '野鬃 turns outside its skill');
  assert.equal(faceTurns('char_496_wildmn', true), false, 'and does not while the skill runs');
  assert.equal(faceTurns('char_002_amiya', false), true);
  assert.deepEqual(facingFor('char_002_amiya', false, 3, 0), { dir: DIR.RIGHT, flip: false });
});

test('a recorded override turns the rule off for that operator (渲染-4)', () => {
  FACE_OVERRIDES['char_test_none'] = { turn: false, basis: '占位：实际条目必须附录像链接与时间点' };
  try {
    assert.equal(faceTurns('char_test_none'), false);
    assert.equal(facingFor('char_test_none', false, 3, 0), null);
  } finally {
    delete FACE_OVERRIDES['char_test_none'];
  }
});

test('flipOf is the deploy direction alone (渲染-4)', () => {
  assert.equal(flipOf(DIR.LEFT), true);
  for (const d of [DIR.RIGHT, DIR.UP, DIR.DOWN]) assert.equal(flipOf(d), false);
});
