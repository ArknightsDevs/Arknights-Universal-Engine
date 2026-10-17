// The menus on the field (docs/spec/ui.md 界面-13, 界面-14): the direction selector shown on a tile where an operator is
// being deployed, and the operator menu around a selected operator — both parts of the battle screen's perspective
// canvas, which lies on the ground centred on that point of the field.
import { refNode } from '../node.js';
import { groundTransform } from '../persp.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/** A point of the field on the page: a ground offset (tiles east, north) from the point to page pixels. @typedef {(east: number, north: number) => number[]} ToPage */
/**
 * An operator's skill as the menu shows it: its icon (a URL; none: no skill button), whether it starts by hand, its
 * state — gathering SP (the share gathered), ready, running (the share of its time left) —, whether it may be stopped,
 * whether a status keeps its operator from starting it now (stunned, frozen, asleep, silenced …).
 * @typedef {{ icon: string | null, manual: boolean, state: 'charging' | 'ready' | 'running', share: number, stoppable?: boolean, blocked?: boolean }} MenuSkill
 */

/** The facings in the order of the selector's arrows: up, right, down, left (schema DIR: right 0, up 1, left 2, down 3). */
export const ARROW_DIRS = Object.freeze([1, 0, 3, 2]);

/**
 * The facing a drag points to (界面-13): of the four ground directions as they lie on the page (a tile east and a tile
 * north of the selector's centre, in page pixels), the one the drag goes furthest along; −1 while the drag is shorter
 * than `dead` page pixels (the selector's centre). Facings are schema DIR: right (east) 0, up (north) 1, left 2, down 3.
 * @param {number[]} drag @param {number[]} east @param {number[]} north @param {number} dead
 */
export function dragFacing(drag, east, north, dead) {
  if (Math.hypot(drag[0], drag[1]) < dead) return -1;
  const axes = [east, north, [-east[0], -east[1]], [-north[0], -north[1]]];
  let best = -1, most = -Infinity;
  axes.forEach((a, i) => {
    const along = (drag[0] * a[0] + drag[1] * a[1]) / (Math.hypot(a[0], a[1]) || 1);
    if (along > most) { most = along; best = i; }
  });
  return best;
}

/**
 * A drag on the page as a ground offset in tiles (east, north), for the drag handle (界面-13): the drag split along a
 * tile east and a tile north of the selector's centre as they lie on the page; none when those two do not span the page.
 * @param {number[]} drag @param {number[]} east @param {number[]} north @returns {number[]}
 */
export function groundOffset(drag, east, north) {
  const det = east[0] * north[1] - east[1] * north[0];
  if (Math.abs(det) < 1e-9) return [0, 0];
  return [(drag[0] * north[1] - drag[1] * north[0]) / det, (east[0] * drag[1] - east[1] * drag[0]) / det];
}

/** The perspective canvas of the battle screen: its size and tiles a reference pixel. @param {import('../node.js').UiPack} pack */
function canvasOf(pack) {
  const p = pack.screens.battle.children.find((c) => c.name === 'perspective_root');
  if (!p?.rt) throw new Error('the battle UI pack has no perspective canvas');
  return { frame: [p.rt.size[0], p.rt.size[1]], k: p.rt.scale[0] };
}

/**
 * Opens a part of the perspective canvas as its own screen, hidden.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {string} ref @param {number[]} frame
 */
function part(ui, ref, frame) {
  const scr = ui.open('battle', { at: ref.slice(1), frame });
  scr.root.active = false;
  return scr;
}

/**
 * The selector's drag handle (界面-13): its thumb moved by a ground offset in tiles (east, north) — on the perspective
 * canvas, `k` tiles a reference pixel, the selector scaled under it — held within its reach, half its area's width;
 * back at the centre for null.
 * Without the pack's joystick data, nothing.
 * @param {Screen} dir the selector @param {Record<string, any> | undefined} j the pack's joystick data @param {number} k
 * @returns {(off: number[] | null) => void}
 */
function thumbOf(dir, j, k) {
  const thumb = j ? refNode(dir.root, j.thumb) : null, area = j ? refNode(dir.root, j.area) : null, reach = (area?.rt.size[0] ?? 0) / 2;
  if (area) area.active = !!thumb;
  // the canvas pixels a pixel of the area: the scales between the selector's root and the area
  let up = 1;
  for (let n = area?.parent ?? null; n; n = n === dir.root ? null : n.parent) up *= n.rt.scale[0];
  return (off) => {
    if (!thumb) return;
    const p = off ? [off[0] / k / up, off[1] / k / up] : [0, 0], len = Math.hypot(p[0], p[1]), f = len > reach ? reach / len : 1;
    thumb.rt.pos = [p[0] * f, p[1] * f];
  };
}

/**
 * The menus on a UI. `direction.show(toPage)` puts the selector on a point; `direction.point(dir)` lights the arrow of a
 * facing (−1: none); `direction.drag(off)` moves its drag handle by a ground offset in tiles (null: back to the centre);
 * `menu.show(toPage, skill)` puts the operator menu around an operator; `hide` takes them away.
 * Taps: `on.cancel` (the selector's cancel button), `on.withdraw`, `on.skill`.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {Record<string, any>} hud
 * @param {{ cancel: () => void, withdraw: () => void, skill: () => void }} on
 */
export function createFieldMenus(ui, hud, on) {
  const { frame, k } = canvasOf(ui.ctx.pack), d = hud.direction, m = hud.menu;
  const dir = part(ui, d.root, frame), menu = part(ui, m.root, frame);
  menu.root.rt.pos = [0, 0];
  dir.show('btn_drag_back', false);
  dir.show('btn_cancel', true);
  const drag = thumbOf(dir, d.joystick, k);
  /** @param {Screen} scr @param {ToPage} toPage */
  const place = (scr, toPage) => { scr.wrap.style.transform = groundTransform(frame, k, toPage); scr.wrap.style.transformOrigin = '0 0'; };
  tapRef(dir, `${d.cancel}/btn_cancel`, on.cancel);
  tapRef(menu, m.withdraw, on.withdraw);
  tapRef(menu, m.skill, on.skill);
  return {
    direction: {
      screen: dir,
      /** @param {ToPage} toPage */
      show(toPage) { place(dir, toPage); dir.root.active = true; drag(null); },
      drag,
      /** @param {number} facing schema DIR, −1 for none */
      point(facing) {
        d.arrows.forEach((/** @type {string} */ ref, /** @type {number} */ i) => {
          const c = ARROW_DIRS[i] === facing ? d.colors.highlight : d.colors.normal, a = refNode(dir.root, ref);
          for (const n of [a, a ? refNode(dir.root, `${ref}/fill`) : null]) if (n?.color) n.color = [...c];
        });
      },
      hide() { dir.root.active = false; },
    },
    menu: {
      screen: menu,
      /** @param {ToPage} toPage @param {MenuSkill | null} skill */
      show(toPage, skill) { place(menu, toPage); menu.root.active = true; showSkill(menu, m, skill); },
      hide() { menu.root.active = false; },
    },
  };
}

/**
 * The skill button's icon, and its state: disabled while a status keeps the operator from its skill (界面-14).
 * @param {Screen} scr @param {UiNode | null} icon @param {UiNode | null} btn @param {MenuSkill} s
 */
function showIcon(scr, icon, btn, s) {
  if (icon) { icon.picture = s.icon; icon.paintKey = ''; }
  if (btn) scr.state('', s.blocked ? 2 : 0, btn);
}

/** @param {Screen} scr @param {string} ref @param {() => void} fn */
function tapRef(scr, ref, fn) { const n = refNode(scr.root, ref); if (n) scr.tap('', fn, n); }

/**
 * The skill button (界面-14): its icon; the SP gathered filling it while charging; the ready mark when it can start by
 * hand; the time left while it runs, and the stop mark when it may be stopped; in its disabled colour, not taking taps
 * and without the ready mark while a status keeps the operator from starting it; nothing without a skill or an icon.
 * @param {Screen} scr @param {Record<string, any>} m @param {MenuSkill | null} s
 */
function showSkill(scr, m, s) {
  const panel = refNode(scr.root, m.panel);
  if (!panel) return;
  panel.active = !!s?.icon;
  if (!s?.icon) return;
  const at = (/** @type {string} */ key) => refNode(scr.root, m[key]);
  showIcon(scr, at('icon'), at('skill'), s);
  for (const key of ['readyNotFull', 'bullet', 'retrigger', 'amount', 'progress', 'range']) { const n = at(key); if (n) n.active = false; }
  const set = (/** @type {string} */ key, /** @type {boolean} */ v) => { const n = at(key); if (n) n.active = v; };
  set('toNext', s.state === 'charging');
  set('casting', s.state === 'running');
  set('notReady', s.state === 'charging');
  set('ready', s.state === 'ready' && s.manual && !s.blocked);
  set('stop', s.state === 'running' && !!s.stoppable);
  set('auto', !s.manual);
  const toNext = at('toNext'), casting = at('casting');
  if (toNext && s.state === 'charging') scr.slider('', s.share, toNext);
  if (casting && s.state === 'running') scr.slider('', s.share, casting);
}
