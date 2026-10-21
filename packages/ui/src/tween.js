// Code tweens (docs/spec/ui.md 界面-33): a node's opacity, anchored position, size or colour from one value to another
// over a time, after a delay, eased, looping (restarting or back and forth); and the fades a switch makes (界面-25).

/** @typedef {import('./node.js').UiNode} UiNode */
/**
 * A tween of the pack: what it moves (opacity, anchored position, size or graphic colour), from, to, whether it starts
 * from `from` (else from the node's value), its time and delay in seconds, its easing, how many times it plays (−1 for
 * ever) and how it loops (1 back and forth, else again from the start), whether it starts when the screen opens.
 * @typedef {{ kind: 'fade' | 'move' | 'size' | 'color', from: number | number[], to: number | number[], startFrom?: number, time: number, delay?: number,
 *   ease?: number, loop?: number, loopType?: number, auto?: number }} Tween
 */

const { sin, cos, PI } = Math;
/** @type {Record<number, (u: number) => number>} */
const EASES = {
  1: (u) => u,
  2: (u) => 1 - cos((u * PI) / 2), 3: (u) => sin((u * PI) / 2), 4: (u) => -(cos(PI * u) - 1) / 2,
  5: (u) => u * u, 6: (u) => 1 - (1 - u) * (1 - u), 7: (u) => (u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2),
  8: (u) => u ** 3, 9: (u) => 1 - (1 - u) ** 3, 10: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - ((-2 * u + 2) ** 3) / 2),
};

/**
 * An eased fraction (界面-33): linear (1), sine (2–4), quadratic (5–7) and cubic (8–10) in, out and in-out; none given
 * (0) eases out quadratically; any other is linear. @param {number | undefined} kind @param {number} u
 */
export const ease = (kind, u) => (kind ? (EASES[kind] ?? EASES[1]) : EASES[6])(Math.max(0, Math.min(1, u)));

/**
 * A tween's fraction after `t` seconds (its delay already past) and whether it is over (界面-33): each play runs its
 * time eased; back and forth plays run every other one backwards.
 * @param {Tween} tw @param {number} t @returns {{ u: number, done: boolean }}
 */
export function tweenAt(tw, t) {
  const T = Math.max(1e-6, tw.time), loops = tw.loop ?? 1, n = Math.floor(t / T);
  const over = loops >= 0 && n >= Math.max(1, loops);
  const cycle = over ? Math.max(1, loops) - 1 : n, f = over ? 1 : (t - n * T) / T;
  const back = tw.loopType === 1 && cycle % 2 === 1;
  return { u: ease(tw.ease, back ? 1 - f : f), done: over };
}

/** A number or a pair between two values. @param {number | number[]} a @param {number | number[]} b @param {number} u */
const lerp = (a, b, u) => (Array.isArray(a) && Array.isArray(b) ? a.map((v, i) => v + (b[i] - v) * u) : /** @type {number} */ (a) + (/** @type {number} */ (b) - /** @type {number} */ (a)) * u);

/** A node's opacity: its canvas group's, else its graphic's colour's. @param {UiNode} s */
const opacity = (s) => (s.n.comps.group || !s.color ? s.alpha : s.color[3]);

/** Sets a node's opacity (its group's, else its colour's). @param {UiNode} s @param {number} v */
function setOpacity(s, v) {
  if (s.n.comps.group || !s.color) s.alpha = v;
  else { s.color[3] = v; s.paintKey = ''; }
}

/** A node's value a tween moves. @param {UiNode} s @param {Tween['kind']} kind */
const valueOf = (s, kind) => (kind === 'fade' ? opacity(s) : kind === 'move' ? [...s.rt.pos] : kind === 'size' ? [...s.rt.size] : [...(s.color ?? [1, 1, 1, 1])]);

/** Sets a node's value a tween moves. @param {UiNode} s @param {Tween['kind']} kind @param {number | number[]} v */
function setValue(s, kind, v) {
  if (kind === 'fade') { setOpacity(s, /** @type {number} */ (v)); return; }
  const p = /** @type {number[]} */ (v);
  if (kind === 'move') { s.rt.pos[0] = p[0]; s.rt.pos[1] = p[1]; }
  else if (kind === 'size') { s.rt.size[0] = p[0]; s.rt.size[1] = p[1]; }
  else if (s.color) { s.color = [...p]; s.paintKey = ''; }
}

/**
 * Starts a node's tween on the UI's clock (界面-33); it stops when the node is removed.
 * @param {UiNode} s @param {Tween} tw
 */
export function startTween(s, tw) {
  const from = tw.startFrom === 0 ? valueOf(s, tw.kind) : tw.from;
  let t = -(tw.delay ?? 0);
  s.scr.ctx.tickers?.add({ scr: s.scr, step: (dt) => {
    if (s.gone) return false;
    t += dt;
    if (t < 0) return true;
    const { u, done } = tweenAt(tw, t);
    setValue(s, tw.kind, lerp(from, tw.to, u));
    return !done;
  } });
}

/**
 * Fades a node to an opacity over `time` seconds (a switch, 界面-25): shown at once when fading in, hidden when a fade
 * out ends; a later fade of the node replaces it.
 * @param {UiNode} s @param {number} to @param {number} time
 */
export function fadeTo(s, to, time) {
  const from = to > 0 && !s.active ? 0 : s.alpha, id = ++s.fadeSeq;
  if (to > 0) s.active = true;
  let t = 0;
  s.scr.ctx.tickers?.add({ scr: s.scr, step: (dt) => {
    if (s.fadeSeq !== id) return false;
    t += dt;
    const u = Math.min(1, t / time);
    s.alpha = from + (to - from) * u;
    if (u < 1) return true;
    if (to <= 0) s.active = false;
    return false;
  } });
}
