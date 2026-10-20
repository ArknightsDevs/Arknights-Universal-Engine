// The official four-direction resolution (render/facing.js), and an operator's model turning toward what it attacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DIR } from '@aue/schema';
import { operatorFacing } from '../src/roles.js';
import {
  facingDir, parseDirection, signOf, FACING_ADDON, FACING_TOLERANCE, FACING_TOO_CLOSE, FACING_ZERO,
  FACE_SIGN_LEFT, FACE_SIGN_RIGHT, FACE_DEFAULT_SIGN,
} from '../src/facing.js';

test('the official constants (渲染-4)', () => {
  assert.equal(FACING_TOLERANCE, 0.2);
  assert.equal(FACING_ADDON, 0.25);
  assert.equal(FACING_TOO_CLOSE, 0.25);
  assert.equal(FACING_ZERO, 0.01);
  assert.equal(FACE_SIGN_LEFT, 3);
  assert.equal(FACE_SIGN_RIGHT, 1);
  assert.equal(FACE_DEFAULT_SIGN, FACE_SIGN_LEFT);
});

test('ParseDirection: the argmax and the horizontal-only bias (渲染-4)', () => {
  assert.equal(parseDirection(0, 1, 0), 0, 'up');
  assert.equal(parseDirection(1, 0, 0), 1, 'right');
  assert.equal(parseDirection(0, -1, 0), 2, 'down');
  assert.equal(parseDirection(-1, 0, 0), 3, 'left');
  assert.equal(parseDirection(1, 1, 0), 0, '45 degrees is a tie: the earlier index wins');
  assert.equal(parseDirection(1, 1, FACING_ADDON), 1, 'the bias makes 45 degrees horizontal');
  assert.equal(parseDirection(0, 1, FACING_ADDON), 0, 'the bias never goes to a vertical entry');
});

test('a horizontal parse is adopted outright (渲染-4)', () => {
  assert.deepEqual(facingDir(1, 0, FACE_SIGN_LEFT), { dir: DIR.RIGHT, sign: FACE_SIGN_RIGHT });
  assert.deepEqual(facingDir(-1, 0, FACE_SIGN_RIGHT), { dir: DIR.LEFT, sign: FACE_SIGN_LEFT });
  assert.deepEqual(facingDir(5, 1, FACE_SIGN_LEFT), { dir: DIR.RIGHT, sign: FACE_SIGN_RIGHT });
});

test('a vertical target keeps the sign inside the dead zone and takes it outside (渲染-4)', () => {
  // |x| / |v| <= 0.2 keeps the previous sign: 0.1/sqrt(1.01) = 0.0995
  assert.deepEqual(facingDir(0.1, 1, FACE_SIGN_LEFT), { dir: DIR.UP, sign: FACE_SIGN_LEFT });
  assert.deepEqual(facingDir(0.1, 1, FACE_SIGN_RIGHT), { dir: DIR.UP, sign: FACE_SIGN_RIGHT });
  // 0.21/1.0218 = 0.2055 is outside it
  assert.deepEqual(facingDir(0.21, 1, FACE_SIGN_LEFT), { dir: DIR.UP, sign: FACE_SIGN_RIGHT });
  assert.deepEqual(facingDir(-0.21, 1, FACE_SIGN_RIGHT), { dir: DIR.UP, sign: FACE_SIGN_LEFT });
  // the dead zone boundary itself: 0.2/1.0198 = 0.1961 stays inside
  assert.equal(facingDir(0.2, 1, FACE_SIGN_LEFT).sign, FACE_SIGN_LEFT);
});

test('too close and no offset keep everything (渲染-4)', () => {
  for (const [dx, dy] of [[0, 0], [0.1, 0.2], [0.15, 0.15], [0, 0.2]]) {
    assert.deepEqual(facingDir(dx, dy, FACE_SIGN_LEFT), { dir: null, sign: FACE_SIGN_LEFT });
  }
  assert.equal(facingDir(0, 0.25, FACE_SIGN_LEFT).dir, DIR.UP, 'just outside the too-close circle');
});

test('the axis takes the bias, so a clearly-above target shows the back model (渲染-4)', () => {
  assert.equal(facingDir(0.5, 1, FACE_SIGN_LEFT).dir, DIR.UP, 'inside the bias band');
  assert.equal(facingDir(0.7, 1, FACE_SIGN_LEFT).dir, DIR.RIGHT, 'past it: level again');
  assert.equal(facingDir(0, -1, FACE_SIGN_LEFT).dir, DIR.DOWN);
});

test('operatorFacing: the back has two orientations (渲染-4)', () => {
  const m = { back: true, backDies: true, dying: false };
  assert.deepEqual(operatorFacing(DIR.UP, m), { side: 'back', flip: false }, 'a deploy direction alone faces right');
  assert.deepEqual(operatorFacing(DIR.UP, m, FACE_SIGN_LEFT), { side: 'back', flip: true }, 'a turn can make the back face left');
  assert.deepEqual(operatorFacing(DIR.LEFT, m), { side: 'front', flip: true });
  assert.deepEqual(operatorFacing(DIR.RIGHT, m, FACE_SIGN_LEFT), { side: 'front', flip: true });
  assert.deepEqual(operatorFacing(DIR.DOWN, m), { side: 'front', flip: false });
});

test('signOf is the deploy direction alone (渲染-4)', () => {
  assert.equal(signOf(DIR.LEFT), FACE_SIGN_LEFT);
  for (const d of [DIR.RIGHT, DIR.UP, DIR.DOWN]) assert.equal(signOf(d), FACE_SIGN_RIGHT);
});
