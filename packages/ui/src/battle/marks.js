// The co-op marks (docs/spec/ui.md 界面-37): the mark card in the bottom-left corner (拖动标记); while it is dragged its
// clip turns it to 拖回取消标记, and a drag let go over it is cancelled; its cool-down shows the lock and the seconds
// left. A mark on a tile of the mate's unit opens the menu by the tile — 注意！ or 撤退干员, on the side of the screen's
// middle —; the mate's marks of those kinds show their icon by their tile (INF-0202).
import { refNode, nodeAt } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/** A mark's kind (界面-37): the tile alone, 注意！, 撤退干员. */
export const MARK_KIND = Object.freeze({ plain: 0, attention: 1, withdraw: 2 });
/** How far the menu's buttons stand from the tile, and the icon's group of each kind, in the mark prefab. */
const MENU_GAP = 190, ICONS = Object.freeze({ [MARK_KIND.attention]: 'container_icon_attention', [MARK_KIND.withdraw]: 'container_icon_exit' });

/**
 * A node set at a point of the canvas (reference pixels from the top left), its own size kept, centred there.
 * @param {UiNode} s @param {number[]} at @param {number[]} canvas [w, h]
 */
function setAt(s, at, canvas) {
  s.rt = { ...s.rt, amin: [0.5, 0.5], amax: [0.5, 0.5], pivot: [0.5, 0.5], pos: [at[0] - canvas[0] / 2, canvas[1] / 2 - at[1]] };
}

/**
 * The menu by a tile (界面-37): its side's buttons — right of the tile in the screen's left half, else left —, flat at
 * their own size; taps pick a kind. @param {Screen} scr @param {UiNode} menu @param {number[]} at @param {number[]} canvas @param {(kind: number) => void} pick
 */
function openMenu(scr, menu, at, canvas, pick) {
  setAt(menu, at, canvas);
  menu.rt.size = [0, 0];
  const right = at[0] < canvas[0] / 2, side = /** @type {UiNode} */ (refNode(menu, right ? '@button_right' : '@button_left'));
  scr.show('button_right', right, menu);
  scr.show('button_left', !right, menu);
  side.rt = { ...side.rt, amin: [0.5, 0.5], amax: [0.5, 0.5], pos: [right ? MENU_GAP : -MENU_GAP, 0], scale: [1, 1] };
  for (const [b, kind] of [['button_A', MARK_KIND.attention], ['button_B', MARK_KIND.withdraw]]) {
    const n = nodeAt(side, `${b}/collider`);
    if (n) scr.tap('', () => pick(Number(kind)), n);
  }
}

/**
 * The marks on a UI: the card's state (`update`), whether a point is over the card, the menu, the mate's marks' icons.
 * The pack's `hud.coopMarks` names the card's drag clip, its cool-down and its text, its collider.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {{ press: (x: number, y: number) => void }} on
 *   press: the card pressed at a client point (the page follows the drag)
 */
export function createMarks(ui, on) {
  const h = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopMarks ?? {}, scr = ui.open('coop.markCard'), root = scr.root;
  for (const n of ['dummy', 'pinMark_edge', 'edgeMarkList']) scr.show(n, false);
  const at = (/** @type {string | undefined} */ r, /** @type {string} */ name) => /** @type {UiNode} */ ((r ? refNode(root, r) : null) ?? scr.one(name));
  const card = at(h.drag?.animationWrapper, 'btn_display_mark'), cd = at(h.cooldown, 'cool_down'), time = at(h.cooldownText, 'time'), clip = h.drag?.animationName;
  scr.on('', 'pointerdown', (e) => { const p = /** @type {PointerEvent} */ (e); on.press(p.clientX, p.clientY); }, at(h.collider, 'collider'));
  let dragging = false;
  /** @type {UiNode | null} */
  let menu = null;
  /** @type {Map<string, UiNode>} */
  const icons = new Map();
  const canvas = () => [ui.canvas.w, ui.canvas.h];
  return {
    screen: scr,
    /** The card (界面-37): dragging or not (its clip forwards or back), the cool-down's seconds left (0: none). @param {{ dragging: boolean, cooldown: number }} s */
    update(s) {
      if (s.dragging !== dragging) { dragging = s.dragging; if (clip) void scr.play('', clip, { reverse: !dragging }, card); }
      cd.active = s.cooldown > 0;
      if (cd.active) scr.text('', `${s.cooldown.toFixed(1)}s`, time);
    },
    /** Whether a client point is over the card: a drag let go there is cancelled. @param {number} x @param {number} y */
    over(x, y) {
      const r = card.el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    },
    /** The menu by a tile at a point of the canvas (reference pixels); a pick closes it. @param {number[]} at @param {(kind: number) => void} pick */
    menu(at, pick) {
      this.closeMenu();
      const m = scr.instantiate(root, 'coop.markMenu');
      menu = m;
      openMenu(scr, m, at, canvas(), (kind) => { this.closeMenu(); pick(kind); });
    },
    closeMenu() { if (menu) scr.remove(menu); menu = null; },
    /** Whether the menu is open. */
    get menuOpen() { return menu !== null; },
    /**
     * The mate's marks of a kind (注意, 撤退): their icon by their tile, at points of the canvas; the others' removed.
     * @param {{ id: string, at: number[], kind: number }[]} list
     */
    icons(list) {
      const seen = new Set();
      for (const m of list) {
        const group = /** @type {Record<number, string>} */ (ICONS)[m.kind];
        if (!group) continue;
        seen.add(m.id);
        let n = icons.get(m.id);
        if (!n) {
          n = scr.instantiate(root, 'coop.markEdge');
          scr.show('arrow_container', false, n);
          for (const g of Object.values(ICONS)) scr.show(g, g === group, n);
          icons.set(m.id, n);
        }
        setAt(n, m.at, canvas());
        n.rt.size = [200, 200];
      }
      for (const [id, n] of icons) if (!seen.has(id)) { scr.remove(n); icons.delete(id); }
    },
  };
}
