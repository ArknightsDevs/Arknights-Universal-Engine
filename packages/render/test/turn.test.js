/**
 * The turn transition (render/figure.js, 渲染-4): the model squeezes edge-on, and the skeleton swaps on the narrowest frame.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { poseFigure, TURN_FRAMES } from '../src/figure.js';

/** A figure stub good enough for poseFigure: two sides, a role set, one clip and a group. */
function stub() {
  /** @type {any[]} */
  const shown = [];
  /** @returns {any} */
  const side = () => ({
    object: { visible: true },
    duration: () => 1,
    show(/** @type {string} */ name, /** @type {number} */ time, /** @type {boolean} */ loop, /** @type {boolean} */ flip) {
      shown.push({ name, time, loop, flip });
    },
  });
  /** @type {any} */
  const scale = { x: 1, y: 1, z: 1, set(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) { scale.x = x; scale.y = y; scale.z = z; } };
  /** @type {any} */
  const group = { quaternion: { copy() {} }, scale };
  /** @type {any} */
  const f = {
    group,
    sides: { front: side(), back: side() },
    roles: { front: { idle: 'Idle', attack: 'Attack', die: null, start: null }, back: { idle: 'Idle', attack: 'Attack', die: null, start: null } },
    forms: {}, dolls: {}, form: 0, side: 'front', flip: false, role: 'idle', clip: '', since: 0, rate: 1,
    view: 'idle', x: 0, dying: false, aim: null, sign: 3, turn: null,
  };
  return { f, shown };
}

/** @type {any} */
const camera = { quaternion: { copy() {} } };

test('a settled figure is drawn at full width (渲染-4)', () => {
  const { f } = stub();
  poseFigure(f, 0, camera);
  assert.equal(f.group.scale.x, 1);
  assert.equal(f.group.scale.y, 1);
});

test('a turn squeezes to zero on its middle frame and swaps the skeleton there (渲染-4)', () => {
  const { f, shown } = stub();
  f.turn = { since: 0, side: 'front', flip: false };
  f.side = 'back'; f.flip = true;
  /** @type {number[]} */ const widths = [];
  /** @type {string[]} */ const sides = [];
  for (let frame = 0; frame <= TURN_FRAMES; frame++) {
    poseFigure(f, frame, camera);
    widths.push(Number(f.group.scale.x.toFixed(3)));
    sides.push(Object.entries(f.sides).filter(([, s]) => /** @type {any} */ (s).object.visible).map(([k]) => k).join(','));
  }
  assert.equal(widths[0], 1, 'starts at full width');
  assert.equal(Math.min(...widths), 0, 'edge-on on the middle frame');
  assert.equal(widths[widths.length - 1], 1, 'and ends at full width');
  assert.deepEqual(sides.slice(0, 2), ['front', 'front'], 'the old side shows first');
  assert.deepEqual(sides.slice(2), ['back', 'back', 'back'], 'the new one from the middle frame on');
  assert.equal(f.turn, null, 'the turn is over');
  assert.ok(shown.length > 0, 'the clip was asked for');
});

test('the height swells opposite the width (渲染-4)', () => {
  const { f } = stub();
  f.turn = { since: 0, side: 'front', flip: false };
  f.side = 'back'; f.flip = true;
  /** @type {number[]} */ const heights = [];
  for (let frame = 0; frame <= TURN_FRAMES; frame++) { poseFigure(f, frame, camera); heights.push(Number(f.group.scale.y.toFixed(3))); }
  assert.ok(Math.max(...heights) > 1.8, 'the narrowest frame is the tallest');
  assert.equal(heights[heights.length - 1], 1, 'and it settles back to 1');
});
