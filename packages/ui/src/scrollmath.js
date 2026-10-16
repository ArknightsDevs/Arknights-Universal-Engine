// A scroll view's motion (docs/spec/ui.md 界面-27), after Unity's ScrollRect: the offsets its content may take, the
// rubber band while dragging past them, the spring back, inertia, clamping; a scroll bar's handle; the pages of a pager.
// Offsets are in reference pixels along each axis, up and right positive, 0 where the prefab puts the content.

/** Movement types. */
export const UNRESTRICTED = 0, ELASTIC = 1, CLAMPED = 2;

/**
 * Unity's Mathf.SmoothDamp: a value moving to a target as a critically damped spring of `smooth` seconds.
 * @param {number} cur @param {number} target @param {number} vel @param {number} smooth @param {number} dt
 * @returns {[number, number]} the value and the velocity
 */
export function smoothDamp(cur, target, vel, smooth, dt) {
  const omega = 2 / Math.max(1e-4, smooth), x = omega * dt, exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, temp = (vel + omega * change) * dt;
  let v = (vel - omega * temp) * exp, out = target + (change + temp) * exp;
  if (target - cur > 0 === out > target) { out = target; v = 0; }
  return [out, v];
}

/**
 * The offsets an axis allows: the content may not leave the viewport's edge inside; a content smaller than the
 * viewport counts as the viewport's size around its pivot.
 * @param {number} m0 the content's low edge from the viewport's low edge at offset 0 @param {number} C the content's size
 * @param {number} V the viewport's size @param {number} pivot the content's pivot on the axis @returns {[number, number]}
 */
export function range(m0, C, V, pivot) {
  const E = Math.max(C, V), p = C < V ? (V - C) * pivot : 0;
  return [V - E + p - m0, p - m0];
}

/** How far an offset must move to be allowed (0 when it is). @param {number} o @param {readonly number[]} r */
export const outOf = (o, r) => (o < r[0] ? r[0] - o : o > r[1] ? r[1] - o : 0);

/** Unity's rubber band: how far a drag that went `over` past the edge shows past it. @param {number} over @param {number} view */
export const rubber = (over, view) => (1 - 1 / ((Math.abs(over) * 0.55) / Math.max(1e-6, view) + 1)) * view * Math.sign(over);

/**
 * A dragged offset: the drag's own offset, brought inside and then let past the edge by the rubber band when elastic,
 * kept inside when clamped.
 * @param {number} raw @param {readonly number[]} r @param {number} view @param {number} move
 */
export function dragged(raw, r, view, move) {
  if (move === UNRESTRICTED) return raw;
  const d = outOf(raw, r), inside = raw + d;
  return move === ELASTIC && d !== 0 ? inside - rubber(d, view) : inside;
}

/**
 * One frame of an axis not being dragged: past the edge an elastic view springs back over its elasticity; else
 * inertia carries it, the speed falling to the deceleration rate's share each second and stopping below 1 a second; a
 * clamped view stays inside.
 * @param {{ off: number, vel: number }} a @param {readonly number[]} r
 * @param {{ move: number, elasticity: number, inertia: number, decel: number }} o @param {number} dt
 */
export function settle(a, r, o, dt) {
  const d = outOf(a.off, r);
  if (o.move === ELASTIC && d !== 0) {
    [a.off, a.vel] = smoothDamp(a.off, a.off + d, a.vel, o.elasticity, dt);
    if (Math.abs(a.vel) < 1) a.vel = 0;
  } else if (o.inertia) {
    a.vel *= o.decel ** dt;
    if (Math.abs(a.vel) < 1) a.vel = 0;
    a.off += a.vel * dt;
  } else a.vel = 0;
  if (o.move === CLAMPED) a.off += outOf(a.off, r);
}

/**
 * The normalized position of an axis (0 at the low end, 1 at the high end of the content).
 * @param {number} off @param {number} m0 @param {number} C @param {number} V
 */
export const normalized = (off, m0, C, V) => (C > V ? Math.max(0, Math.min(1, -(m0 + off) / (C - V))) : 0);

/**
 * A scroll bar's handle anchors on its axis for a value and a size (Unity's Scrollbar): from the start, or from the
 * far end when reversed. @param {number} value @param {number} size @param {boolean} reverse @returns {[number, number]}
 */
export function handleSpan(value, size, reverse) {
  const sz = Math.max(0, Math.min(1, size)), move = Math.max(0, Math.min(1, value)) * (1 - sz);
  return reverse ? [1 - move - sz, 1 - move] : [move, move + sz];
}

/**
 * The page a pager settles on: the nearest page to the offset, one further when it was let go moving that way.
 * @param {number} off @param {readonly number[]} r the axis's offsets @param {number} V the page's size @param {number} vel
 * @returns {number} the page's offset
 */
export function pageOf(off, r, V, vel) {
  const pages = Math.max(1, Math.round((r[1] - r[0]) / Math.max(1e-6, V)) + 1);
  let i = Math.round((r[1] - off) / Math.max(1e-6, V));
  if (Math.abs(vel) > 200) i = Math.floor((r[1] - off) / V) + (vel < 0 ? 1 : 0);
  i = Math.max(0, Math.min(pages - 1, i));
  return Math.max(r[0], r[1] - i * V);
}
