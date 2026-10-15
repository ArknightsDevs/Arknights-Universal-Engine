// Poses against the official Spine 3.8 runtime on real skeletons, run where the maintainer has them (the same
// AUE_SPINE_MODELS and AUE_SPINE_RUNTIME as models.test.js; model files also carry the atlas text at spine.atlas).
// Every animation is sampled at 7 times; each bone's world matrix (within a relative 1e-4) and position, each slot's
// attachment, color and world vertices (positions within 1/1000 of a skeleton unit), and the draw order must agree.
// The reference keeps its keys in 32-bit floats, so positions differ by float noise. Skipped when either is not set.
//
// The reference reads region sizes from textures, so its region attachments get plain region data from our atlas and
// their corner offsets computed after reading (its loader leaves that to its renderer). Its path constraint nests the
// chain branch under `if (tangents)`, leaving the turn 0 in chain modes; that one line is corrected before comparing
// (docs/spec/spine.md 骨骼-15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as sp from '../src/index.js';

const MODELS = process.env.AUE_SPINE_MODELS, RUNTIME = process.env.AUE_SPINE_RUNTIME;
const skip = MODELS && RUNTIME ? false : 'AUE_SPINE_MODELS and AUE_SPINE_RUNTIME are not set';
const RELATIVE = 1e-4, UNIT = 1e-3;

/** The reference runtime, set up for comparison (y up, the chain branch corrected). @returns {{ r: any, base: any }} */
function reference() {
  const req = createRequire(join(/** @type {string} */ (RUNTIME), 'index.js'));
  const r = req('@pixi-spine/runtime-3.8'), base = req('@pixi-spine/base');
  base.settings.yDown = false;
  const src = r.PathConstraint.prototype.update.toString(), fixed = src.replace(/if \(tangents\)\s+if \(tangents\)/, 'if (tangents)');
  if (fixed !== src) {
    const deps = { base, PathAttachment: { PathAttachment: r.PathAttachment }, PathConstraintData: { SpacingMode: r.SpacingMode }, _PathConstraint: r.PathConstraint };
    r.PathConstraint.prototype.update = new Function(...Object.keys(deps), `return function ${fixed}`)(...Object.values(deps));
  }
  return { r, base };
}

/** The reference's skeleton of a model. @param {any} r @param {Uint8Array} bytes @param {import('../src/atlas.js').Atlas} atlas */
function theirSkeleton(r, bytes, atlas) {
  const region = (/** @type {string} */ path) => {
    const g = sp.regionOf(atlas, path);
    return g && { width: g.width, height: g.height, originalWidth: g.originalWidth, originalHeight: g.originalHeight, offsetX: g.offsetX, offsetY: g.offsetY };
  };
  const make = (/** @type {any} */ C, /** @type {boolean} */ withRegion) => (/** @type {any} */ _skin, /** @type {string} */ name, /** @type {string} */ path) => {
    const a = new C(name);
    if (withRegion) a.region = region(path ?? name);
    return a;
  };
  const loader = {
    newRegionAttachment: make(r.RegionAttachment, true), newMeshAttachment: make(r.MeshAttachment, true), newBoundingBoxAttachment: make(r.BoundingBoxAttachment, false),
    newPathAttachment: make(r.PathAttachment, false), newPointAttachment: make(r.PointAttachment, false), newClippingAttachment: make(r.ClippingAttachment, false),
  };
  const data = new r.SkeletonBinary(loader).readSkeletonData(bytes);
  for (const skin of data.skins) for (const map of skin.attachments) for (const a of Object.values(map ?? {})) if (a instanceof r.RegionAttachment) a.updateOffset();
  return { data, sk: new r.Skeleton(data) };
}

/** A slot's attachment and world vertices in the reference. @param {any} r @param {any} sl */
function theirSlot(r, sl) {
  const a = sl.attachment;
  if (a instanceof r.RegionAttachment) {
    const verts = new Array(8);
    a.computeWorldVertices(sl.bone, verts, 0, 2);
    return { name: a.name, verts };
  }
  if (!a || a.worldVerticesLength === undefined) return { name: a ? a.name : null, verts: null };
  const verts = new Array(a.worldVerticesLength);
  a.computeWorldVertices(sl, 0, a.worldVerticesLength, verts, 0, 2);
  return { name: a.name, verts };
}

/** The reference's pose at a time. @param {{ r: any, base: any }} ref @param {any} sk @param {any} anim @param {number} t */
function theirsAt(ref, sk, anim, t) {
  sk.setToSetupPose();
  anim.apply(sk, t, t, false, [], 1, ref.base.MixBlend.setup, ref.base.MixDirection.mixIn);
  sk.updateWorldTransform();
  return {
    bones: sk.bones.map((/** @type {any} */ b) => [b.matrix.a, b.matrix.c, b.matrix.b, b.matrix.d, b.matrix.tx, b.matrix.ty]),
    slots: sk.slots.map((/** @type {any} */ sl) => ({ ...theirSlot(ref.r, sl), color: [sl.color.r, sl.color.g, sl.color.b, sl.color.a] })),
    order: sk.drawOrder.map((/** @type {any} */ sl) => sl.data.index),
  };
}

/**
 * Our pose at a time.
 * @param {{ s: import('../src/skeleton.js').Skeleton, p: import('../src/pose.js').Pose, order: import('../src/order.js').Order, atlas: import('../src/atlas.js').Atlas }} m
 * @param {import('../src/animation.js').Animation} anim @param {number} t
 */
function oursAt(m, anim, t) {
  const { s, p } = m;
  sp.setupPose(s, p);
  sp.applyAnimation(p, s, anim, t, { loop: false, order: m.order });
  sp.updateWorld(p, s, m.order);
  const slots = p.slots.map((sl, i) => {
    const f = sl.attachment === null ? null : sp.findAttachment(s, null, i, sl.attachment);
    if (!f) return { name: null, color: sl.color, verts: null };
    const a = f.attachment;
    if (a.type === 'region') return { name: a.name, color: sl.color, verts: sp.regionWorld(p, s, i, sp.regionCorners(a, /** @type {any} */ (sp.regionOf(m.atlas, a.path ?? a.name)))) };
    return { name: a.name, color: sl.color, verts: a.type === 'point' ? null : sp.worldVertices({ p, s, slot: i, a: f.mesh ?? a, deform: sl.deform[f.deformKey] }) };
  });
  return { bones: p.bones.map((b) => [b.a, b.b, b.c, b.d, b.worldX, b.worldY]), slots, order: p.drawOrder };
}

/** Whether two lists of numbers agree within a relative 1e-4 (of 1 + |theirs|). @param {number[]} a @param {number[]} b */
const agree = (a, b) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) <= RELATIVE * (1 + Math.abs(b[k])));
/** Whether two lists of positions agree within 1/1000 of a skeleton unit. @param {number[]} a @param {number[]} b */
const near = (a, b) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) <= UNIT);

/** What differs between our pose and the reference's, as messages. @param {ReturnType<typeof oursAt>} ours @param {ReturnType<typeof theirsAt>} theirs @param {string} at */
function differences(ours, theirs, at) {
  const out = [];
  ours.bones.forEach((b, i) => { if (!agree(b.slice(0, 4), theirs.bones[i].slice(0, 4)) || !near(b.slice(4), theirs.bones[i].slice(4))) out.push(`${at} bone ${i}`); });
  if (ours.order.join() !== theirs.order.join()) out.push(`${at} draw order`);
  ours.slots.forEach((sl, i) => {
    const th = theirs.slots[i];
    if (sl.name !== th.name) out.push(`${at} slot ${i} attachment ${sl.name} ≠ ${th.name}`);
    else if (!agree(sl.color, th.color)) out.push(`${at} slot ${i} color`);
    else if (sl.verts && th.verts && !near(sl.verts, th.verts)) out.push(`${at} slot ${i} vertices`);
  });
  return out;
}

test('[骨骼-7] [骨骼-8] [骨骼-9] [骨骼-11] [骨骼-12] [骨骼-13] [骨骼-14] [骨骼-15] every model: poses equal the official runtime\'s', { skip }, () => {
  const ref = reference(), files = readdirSync(/** @type {string} */ (MODELS)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0);
  let samples = 0;
  /** @type {string[]} */
  const wrong = [];
  for (const f of files) {
    const model = JSON.parse(readFileSync(join(/** @type {string} */ (MODELS), f), 'utf8')).spine, bytes = new Uint8Array(Buffer.from(model.skel, 'base64'));
    const atlas = sp.readAtlas(model.atlas), s = sp.readSkeleton(bytes), m = { s, p: sp.newPose(s), order: sp.updateOrder(s), atlas };
    const theirs = theirSkeleton(ref.r, bytes, atlas);
    s.animations.forEach((anim, k) => {
      for (let n = 0; n <= 6; n++) {
        const t = (anim.duration * n) / 6 + (n % 2 ? 0.0123 : 0);
        wrong.push(...differences(oursAt(m, anim, t), theirsAt(ref, theirs.sk, theirs.data.animations[k], t), `${f} ${anim.name}@${t.toFixed(4)}`));
        samples++;
      }
    });
  }
  assert.deepEqual(wrong.slice(0, 20), []);
  assert.ok(samples > 0);
});
