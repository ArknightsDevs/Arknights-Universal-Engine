// The values an effect's data describes (docs/spec/render.md 渲染-10): Unity's curves (MinMaxCurve: a constant, a curve,
// between two curves, between two constants; keys are Hermite segments, an infinite slope holds the value), gradients
// and start colours, the renderers' animation tracks (sampled frames), texture tilings and scrolls, Euler angles, and
// a smooth value noise for the noise module (Unity's own field is not published).

/** @typedef {[number, number, number, number]} Key time, value, in slope, out slope */
/** @typedef {{ st: number, sc: number, mn?: number, cx?: Key[], cn?: Key[] }} MinMax */
/** @typedef {{ c: number[][], a: number[][] }} Gradient colour keys [r, g, b, t], alpha keys [a, t] */
/** @typedef {[number, number, number, number, number, number, number, number, number]} Mat3 row-major */

export const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;
export const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => Math.max(a, Math.min(b, v));

/** One Hermite segment's value; an infinite slope (≥ 1e29) holds the start. */
function hermite(/** @type {number[]} */ [t0, v0, , o0], /** @type {number[]} */ [t1, v1, i1], /** @type {number} */ t) {
  const dt = t1 - t0, u = (t - t0) / dt;
  if (Math.abs(o0) >= 1e29 || Math.abs(i1) >= 1e29) return v0;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * dt * o0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * dt * i1;
}

/** A curve's value at t (held before the first key and after the last); null without keys. @param {Key[] | undefined} keys @param {number} t */
export function evalKeys(keys, t) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  return hermite(keys[i], keys[i + 1], t);
}

/** A MinMaxCurve at t with a random r in [0, 1). @param {MinMax | undefined} m @param {number} t @param {number} r */
export function mm(m, t, r) {
  if (!m) return 0;
  switch (m.st) {
    case 0: return m.sc;
    case 1: return (m.cx && m.cx.length ? /** @type {number} */ (evalKeys(m.cx, t)) : 1) * m.sc;
    case 2: return lerp(evalKeys(m.cn, t) ?? 0, evalKeys(m.cx, t) ?? 0, r) * m.sc;
    case 3: return lerp(m.mn ?? 0, m.sc, r);
    default: return m.sc || 0;
  }
}

/** The smallest value a MinMaxCurve takes (a constant pair's smaller end). @param {MinMax | undefined} m */
export const mmLow = (m) => (m ? (m.st === 3 ? Math.min(m.mn ?? 0, m.sc) : m.sc) : 0);

/** @param {number[][]} keys @param {number} t @param {number} at the time's index in a key @param {number} n values a key */
function keyed(keys, t, at, n) {
  const last = keys[keys.length - 1];
  if (t >= last[at]) return last.slice(0, n);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a[at] && t <= b[at]) { const u = b[at] > a[at] ? (t - a[at]) / (b[at] - a[at]) : 0; return a.slice(0, n).map((v, k) => lerp(v, b[k], u)); }
  }
  return keys[0].slice(0, n);
}

/** A gradient's colour at t: [r, g, b, a]; white without one. @param {Gradient | undefined} g @param {number} t */
export function grad(g, t) {
  if (!g) return [1, 1, 1, 1];
  return [...keyed(g.c, t, 3, 3), keyed(g.a, t, 1, 1)[0]];
}

/**
 * A particle's start colour (MinMaxGradient): a gradient over the system's loop, two colours, two gradients, a random
 * point of a gradient, or a colour. @param {any} m @param {number} tn @param {number} r @returns {number[]}
 */
export function startColor(m, tn, r) {
  if (!m) return [1, 1, 1, 1];
  switch (m.st) {
    case 1: return grad(m.gmax, tn);
    case 2: return m.cmin.map((/** @type {number} */ v, /** @type {number} */ i) => lerp(v, m.cmax[i], r));
    case 3: { const a = grad(m.gmin, tn), b = grad(m.gmax, tn); return a.map((v, i) => lerp(v, b[i], r)); }
    case 4: return grad(m.gmax, r);
    default: return m.cmax.slice();
  }
}

/** A track's frames around t: [i, j, w] (n frames over L seconds, looping or held at the end). @param {any} an @param {number} t */
export function trackAt(an, t) {
  const L = an.L || 1e-3, x = an.loop ? ((t % L) + L) % L : clamp(t, 0, L), f = (x / L) * (an.n - 1), i = Math.min(an.n - 1, Math.floor(f));
  return [i, Math.min(an.n - 1, i + 1), f - i];
}

/** k values of a track between two frames. @param {number[]} a @param {number} k @param {number[]} at */
export function trackValue(a, k, at) {
  const [i, j, w] = at, o = new Array(k);
  for (let c = 0; c < k; c++) o[c] = a[i * k + c] + (a[j * k + c] - a[i * k + c]) * w;
  return o;
}

/**
 * A renderer's values before its animation: place (pos, M, scl), shown, tint, tilings (main, dissolve, distortion),
 * dissolve amount and border, distortion strength, a trail's width. @param {any} d
 */
export function current(d) {
  return { pos: d.pos || [0, 0, 0], M: d.M || [1, 0, 0, 0, 1, 0, 0, 0, 1], scl: d.scl || [1, 1, 1], on: 1, tint: d.tint || [1, 1, 1, 1],
    ust: d.uvst || [1, 1, 0, 0], dst: d.diss ? d.diss.st : [1, 1, 0, 0], xst: d.dist ? d.dist.st : [1, 1, 0, 0],
    amt: d.diss ? d.diss.amount : 0, bw: d.diss ? d.diss.border : 0.1, xi: d.dist ? d.dist.I : [0, 0], wid: d.width ?? 1 };
}

/** The values a renderer's animation tracks give at time t (渲染-10). @param {ReturnType<typeof current>} cur @param {any} an @param {number} t */
export function animate(cur, an, t) {
  if (!an) return;
  const at = trackAt(an, t);
  if (an.tr) { const f = trackValue(an.tr, 15, at); cur.pos = f.slice(0, 3); cur.M = f.slice(3, 12); cur.scl = f.slice(12, 15); }
  if (an.on) cur.on = an.on[at[2] > 0.999 ? at[1] : at[0]];
  /** @type {[string, string, number][]} */
  const vec = [['tint', 'tint', 4], ['ust', 'ust', 4], ['dst', 'dst', 4], ['xst', 'xst', 4], ['xi', 'xi', 2]];
  for (const [k, c, n] of vec) if (an[k]) /** @type {any} */ (cur)[c] = trackValue(an[k], n, at);
  for (const k of ['amt', 'bw', 'wid']) if (an[k]) /** @type {any} */ (cur)[k] = trackValue(an[k], 1, at)[0];
}

/**
 * The textures' scroll at time t: main u v, dissolve u v, distortion u v (the material's speeds, wrapped; a tween over
 * its time, repeating or held). @param {any} d @param {number} t
 */
export function scroll(d, t) {
  const s = d.uvspd || [0, 0, 0, 0], x = (d.dist && d.dist.spd) || [0, 0], fr = (/** @type {number} */ v) => v - Math.floor(v);
  const o = [fr(s[0] * t), fr(s[1] * t), fr(s[2] * t), fr(s[3] * t), fr(x[0] * t), fr(x[1] * t)];
  if (d.tw) { const k = d.tw.rep ? t % d.tw.T : Math.min(t, d.tw.T); for (let i = 0; i < 6; i++) o[i] += d.tw.s[i] * k; }
  return o;
}

/** @typedef {{ st: number[], off: number[], R?: number[] | null, sc: number[] }} UvWay a tiling, an offset, a rotation, a scroll */

/**
 * A texture coordinate (v up) through a tiling [sx, sy, ox, oy], an extra offset, a rotation about the centre
 * (R = [x, y, z, w]: u' = (x, z)·uv, v' = (y, w)·uv) and a scroll, into out[o], out[o + 1].
 * @param {number[]} uv @param {UvWay} w @param {number[]} out @param {number} o
 */
export function uvThrough(uv, w, out, o) {
  const { st, off, R, sc } = w;
  let x = uv[0] * st[0] + st[2] + off[0], y = uv[1] * st[1] + st[3] + off[1];
  if (R) { const a = x - 0.5, b = y - 0.5; x = a * R[0] + b * R[2] + 0.5; y = a * R[1] + b * R[3] + 0.5; }
  out[o] = x + sc[0]; out[o + 1] = y + sc[1];
}

/**
 * A vertex's four coordinates into o.out[0..7]: main, dissolve, distortion, weight / multiply (c1: custom data's main
 * and dissolve offsets, cx: the distortion's). @param {any} d @param {ReturnType<typeof current>} cur @param {number[]} sc
 * @param {number[]} uv @param {{ c1?: number[] | null, cx?: number[] | null, out: number[] }} o
 */
export function uvs(d, cur, sc, uv, o) {
  const R = d.uvrot, A = (d.dist && d.dist.wst) || (d.mul && d.mul.st), { c1, cx, out } = o;
  uvThrough(uv, { st: cur.ust, off: c1 ? [c1[0], c1[1]] : [0, 0], R: R && R[0], sc: [sc[0], sc[1]] }, out, 0);
  if (d.diss) uvThrough(uv, { st: cur.dst, off: c1 ? [c1[2], c1[3]] : [0, 0], R: R && R[1], sc: [sc[2], sc[3]] }, out, 2);
  if (d.dist) uvThrough(uv, { st: cur.xst, off: cx ? [cx[0], cx[1]] : [0, 0], R: R && R[3], sc: [sc[4], sc[5]] }, out, 4);
  if (A) uvThrough(uv, { st: A, off: [0, 0], R: R && R[2], sc: [0, 0] }, out, 6);
  return out;
}

/** Unity's Euler angles (degrees; z, then x, then y) as a row-major matrix. @param {number[]} r @returns {Mat3} */
export function euler(r) {
  const [x, y, z] = r.map((a) => (a * Math.PI) / 180), cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx, cx * sz, cx * cz, -sx, -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx];
}

/** M·v. @param {number[]} M @param {number[]} v @returns {number[]} */
export const rot = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
/** Mᵀ·v. @param {number[]} M @param {number[]} v @returns {number[]} */
export const rotT = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];

/** A random unit vector. @param {() => number} rand */
export function unitVector(rand) {
  const z = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}

const PERM = (() => {
  const p = new Uint8Array(512);
  let s = 20240611;
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1), t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 256; i++) p[256 + i] = p[i];
  return p;
})();

/** Smooth value noise in [−1, 1] (a fixed lattice). @param {number} x @param {number} y @param {number} z */
export function noise3(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ k) => PERM[(PERM[(PERM[(X + i) & 255] + Y + j) & 255] + Z + k) & 255] / 127.5 - 1;
  const at = (/** @type {number} */ k) => lerp(lerp(h(0, 0, k), h(1, 0, k), u), lerp(h(0, 1, k), h(1, 1, k), u), v);
  return lerp(at(0), at(1), w);
}
