// The reader against the official Spine 3.8 runtime on real skeletons, run where the maintainer has them: set
// AUE_SPINE_MODELS to a directory of model files (JSON with the binary skeleton in base64 at spine.skel) and
// AUE_SPINE_RUNTIME to a directory where `@pixi-spine/runtime-3.8` can be required. Every animation's name, duration
// and OnAttack times must equal the runtime's exactly. Skipped when either is not set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readSkeleton, animationTimes } from '../src/index.js';

const MODELS = process.env.AUE_SPINE_MODELS, RUNTIME = process.env.AUE_SPINE_RUNTIME;
const skip = MODELS && RUNTIME ? false : 'AUE_SPINE_MODELS and AUE_SPINE_RUNTIME are not set';

/** The runtime's animation names, durations and OnAttack times. @param {any} r @param {Uint8Array} bytes */
function official(r, bytes) {
  const make = (/** @type {any} */ C) => (/** @type {any} */ _skin, /** @type {string} */ name) => new C(name);
  const loader = {
    newRegionAttachment: make(r.RegionAttachment), newMeshAttachment: make(r.MeshAttachment), newBoundingBoxAttachment: make(r.BoundingBoxAttachment),
    newPathAttachment: make(r.PathAttachment), newPointAttachment: make(r.PointAttachment), newClippingAttachment: make(r.ClippingAttachment),
  };
  const data = new r.SkeletonBinary(loader).readSkeletonData(bytes);
  /** @type {Record<string, { duration: number, hits: number[] }>} */
  const out = {};
  for (const a of data.animations) {
    const hits = [];
    for (const t of a.timelines) for (const e of t.events ?? []) if (/^onattack$/i.test(e.data.name)) hits.push(e.time);
    out[a.name] = { duration: a.duration, hits: hits.sort((x, y) => x - y) };
  }
  return { version: data.version, names: data.animations.map((/** @type {any} */ a) => a.name), times: out };
}

test('[骨骼-1] [骨骼-6] every model: the same animations, durations and OnAttack times as the official runtime', { skip }, () => {
  const r = createRequire(join(/** @type {string} */ (RUNTIME), 'index.js'))('@pixi-spine/runtime-3.8');
  const files = readdirSync(/** @type {string} */ (MODELS)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length > 0);
  let animations = 0;
  for (const f of files) {
    const bytes = new Uint8Array(Buffer.from(JSON.parse(readFileSync(join(/** @type {string} */ (MODELS), f), 'utf8')).spine.skel, 'base64'));
    const theirs = official(r, bytes), s = readSkeleton(bytes);
    assert.equal(s.version, theirs.version, f);
    assert.deepEqual(s.animations.map((a) => a.name), theirs.names, f);
    assert.deepEqual(animationTimes(s), theirs.times, f);
    animations += theirs.names.length;
  }
  assert.ok(animations > 0);
});
