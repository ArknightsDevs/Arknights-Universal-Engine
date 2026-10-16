// IK constraints (docs/spec/spine.md 骨骼-12): one bone turned to point at its target, or two bones bent to reach it,
// with mix, bend direction, softness, and stretching or compressing the bone. Our own implementation of the Spine 3.8
// semantics; no Spine runtime code.
import { TRANSFORM, placeBone, recoverApplied, updateBone } from './pose.js';
import { PI, RAD_DEG } from './math.js';

/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./pose.js').Pose} Pose */
/** @typedef {{ compress: boolean, stretch: boolean, uniform: boolean, alpha: number }} OneOptions */
/** @typedef {{ bend: number, stretch: boolean, softness: number, alpha: number }} TwoOptions */

/** An angle in degrees brought into [−180, 180] by one turn. @param {number} r */
const wrap = (r) => (r > 180 ? r - 360 : r < -180 ? r + 360 : r);

/** The applied values of a bone, recovered first when a constraint changed its world transform. @param {Pose} p @param {Skeleton} s @param {number} i */
const applied = (p, s, i) => {
  if (!p.bones[i].valid) recoverApplied(p, s, i);
  return p.bones[i].applied;
};

/**
 * The target in the bone's parent space, relative to the bone, and the extra rotation of a noRotationOrReflection bone.
 * @param {Pose} p @param {Skeleton} s @param {number} i @param {number[]} target
 */
function towards(p, s, i, target) {
  const bone = p.bones[i], q = p.bones[s.bones[i].parent], mode = s.bones[i].transform, v = bone.applied;
  if (mode === TRANSFORM.ONLY_TRANSLATION) return { tx: target[0] - bone.worldX, ty: target[1] - bone.worldY, turn: 0 };
  let pb = q.b, pd = q.d, turn = 0;
  const pa = q.a, pc = q.c;
  if (mode === TRANSFORM.NO_ROTATION_OR_REFLECTION) {
    const k = Math.abs(pa * pd - pb * pc) / (pa * pa + pc * pc), sa = pa / p.scaleX, sc = pc / p.scaleY;
    pb = -sc * k * p.scaleX;
    pd = sa * k * p.scaleY;
    turn = Math.atan2(sc, sa) * RAD_DEG;
  }
  const x = target[0] - q.worldX, y = target[1] - q.worldY, d = pa * pd - pb * pc;
  return { tx: (x * pd - y * pb) / d - v.x, ty: (y * pa - x * pc) / d - v.y, turn };
}

/**
 * One bone pointed at a target (骨骼-12): turned by `alpha` of the way, and stretched (target farther than the bone's
 * length) or compressed (nearer) when asked — along its length, or both ways when uniform.
 * @param {Pose} p @param {Skeleton} s @param {number} i @param {number[]} target @param {OneOptions} o
 */
export function pointBone(p, s, i, target, o) {
  const v = applied(p, s, i), bone = p.bones[i], mode = s.bones[i].transform, to = towards(p, s, i, target);
  let tx = to.tx, ty = to.ty, rotation = -v.shearX - v.rotation + to.turn + Math.atan2(ty, tx) * RAD_DEG;
  if (v.scaleX < 0) rotation += 180;
  rotation = wrap(rotation);
  let sx = v.scaleX, sy = v.scaleY;
  if (o.compress || o.stretch) {
    if (mode === TRANSFORM.NO_SCALE || mode === TRANSFORM.NO_SCALE_OR_REFLECTION) { tx = target[0] - bone.worldX; ty = target[1] - bone.worldY; }
    const b = s.bones[i].length * sx, dd = Math.sqrt(tx * tx + ty * ty);
    if ((o.compress && dd < b) || (o.stretch && dd > b && b > 0.0001)) {
      const k = (dd / b - 1) * o.alpha + 1;
      sx *= k;
      if (o.uniform) sy *= k;
    }
  }
  placeBone(p, s, i, { x: v.x, y: v.y, rotation: v.rotation + rotation * o.alpha, scaleX: sx, scaleY: sy, shearX: v.shearX, shearY: v.shearY });
}

/**
 * The two angles (radians) of a parent with unequal scales: the child's reach is an ellipse; the exact solution when
 * the target is on it, else the nearest or farthest point of it. At the solution's x, r, the child reaches e = r − l1
 * along the parent: the target is on the ellipse when |e| ≤ a, at the height (b / a)·√(a² − e²) — in exact arithmetic
 * the same as the runtimes' r² ≤ dd and √(dd − r²). Those cancel to rounding noise when the parent is squashed nearly
 * flat, so there the runtimes' result jumps with the last bits of the target; we take the exact solution on purpose
 * and may differ from them (骨骼-12).
 * @param {{ l1: number, l2: number, psx: number, psy: number, tx: number, ty: number, dd: number, bend: number }} k @returns {number[]}
 */
function ellipseAngles(k) {
  const { l1, l2, psx, psy, tx, ty, dd, bend } = k;
  const a = psx * l2, b = psy * l2, aa = a * a, bb = b * b, ta = Math.atan2(ty, tx);
  let c = bb * l1 * l1 + aa * dd - aa * bb;
  const c1 = -2 * bb * l1, c2 = bb - aa, d = c1 * c1 - 4 * c2 * c;
  if (d >= 0) {
    let q = Math.sqrt(d);
    if (c1 < 0) q = -q;
    q = -(c1 + q) / 2;
    const r0 = q / c2, r1 = c / q, r = Math.abs(r0) < Math.abs(r1) ? r0 : r1, e = r - l1;
    if (e * e <= aa) {
      const h = Math.sqrt(aa - e * e) * bend;
      return [ta - Math.atan2((h * psy) / psx, r), Math.atan2(h, e)];
    }
  }
  const near = { angle: PI, x: l1 - a, y: 0, dist: (l1 - a) * (l1 - a) }, far = { angle: 0, x: l1 + a, y: 0, dist: (l1 + a) * (l1 + a) };
  c = -a * l1 / (aa - bb);
  if (c >= -1 && c <= 1) {
    c = Math.acos(c);
    const x = a * Math.cos(c) + l1, y = b * Math.sin(c), dist = x * x + y * y;
    if (dist < near.dist) Object.assign(near, { angle: c, x, y, dist });
    if (dist > far.dist) Object.assign(far, { angle: c, x, y, dist });
  }
  const m = dd <= (near.dist + far.dist) / 2 ? near : far;
  return [ta - Math.atan2(m.y * bend, m.x), m.angle * bend];
}

/**
 * The parent's signs and the parent bone's frame: scales made positive with the offsets and sign that undo it, the
 * child's position, and the lengths of both bones.
 * @param {Pose} p @param {Skeleton} s @param {number} pi @param {number} ci
 */
function twoBoneFrame(p, s, pi, ci) {
  const P = applied(p, s, pi), C = applied(p, s, ci), pm = p.bones[pi];
  let psx = P.scaleX, psy = P.scaleY, csx = C.scaleX, os1 = 0, s2 = 1, os2 = 0;
  if (psx < 0) { psx = -psx; os1 = 180; s2 = -1; }
  if (psy < 0) { psy = -psy; s2 = -s2; }
  if (csx < 0) { csx = -csx; os2 = 180; }
  const u = Math.abs(psx - psy) <= 0.0001, cx = C.x, cy = u ? C.y : 0;
  const cwx = pm.a * cx + pm.b * cy + pm.worldX, cwy = pm.c * cx + pm.d * cy + pm.worldY;
  const pp = p.bones[s.bones[pi].parent], id = 1 / (pp.a * pp.d - pp.b * pp.c);
  const x = cwx - pp.worldX, y = cwy - pp.worldY;
  const dx = (x * pp.d - y * pp.b) * id - P.x, dy = (y * pp.a - x * pp.c) * id - P.y;
  return { P, C, psx, psy, csx, os1, s2, os2, u, cx, cy, pp, id, l1: Math.sqrt(dx * dx + dy * dy), l2: s.bones[ci].length * csx };
}

/**
 * Two bones bent to reach a target (骨骼-12): the parent and child turned by `alpha` of the way, bending towards
 * `bend` (1 or −1); softness eases the last stretch of the reach; the parent stretches when asked and the target is
 * out of reach. A zero mix leaves the child as its local values place it.
 * @param {Pose} p @param {Skeleton} s @param {number[]} bones the parent and the child @param {number[]} target @param {TwoOptions} o
 */
export function bendBones(p, s, bones, target, o) {
  const [pi, ci] = bones;
  if (o.alpha === 0) { updateBone(p, s, ci); return; }
  const f = twoBoneFrame(p, s, pi, ci), { P, C, pp, id, psx, l1 } = f;
  let l2 = f.l2, sx = P.scaleX;
  if (l1 < 0.0001) {
    pointBone(p, s, pi, target, { compress: false, stretch: o.stretch, uniform: false, alpha: o.alpha });
    placeBone(p, s, ci, { x: f.cx, y: f.cy, rotation: 0, scaleX: C.scaleX, scaleY: C.scaleY, shearX: C.shearX, shearY: C.shearY });
    return;
  }
  const x = target[0] - pp.worldX, y = target[1] - pp.worldY;
  let tx = (x * pp.d - y * pp.b) * id - P.x, ty = (y * pp.a - x * pp.c) * id - P.y, dd = tx * tx + ty * ty;
  if (o.softness !== 0) {
    const soft = o.softness * (psx * (f.csx + 1) / 2), td = Math.sqrt(dd), sd = td - l1 - l2 * psx + soft;
    if (sd > 0) {
      let q = Math.min(1, sd / (soft * 2)) - 1;
      q = (sd - soft * (1 - q * q)) / td;
      tx -= q * tx; ty -= q * ty;
      dd = tx * tx + ty * ty;
    }
  }
  let a1, a2;
  if (f.u) {
    l2 *= psx;
    let cos = (dd - l1 * l1 - l2 * l2) / (2 * l1 * l2);
    if (cos < -1) cos = -1;
    else if (cos > 1) { cos = 1; if (o.stretch) sx *= (Math.sqrt(dd) / (l1 + l2) - 1) * o.alpha + 1; }
    a2 = Math.acos(cos) * o.bend;
    const a = l1 + l2 * cos, b = l2 * Math.sin(a2);
    a1 = Math.atan2(ty * a - tx * b, tx * a + ty * b);
  } else [a1, a2] = ellipseAngles({ l1, l2, psx, psy: f.psy, tx, ty, dd, bend: o.bend });
  const os = Math.atan2(f.cy, f.cx) * f.s2, pr = P.rotation, cr = C.rotation;
  const t1 = wrap((a1 - os) * RAD_DEG + f.os1 - pr), t2 = wrap(((a2 + os) * RAD_DEG - C.shearX) * f.s2 + f.os2 - cr);
  placeBone(p, s, pi, { x: P.x, y: P.y, rotation: pr + t1 * o.alpha, scaleX: sx, scaleY: P.scaleY, shearX: 0, shearY: 0 });
  placeBone(p, s, ci, { x: f.cx, y: f.cy, rotation: cr + t2 * o.alpha, scaleX: C.scaleX, scaleY: C.scaleY, shearX: C.shearX, shearY: C.shearY });
}

/** An IK constraint of a pose applied (骨骼-12). @param {Pose} p @param {Skeleton} s @param {number} index */
export function applyIk(p, s, index) {
  const c = s.constraints.ik[index], m = p.ik[index], t = p.bones[c.target], target = [t.worldX, t.worldY];
  if (c.bones.length === 1) pointBone(p, s, c.bones[0], target, { compress: m.compress, stretch: m.stretch, uniform: c.uniform, alpha: m.mix });
  else if (c.bones.length === 2) bendBones(p, s, c.bones, target, { bend: m.bend, stretch: m.stretch, softness: m.softness, alpha: m.mix });
}
