// Scroll views on the page (docs/spec/ui.md 界面-27): a node with a scroll view drags, wheels and coasts its content
// inside its viewport (scrollmath.js), sets its scroll bars, hides its drag parts when the content fits, and a pager
// settles on a page when let go. A tap that turned into a drag is not a tap.
import { refNode } from './node.js';
import { CLAMPED, dragged, handleSpan, normalized, outOf, pageOf, range, settle } from './scrollmath.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/**
 * A scroll view's state: its parts, each axis's offset and speed, the drag (pointer start, offsets at its start,
 * whether it moved far enough to be one), whether the last tap was a drag, the page it settles on.
 * @typedef {{ s: UiNode, view: UiNode, content: UiNode, base: number[], ax: { off: number, vel: number }[], prev: number[],
 *   drag: { x: number, y: number, off: number[], on: boolean } | null, wasDrag: boolean, snap: { from: number, to: number, t: number } | null,
 *   geo: { m0: number, C: number, V: number, r: [number, number] }[] | null }} View
 */

/** Pointer moves (CSS pixels) a drag needs before it starts, like Unity's event system. */
export const DRAG_START = 10;

/** A node's box in its screen: the boxes added up the tree (without transforms). @param {UiNode} s */
function screenBox(s) {
  let x = 0, y = 0;
  for (let n = /** @type {UiNode | null} */ (s); n; n = n.parent) { x += n.box?.[0] ?? 0; y += n.box?.[1] ?? 0; }
  return [x, y];
}

/**
 * A node's box relative to another's: its viewport's, which need not hold it (a content beside its viewport, as the
 * game's operator list has it). @param {UiNode} s @param {UiNode} top
 */
function relBox(s, top) {
  const a = screenBox(s), b = screenBox(top);
  return [a[0] - b[0], a[1] - b[1]];
}

/**
 * Each axis's geometry from the last layout: the content's low edge at offset 0, its size, the viewport's size, the
 * offsets allowed (up and right positive). @param {View} v
 */
function geometry(v) {
  const { view, content } = v;
  if (!view.box || !content.box) return null;
  const [cx, cy] = relBox(content, view), C = [content.w, content.h], V = [view.w, view.h];
  // the last layout placed the content at the offsets of the last frame
  const m0 = [cx - v.prev[0], V[1] - (cy + v.prev[1]) - C[1]];
  return [0, 1].map((a) => ({ m0: m0[a], C: C[a], V: V[a], r: range(m0[a], C[a], V[a], content.rt.pivot[a]) }));
}

/** The axes a view scrolls on. @param {View} v */
const axesOf = (v) => [v.s.n.comps.scroll.h ? 0 : -1, v.s.n.comps.scroll.v ? 1 : -1].filter((a) => a >= 0);

/** Whether a view's content is larger than its viewport on an axis it scrolls on. @param {View} v */
const canDrag = (v) => { const g = v.geo; return !!g && axesOf(v).some((a) => g[a].C > g[a].V + 0.5); };

/** A drag started on the view (a pointer down). @param {View} v @param {PointerEvent} e */
function down(v, e) {
  if (v.s.n.comps.dragFit && !canDrag(v)) return;
  v.drag = { x: e.clientX, y: e.clientY, off: v.ax.map((a) => a.off), on: false };
  v.snap = null;
}

/**
 * The pointer moved: past the start distance the drag moves the content (rubber band, clamping). The view takes the
 * pointer only then: a captured pointer's click goes to the view, so a press that does not drag still reaches the
 * buttons in it.
 * @param {View} v @param {PointerEvent} e
 */
function move(v, e) {
  const d = v.drag;
  if (!d) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (!d.on && Math.hypot(dx, dy) < DRAG_START) return;
  if (!d.on) /** @type {any} */ (v.s.el).setPointerCapture?.(e.pointerId);
  d.on = true;
  const k = v.s.scr.ctx.k ?? 1, sc = v.s.n.comps.scroll, raw = [d.off[0] + dx / k, d.off[1] - dy / k];
  for (const a of axesOf(v)) v.ax[a].off = v.geo ? dragged(raw[a], v.geo[a].r, v.geo[a].V, sc.move) : raw[a];
}

/** The pointer let go: a pager settles on a page. @param {View} v */
function up(v) {
  const d = v.drag;
  v.drag = null;
  if (!d?.on) return;
  v.wasDrag = true;
  const pg = v.s.n.comps.pager, a = axesOf(v)[0];
  if (pg && v.geo && a != null) v.snap = { from: v.ax[a].off, to: pageOf(v.ax[a].off, v.geo[a].r, v.geo[a].V, v.ax[a].vel), t: 0 };
}

/** The wheel scrolls the view along its axis, its sensitivity per reference pixel. @param {View} v @param {WheelEvent} e */
function wheel(v, e) {
  const sc = v.s.n.comps.scroll, k = v.s.scr.ctx.k ?? 1, a = axesOf(v);
  if (!a.length || !canDrag(v)) return;
  const delta = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) / k * (sc.sens ?? 1);
  const ax = a.length === 1 ? a[0] : 1, step = ax === 0 ? -delta : delta;
  v.ax[ax].off += step;
  if (sc.move === CLAMPED && v.geo) v.ax[ax].off += outOf(v.ax[ax].off, v.geo[ax].r);
  e.preventDefault?.();
}

/** The scroll bars, the drag parts and the arrows of a view (界面-27). @param {View} v */
function parts(v) {
  const s = v.s, sc = s.n.comps.scroll, g = v.geo;
  if (!g) return;
  for (const [a, ref, vis] of /** @type {[number, string, number][]} */ ([[0, sc.hbar, sc.hvis], [1, sc.vbar, sc.vvis]])) {
    const bar = ref ? refNode(s, ref) : null;
    if (!bar) continue;
    if (vis) bar.active = g[a].C > g[a].V + 0.5;
    setBar(bar, normalized(v.ax[a].off, g[a].m0, g[a].C, g[a].V), g[a].C > 0 ? g[a].V / g[a].C : 1);
  }
  const fit = s.n.comps.dragFit;
  if (!fit) return;
  const hide = fit.hide ? refNode(s, fit.hide) : null, can = canDrag(v), ar = fit.arrows ?? {};
  if (hide) hide.active = can;
  /** @param {string | null} ref @param {boolean} on */
  const arrow = (ref, on) => { const n = ref ? refNode(s, ref) : null; if (n) n.active = can && on; };
  arrow(ar.top, v.ax[1].off > g[1].r[0] + 1); arrow(ar.down, v.ax[1].off < g[1].r[1] - 1);
  arrow(ar.left, v.ax[0].off < g[0].r[1] - 1); arrow(ar.right, v.ax[0].off > g[0].r[0] + 1);
}

/**
 * A scroll bar showing a value and a size (界面-27): its handle's anchors along its direction.
 * @param {UiNode} bar @param {number} value @param {number} size
 */
export function setBar(bar, value, size) {
  const sb = bar.n.comps.scrollbar, handle = sb ? refNode(bar, sb.handle) : null;
  if (!sb || !handle) return;
  const ax = sb.dir < 2 ? 0 : 1, [lo, hi] = handleSpan(value, size, sb.dir === 1 || sb.dir === 3);
  handle.rt.amin = ax === 0 ? [lo, 0] : [0, lo]; handle.rt.amax = ax === 0 ? [hi, 1] : [1, hi];
}

/** One frame of a view: its geometry, its drag's speed, coasting or springing back, a pager's settling; the content placed. @param {View} v @param {number} dt */
function step(v, dt) {
  if (v.s.gone || v.content.gone) return false;
  v.geo = geometry(v);
  const sc = v.s.n.comps.scroll, pg = v.s.n.comps.pager;
  for (const a of axesOf(v)) {
    const ax = v.ax[a];
    if (v.drag) { if (dt > 0) ax.vel += ((ax.off - v.prev[a]) / dt - ax.vel) * Math.min(1, dt * 10); }
    else if (v.snap) {
      v.snap.t = Math.min(1, v.snap.t + dt / Math.max(1e-3, pg?.time ?? 0.3));
      const u = 1 - (1 - v.snap.t) ** 2;
      ax.off = v.snap.from + (v.snap.to - v.snap.from) * u; ax.vel = 0;
      if (v.snap.t >= 1) v.snap = null;
    } else if (v.geo) settle(ax, v.geo[a].r, sc, dt);
    v.prev[a] = ax.off;
    v.content.rt.pos[a] = v.base[a] + ax.off;
  }
  parts(v);
  return true;
}

/** Each node's scroll view. @type {WeakMap<UiNode, View>} */
const views = new WeakMap();

/** A scroll view's offsets on each axis (界面-27; up and right positive), [0, 0] for a node without one. @param {UiNode} s @returns {[number, number]} */
export function scrollOf(s) {
  const v = views.get(s);
  return v ? [v.ax[0].off, v.ax[1].off] : [0, 0];
}

/**
 * Puts a scroll view's content at offsets (界面-27), stopping its motion: the page's way back to the start of a list it
 * fills anew. Nothing for a node without one. @param {UiNode} s @param {number} x @param {number} y
 */
export function scrollTo(s, x, y) {
  const v = views.get(s);
  if (!v) return;
  v.ax = [{ off: x, vel: 0 }, { off: y, vel: 0 }]; v.prev = [x, y]; v.drag = null; v.snap = null;
  v.content.rt.pos[0] = v.base[0] + x; v.content.rt.pos[1] = v.base[1] + y;
}

/**
 * Makes a node's scroll view work (界面-27): pointer drags and the wheel on the node, the clock moving the content.
 * @param {UiNode} s a node with a scroll view
 */
export function attachScroll(s) {
  const sc = s.n.comps.scroll, content = sc.content ? refNode(s, sc.content) : null;
  if (!content) return;
  /** @type {View} */
  const v = { s, view: (sc.viewport ? refNode(s, sc.viewport) : null) ?? s, content, base: [...content.rt.pos], ax: [{ off: 0, vel: 0 }, { off: 0, vel: 0 }],
    prev: [0, 0], drag: null, wasDrag: false, snap: null, geo: null };
  const el = s.el;
  el.addEventListener('pointerdown', (e) => down(v, /** @type {PointerEvent} */ (e)));
  el.addEventListener('pointermove', (e) => move(v, /** @type {PointerEvent} */ (e)));
  for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, () => up(v));
  el.addEventListener('wheel', (e) => wheel(v, /** @type {WheelEvent} */ (e)));
  // a tap that turned into a drag does not reach the nodes under it
  el.addEventListener('click', (e) => { if (v.wasDrag) { e.stopPropagation(); v.wasDrag = false; } }, true);
  s.scr.ctx.tickers?.add({ scr: s.scr, step: (dt) => step(v, dt) });
  views.set(s, v);
  return v;
}
