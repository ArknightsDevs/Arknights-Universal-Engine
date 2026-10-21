// 堡垒守御's rest panel (docs/spec/ui.md 界面-39, the engine's 守御-2): while a rest runs, at the top of the screen, the
// seconds it has left, the 「跳过休整」 button, and whether this seat (left) and the mate (right) agreed to skip it — a
// side agreeing plays its side's clip (界面-40).
import { refNode, ownClip } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** What the panel shows: the seconds left of the rest, whether this seat and the mate said 「休整完毕」. @typedef {{ left: number, me: boolean, mate: boolean }} Resting */

/** The seconds left as the panel's count: whole seconds, rounded up, a smaller s after them. @param {number} s */
export const restText = (s) => `${Math.max(0, Math.ceil(s))}<size=48>s</size>`;

/**
 * The rest panel on a UI: `update` shows a rest's state, or hides the panel (null); a tap on its button calls `on.skip`
 * once a rest, until this seat has agreed.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {{ skip: () => void }} on
 */
export function createResting(ui, on) {
  const scr = ui.open('coop.resting'), root = scr.root, h = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopResting ?? {};
  const sides = { left: { at: refNode(root, h.left), shown: /** @type {boolean | null} */ (null) }, right: { at: refNode(root, h.right), shown: /** @type {boolean | null} */ (null) } };
  let agreed = false;
  scr.tap('btn_skip_rest', () => { if (!agreed) on.skip(); });
  root.active = false;
  return {
    screen: scr,
    /** @param {Resting | null} r */
    update(r) {
      root.active = r !== null;
      if (!r) return;
      agreed = r.me;
      scr.text('text_count', restText(r.left));
      scr.state('btn_skip_rest', r.me ? 2 : 0);
      side(scr, 'left', r.me, sides.left);
      side(scr, 'right', r.mate, sides.right);
    },
  };
}

/**
 * A side's mark: 「等待跳过」 until it agreed, then 「同意跳过」 (the pack's two panels, by their canvas groups' alpha). A
 * side agreeing while shown plays its side's clip (界面-40); a new rest starts it from the clip's beginning.
 * @param {import('../screen.js').Screen} scr @param {'left' | 'right'} which @param {boolean} agreed
 * @param {{ at: UiNode | null, shown: boolean | null }} o its side's node with the clip, and what it shows now
 */
function side(scr, which, agreed, o) {
  if (o.shown === agreed) return;
  const clip = ownClip(o.at), was = o.shown;
  o.shown = agreed;
  if (o.at && clip) { void scr.anim.play(o.at, clip, was === false && agreed ? {} : { reverse: !agreed, rate: 1e4 }); return; }
  for (const [name, on] of /** @type {[string, boolean][]} */ ([[`panel_wait_${which}`, !agreed], [`panel_skip_${which}`, agreed]])) {
    const n = scr.one(name);
    if (n && n.alpha !== (on ? 1 : 0)) { n.alpha = on ? 1 : 0; n.paintKey = ''; }
  }
}
