// What a pose draws and how clipping cuts it, on small skeletons built as data (docs/spec/spine.md 骨骼-16, 骨骼-17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPose } from '../src/pose.js';
import { updateOrder } from '../src/order.js';
import { updateWorld } from '../src/world.js';
import { drawList, colorsOf } from '../src/draw.js';
import { triangulate, cutConvex, signedArea } from '../src/clip.js';
import { bone, slot, skeleton, defaultSkin } from './skel.js';

/** A 10 × 10 region attachment centred at x, y (white). @param {string} name @param {number} x @param {number} y */
const square = (name, x, y) => ({ name, type: 'region', path: name, x, y, rotation: 0, scaleX: 1, scaleY: 1, width: 10, height: 10, color: -1 });
/** An atlas of 10 × 10 regions on two pages. */
const ATLAS = {
  pages: [{ name: 'a.png', width: 64, height: 64 }, { name: 'b.png', width: 64, height: 64 }],
  regions: ['r0', 'r1', 'r2', 'other'].map((name, i) => ({ name, page: name === 'other' ? 1 : 0, x: i * 10, y: 0, width: 10, height: 10, degrees: 0, originalWidth: 10, originalHeight: 10, offsetX: 0, offsetY: 0, index: -1 })),
};

/** The batches of a skeleton's setup pose. @param {import('../src/skeleton.js').Skeleton} s @param {boolean} [pma] */
function drawn(s, pma = false) {
  const p = newPose(s), order = updateOrder(s);
  updateWorld(p, s, order);
  return drawList(p, s, ATLAS, { active: order.active, pma });
}

/** The total area of a batch's triangles. @param {import('../src/draw.js').Batch} b */
function area(b) {
  let sum = 0;
  for (let t = 0; t < b.indices.length; t += 3) {
    const v = [b.indices[t], b.indices[t + 1], b.indices[t + 2]].flatMap((i) => [b.positions[i * 2], b.positions[i * 2 + 1]]);
    sum += Math.abs(signedArea(v)) / 2;
  }
  return sum;
}

test('[骨骼-16] slots in draw order, one batch per run of the same page and blend mode', () => {
  const slots = [slot('a', 0, 'r0'), slot('b', 0, 'r1'), { ...slot('c', 0, 'r2'), blend: 1 }, slot('d', 0, 'other'), slot('e', 0, 'none')];
  const s = skeleton({ bones: [bone('root', -1)], slots });
  s.skins = [defaultSkin([['r0', 0], ['r1', 1], ['r2', 2], ['other', 3]].map(([k, i]) => ({ slot: /** @type {number} */ (i), key: /** @type {string} */ (k), attachment: square(/** @type {string} */ (k), 0, 0) })))];
  const b = drawn(s);
  assert.deepEqual(b.map((x) => [x.page, x.blend, x.positions.length / 2, x.indices.length]), [[0, 0, 8, 12], [0, 1, 4, 6], [1, 0, 4, 6]]);
  assert.deepEqual(b[0].indices, [0, 1, 2, 2, 3, 0, 4, 5, 6, 6, 7, 4]);
  assert.deepEqual(b[0].uvs.slice(0, 8), [0, 10 / 64, 0, 0, 10 / 64, 0, 10 / 64, 10 / 64]);
});

test('[骨骼-16] a slot on an inactive bone draws nothing', () => {
  const s = skeleton({ bones: [bone('root', -1), bone('hidden', 0, { skinRequired: true })], slots: [slot('a', 1, 'r0')] });
  s.skins = [defaultSkin([{ slot: 0, key: 'r0', attachment: square('r0', 0, 0) }])];
  assert.deepEqual(drawn(s), []);
});

test('[骨骼-16] light and dark colors, straight or premultiplied', () => {
  const slotColor = { color: [1, 0.5, 1, 0.5], dark: null, attachment: null, deform: {} };
  assert.deepEqual(colorsOf(slotColor, 0xff8080ff, false), { light: [1, 0.5 * (0x80 / 255), 0x80 / 255, 0.5], dark: [0, 0, 0, 1] });
  assert.deepEqual(colorsOf(slotColor, -1, true).light, [0.5, 0.25, 0.5, 0.5]);
  const dark = { ...slotColor, dark: [0.2, 0.4, 0.6, 1] };
  assert.deepEqual(colorsOf(dark, -1, true).dark, [0.1, 0.2, 0.3, 1]);
  assert.deepEqual(colorsOf(dark, -1, false).dark, [0.2, 0.4, 0.6, 0]);
});

test('[骨骼-17] polygons cut into triangles and triangles cut by a convex polygon', () => {
  const l = [0, 0, 20, 0, 20, 10, 10, 10, 10, 20, 0, 20];
  const tris = triangulate(l);
  assert.equal(tris.length, 4);
  assert.equal(tris.reduce((s, t) => s + signedArea(t) / 2, 0), 300);
  assert.ok(tris.every((t) => signedArea(t) > 0));
  const cut = cutConvex([[0, 0, 1, 0, 0], [10, 0, 0, 1, 0], [0, 10, 0, 0, 1]], [0, 0, 5, 0, 5, 5, 0, 5]);
  assert.equal(signedArea(cut.flatMap((q) => [q[0], q[1]])) / 2, 25);
  assert.ok(cut.every((q) => near1(q[2] + q[3] + q[4])));
});

/** @param {number} x */
const near1 = (x) => Math.abs(x - 1) < 1e-12;

/** A clipping square [0, 10]² on slot 0 ending at `end`, then squares centred at (10, 10) on slots 1 and 2. @param {number} end */
function clipped(end) {
  const box = { name: 'clip', type: 'clipping', end, weighted: false, vertices: [0, 0, 10, 0, 10, 10, 0, 10], bones: [], color: 0 };
  const s = skeleton({ bones: [bone('root', -1)], slots: [slot('c', 0, 'clip'), slot('a', 0, 'r0'), slot('b', 0, 'r1')] });
  s.skins = [defaultSkin([{ slot: 0, key: 'clip', attachment: box }, { slot: 1, key: 'r0', attachment: square('r0', 10, 10) }, { slot: 2, key: 'r1', attachment: square('r1', 10, 10) }])];
  return drawn(s);
}

test('[骨骼-17] clipping cuts the slots after it up to its end slot; its own slot as the end clips to the end', () => {
  const [one] = clipped(1);
  assert.equal(area({ ...one, indices: one.indices.slice(0, one.indices.length - 6) }), 25);
  assert.equal(area(one), 125);
  const [all] = clipped(0);
  assert.equal(area(all), 50);
});
