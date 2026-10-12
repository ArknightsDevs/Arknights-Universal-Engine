// The co-op top bar (docs/spec/ui.md 界面-12): over the battle screen in a match of two, in place of its own top bar —
// both players' lives (and the time until a down player comes back), the speed button with a light for each side's
// 2× switch, the pause button, the pause request waiting for the mate.
import { refNode } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * A side's state: its lives, whether its 2× switch is on, the seconds until it comes back when down (−1 when not).
 * @typedef {{ life: number, fast: boolean, revive: number }} Side
 */
/**
 * What the co-op top bar shows: this seat and the mate, the speed the battle runs at, whether it is paused, and the
 * share left of this seat's pause request (−1 for none).
 * @typedef {{ me: Side, mate: Side, speed: number, paused: boolean, asking: number }} CoopState
 */

/** The speed icon for the speed the battle runs at: 2× only when both sides have it on. @param {Record<string, any>} sp @param {number} speed */
export const coopSpeedSprite = (sp, speed) => (speed >= 2 ? sp.x2 : sp.x1);

/** A side's countdown text: whole seconds, rounded up. @param {number} s */
export const reviveText = (s) => String(Math.max(0, Math.ceil(s)));

/**
 * The co-op top bar on a UI; `update` shows a frame's state; taps on speed and pause call the handlers.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {Record<string, any>} c the pack's co-op top bar data
 * @param {{ speed: () => void, pause: () => void }} on
 */
export function createCoopTop(ui, c, on) {
  const scr = ui.open('coop.topbar'), root = scr.root, status = refNode(root, c.status.panel);
  scr.show('btn_menu', false);
  if (status) status.active = true;
  for (const ref of [c.status.lifeLost, c.status.lifeLost?.replace('[my]', '[you]'), c.lag?.back]) { const n = refNode(root, ref); if (n) n.active = false; }
  scr.show('task', false, status ?? undefined);
  scr.show('text_battle_end_time', false);
  const mateRef = (/** @type {string} */ ref) => ref.replace('[my]', '[you]');
  tapHit(scr, root, '@btn_speed_level/btn_speed_level_icon/hotspot', on.speed);
  tapHit(scr, root, `${c.pause}/collider`, on.pause);
  return {
    screen: scr,
    /** @param {CoopState} s */
    update(s) {
      showSide(scr, root, c.status.life, s.me);
      showSide(scr, root, mateRef(c.status.life), s.mate);
      showSpeed(root, c.speed, s);
      const pause = refNode(root, c.pauseImage), resume = refNode(root, c.resumeImage);
      if (pause) pause.active = !s.paused;
      if (resume) resume.active = s.paused;
      const wait = refNode(root, `${c.pause}/slider_pause_waiting`);
      if (wait) { wait.active = s.asking >= 0; if (s.asking >= 0) scr.slider('', s.asking, wait); }
    },
  };
}

/** @param {Screen} scr @param {UiNode} root @param {string} ref @param {() => void} fn */
function tapHit(scr, root, ref, fn) { const n = refNode(root, ref); if (n) scr.tap('', fn, n); }

/**
 * A side's lives, and its countdown instead while it is down.
 * @param {Screen} scr @param {UiNode} root @param {string} lifeRef @param {Side} s
 */
function showSide(scr, root, lifeRef, s) {
  const life = refNode(root, lifeRef), point = life?.parent, panel = point?.parent;
  if (!life || !point || !panel) return;
  scr.text('', String(s.life), life);
  const timer = panel.kids.find((k) => k.n.name === point.n.name.replace('icon_life_point', 'revive_timer'));
  point.active = s.revive < 0;
  if (timer) { timer.active = s.revive >= 0; if (s.revive >= 0) scr.text('timer', reviveText(s.revive), timer); }
}

/** The speed icon and each side's light. @param {UiNode} root @param {Record<string, any>} sp @param {CoopState} s */
function showSpeed(root, sp, s) {
  const icon = refNode(root, sp.image);
  if (icon) { icon.sprite = coopSpeedSprite(sp, s.speed); icon.paintKey = ''; }
  for (const [ref, on] of /** @type {[string, boolean][]} */ ([[sp.me, s.me.fast], [sp.mate, s.mate.fast]])) {
    const n = refNode(root, ref);
    if (n?.color) n.color[3] = on ? 1 : 0;
  }
}
