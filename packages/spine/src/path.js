// Path constraints (docs/spec/spine.md 骨骼-15): bones placed along a path attachment's Bézier curves — at a position,
// spaced by length, a fixed distance or a share of the path — and turned along it (tangent, chain, or chain and
// scaled). Our own implementation of the Spine 3.8 semantics; no Spine runtime code.
import { DEG_RAD, wrapRad } from './math.js';
import { findAttachment, worldVertices } from './vertices.js';

/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./pose.js').Pose} Pose */
/** @typedef {Record<string, any>} Attachment */

/** Position, spacing and rotate modes, by their code in the file. */
export const PATH = Object.freeze({ FIXED: 0, PERCENT: 1, LENGTH: 0, SPACING_FIXED: 1, SPACING_PERCENT: 2, TANGENT: 0, CHAIN: 1, CHAIN_SCALE: 2 });

/**
 * A point and the angle there on a Bézier curve at t, written to out[o], out[o + 1] and (with `tangent`) out[o + 2].
 * @param {number} t @param {number[]} c x1, y1, cx1, cy1, cx2, cy2, x2, y2 @param {number[]} out @param {number} o @param {boolean} tangent
 */
function onCurve(t, c, out, o, tangent) {
  if (t === 0 || Number.isNaN(t)) t = 0.0001;
  const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = c, tt = t * t, ttt = tt * t, u = 1 - t, uu = u * u, uuu = uu * u;
  const ut = u * t, ut3 = ut * 3, uut3 = u * ut3, utt3 = ut3 * t;
  const x = x1 * uuu + cx1 * uut3 + cx2 * utt3 + x2 * ttt, y = y1 * uuu + cy1 * uut3 + cy2 * utt3 + y2 * ttt;
  out[o] = x;
  out[o + 1] = y;
  if (tangent) out[o + 2] = Math.atan2(y - (y1 * uu + cy1 * ut * 2 + cy2 * tt), x - (x1 * uu + cx1 * ut * 2 + cx2 * tt));
}

/**
 * A point beyond a path's start (d < 0) or end, along the line of its first or last two points.
 * @param {number} d @param {number[]} w the two points @param {number[]} out @param {number} o @param {boolean} after
 */
function beyond(d, w, out, o, after) {
  const x1 = after ? w[2] : w[0], y1 = after ? w[3] : w[1];
  const r = after ? Math.atan2(y1 - w[1], x1 - w[0]) : Math.atan2(w[3] - y1, w[2] - x1);
  out[o] = x1 + d * Math.cos(r);
  out[o + 1] = y1 + d * Math.sin(r);
  out[o + 2] = r;
}

/** Which of the cumulative lengths a distance falls in, and the share of the way through it. @param {number[]} lengths @param {number} d @param {number} from */
function inLengths(lengths, d, from) {
  let k = from;
  while (d > lengths[k]) k++;
  return { k, t: k === 0 ? d / lengths[0] : (d - lengths[k - 1]) / (lengths[k] - lengths[k - 1]) };
}

/**
 * The points along a path at the given spaces (骨骼-15), not at constant speed: the path's stored curve lengths are
 * used and each point is at its share of a curve's parameter.
 * @param {{ p: Pose, s: Skeleton, slot: number, a: Attachment, deform: number[] | undefined }} at @param {number[]} spaces
 * @param {number} position @param {{ tangents: boolean, percentPosition: boolean, percentSpacing: boolean }} o @returns {number[]}
 */
function storedSpeed(at, spaces, position, o) {
  const a = at.a, total = a.lengths.length;
  const closed = a.closed, curves = closed ? total : total - 1, pathLength = a.lengths[curves - 1], out = new Array(spaces.length * 3 + 2);
  const n = vertexNumbers(a), part = (/** @type {number} */ start, /** @type {number} */ count) => worldVertices(at, start, count);
  if (o.percentPosition) position *= pathLength;
  const sp = o.percentSpacing ? spaces.map((x) => x * pathLength) : spaces;
  // the world points of a curve (or of the two lines beyond the ends, −2 and −3), kept while the curve is the same
  const cache = { key: -1, w: /** @type {number[]} */ ([]) };
  const points = (/** @type {number} */ key) => {
    if (cache.key === key) return cache.w;
    cache.key = key;
    if (key < 0) cache.w = part(key === -2 ? 2 : n - 6, 4);
    else cache.w = closed && key === curves - 1 ? [...part(n - 4, 4), ...part(0, 4)] : part(key * 6 + 2, 8);
    return cache.w;
  };
  let curve = 0;
  for (let i = 0, k = 0; i < sp.length; i++, k += 3) {
    position += sp[i];
    let d = position;
    if (closed) { d %= pathLength; if (d < 0) d += pathLength; curve = 0; }
    else if (d < 0 || d > pathLength) {
      const after = d > pathLength;
      beyond(after ? d - pathLength : d, points(after ? -3 : -2), out, k, after);
      continue;
    }
    const f = inLengths(a.lengths, d, curve);
    curve = f.k;
    onCurve(f.t, points(curve), out, k, o.tangents || (i > 0 && sp[i] === 0));
  }
  return out;
}

/** The numbers (two a vertex) of a path attachment's vertices. @param {Attachment} a */
function vertexNumbers(a) {
  if (!a.weighted) return a.vertices.length;
  let n = 0;
  for (let i = 0; i < a.bones.length; i += a.bones[i] + 1) n += 2;
  return n;
}

/**
 * A curve's 10 cumulative segment lengths, by forward differences at t = 0.1 … 1.
 * @param {number[]} c x1, y1, cx1, cy1, cx2, cy2, x2, y2 @returns {number[]}
 */
function segmentsOf(c) {
  const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = c;
  const tmpx = (x1 - cx1 * 2 + cx2) * 0.03, tmpy = (y1 - cy1 * 2 + cy2) * 0.03;
  const dddfx = ((cx1 - cx2) * 3 - x1 + x2) * 0.006, dddfy = ((cy1 - cy2) * 3 - y1 + y2) * 0.006;
  let ddfx = tmpx * 2 + dddfx, ddfy = tmpy * 2 + dddfy, dfx = (cx1 - x1) * 0.3 + tmpx + dddfx * 0.16666667, dfy = (cy1 - y1) * 0.3 + tmpy + dddfy * 0.16666667;
  let length = Math.sqrt(dfx * dfx + dfy * dfy);
  const out = [length];
  for (let k = 1; k < 8; k++) {
    dfx += ddfx; dfy += ddfy; ddfx += dddfx; ddfy += dddfy;
    length += Math.sqrt(dfx * dfx + dfy * dfy);
    out.push(length);
  }
  dfx += ddfx; dfy += ddfy;
  length += Math.sqrt(dfx * dfx + dfy * dfy);
  out.push(length);
  dfx += ddfx + dddfx; dfy += ddfy + dddfy;
  length += Math.sqrt(dfx * dfx + dfy * dfy);
  out.push(length);
  return out;
}

/**
 * A running length plus a curve's length by four forward differences, as the path's lengths are measured.
 * @param {number[]} c x1, y1, cx1, cy1, cx2, cy2, x2, y2 @param {number} length so far
 */
function addCurveLength(c, length) {
  const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = c;
  const tmpx = (x1 - cx1 * 2 + cx2) * 0.1875, tmpy = (y1 - cy1 * 2 + cy2) * 0.1875;
  const dddfx = ((cx1 - cx2) * 3 - x1 + x2) * 0.09375, dddfy = ((cy1 - cy2) * 3 - y1 + y2) * 0.09375;
  let ddfx = tmpx * 2 + dddfx, ddfy = tmpy * 2 + dddfy, dfx = (cx1 - x1) * 0.75 + tmpx + dddfx * 0.16666667, dfy = (cy1 - y1) * 0.75 + tmpy + dddfy * 0.16666667;
  length += Math.sqrt(dfx * dfx + dfy * dfy);
  dfx += ddfx; dfy += ddfy; ddfx += dddfx; ddfy += dddfy;
  length += Math.sqrt(dfx * dfx + dfy * dfy);
  dfx += ddfx; dfy += ddfy;
  length += Math.sqrt(dfx * dfx + dfy * dfy);
  dfx += ddfx + dddfx; dfy += ddfy + dddfy;
  return length + Math.sqrt(dfx * dfx + dfy * dfy);
}

/**
 * The points along a path at the given spaces at constant speed (骨骼-15): the curves are measured in the world, and
 * each point is placed by distance along its curve's ten segments.
 * @param {{ p: Pose, s: Skeleton, slot: number, a: Attachment, deform: number[] | undefined }} at @param {number[]} spaces
 * @param {number} position @param {{ tangents: boolean, percentPosition: boolean, percentSpacing: boolean }} o @returns {number[]}
 */
function constantSpeed(at, spaces, position, o) {
  const a = at.a, closed = a.closed, n = vertexNumbers(a), out = new Array(spaces.length * 3 + 2);
  const part = (/** @type {number} */ start, /** @type {number} */ count) => worldVertices(at, start, count);
  const w = closed ? [...part(2, n - 2), ...part(0, 2)] : part(2, n - 4);
  if (closed) w.push(w[0], w[1]);
  const curves = closed ? n / 6 : n / 6 - 1, lengths = [];
  let pathLength = 0;
  for (let i = 0; i < curves; i++) lengths.push(pathLength = addCurveLength(w.slice(i * 6, i * 6 + 8), pathLength));
  if (o.percentPosition) position *= pathLength;
  const sp = o.percentSpacing ? spaces.map((x) => x * pathLength) : spaces;
  let prev = -1, curve = 0, segment = 0, segments = /** @type {number[]} */ ([]), c = /** @type {number[]} */ ([]);
  for (let i = 0, k = 0; i < sp.length; i++, k += 3) {
    position += sp[i];
    let d = position;
    if (closed) { d %= pathLength; if (d < 0) d += pathLength; curve = 0; }
    else if (d < 0) { beyond(d, w, out, k, false); continue; }
    else if (d > pathLength) { beyond(d - pathLength, w.slice(w.length - 4), out, k, true); continue; }
    const f = inLengths(lengths, d, curve);
    curve = f.k;
    if (curve !== prev) { prev = curve; c = w.slice(curve * 6, curve * 6 + 8); segments = segmentsOf(c); segment = 0; }
    const g = inLengths(segments, f.t * segments[9], segment);
    segment = g.k;
    onCurve((g.k + g.t) * 0.1, c, out, k, o.tangents || (i > 0 && sp[i] === 0));
  }
  return out;
}

/**
 * The spaces between the constrained bones (骨骼-15): by each bone's world length (length spacing: its setup length
 * plus the spacing; chain scale also keeps the lengths), else the spacing; the first is 0.
 * @param {Pose} p @param {Skeleton} s @param {Skeleton['constraints']['path'][number]} c @param {number} spacing @param {number} count
 */
function spacesOf(p, s, c, spacing, count) {
  const byLength = c.spacing === PATH.LENGTH, scale = c.rotate === PATH.CHAIN_SCALE, spaces = new Array(count).fill(0), lengths = /** @type {number[]} */ ([]);
  if (!scale && !byLength) { for (let i = 1; i < count; i++) spaces[i] = spacing; return { spaces, lengths }; }
  for (let i = 0; i < count - 1; i++) {
    const setup = s.bones[c.bones[i]].length, b = p.bones[c.bones[i]];
    if (setup < 0.00001) { lengths.push(0); spaces[i + 1] = 0; continue; }
    const x = setup * b.a, y = setup * b.c, length = Math.sqrt(x * x + y * y);
    lengths.push(length);
    spaces[i + 1] = ((byLength ? setup + spacing : spacing) * length) / setup;
  }
  return { spaces, lengths };
}

/** A path constraint of a pose applied (骨骼-15). @param {Pose} p @param {Skeleton} s @param {number} index @param {number | null} skin the named skin in use */
export function applyPath(p, s, index, skin) {
  const c = s.constraints.path[index], m = p.path[index], key = p.slots[c.target].attachment;
  const found = key === null ? null : findAttachment(s, skin, c.target, key);
  if (!found || found.attachment.type !== 'path' || (!(m.translateMix > 0) && !(m.rotateMix > 0))) return;
  const tangents = c.rotate === PATH.TANGENT, count = tangents ? c.bones.length : c.bones.length + 1;
  const { spaces, lengths } = spacesOf(p, s, c, m.spacing, count);
  const at = { p, s, slot: c.target, a: found.attachment, deform: p.slots[c.target].deform[found.deformKey] };
  const o = { tangents, percentPosition: c.position === PATH.PERCENT, percentSpacing: c.spacing === PATH.SPACING_PERCENT };
  const positions = (found.attachment.constantSpeed ? constantSpeed : storedSpeed)(at, spaces, m.position, o);
  placeAlong(p, s, c, { m, positions, spaces, lengths });
}

/**
 * Each bone moved to its point and, with a rotate mix, turned along the path (骨骼-15): to the tangent, or towards the
 * next point (its own angle where the next space is 0); chain with no offset rotation also moves the next point to the
 * turned bone's tip; chain scale stretches each bone to reach the next point.
 * @param {Pose} p @param {Skeleton} s @param {Skeleton['constraints']['path'][number]} c
 * @param {{ m: import('./pose.js').PosePath, positions: number[], spaces: number[], lengths: number[] }} k
 */
function placeAlong(p, s, c, k) {
  const { m, positions, spaces, lengths } = k, tangents = c.rotate === PATH.TANGENT, scale = c.rotate === PATH.CHAIN_SCALE;
  const tb = p.bones[s.slots[c.target].bone], tip = c.offsetRotation === 0 && c.rotate === PATH.CHAIN;
  const offset = c.offsetRotation === 0 ? 0 : c.offsetRotation * (tb.a * tb.d - tb.b * tb.c > 0 ? DEG_RAD : -DEG_RAD);
  let bx = positions[0], by = positions[1];
  for (let i = 0, q = 3; i < c.bones.length; i++, q += 3) {
    const b = p.bones[c.bones[i]];
    b.worldX += (bx - b.worldX) * m.translateMix;
    b.worldY += (by - b.worldY) * m.translateMix;
    const x = positions[q], y = positions[q + 1], dx = x - bx, dy = y - by;
    if (scale && lengths[i] !== 0) {
      const f = (Math.sqrt(dx * dx + dy * dy) / lengths[i] - 1) * m.rotateMix + 1;
      b.a *= f; b.c *= f;
    }
    bx = x; by = y;
    if (m.rotateMix > 0) {
      const { a, b: bb, c: cc, d } = b;
      let r = (tangents ? positions[q - 1] : spaces[i + 1] === 0 ? positions[q + 2] : Math.atan2(dy, dx)) - Math.atan2(cc, a);
      if (tip) {
        const cos = Math.cos(r), sin = Math.sin(r), length = s.bones[c.bones[i]].length;
        bx += (length * (cos * a - sin * cc) - dx) * m.rotateMix;
        by += (length * (sin * a + cos * cc) - dy) * m.rotateMix;
      } else r += offset;
      r = wrapRad(r) * m.rotateMix;
      const cos = Math.cos(r), sin = Math.sin(r);
      b.a = cos * a - sin * cc; b.b = cos * bb - sin * d;
      b.c = sin * a + cos * cc; b.d = sin * bb + cos * d;
    }
    b.valid = false;
  }
}
