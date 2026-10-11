// Directions (docs/spec/direction.md): every function equals the pinned Stronghold oracle on every direction, on junk
// inputs and on a grid of offsets — exhaustively, −0 included.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadOracle } from '@aue/testkit';
import { DIR } from '@aue/schema';
import { dir } from '../src/index.js';

/** @type {any} */
let sh;
before(async () => { sh = await loadOracle('server/sim/dir.js'); });

const INPUTS = [...dir.DIRS, 'up', ' Left ', 'down ', 'Right', 1, -1, 2.5, -0.1, 0, -0, NaN, Infinity, -Infinity, null, undefined, 'x', '', {}, [], true];
const OFFS = /** @type {[number, number][]} */ ([]);
for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) OFFS.push([a, b]);
OFFS.push([-0, 0], [0, -0], [-0, -0], [0.5, -2.5]);

test('[方向-1] the four directions, their vectors, names from junk, mirror, opposite, perpendicular, flip sign', () => {
  assert.deepEqual(dir.DIRS, sh.DIRS);
  assert.equal(dir.DEFAULT_DIR, sh.DEFAULT_DIR);
  assert.deepEqual(dir.DIR_VEC, sh.DIR_VEC);
  for (const d of INPUTS) {
    assert.equal(dir.isDir(d), sh.isDir(d), String(d));
    for (const f of [undefined, 'UP', 'nope', -1]) assert.equal(dir.normDir(d, f), sh.normDir(d, f), `${String(d)} / ${f}`);
    assert.deepEqual(dir.dirVec(d), sh.dirVec(d));
    assert.equal(dir.hSign(d), sh.hSign(d));
    assert.equal(dir.mirrorDir(d), sh.mirrorDir(d));
    assert.equal(dir.oppositeDir(d), sh.oppositeDir(d));
    for (const e of INPUTS) assert.equal(dir.perpendicular(d, e), sh.perpendicular(d, e));
  }
});

test('[方向-1] the protocol codes map to the names and back', () => {
  for (const d of dir.DIRS) assert.equal(dir.dirOfCode(dir.codeOfDir(d)), d);
  assert.equal(dir.codeOfDir('UP'), DIR.UP);
  assert.equal(dir.dirOfCode(9), 'RIGHT');
});

test('[方向-2] offsets turn with the facing; toLocal undoes it; offsetTile and frontOf', () => {
  for (const d of INPUTS) {
    for (const [a, b] of OFFS) {
      assert.deepStrictEqual(dir.rotateOffset(a, b, d), sh.rotateOffset(a, b, d), `rotate ${a},${b} ${String(d)}`);
      assert.deepStrictEqual(dir.toLocal(a, b, d), sh.toLocal(a, b, d), `local ${a},${b} ${String(d)}`);
      assert.deepStrictEqual(dir.offsetTile(3, 5, a, b, d), sh.offsetTile(3, 5, a, b, d));
      const [x, y] = dir.rotateOffset(a, b, d);
      assert.deepEqual(dir.toLocal(x, y, d).map((v) => v + 0), [a + 0, b + 0]);
    }
    for (const k of [-2, -1, 0, 1, 2, undefined]) assert.deepStrictEqual(dir.frontOf(3, 5, d, k), sh.frontOf(3, 5, d, k));
  }
});

test('[方向-3] the direction of a delta: the dominant axis, ties horizontal, zero gives the fallback', () => {
  const vals = [-3, -2, -1, -0, 0, 1, 2, 3, 0.5, NaN, '2', null, undefined];
  for (const r of vals) for (const c of vals) for (const f of [undefined, 'DOWN', 'junk']) {
    assert.equal(dir.dirFromDelta(r, c, f), sh.dirFromDelta(r, c, f), `${String(r)},${String(c)} ${f}`);
  }
});

test('[方向-4] tie-break order: deltas in the unit\'s facing-RIGHT frame, compared lexicographically', () => {
  for (const d of dir.DIRS) for (const [a, b] of OFFS) assert.deepStrictEqual(dir.localOrder(a, b, d), sh.localOrder(a, b, d));
  for (const [a, b] of OFFS) for (const [c, e] of OFFS) assert.equal(dir.localBefore([a, b], [c, e]), sh.localBefore([a, b], [c, e]));
  assert.equal(dir.localBefore([1, 2], null), true);
});
