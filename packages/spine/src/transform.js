// Transform constraints (docs/spec/spine.md 骨骼-13): bones moved towards their target's rotation, position, scale and
// shear by four mixes, with offsets; in world space or in local space, absolute or relative. Our own implementation of
// the Spine 3.8 semantics; no Spine runtime code.
import { placeBone, recoverApplied, toWorld } from './pose.js';
import { PI, DEG_RAD, wrapRad } from './math.js';

/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./pose.js').Pose} Pose @typedef {import('./pose.js').PoseBone} PoseBone */
/** @typedef {Skeleton['constraints']['transform'][number]} TransformData @typedef {import('./pose.js').PoseTransform} Mix */

/** An angle in degrees brought into [−180, 180] (any number of turns). @param {number} r */
const wrapDeg = (r) => r - 360 * Math.round(r / 360);

/** A bone's world matrix turned by r radians. @param {PoseBone} b @param {number} r */
function turn(b, r) {
  const cos = Math.cos(r), sin = Math.sin(r), { a, b: bb, c, d } = b;
  b.a = cos * a - sin * c; b.b = cos * bb - sin * d;
  b.c = sin * a + cos * c; b.d = sin * bb + cos * d;
}

/**
 * World space (骨骼-13): rotation, position, scale and shear moved towards the target's — absolutely, or added to the
 * bone's own when relative. The bones' applied values are recovered from the result when next needed.
 * @param {Pose} p @param {TransformData} c @param {Mix} m
 */
function world(p, c, m) {
  const t = p.bones[c.target], { a: ta, b: tb, c: tc, d: td } = t, rel = c.relative;
  const reflect = ta * td - tb * tc > 0 ? DEG_RAD : -DEG_RAD, offRot = c.offsetRotation * reflect, offShear = c.offsetShearY * reflect;
  for (const i of c.bones) {
    const b = p.bones[i];
    if (m.rotateMix !== 0) turn(b, wrapRad(Math.atan2(tc, ta) - (rel ? 0 : Math.atan2(b.c, b.a)) + offRot) * m.rotateMix);
    if (m.translateMix !== 0) {
      const [x, y] = toWorld(t, c.offsetX, c.offsetY);
      b.worldX += (rel ? x : x - b.worldX) * m.translateMix;
      b.worldY += (rel ? y : y - b.worldY) * m.translateMix;
    }
    if (m.scaleMix > 0) {
      const sx = scaleBy(Math.sqrt(b.a * b.a + b.c * b.c), Math.sqrt(ta * ta + tc * tc), c.offsetScaleX, m.scaleMix, rel);
      b.a *= sx; b.c *= sx;
      const sy = scaleBy(Math.sqrt(b.b * b.b + b.d * b.d), Math.sqrt(tb * tb + td * td), c.offsetScaleY, m.scaleMix, rel);
      b.b *= sy; b.d *= sy;
    }
    if (m.shearMix > 0) shear(b, t, offShear, m.shearMix, rel);
    if (m.rotateMix !== 0 || m.translateMix !== 0 || m.scaleMix > 0 || m.shearMix > 0) b.valid = false;
  }
}

/**
 * The factor a world axis of length s is scaled by towards the target's length ts.
 * @param {number} s @param {number} ts @param {number} offset @param {number} mix @param {boolean} rel
 */
function scaleBy(s, ts, offset, mix, rel) {
  if (rel) return (ts - 1 + offset) * mix + 1;
  return s > 0.00001 ? (s + (ts - s + offset) * mix) / s : s;
}

/** The bone's y axis turned towards the target's shear. @param {PoseBone} b @param {PoseBone} t @param {number} offset @param {number} mix @param {boolean} rel */
function shear(b, t, offset, mix, rel) {
  const by = Math.atan2(b.d, b.b), s = Math.sqrt(b.b * b.b + b.d * b.d);
  const target = Math.atan2(t.d, t.b) - Math.atan2(t.c, t.a);
  const r = rel ? by + (wrapRad(target) - PI / 2 + offset) * mix : by + (wrapRad(target - (by - Math.atan2(b.c, b.a))) + offset) * mix;
  b.b = Math.cos(r) * s;
  b.d = Math.sin(r) * s;
}

/**
 * Local space (骨骼-13): the applied values moved towards the target's, absolutely or added when relative, then the
 * bone placed from them. Absolute local keeps two quirks of the reference runtime: a scale becomes the ratio it would
 * multiply by, and the shear goes to the bone's local shear, not this placement.
 * @param {Pose} p @param {Skeleton} s @param {TransformData} c @param {Mix} m
 */
function local(p, s, c, m) {
  if (!p.bones[c.target].valid) recoverApplied(p, s, c.target);
  const t = p.bones[c.target].applied, rel = c.relative;
  for (const i of c.bones) {
    if (!p.bones[i].valid) recoverApplied(p, s, i);
    const v = { ...p.bones[i].applied };
    if (m.rotateMix !== 0) v.rotation += (rel ? t.rotation + c.offsetRotation : wrapDeg(t.rotation - v.rotation + c.offsetRotation)) * m.rotateMix;
    if (m.translateMix !== 0) {
      v.x += ((rel ? t.x : t.x - v.x) + c.offsetX) * m.translateMix;
      v.y += ((rel ? t.y : t.y - v.y) + c.offsetY) * m.translateMix;
    }
    if (m.scaleMix > 0) {
      v.scaleX = scaleLocal(v.scaleX, t.scaleX, c.offsetScaleX, m.scaleMix, rel);
      v.scaleY = scaleLocal(v.scaleY, t.scaleY, c.offsetScaleY, m.scaleMix, rel);
    }
    if (m.shearMix > 0) {
      if (rel) v.shearY += (t.shearY + c.offsetShearY) * m.shearMix;
      else p.bones[i].shearY += wrapDeg(t.shearY - v.shearY + c.offsetShearY) * m.shearMix;
    }
    placeBone(p, s, i, v);
  }
}

/**
 * A local scale moved towards the target's: multiplied when relative; absolutely, the ratio (骨骼-13). A scale near 0
 * is left as it is.
 * @param {number} s @param {number} ts @param {number} offset @param {number} mix @param {boolean} rel
 */
function scaleLocal(s, ts, offset, mix, rel) {
  if (!(s > 0.00001)) return s;
  return rel ? s * ((ts - 1 + offset) * mix + 1) : (s + (ts - s + offset) * mix) / s;
}

/** A transform constraint of a pose applied (骨骼-13). @param {Pose} p @param {Skeleton} s @param {number} index */
export function applyTransform(p, s, index) {
  const c = s.constraints.transform[index], m = p.transform[index];
  if (c.local) local(p, s, c, m);
  else world(p, c, m);
}
