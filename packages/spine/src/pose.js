// A skeleton's pose (docs/spec/spine.md 骨骼-7, 骨骼-8): every bone's local values, its applied values and world
// transform, every slot's color and attachment, every constraint's mix, the draw order. Our own implementation of the
// Spine 3.8 semantics; no Spine runtime code.
import { DEG_RAD, RAD_DEG } from './math.js';

/** @typedef {import('./skeleton.js').Skeleton} Skeleton */

/** A transform mode (骨骼-3): how a bone inherits its parent's transform. */
export const TRANSFORM = Object.freeze({ NORMAL: 0, ONLY_TRANSLATION: 1, NO_ROTATION_OR_REFLECTION: 2, NO_SCALE: 3, NO_SCALE_OR_REFLECTION: 4 });

/**
 * Local values of a bone: position, rotation, scale and shear.
 * @typedef {{ x: number, y: number, rotation: number, scaleX: number, scaleY: number, shearX: number, shearY: number }} Local
 */
/**
 * A bone of a pose: the local values the animations set; the applied values its world transform was last made from
 * (`applied` false once a constraint changed the world transform directly); and the world transform — the 2 × 2
 * matrix a, b, c, d and the position worldX, worldY.
 * @typedef {Local & { applied: Local, valid: boolean, a: number, b: number, c: number, d: number, worldX: number, worldY: number }} PoseBone
 */
/**
 * A slot of a pose: its color and dark color (r, g, b, a in 0–1; dark null without one), its attachment's key (null for
 * none), and the deform offsets of its attachments by key.
 * @typedef {{ color: number[], dark: number[] | null, attachment: string | null, deform: Record<string, number[]> }} PoseSlot
 */
/** @typedef {{ mix: number, softness: number, bend: number, compress: boolean, stretch: boolean }} PoseIk */
/** @typedef {{ rotateMix: number, translateMix: number, scaleMix: number, shearMix: number }} PoseTransform */
/** @typedef {{ position: number, spacing: number, rotateMix: number, translateMix: number }} PosePath */
/**
 * @typedef {{ bones: PoseBone[], slots: PoseSlot[], ik: PoseIk[], transform: PoseTransform[], path: PosePath[],
 *   drawOrder: number[], x: number, y: number, scaleX: number, scaleY: number }} Pose
 */

/** An rgba8888 color as r, g, b, a in 0–1. @param {number} c */
export const rgba = (c) => [((c >>> 24) & 0xff) / 255, ((c >>> 16) & 0xff) / 255, ((c >>> 8) & 0xff) / 255, (c & 0xff) / 255];

/** @returns {Local} */
const identity = () => ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 });

/** A pose in the setup pose (骨骼-7). @param {Skeleton} s @returns {Pose} */
export function newPose(s) {
  const p = {
    bones: s.bones.map(() => /** @type {PoseBone} */ ({ ...identity(), applied: identity(), valid: true, a: 1, b: 0, c: 0, d: 1, worldX: 0, worldY: 0 })),
    slots: s.slots.map(() => /** @type {PoseSlot} */ ({ color: [1, 1, 1, 1], dark: null, attachment: null, deform: {} })),
    ik: [], transform: [], path: [], drawOrder: [], x: 0, y: 0, scaleX: 1, scaleY: 1,
  };
  setupPose(s, p);
  return p;
}

/**
 * Back to the setup pose (骨骼-7): the bones' and slots' setup values, the constraints' setup mixes, the setup draw
 * order.
 * @param {Skeleton} s @param {Pose} p
 */
export function setupPose(s, p) {
  s.bones.forEach((b, i) => Object.assign(p.bones[i], { x: b.x, y: b.y, rotation: b.rotation, scaleX: b.scaleX, scaleY: b.scaleY, shearX: b.shearX, shearY: b.shearY }));
  s.slots.forEach((sl, i) => {
    const slot = p.slots[i];
    slot.color = rgba(sl.color);
    slot.dark = sl.dark === -1 ? null : rgba(sl.dark).slice(0, 3).concat(1);
    slot.attachment = sl.attachment;
    slot.deform = {};
  });
  const { ik, transform, path } = s.constraints;
  p.ik = ik.map((c) => ({ mix: c.mix, softness: c.softness, bend: c.bend, compress: c.compress, stretch: c.stretch }));
  p.transform = transform.map((c) => ({ rotateMix: c.rotateMix, translateMix: c.translateMix, scaleMix: c.scaleMix, shearMix: c.shearMix }));
  p.path = path.map((c) => ({ position: c.positionValue, spacing: c.spacingValue, rotateMix: c.rotateMix, translateMix: c.translateMix }));
  p.drawOrder = s.slots.map((_, i) => i);
}

/**
 * A bone's world transform from the given local values and its parent's world transform (骨骼-7), by its transform
 * mode; the root's from the skeleton's position and scale. The values become the bone's applied values.
 * @param {Pose} p @param {Skeleton} s @param {number} i @param {Local} v
 */
export function placeBone(p, s, i, v) {
  const b = p.bones[i], parent = s.bones[i].parent, sx = p.scaleX, sy = p.scaleY, ap = b.applied;
  ap.x = v.x; ap.y = v.y; ap.rotation = v.rotation; ap.scaleX = v.scaleX; ap.scaleY = v.scaleY; ap.shearX = v.shearX; ap.shearY = v.shearY;
  b.valid = true;
  const rx = (v.rotation + v.shearX) * DEG_RAD, ry = (v.rotation + 90 + v.shearY) * DEG_RAD;
  const la = Math.cos(rx) * v.scaleX, lb = Math.cos(ry) * v.scaleY, lc = Math.sin(rx) * v.scaleX, ld = Math.sin(ry) * v.scaleY;
  if (parent < 0) {
    Object.assign(b, { a: la * sx, b: lb * sx, c: lc * sy, d: ld * sy, worldX: v.x * sx + p.x, worldY: v.y * sy + p.y });
    return;
  }
  const q = p.bones[parent];
  b.worldX = q.a * v.x + q.b * v.y + q.worldX;
  b.worldY = q.c * v.x + q.d * v.y + q.worldY;
  const m = inherit(s.bones[i].transform, v, q, p, [la, lb, lc, ld]);
  b.a = m[0]; b.b = m[1]; b.c = m[2]; b.d = m[3];
}

/** A bone's world transform from its own local values (骨骼-7). @param {Pose} p @param {Skeleton} s @param {number} i */
export const updateBone = (p, s, i) => placeBone(p, s, i, p.bones[i]);

/** Every bone's world transform from its local values, parents first, with no constraints (骨骼-7). @param {Pose} p @param {Skeleton} s */
export function updateBones(p, s) {
  for (let i = 0; i < s.bones.length; i++) updateBone(p, s, i);
}

/**
 * The world matrix a, b, c, d of a bone under its transform mode (骨骼-7).
 * @param {number} mode @param {Local} b @param {PoseBone} q its parent @param {Pose} p for the skeleton's scale
 * @param {number[]} l its local matrix la, lb, lc, ld @returns {number[]}
 */
function inherit(mode, b, q, p, l) {
  const [la, lb, lc, ld] = l, pa = q.a, pb = q.b, pc = q.c, pd = q.d, sx = p.scaleX, sy = p.scaleY;
  if (mode === TRANSFORM.NORMAL) return [pa * la + pb * lc, pa * lb + pb * ld, pc * la + pd * lc, pc * lb + pd * ld];
  if (mode === TRANSFORM.ONLY_TRANSLATION) return [la * sx, lb * sx, lc * sy, ld * sy];
  if (mode === TRANSFORM.NO_ROTATION_OR_REFLECTION) return noRotation(b, [pa, pb, pc, pd], sx, sy);
  return noScale(mode, b, [pa, pb, pc, pd], sx, sy);
}

/**
 * noRotationOrReflection (骨骼-7): the parent's scale without its rotation or reflection.
 * @param {Local} b @param {number[]} m the parent's matrix @param {number} sx @param {number} sy @returns {number[]}
 */
function noRotation(b, m, sx, sy) {
  let [pa, pb, pc, pd] = m, prx;
  let s = pa * pa + pc * pc;
  if (s > 0.0001) {
    s = Math.abs(pa * pd - pb * pc) / s;
    pa /= sx; pc /= sy;
    pb = pc * s; pd = pa * s;
    prx = Math.atan2(pc, pa) * RAD_DEG;
  } else {
    pa = 0; pc = 0;
    prx = 90 - Math.atan2(pd, pb) * RAD_DEG;
  }
  const rx = (b.rotation + b.shearX - prx) * DEG_RAD, ry = (b.rotation + b.shearY - prx + 90) * DEG_RAD;
  const la = Math.cos(rx) * b.scaleX, lb = Math.cos(ry) * b.scaleY, lc = Math.sin(rx) * b.scaleX, ld = Math.sin(ry) * b.scaleY;
  return [(pa * la - pb * lc) * sx, (pa * lb - pb * ld) * sx, (pc * la + pd * lc) * sy, (pc * lb + pd * ld) * sy];
}

/**
 * noScale and noScaleOrReflection (骨骼-7): the parent's rotation without its scale; noScale keeps a reflection.
 * @param {number} mode @param {Local} b @param {number[]} m the parent's matrix @param {number} sx @param {number} sy @returns {number[]}
 */
function noScale(mode, b, m, sx, sy) {
  const [pa, pb, pc, pd] = m, cos = Math.cos(b.rotation * DEG_RAD), sin = Math.sin(b.rotation * DEG_RAD);
  let za = (pa * cos + pb * sin) / sx, zc = (pc * cos + pd * sin) / sy, s = Math.sqrt(za * za + zc * zc);
  if (s > 0.00001) s = 1 / s;
  za *= s; zc *= s;
  s = Math.sqrt(za * za + zc * zc);
  if (mode === TRANSFORM.NO_SCALE && (pa * pd - pb * pc < 0) !== ((sx < 0) !== (sy < 0))) s = -s;
  const r = Math.PI / 2 + Math.atan2(zc, za), zb = Math.cos(r) * s, zd = Math.sin(r) * s;
  const la = Math.cos(b.shearX * DEG_RAD) * b.scaleX, lb = Math.cos((90 + b.shearY) * DEG_RAD) * b.scaleY;
  const lc = Math.sin(b.shearX * DEG_RAD) * b.scaleX, ld = Math.sin((90 + b.shearY) * DEG_RAD) * b.scaleY;
  return [(za * la + zb * lc) * sx, (za * lb + zb * ld) * sx, (zc * la + zd * lc) * sy, (zc * lb + zd * ld) * sy];
}

/**
 * The applied values of a bone recovered from its world transform (骨骼-7), after a constraint changed it directly:
 * position, rotation and scale relative to the parent, shearX 0. The root's are its world values.
 * @param {Pose} p @param {Skeleton} s @param {number} i
 */
export function recoverApplied(p, s, i) {
  const b = p.bones[i], parent = s.bones[i].parent, v = b.applied;
  b.valid = true;
  if (parent < 0) {
    Object.assign(v, { x: b.worldX, y: b.worldY, rotation: Math.atan2(b.c, b.a) * RAD_DEG, scaleX: Math.sqrt(b.a * b.a + b.c * b.c), scaleY: Math.sqrt(b.b * b.b + b.d * b.d), shearX: 0 });
    v.shearY = Math.atan2(b.a * b.b + b.c * b.d, b.a * b.d - b.b * b.c) * RAD_DEG;
    return;
  }
  const q = p.bones[parent], pid = 1 / (q.a * q.d - q.b * q.c), dx = b.worldX - q.worldX, dy = b.worldY - q.worldY;
  v.x = dx * q.d * pid - dy * q.b * pid;
  v.y = dy * q.a * pid - dx * q.c * pid;
  const ia = pid * q.d, id = pid * q.a, ib = pid * q.b, ic = pid * q.c;
  const ra = ia * b.a - ib * b.c, rb = ia * b.b - ib * b.d, rc = id * b.c - ic * b.a, rd = id * b.d - ic * b.b;
  v.shearX = 0;
  v.scaleX = Math.sqrt(ra * ra + rc * rc);
  if (v.scaleX > 0.0001) {
    const det = ra * rd - rb * rc;
    v.scaleY = det / v.scaleX;
    v.shearY = Math.atan2(ra * rb + rc * rd, det) * RAD_DEG;
    v.rotation = Math.atan2(rc, ra) * RAD_DEG;
  } else {
    v.scaleX = 0;
    v.scaleY = Math.sqrt(rb * rb + rd * rd);
    v.shearY = 0;
    v.rotation = 90 - Math.atan2(rd, rb) * RAD_DEG;
  }
}

/** A point in a bone's space to the world. @param {PoseBone} b @param {number} x @param {number} y @returns {number[]} */
export const toWorld = (b, x, y) => [x * b.a + y * b.b + b.worldX, x * b.c + y * b.d + b.worldY];
