// Poses on small skeletons built as data: world transforms, curves, animations, the atlas, update order, the three
// kinds of constraints and attachment positions (docs/spec/spine.md 骨骼-7 … 骨骼-15). The same is checked against
// the official runtime on real skeletons in pose.models.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPose, setupPose, updateBones, recoverApplied, TRANSFORM } from '../src/pose.js';
import { curvePercent, frameAt, applyAnimation, drawOrderOf, eventsBetween } from '../src/apply.js';
import { CURVE } from '../src/animation.js';
import { readAtlas, regionOf } from '../src/atlas.js';
import { pageUV, regionUVs, regionCorners, worldVertices, findAttachment, deformKey } from '../src/vertices.js';
import { updateOrder } from '../src/order.js';
import { updateWorld } from '../src/world.js';
import { bone, slot, skeleton, ik, transform, defaultSkin, near } from './skel.js';

/** A pose of a skeleton with its world transforms updated in update order. @param {import('../src/skeleton.js').Skeleton} s */
function posed(s) {
  const p = newPose(s);
  updateWorld(p, s, updateOrder(s));
  return p;
}

/** The world angle of a bone's x axis in degrees. @param {{ a: number, c: number }} b */
const angle = (b) => (Math.atan2(b.c, b.a) * 180) / Math.PI;

test('[骨骼-7] world transforms: parents first, the root by the skeleton position and scale', () => {
  const s = skeleton({ bones: [bone('root', -1, { rotation: 90 }), bone('a', 0, { x: 10 })] });
  const p = newPose(s);
  Object.assign(p, { x: 5, scaleX: 2, scaleY: 2 });
  updateBones(p, s);
  assert.ok(near(p.bones[0].worldX, 5) && near(p.bones[0].worldY, 0));
  assert.ok(near(p.bones[1].worldX, 5) && near(p.bones[1].worldY, 20));
  assert.ok(near(angle(p.bones[1]), 90));
});

test('[骨骼-7] transform modes: only translation, no rotation or reflection, no scale', () => {
  const parent = bone('p', 0, { rotation: 90, scaleX: 2, scaleY: 2 });
  const s = skeleton({ bones: [bone('root', -1), parent, bone('t', 1, { transform: TRANSFORM.ONLY_TRANSLATION }), bone('r', 1, { transform: TRANSFORM.NO_ROTATION_OR_REFLECTION }), bone('s', 1, { transform: TRANSFORM.NO_SCALE })] });
  const p = posed(s), [t, r, sc] = [p.bones[2], p.bones[3], p.bones[4]];
  assert.ok(near(t.a, 1) && near(t.b, 0) && near(t.c, 0) && near(t.d, 1));
  assert.ok(near(r.a, 2) && near(r.b, 0) && near(r.c, 0) && near(r.d, 2));
  assert.ok(near(Math.hypot(sc.a, sc.c), 1) && near(angle(sc), 90));
});

test('[骨骼-7] applied values are recovered from a world transform a constraint changed', () => {
  const s = skeleton({ bones: [bone('root', -1, { rotation: 20 }), bone('a', 0, { x: 5, y: 1, rotation: 30, scaleX: 2, scaleY: 0.5 })] });
  const p = posed(s), b = p.bones[1];
  b.valid = false;
  recoverApplied(p, s, 1);
  for (const [k, v] of Object.entries({ x: 5, y: 1, rotation: 30, scaleX: 2, scaleY: 0.5, shearX: 0, shearY: 0 })) assert.ok(near(b.applied[/** @type {'x'} */ (k)], v), k);
});

test('[骨骼-7] [骨骼-13] the runtimes\' π, 3.1415927: a target turned half a turn is a hair past π, so half a rotate mix turns clockwise', () => {
  const s = skeleton({
    bones: [bone('root', -1), bone('a', 0), bone('t', 0, { rotation: 180 })],
    constraints: { ik: [], transform: [transform([1], 2, { rotateMix: 0.5, translateMix: 0, scaleMix: 0, shearMix: 0 })], path: [] },
  });
  assert.ok(near(angle(posed(s).bones[1]), -90));
});

test('[骨骼-8] curves: linear, stepped, Bézier through 10 sampled points; the frame a time falls in', () => {
  assert.equal(curvePercent({ type: CURVE.LINEAR }, 0.3), 0.3);
  assert.equal(curvePercent({ type: CURVE.STEPPED }, 0.9), 0);
  assert.ok(near(curvePercent({ type: CURVE.BEZIER, c: [0.25, 0, 0.75, 1] }, 0.5), 0.5, 1e-12));
  assert.ok(curvePercent({ type: CURVE.BEZIER, c: [1, 0, 1, 1] }, 0.5) < 0.3);
  const frames = [0, 1, 2].map((time) => ({ time, values: [time] }));
  assert.equal(frameAt(frames, -1), null);
  assert.deepEqual(frameAt(frames, 0.5), { i: 0, t: 0.5 });
  assert.deepEqual(frameAt(frames, 2), { i: 2, t: 0 });
  assert.deepEqual(frameAt(frames, 9), { i: 2, t: 0 });
});

/** A one-bone, one-slot skeleton with an animation of the given timelines. @param {import('../src/animation.js').Timeline[]} timelines */
function animated(timelines) {
  const anim = { name: 'a', duration: 1, timelines, events: [], drawOrder: [] };
  return skeleton({ bones: [bone('root', -1, { x: 3, scaleX: 2 })], slots: [slot('s', 0, 'x')], animations: [anim] });
}

test('[骨骼-9] bone timelines: rotation the short way and wrapped, translate added, scale multiplied', () => {
  const tl = (/** @type {string} */ kind, /** @type {number[][]} */ v) => ({ kind, target: 0, frames: v.map((values, i) => ({ time: i, values, curve: { type: CURVE.LINEAR } })) });
  const s = animated([tl('rotate', [[170], [-170]]), tl('translate', [[0, 0], [10, 4]]), tl('scale', [[1, 1], [3, 1]])]);
  const p = newPose(s);
  applyAnimation(p, s, s.animations[0], 0.75, false);
  assert.ok(near(p.bones[0].rotation, -175, 1e-9));
  assert.ok(near(p.bones[0].x, 3 + 7.5) && near(p.bones[0].y, 3));
  assert.ok(near(p.bones[0].scaleX, 2 * 2.5));
  setupPose(s, p);
  applyAnimation(p, s, s.animations[0], 1, false);
  assert.ok(near(p.bones[0].rotation, -170) && near(p.bones[0].x, 13) && near(p.bones[0].scaleX, 6));
});

test('[骨骼-9] slot timelines, deform over the setup vertices, constraint mixes, draw order and events', () => {
  const s = animated([
    { kind: 'attachment', target: 0, frames: [{ time: 0, values: ['x'] }, { time: 0.5, values: [null] }] },
    { kind: 'color', target: 0, frames: [{ time: 0, values: [0xff0000ff], curve: { type: CURVE.LINEAR } }, { time: 1, values: [0x0000ffff] }] },
    { kind: 'deform', target: 0, skin: 0, attachment: 'x', frames: [{ time: 0, values: [], curve: { type: CURVE.LINEAR } }, { time: 1, values: [2, 4] }] },
  ]);
  s.skins = [defaultSkin([{ slot: 0, key: 'x', attachment: { name: 'x', type: 'mesh', weighted: false, vertices: [0, 0, 1, 1], bones: [] } }])];
  const p = newPose(s);
  applyAnimation(p, s, s.animations[0], 0.5, false);
  assert.equal(p.slots[0].attachment, null);
  assert.deepEqual(p.slots[0].color, [0.5, 0, 0.5, 1]);
  assert.deepEqual(p.slots[0].deform[deformKey(0, 'x')], [0, 0, 3, 1]);
  assert.deepEqual(drawOrderOf([[0, 2]], 3), [1, 2, 0]);
  const anim = { name: 'e', duration: 1, timelines: [], drawOrder: [], events: [0.1, 0.5, 0.9].map((time) => ({ time, event: 0, int: 0, float: 0, string: null })) };
  assert.deepEqual(eventsBetween(anim, 0.2, 0.9, false).map((e) => e.time), [0.5, 0.9]);
  assert.deepEqual(eventsBetween(anim, 0.8, 1.2, true).map((e) => e.time), [0.9, 0.1]);
});

test('[骨骼-9] constraint timelines set IK, transform and path mixes', () => {
  const s = skeleton({ bones: [bone('root', -1), bone('a', 0), bone('t', 0)], constraints: { ik: [ik([1], 2)], transform: [transform([1], 2)], path: [] } });
  const frames = (/** @type {unknown[]} */ a, /** @type {unknown[]} */ b) => [{ time: 0, values: a, curve: { type: CURVE.LINEAR } }, { time: 1, values: b }];
  s.animations = [{ name: 'a', duration: 1, events: [], drawOrder: [], timelines: [
    { kind: 'ik', target: 0, frames: /** @type {any} */ (frames([0, 0, -1, true, false], [1, 1, 1, false, true])) },
    { kind: 'transform', target: 0, frames: /** @type {any} */ (frames([0, 0, 0, 0], [1, 1, 1, 1])) },
  ] }];
  const p = newPose(s);
  applyAnimation(p, s, s.animations[0], 0.25, false);
  assert.deepEqual(p.ik[0], { mix: 0.25, softness: 0.25, bend: -1, compress: true, stretch: false });
  assert.deepEqual(p.transform[0], { rotateMix: 0.25, translateMix: 0.25, scaleMix: 0.25, shearMix: 0.25 });
});

test('[骨骼-9] a color curve that overshoots its keys is held to 0…1, light and dark, as the runtimes\' Color.set does', () => {
  const over = { type: CURVE.BEZIER, c: [0.25, 1.5, 0.5, 1.5] };
  const s = animated([{ kind: 'twoColor', target: 0, frames: [{ time: 0, values: [0x000000ff, 0xffffffff], curve: over }, { time: 1, values: [0xffffffff, 0x000000ff] }] }]);
  const p = newPose(s);
  applyAnimation(p, s, s.animations[0], 0.5, false);
  assert.deepEqual([p.slots[0].color, p.slots[0].dark], [[1, 1, 1, 1], [0, 0, 0, 1]]);
});

test('[骨骼-9] with the update order, the timelines of an inactive bone, of a slot on it and of a constraint not in use set nothing', () => {
  const s = skeleton({
    bones: [bone('root', -1), bone('a', 0), bone('t', 0, { skinRequired: true })], slots: [slot('s', 2)], constraints: { ik: [ik([1], 2)], transform: [], path: [] },
  });
  s.animations = [{ name: 'a', duration: 1, events: [], drawOrder: [], timelines: [
    { kind: 'rotate', target: 2, frames: [{ time: 0, values: [90] }] }, { kind: 'color', target: 0, frames: [{ time: 0, values: [0xff0000ff] }] },
    { kind: 'ik', target: 0, frames: [{ time: 0, values: [0.5, 0, 1, false, false] }] },
  ] }];
  const p = newPose(s), all = newPose(s);
  applyAnimation(p, s, s.animations[0], 0, { loop: false, order: updateOrder(s) });
  applyAnimation(all, s, s.animations[0], 0, false);
  assert.deepEqual([p.bones[2].rotation, p.slots[0].color, p.ik[0].mix], [0, [1, 1, 1, 1], 1]);
  assert.deepEqual([all.bones[2].rotation, all.slots[0].color, all.ik[0].mix], [90, [1, 0, 0, 1], 0.5]);
});

const ATLAS = `
a.png
size: 64,32
format: RGBA8888
filter: Linear,Linear
repeat: none
trim
  rotate: false
  xy: 2, 4
  size: 10, 6
  orig: 12, 8
  offset: 1, 1
  index: -1
r90
  rotate: true
  xy: 20, 0
  size: 10, 6
  orig: 10, 6
  offset: 0, 0
  index: -1
r180
  rotate: 180
  xy: 30, 10
  size: 10, 6
r270
  rotate: 270
  xy: 50, 0
  size: 10, 6
`;

test('[骨骼-10] the atlas: pages, regions, their turn, original size and offset', () => {
  const a = readAtlas(ATLAS);
  assert.deepEqual(a.pages, [{ name: 'a.png', width: 64, height: 32 }]);
  assert.deepEqual(a.regions.map((r) => r.degrees), [0, 90, 180, 270]);
  assert.deepEqual(regionOf(a, 'trim'), { name: 'trim', page: 0, x: 2, y: 4, width: 10, height: 6, degrees: 0, originalWidth: 12, originalHeight: 8, offsetX: 1, offsetY: 1, index: -1 });
  assert.equal(regionOf(a, 'r180')?.originalWidth, 10);
  assert.equal(regionOf(a, 'none'), null);
});

test('[骨骼-10] a point of the original image on the page, for each turn', () => {
  const a = readAtlas(ATLAS), page = a.pages[0], px = (/** @type {string} */ n, /** @type {number} */ s, /** @type {number} */ t) => {
    const [u, v] = pageUV(/** @type {any} */ (regionOf(a, n)), page, s, t);
    return [Math.round(u * 64 * 1e9) / 1e9, Math.round(v * 32 * 1e9) / 1e9];
  };
  assert.deepEqual(px('trim', 1 / 12, 1 / 8), [2, 4]);
  assert.deepEqual(px('trim', 11 / 12, 7 / 8), [12, 10]);
  assert.deepEqual(px('r90', 0, 0), [20, 10]);
  assert.deepEqual(px('r90', 1, 0), [20, 0]);
  assert.deepEqual(px('r90', 0, 1), [26, 10]);
  assert.deepEqual(px('r180', 0, 0), [40, 16]);
  assert.deepEqual(px('r270', 0, 0), [56, 0]);
  assert.deepEqual(px('r270', 1, 1), [50, 10]);
  const uv = regionUVs(/** @type {any} */ (regionOf(a, 'r90')), page).map((x, i) => x * (i % 2 ? 32 : 64));
  assert.deepEqual(uv, [26, 10, 20, 10, 20, 0, 26, 0]);
});

test('[骨骼-11] update order: a constraint after its target and first bone; the bones under it again after it', () => {
  const s = skeleton({ bones: [bone('root', -1), bone('a', 0), bone('b', 1), bone('c', 2), bone('t', 0)], constraints: { ik: [ik([1, 2], 4)], transform: [], path: [] } });
  const o = updateOrder(s), names = o.steps.map((x) => (x.kind === 'bone' ? s.bones[x.index].name : x.kind));
  assert.deepEqual(names, ['root', 't', 'a', 'ik', 'c']);
  assert.deepEqual(o.reset, [2]);
});

test('[骨骼-11] a bone a skin needs is inactive without that skin, and so is a constraint on it', () => {
  const s = skeleton({ bones: [bone('root', -1), bone('a', 0), bone('t', 0, { skinRequired: true })], constraints: { ik: [ik([1], 2)], transform: [], path: [] } });
  const o = updateOrder(s);
  assert.deepEqual(o.active, [true, true, false]);
  assert.deepEqual(o.steps.map((x) => x.kind + x.index), ['bone0', 'bone1']);
});

/** Root, a 10-long bone and a second 10-long bone at its end, a target bone at x, y. @param {number} x @param {number} y @param {Record<string, unknown>} [v] */
function arm(x, y, v = {}) {
  const bones = [bone('root', -1), bone('a', 0, { length: 10 }), bone('b', 1, { x: 10, length: 10 }), bone('t', 0, { x, y })];
  return skeleton({ bones, constraints: { ik: [ik([1, 2], 3, v)], transform: [], path: [] } });
}

/** The tip of a bone of a pose. @param {import('../src/pose.js').Pose} p @param {import('../src/skeleton.js').Skeleton} s @param {number} i */
const tip = (p, s, i) => [p.bones[i].worldX + p.bones[i].a * s.bones[i].length, p.bones[i].worldY + p.bones[i].c * s.bones[i].length];

test('[骨骼-12] one bone turns to its target by the mix and stretches when asked', () => {
  const one = (/** @type {Record<string, unknown>} */ v, /** @type {number} */ x, /** @type {number} */ y) => {
    const s = skeleton({ bones: [bone('root', -1), bone('a', 0, { length: 10 }), bone('t', 0, { x, y })], constraints: { ik: [ik([1], 2, v)], transform: [], path: [] } });
    return posed(s).bones[1];
  };
  assert.ok(near(angle(one({}, 0, 10)), 90));
  assert.ok(near(angle(one({ mix: 0.5 }, 0, 10)), 45));
  assert.ok(near(one({ stretch: true }, 20, 0).a, 2));
  assert.ok(near(one({}, 20, 0).a, 1));
});

test('[骨骼-12] two bones bend to reach the target, on the side of the bend direction', () => {
  for (const bend of [1, -1]) {
    const s = arm(10, 10, { bend }), p = posed(s), [x, y] = tip(p, s, 2);
    assert.ok(near(x, 10) && near(y, 10), `bend ${bend}`);
    assert.ok(near(p.bones[2].worldX, bend === 1 ? 10 : 0) && near(p.bones[2].worldY, bend === 1 ? 0 : 10));
  }
  const s = arm(30, 0), p = posed(s);
  assert.deepEqual(tip(p, s, 2).map((v) => Math.round(v * 1e6) / 1e6 + 0), [20, 0]);
  const stretched = arm(30, 0, { stretch: true }), q = posed(stretched);
  assert.ok(near(tip(q, stretched, 2)[0], 30));
});

/** A number `k` steps of its last bit away. @param {number} v @param {number} k */
const ulps = (v, k) => {
  const f = new Float64Array([v]), bits = new BigInt64Array(f.buffer);
  bits[0] += BigInt(k);
  return f[0];
};

/** Root, a parent of y scale `sy`, a child at `l1` on it `l2` long, a target bone at x, y. @param {number} sy @param {number[]} l @param {number} x @param {number} y */
function flatArm(sy, l, x, y) {
  const bones = [bone('root', -1), bone('a', 0, { length: l[0], scaleY: sy }), bone('b', 1, { x: l[0], length: l[1] }), bone('t', 0, { x, y })];
  return skeleton({ bones, constraints: { ik: [ik([1, 2], 3)], transform: [], path: [] } });
}

test('[骨骼-12] unequal scales: the tip reaches a target on the ellipse, else the arm points straight at it — also for a parent squashed nearly flat', () => {
  const s = flatArm(0.5, [10, 10], 12, 6), p = posed(s);
  assert.ok(near(tip(p, s, 2)[0], 12) && near(tip(p, s, 2)[1], 6));
  // char_222_bpipe's back, Skill_2_Begin at 1/30 s: a parent at 3.7e-8 of its height, so whether the target is on the
  // ellipse and how high it is there must not come from √(dd − r²), whose terms agree to their last bits.
  const l = [38.48779296875, 32.45602035522461];
  for (const [x, y, reach] of [[36, 48, 60], [-55.8732577299379, 46.475256626088154, l[0] + l[1]]]) {
    for (let k = -16; k <= 16; k++) {
      const flat = flatArm(3.725290298461914e-8, l, ulps(x, k), y), q = posed(flat), [tx, ty] = tip(q, flat, 2), d = Math.hypot(ulps(x, k), y);
      assert.ok(near(tx, (ulps(x, k) * reach) / d) && near(ty, (y * reach) / d), `${x} ${k}`);
    }
  }
});

test('[骨骼-13] a transform constraint moves bones towards the target in the world, absolutely or relatively', () => {
  const make = (/** @type {Record<string, unknown>} */ v) => skeleton({
    bones: [bone('root', -1), bone('a', 0, { rotation: 10 }), bone('t', 0, { x: 6, y: 4, rotation: 90 })],
    constraints: { ik: [], transform: [transform([1], 2, { scaleMix: 0, shearMix: 0, ...v })], path: [] },
  });
  const abs = posed(make({ translateMix: 0.5 })).bones[1];
  assert.ok(near(angle(abs), 90) && near(abs.worldX, 3) && near(abs.worldY, 2));
  const rel = posed(make({ relative: true, translateMix: 0 })).bones[1];
  assert.ok(near(angle(rel), 100));
});

test('[骨骼-14] a region\'s corners, plain and weighted vertices with a deform, a linked mesh\'s parent', () => {
  const r = { name: 'r', page: 0, x: 0, y: 0, width: 4, height: 2, degrees: 0, originalWidth: 4, originalHeight: 2, offsetX: 0, offsetY: 0, index: -1 };
  assert.deepEqual(regionCorners({ x: 1, y: 0, width: 4, height: 2, scaleX: 1, scaleY: 1, rotation: 0 }, r), [-1, -1, -1, 1, 3, 1, 3, -1]);
  const mesh = { name: 'm', type: 'mesh', weighted: false, vertices: [1, 0], bones: [] };
  const weighted = { name: 'w', type: 'mesh', weighted: true, vertices: [0, 0, 0.5, 0, 0, 0.5], bones: [2, 0, 1] };
  const linked = { name: 'l', type: 'linkedmesh', skin: null, parent: 'm', inheritDeform: true };
  const s = skeleton({ bones: [bone('root', -1), bone('a', 0, { x: 10, rotation: 90 })], slots: [slot('s', 1, 'm')] });
  s.skins = [defaultSkin([{ slot: 0, key: 'm', attachment: mesh }, { slot: 0, key: 'w', attachment: weighted }, { slot: 0, key: 'l', attachment: linked }])];
  const p = posed(s), round = (/** @type {number[]} */ v) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0);
  assert.deepEqual(round(worldVertices({ p, s, slot: 0, a: mesh, deform: undefined })), [10, 1]);
  assert.deepEqual(round(worldVertices({ p, s, slot: 0, a: weighted, deform: undefined })), [5, 0]);
  assert.deepEqual(round(worldVertices({ p, s, slot: 0, a: weighted, deform: [2, 0, 0, 0] })), [6, 0]);
  const found = findAttachment(s, null, 0, 'l');
  assert.equal(found?.mesh, mesh);
  assert.equal(found?.deformKey, deformKey(0, 'm'));
});

/** A straight open path along x from 0 to 30 and two 10-long bones on it. @param {Record<string, unknown>} v */
function onPath(v) {
  const path = { name: 'p', type: 'path', closed: false, constantSpeed: true, weighted: false, vertices: [-10, 0, 0, 0, 10, 0, 20, 0, 30, 0, 40, 0], bones: [], lengths: [30, 40] };
  const bones = [bone('root', -1, { rotation: 0 }), bone('a', 0, { length: 10, rotation: 30 }), bone('b', 1, { x: 10, length: 10 })];
  const c = { name: 'pc', order: 0, skinRequired: false, bones: [1, 2], target: 0, position: 0, spacing: 0, rotate: 1, offsetRotation: 0, positionValue: 5, spacingValue: 0, rotateMix: 1, translateMix: 1, ...v };
  const s = skeleton({ bones, slots: [slot('s', 0, 'p')], constraints: { ik: [], transform: [], path: [c] } });
  s.skins = [defaultSkin([{ slot: 0, key: 'p', attachment: path }])];
  return s;
}

test('[骨骼-15] a path constraint places bones along the path, spaced by their length, turned along it', () => {
  const p = posed(onPath({})), round = (/** @type {number} */ x) => Math.round(x * 1e6) / 1e6 + 0;
  assert.deepEqual([p.bones[1].worldX, p.bones[1].worldY, p.bones[2].worldX, p.bones[2].worldY].map(round), [5, 0, 15, 0]);
  assert.ok(near(angle(p.bones[1]), 0) && near(angle(p.bones[2]), 0));
  const pct = posed(onPath({ position: 1, positionValue: 0.5, spacing: 1, spacingValue: 4, rotate: 0 }));
  assert.deepEqual([pct.bones[1].worldX, pct.bones[2].worldX].map(round), [15, 19]);
  const chain = posed(onPath({ position: 1, positionValue: 0.5, spacing: 1, spacingValue: 4 }));
  assert.deepEqual([chain.bones[1].worldX, chain.bones[2].worldX].map(round), [15, 25]);
  const half = posed(onPath({ translateMix: 0.5, rotateMix: 0 }));
  assert.ok(near(half.bones[1].worldX, 2.5) && near(angle(half.bones[1]), 30));
});
