// The co-op top bar (docs/spec/ui.md 界面-12, 界面-16, 界面-17): over the battle screen in a match of two, in place of its
// own top bar — both players' lives (and the time until a down player comes back), the speed button with a light for
// each side's 2× switch, the pause button, the pause request waiting for the mate; the stage's task; the mate's pause
// request to answer.
import { refNode } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * A side's state: its lives, whether its 2× switch is on, the seconds until it comes back when down (−1 when not).
 * @typedef {{ life: number, fast: boolean, revive: number }} Side
 */
/**
 * The stage's task: its number (1-based), objective (protect, target, kill, survive, boss, tower, car), count, goal and
 * advanced goal, and the seconds left of its time (or of the rest before it).
 * @typedef {{ stage: number, objective: string, count: number, goal: number, advanced?: number, left: number }} Task
 */
/**
 * What the co-op top bar shows: this seat and the mate, the speed the battle runs at, whether it is paused, the share
 * left of this seat's pause request and of the mate's (−1 for none), the stage's task (none before the first).
 * @typedef {{ me: Side, mate: Side, speed: number, paused: boolean, asking: number, confirm?: number, task?: Task | null }} CoopState
 */

/** The objectives the task panel has a line for. */
export const OBJECTIVES = Object.freeze(['kill', 'survive', 'tower', 'protect', 'car', 'target', 'boss']);
/** From how many seconds left the timer shows its warning when the pack gives none. */
export const TIMER_WARN = 10;

/** A task's time as minutes and seconds (mm:ss), rounded up. @param {number} s */
export const clockText = (s) => { const t = Math.max(0, Math.ceil(s)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

/** The speed icon for the speed the battle runs at: 2× only when both sides have it on. @param {Record<string, any>} sp @param {number} speed */
export const coopSpeedSprite = (sp, speed) => (speed >= 2 ? sp.x2 : sp.x1);

/** A side's countdown text: whole seconds, rounded up. @param {number} s */
export const reviveText = (s) => String(Math.max(0, Math.ceil(s)));

/**
 * The co-op top bar on a UI; `update` shows a frame's state; taps on speed and pause call the handlers, and the answer
 * to the mate's pause request `on.confirm(accept)`.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {Record<string, any>} c the pack's co-op top bar data
 * @param {{ speed: () => void, pause: () => void, confirm?: (accept: boolean) => void }} on
 */
export function createCoopTop(ui, c, on) {
  const scr = ui.open('coop.topbar'), root = scr.root, status = refNode(root, c.status.panel);
  scr.show('btn_menu', false);
  if (status) status.active = true;
  for (const ref of [c.status.lifeLost, c.status.lifeLost?.replace('[my]', '[you]'), c.lag?.back]) { const n = refNode(root, ref); if (n) n.active = false; }
  scr.show('text_battle_end_time', false);
  for (const n of ['fortress', 'fortress_lastWave', 'slider_progress_outer']) scr.show(n, false);
  const confirm = refNode(root, c.pauseConfirm);
  if (confirm) {
    scr.tap('btn_confirm', () => on.confirm?.(true), confirm);
    scr.tap('btn_cancel/hotspot', () => on.confirm?.(false), confirm);
  }
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
      if (confirm) { confirm.active = (s.confirm ?? -1) >= 0; if (confirm.active) scr.slider('slider_progress', s.confirm ?? 0, confirm); }
      if (status) showTask(scr, status, s.task ?? null, c.timerWarn ?? TIMER_WARN);
    },
  };
}

/**
 * The stage's task (界面-16): the stage number, the objective's line, the count against the goal on the bar and in
 * figures (the advanced goal beside it when there is one), the time left (its warning in the last `warn` seconds).
 * @param {Screen} scr @param {UiNode} status the status panel @param {Task | null} t @param {number} warn
 */
function showTask(scr, status, t, warn) {
  const task = scr.one('task', status);
  if (!task) return;
  task.active = t !== null;
  if (!t) return;
  scr.text('text_stage_info_01', `STAGE.${t.stage}`, task);
  // nothing counted yet: the bar stays at its minimum, empty (the original at 0/46); then the count over the goal
  scr.slider('normal', t.goal > 0 && t.count > 0 ? Math.min(1, t.count / t.goal) : -Infinity, task);
  // with an advanced goal the count over the goal stands left of the line and the count over the advanced goal at the
  // right end; without one only the count over the goal, at the right end, no line (the original's stages 2 and 1)
  const adv = t.advanced !== undefined;
  scr.show('split_line', adv, task);
  scr.text('split_line/group_text/text_monster', `${t.count}/${t.goal}`, task);
  scr.show('group_text_02', true, task);
  scr.text('group_text_02/text_monster', `${t.count}/${adv ? t.advanced : t.goal}`, task);
  for (const o of OBJECTIVES) scr.show(`taskInfo/${o}`, o === t.objective, task);
  const late = t.left <= warn;
  scr.show('group_timeout', late, task);
  scr.show('text_timer', late, task);
  scr.show('text_timer_normal', !late, task);
  scr.text(late ? 'text_timer' : 'text_timer_normal', clockText(t.left), task);
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
