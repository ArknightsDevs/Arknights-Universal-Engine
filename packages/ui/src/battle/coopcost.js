// The co-op cost request (docs/spec/ui.md 界面-15, 合作-5): above the cost panel in a match of two, one state at a time
// — the request button, this seat's request waiting for an answer, the answer (the cost received, refused, ignored),
// the wait until it may ask again, that it cannot ask now, or the mate's request to answer. The cost received and the
// mate's request come in with their clips (界面-40).
import { refNode, ownClip } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * What the panel shows: its state; the cost on the request button and on the mate's request, or the cost received; the
 * share left of an open request; the seconds until this seat may ask again.
 * @typedef {{ state: 'none' | 'request' | 'accept' | 'reject' | 'ignore' | 'wait' | 'forbid' | 'response', amount: number, share: number, wait: number }} CostAsk
 */
/**
 * What the page knows of the requests: each side's open request (frames left, −1 none) and this seat's wait to ask
 * again (frames); whether this seat may ask now (合作-5); the last answer to this seat's request (accepted 1, refused 0,
 * ignored −1, its amount, how many seconds ago); the cost on the button (the level's transfer cap) and the most the
 * mate's request would take from this seat.
 * @typedef {{ mine: number, mates: number, cooldown: number, canAsk: boolean, answer: { accept: number, amount: number, ago: number } | null,
 *   cap: number, give: number, fps: number, open: number }} CostAskInput
 */

/** How long an answer to this seat's request shows, in seconds. */
export const ANSWER_SHOWN = 2;

/**
 * The panel's state (界面-15): the mate's open request first; then this seat's; then a recent answer; then the wait to
 * ask again; then whether it may ask.
 * @param {CostAskInput} s @returns {CostAsk}
 */
export function costAsk(s) {
  if (s.mates >= 0) return { state: 'response', amount: s.give, share: s.mates / s.open, wait: 0 };
  if (s.mine >= 0) return { state: 'request', amount: s.cap, share: s.mine / s.open, wait: 0 };
  const a = s.answer;
  if (a && a.ago < ANSWER_SHOWN) return { state: a.accept === 1 ? 'accept' : a.accept === 0 ? 'reject' : 'ignore', amount: a.amount, share: 0, wait: 0 };
  if (s.cooldown > 0) return { state: 'wait', amount: s.cap, share: 0, wait: Math.ceil(s.cooldown / s.fps) };
  return { state: s.canAsk ? 'none' : 'forbid', amount: s.cap, share: 0, wait: 0 };
}

/** The node of each state in the panel. */
const NODES = Object.freeze({ none: 'state_none_button', request: 'state_request', accept: 'state_accept', reject: 'state_reject', ignore: 'state_ignore',
  wait: 'state_wait', forbid: 'state_forbid', response: 'state_response' });

/**
 * The panel on a UI: `update` shows a state; taps call `on.ask` (the request button), `on.answer(true | false)`.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {{ ask: () => void, answer: (accept: boolean) => void }} on
 */
export function createCostAsk(ui, on) {
  const scr = ui.open('coop.cost'), h = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopCost ?? {};
  const state = (/** @type {string} */ k) => /** @type {UiNode} */ (scr.one(/** @type {Record<string, string>} */ (NODES)[k]));
  scr.tap('collider', on.ask, state('none'));
  scr.tap('state_response_accept/hotspot', () => on.answer(true));
  scr.tap('state_response_reject/hotspot', () => on.answer(false));
  for (const n of ['pasue_mask', 'pause_mask_fail', 'response_mask']) scr.show(n, false);
  /** The nodes whose own clips play as a state comes (界面-40). @type {Record<string, UiNode | null>} */
  const enter = { accept: refNode(scr.root, h.acceptAnim), response: refNode(scr.root, h.responseAnim) };
  let last = '';
  return {
    screen: scr,
    /** @param {CostAsk} c */
    update(c) {
      for (const k of Object.keys(NODES)) { const n = state(k); if (n) n.active = k === c.state; }
      const n = state(c.state), a = enter[c.state], clip = ownClip(a);
      if (c.state !== last && a && clip) void scr.anim.play(a, clip);
      last = c.state;
      if (!n) return;
      if (c.state === 'none' || c.state === 'response' || c.state === 'accept') scr.text('cost_text', String(c.amount), n);
      if (c.state === 'wait') scr.text('cost_info', String(c.wait).padStart(2, '0'), n);
      if (c.state === 'request' || c.state === 'response') scr.slider('slider_timer', c.share, n);
    },
  };
}
