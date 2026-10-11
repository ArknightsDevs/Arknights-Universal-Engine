// Clipping (docs/spec/spine.md 骨骼-17): a clipping attachment's polygon cut into triangles, and each drawn triangle
// cut to the parts inside it, with UVs and colors carried over. Our own implementation; no Spine runtime code.

/** Twice the signed area of a polygon (x, y pairs); positive when counter-clockwise. @param {number[]} v */
export function signedArea(v) {
  let a = 0;
  for (let i = 0, n = v.length; i < n; i += 2) {
    const j = (i + 2) % n;
    a += v[i] * v[j + 1] - v[j] * v[i + 1];
  }
  return a;
}

/** Whether point p is inside or on triangle abc, all counter-clockwise. @param {number[]} p @param {number[]} a @param {number[]} b @param {number[]} c */
function inTriangle(p, a, b, c) {
  const cross = (/** @type {number[]} */ o, /** @type {number[]} */ q, /** @type {number[]} */ r) => (q[0] - o[0]) * (r[1] - o[1]) - (q[1] - o[1]) * (r[0] - o[0]);
  return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
}

/**
 * A simple polygon cut into triangles by ear clipping, each counter-clockwise (骨骼-17). Degenerate leftovers are
 * dropped.
 * @param {number[]} polygon x, y pairs @returns {number[][]} triangles of x, y pairs
 */
export function triangulate(polygon) {
  const ccw = signedArea(polygon) >= 0, pts = [];
  for (let i = 0; i < polygon.length; i += 2) pts.push([polygon[i], polygon[i + 1]]);
  if (!ccw) pts.reverse();
  const out = [];
  while (pts.length > 3) {
    const n = pts.length;
    let cut = -1;
    for (let i = 0; i < n && cut < 0; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0) continue;
      if (!pts.some((q, k) => k !== i && k !== (i + n - 1) % n && k !== (i + 1) % n && inTriangle(q, a, b, c))) cut = i;
    }
    if (cut < 0) cut = 0;
    out.push([...pts[(cut + n - 1) % n], ...pts[cut], ...pts[(cut + 1) % n]]);
    pts.splice(cut, 1);
  }
  if (pts.length === 3 && signedArea(pts.flat()) > 0) out.push(pts.flat());
  return out;
}

/**
 * A convex polygon cut by a counter-clockwise convex polygon (Sutherland–Hodgman): the points inside, with the
 * barycentric weights of each against the triangle it came from.
 * @param {number[][]} poly points [x, y, w1, w2, w3] @param {number[]} clip x, y pairs, counter-clockwise @returns {number[][]}
 */
export function cutConvex(poly, clip) {
  let out = poly;
  for (let i = 0; i < clip.length && out.length > 0; i += 2) {
    const ax = clip[i], ay = clip[i + 1], bx = clip[(i + 2) % clip.length], by = clip[(i + 3) % clip.length];
    const side = (/** @type {number[]} */ p) => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k], q = input[(k + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push(p.map((v, j) => v + (q[j] - v) * t));
      }
    }
  }
  return out;
}
