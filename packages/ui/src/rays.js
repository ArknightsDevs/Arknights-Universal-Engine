// Taps through the UI (docs/spec/ui.md 界面-24, 界面-25): in a pack that marks its tap targets, a marked graphic and a
// tap-only area take the pointer and keep it from what lies beneath; a canvas group that does not block takes its
// subtree out; one that is not interactable leaves its buttons unusable, in their disabled colour. A colour set gives
// the tint of its node to each of its targets.
import { refNode } from './node.js';
import { sty } from './paint.js';

/** @typedef {import('./node.js').UiNode} UiNode */

/** The node above a node for taps: its parent, or the node a screen was opened into. @param {UiNode} s */
const above = (s) => s.parent ?? s.scr.into ?? null;

/**
 * A node's tap state from the groups above it (界面-24): blocked when one of them does not block, usable when all are
 * interactable; with a pack that marks its targets, the node takes the pointer when it is a target or the page made
 * it tappable, never when blocked.
 * @param {UiNode} s
 */
export function rayPass(s) {
  const up = above(s);
  s.blockedDown = (up?.blockedDown ?? false) || !s.blocks;
  s.interDown = (up?.interDown ?? true) && s.inter;
  if (!s.scr.ctx.rays) return;
  const hot = s.ray || s.el.classList.contains('aue-hot') || !!s.n.comps.scroll;
  sty(s, s.el, 'pointerEvents', s.blockedDown ? 'none' : hot ? 'auto' : 'none');
  if (s.n.comps.button) buttonLook(s);
}

/** A node's Selectable (button, toggle, input field). @param {UiNode} s */
const selectable = (s) => s.n.comps.button ?? s.n.comps.toggle ?? s.n.comps.input ?? null;

/**
 * Whether a node's buttons work (界面-24, 界面-25): by the state the page set it (not disabled); else, in a pack that
 * marks its tap targets, when the groups above let it and its Selectable is interactable; in other packs (the battle
 * pack, whose buttons the page enables itself) always.
 * @param {UiNode} s
 */
export function usable(s) {
  if (s.look != null) return s.look !== 2;
  if (!s.scr.ctx.rays) return true;
  return s.interDown && selectable(s)?.interactable !== 0;
}

/**
 * A button's look (界面-24, 界面-25): its target in the pressed colour while pressed, else in the state the page set, else
 * in the disabled colour when it does not work, else as it is.
 * @param {UiNode} s
 */
export function buttonLook(s) {
  const sel = selectable(s);
  if (!sel || sel.transition !== 1 || !sel.colors || !sel.target) return;
  const target = refNode(s, sel.target);
  if (!target) return;
  const set = s.look != null ? [null, sel.colors.pressed, sel.colors.disabled][s.look] ?? null : usable(s) ? null : sel.colors.disabled;
  setTint(target, s.pressed ? sel.colors.pressed : set);
}

/**
 * A node's tint over its colour (null: none), and its colour set's targets' (界面-25).
 * @param {UiNode} s @param {number[] | null} c
 */
export function setTint(s, c) {
  const set = s.n.comps.colorSet;
  if (s.tint !== c) { s.tint = c; s.paintKey = ''; }
  if (!set) return;
  for (const ref of set.targets) {
    const t = refNode(s, ref);
    if (t && t !== s && t.tint !== c) { t.tint = c; t.paintKey = ''; }
  }
}

/**
 * The state of a node (界面-25): a switch shows its `on` part for a true state and its `off` part otherwise (fading
 * over its time when it has one); a button (with its colour set) takes its normal (0), pressed (1) or disabled (2) colour
 * until the page sets another state.
 * @param {UiNode} s @param {number} i @param {(node: UiNode, to: number, time: number) => void} fade
 */
export function setState(s, i, fade) {
  const sw = s.n.comps.switch;
  if (sw) {
    const on = refNode(s, sw.on), off = refNode(s, sw.off), t = sw.fade ?? 0;
    for (const [node, shown] of /** @type {[UiNode | null, boolean][]} */ ([[on, !!i], [off, !i]])) {
      if (!node) continue;
      if (t > 0) fade(node, shown ? 1 : 0, t); else node.active = shown;
    }
    return;
  }
  s.look = i;
  if (selectable(s)) buttonLook(s);
}
