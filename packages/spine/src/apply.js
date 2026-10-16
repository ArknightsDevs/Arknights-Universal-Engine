// Applying an animation to a pose at a time (docs/spec/spine.md 骨骼-8, 骨骼-9): each timeline's value between its
// frames by the frame's curve, laid over the setup pose. Our own implementation of the Spine 3.8 semantics; no Spine
// runtime code.
import { CURVE } from './animation.js';
import { rgba } from './pose.js';
import { findAttachment, deformKey } from './vertices.js';

/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./animation.js').Animation} Animation */
/** @typedef {import('./animation.js').Timeline} Timeline @typedef {import('./pose.js').Pose} Pose */

/** A Bézier curve is followed as 10 straight segments between points taken at t = 0.1, 0.2, … (骨骼-8). */
const SEGMENTS = 10;

/**
 * The share of the way from a frame to the next at `percent` of the time between them (骨骼-8): linear, stepped (0), or
 * along the Bézier curve sampled at even t.
 * @param {import('./animation.js').Curve | undefined} curve @param {number} percent
 */
export function curvePercent(curve, percent) {
  if (!curve || curve.type === CURVE.LINEAR) return percent;
  if (curve.type === CURVE.STEPPED) return 0;
  const [cx1, cy1, cx2, cy2] = /** @type {number[]} */ (curve.c);
  let px = 0, py = 0;
  for (let i = 1; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS, u = 1 - t, x = 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t, y = 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t;
    if (x >= percent) return x === px ? y : py + ((y - py) * (percent - px)) / (x - px);
    px = x; py = y;
  }
  return py + ((1 - py) * (percent - px)) / (1 - px);
}

/**
 * The frame a time falls in and the curved share towards the next frame; null before the first frame (骨骼-8).
 * @param {Timeline['frames']} frames @param {number} time @returns {{ i: number, t: number } | null}
 */
export function frameAt(frames, time) {
  if (frames.length === 0 || time < frames[0].time) return null;
  if (time >= frames[frames.length - 1].time) return { i: frames.length - 1, t: 0 };
  let i = 0;
  while (frames[i + 1].time <= time) i++;
  const a = frames[i], b = frames[i + 1];
  return { i, t: curvePercent(a.curve, (time - a.time) / (b.time - a.time)) };
}

/** A frame's numeric values interpolated towards the next. @param {Timeline['frames']} frames @param {{ i: number, t: number }} at */
function lerpValues(frames, at) {
  const a = /** @type {number[]} */ (frames[at.i].values), next = frames[at.i + 1];
  if (!next) return a.slice();
  const b = /** @type {number[]} */ (next.values);
  return a.map((v, k) => v + (b[k] - v) * at.t);
}

/** An angle in degrees brought into [−180, 180] (骨骼-9). @param {number} d */
const wrap180 = (d) => d - 360 * Math.round(d / 360);

/** The four bone timelines (骨骼-9): rotate, translate, scale, shear, laid over the bone's setup values. */
const BONE = {
  /** @param {Pose} p @param {Skeleton} s @param {Timeline} tl @param {{ i: number, t: number }} at */
  rotate(p, s, tl, at) {
    const f = tl.frames, a = /** @type {number} */ (f[at.i].values[0]), next = f[at.i + 1];
    p.bones[tl.target].rotation = s.bones[tl.target].rotation + (next ? wrap180(a + wrap180(/** @type {number} */ (next.values[0]) - a) * at.t) : a);
  },
  /** @param {Pose} p @param {Skeleton} s @param {Timeline} tl @param {{ i: number, t: number }} at */
  translate(p, s, tl, at) {
    const [x, y] = lerpValues(tl.frames, at), d = s.bones[tl.target], b = p.bones[tl.target];
    b.x = d.x + x; b.y = d.y + y;
  },
  /** @param {Pose} p @param {Skeleton} s @param {Timeline} tl @param {{ i: number, t: number }} at */
  scale(p, s, tl, at) {
    const [x, y] = lerpValues(tl.frames, at), d = s.bones[tl.target], b = p.bones[tl.target];
    b.scaleX = d.scaleX * x; b.scaleY = d.scaleY * y;
  },
  /** @param {Pose} p @param {Skeleton} s @param {Timeline} tl @param {{ i: number, t: number }} at */
  shear(p, s, tl, at) {
    const [x, y] = lerpValues(tl.frames, at), d = s.bones[tl.target], b = p.bones[tl.target];
    b.shearX = d.shearX + x; b.shearY = d.shearY + y;
  },
};

/** The slot timelines (骨骼-9): attachment (the frame's, no blending), color, two-color. */
const SLOT = {
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  attachment(p, _s, tl, at) { p.slots[tl.target].attachment = /** @type {string | null} */ (tl.frames[at.i].values[0]); },
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  color(p, _s, tl, at) { p.slots[tl.target].color = clamp01(lerpColor(tl.frames, at, 0)); },
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  twoColor(p, _s, tl, at) {
    const slot = p.slots[tl.target];
    slot.color = clamp01(lerpColor(tl.frames, at, 0));
    slot.dark = clamp01(lerpColor(tl.frames, at, 1).slice(0, 3)).concat(1);
  },
};

/** The constraint timelines (骨骼-9): IK mix and softness (bend, compress and stretch from the frame), transform mixes, path position, spacing and mixes. */
const CONSTRAINT = {
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  ik(p, _s, tl, at) {
    const [mix, softness] = lerpValues(tl.frames, at), v = tl.frames[at.i].values;
    Object.assign(p.ik[tl.target], { mix, softness, bend: v[2], compress: v[3], stretch: v[4] });
  },
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  transform(p, _s, tl, at) {
    const [rotateMix, translateMix, scaleMix, shearMix] = lerpValues(tl.frames, at);
    Object.assign(p.transform[tl.target], { rotateMix, translateMix, scaleMix, shearMix });
  },
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  pathPosition(p, _s, tl, at) { p.path[tl.target].position = lerpValues(tl.frames, at)[0]; },
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  pathSpacing(p, _s, tl, at) { p.path[tl.target].spacing = lerpValues(tl.frames, at)[0]; },
  /** @param {Pose} p @param {Skeleton} _s @param {Timeline} tl @param {{ i: number, t: number }} at */
  pathMix(p, _s, tl, at) {
    const [rotateMix, translateMix] = lerpValues(tl.frames, at);
    Object.assign(p.path[tl.target], { rotateMix, translateMix });
  },
};

/** Every timeline kind but deform, by name. @type {Record<string, (p: Pose, s: Skeleton, tl: Timeline, at: { i: number, t: number }) => void>} */
const KINDS = { ...BONE, ...SLOT, ...CONSTRAINT };

/** A color's channels held to 0…1, as the runtimes' Color.set does: a curve may overshoot a key (骨骼-9). @param {number[]} c */
const clamp01 = (c) => c.map((v) => (v < 0 ? 0 : v > 1 ? 1 : v));

/** A frame's rgba8888 color (value k) towards the next. @param {Timeline['frames']} f @param {{ i: number, t: number }} at @param {number} k */
function lerpColor(f, at, k) {
  const a = rgba(/** @type {number} */ (f[at.i].values[k])), b = f[at.i + 1] ? rgba(/** @type {number} */ (f[at.i + 1].values[k])) : a;
  return a.map((v, c) => v + (b[c] - v) * at.t);
}

/**
 * The deform offsets of a frame (骨骼-9): the frame writes values from its first changed index; an unweighted mesh's are
 * added to its setup vertices; no values means the setup pose.
 * @param {number[]} values @param {number} length @param {number[] | null} setup the setup vertices of an unweighted attachment
 */
export function deformFrame(values, length, setup) {
  const out = setup ? setup.slice(0, length) : new Array(length).fill(0);
  if (values.length === 0) return out;
  const [start, ...vs] = values;
  vs.forEach((v, k) => { out[start + k] += v; });
  return out;
}

/**
 * The draw order after a draw order key (骨骼-9): each listed slot moves by its offset, the others keep their order.
 * @param {number[][]} offsets [slot, offset] pairs @param {number} count slots
 */
export function drawOrderOf(offsets, count) {
  const order = new Array(count).fill(-1), unchanged = [];
  let original = 0;
  for (const [slot, offset] of offsets) {
    while (original !== slot) unchanged.push(original++);
    order[original + offset] = original++;
  }
  while (original < count) unchanged.push(original++);
  for (let i = count - 1; i >= 0; i--) if (order[i] === -1) order[i] = /** @type {number} */ (unchanged.pop());
  return order;
}

/**
 * The attachment a deform timeline acts on, by skin, slot and key; a linked mesh has its parent's vertices.
 * @param {Skeleton} s @param {Timeline} tl
 */
function deformTarget(s, tl) {
  const skin = tl.skin ?? 0, found = findAttachment(s, skin, tl.target, /** @type {string} */ (tl.attachment));
  const att = found?.mesh ?? found?.attachment;
  if (!found || found.skin !== skin || !att?.vertices) return null;
  const vertices = /** @type {number[]} */ (att.vertices), weighted = att.weighted === true;
  return { length: weighted ? (vertices.length / 3) * 2 : vertices.length, setup: weighted ? null : vertices, key: deformKey(skin, /** @type {string} */ (tl.attachment)) };
}

/**
 * The pose of an animation at a time over the setup pose (骨骼-9): every timeline that has begun sets its value — with
 * the update order given, not those of an inactive bone, of a slot on one or of a constraint not in use, as the
 * runtimes skip them; a looping animation's time wraps at its duration. The pose's bones, slots and draw order must be
 * in the setup pose.
 * @param {Pose} p @param {Skeleton} s @param {Animation} anim @param {number} time
 * @param {boolean | { loop: boolean, order?: import('./order.js').Order | null }} how whether it loops; with an object, also the update order
 */
export function applyAnimation(p, s, anim, time, how) {
  const loop = typeof how === 'boolean' ? how : how.loop, order = typeof how === 'boolean' ? null : how.order ?? null;
  const t = loop && anim.duration > 0 ? time % anim.duration : time;
  for (const tl of anim.timelines) {
    if (order && !inUse(s, order, tl)) continue;
    const at = frameAt(tl.frames, t);
    if (!at) continue;
    if (Object.hasOwn(KINDS, tl.kind)) KINDS[tl.kind](p, s, tl, at);
    else if (tl.kind === 'deform') applyDeform(p, s, tl, at);
  }
  const key = anim.drawOrder.filter((k) => k.time <= t).at(-1);
  if (key) p.drawOrder = drawOrderOf(key.offsets, s.slots.length);
}

/** The constraint list a constraint timeline's kind acts on. @type {Record<string, 'ik' | 'transform' | 'path'>} */
const CONSTRAINT_OF = { ik: 'ik', transform: 'transform', pathPosition: 'path', pathSpacing: 'path', pathMix: 'path' };

/**
 * Whether a timeline acts in a pose updated in this order (骨骼-9): a bone's while the bone is active, a slot's while its
 * bone is, a constraint's while the constraint is in use.
 * @param {Skeleton} s @param {import('./order.js').Order} order @param {Timeline} tl
 */
function inUse(s, order, tl) {
  if (Object.hasOwn(BONE, tl.kind)) return order.active[tl.target];
  if (Object.hasOwn(CONSTRAINT_OF, tl.kind)) return order.constraints[CONSTRAINT_OF[tl.kind]][tl.target];
  return order.active[s.slots[tl.target].bone];
}

/** A deform timeline (骨骼-9): the frame's vertices towards the next's. @param {Pose} p @param {Skeleton} s @param {Timeline} tl @param {{ i: number, t: number }} at */
function applyDeform(p, s, tl, at) {
  const target = deformTarget(s, tl);
  if (!target) return;
  const a = deformFrame(/** @type {number[]} */ (tl.frames[at.i].values), target.length, target.setup), next = tl.frames[at.i + 1];
  const b = next ? deformFrame(/** @type {number[]} */ (next.values), target.length, target.setup) : null;
  p.slots[tl.target].deform[target.key] = b ? a.map((v, k) => v + (b[k] - v) * at.t) : a;
}

/**
 * The event keys passed from `from` to `to` in an animation (骨骼-9): those in (from, to]; a looping animation that
 * wrapped also passes the ones after `from` to its end and from its start.
 * @param {Animation} anim @param {number} from @param {number} to @param {boolean} loop
 */
export function eventsBetween(anim, from, to, loop) {
  const d = anim.duration;
  if (!loop || d <= 0 || Math.floor(from / d) === Math.floor(to / d)) {
    const a = loop && d > 0 ? from % d : from, b = loop && d > 0 ? a + (to - from) : to;
    return anim.events.filter((e) => e.time > a && e.time <= b);
  }
  const a = from % d, b = to % d;
  return [...anim.events.filter((e) => e.time > a), ...anim.events.filter((e) => e.time <= b)];
}
