// The units' bars (docs/spec/ui.md 界面-19, 界面-20): each drawn unit gets the battle UI's unit HUD at the point of
// the canvas under its feet — an operator its HP bar and, with a skill, its SP bar (the cast bar while the skill
// runs) on their background plate; an enemy its HP bar (a leader its own); a unit with an element value below its
// maximum the element dial of its 当前损伤元素; an operator of this seat whose skill can start by hand or be stopped the
// skill mark, the pack's mark panel at its feet (its marks stand above the panel's centre). The bars are the pack's prefabs placed by its grid; their parts (the slider, the
// slider trailing it, the dial's images) come from the pack's `hud.units.bars`, the mark's from `hud.units.skillMark`.
import { refNode } from '../node.js';
import { setSlider } from '../screen.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * A unit as its bars show it: where its feet are on the canvas (reference pixels from the top left), whether it is an
 * operator, an enemy or a leader, its HP share, its skill (none, or its state and the share filled), its element
 * (none, or the element 1–5, the value's share and whether it is in a burst), its skill mark (none; ready to start by
 * hand; running and able to be stopped).
 * @typedef {{ id: number, at: number[], kind: 'char' | 'enemy' | 'boss', hp: number,
 *   sp: { state: 'charging' | 'ready' | 'running', share: number } | null, el: { element: number, share: number, burst: boolean } | null,
 *   mark?: 'ready' | 'stop' | null }} UnitBar
 */
/**
 * A bar prefab's parts (references from its root): its slider; the slider trailing it and whether that one is appended
 * to the fill's end; an element dial's hit and burst images, icon and centre colour.
 * @typedef {{ slider: string, back?: string, end?: number, hit?: string, burst?: string, icon?: string, color?: string }} BarParts
 */
/** @typedef {{ root: UiNode, kind: string, hp: UiNode, sp: UiNode | null, spName: string, ep: UiNode | null, mark: UiNode | null, markName: string }} Hud */

/** The prefab of each bar by the unit's kind. */
const PREFABS = Object.freeze({ char: { hp: 'bar.charHp', back: 'bar.charBack', ep: 'bar.charEp' }, enemy: { hp: 'bar.enemyHp', back: 'bar.enemyBack', ep: 'bar.enemyEp' },
  boss: { hp: 'bar.bossHp', back: null, ep: 'bar.enemyEp' } });

/**
 * The bars on the battle screen: kept per unit id; `update` places and fills those of the units given and removes the
 * others'.
 * @param {Screen} scr the battle screen @param {Record<string, any>} u the pack's unit HUD data
 */
export function createUnitBars(scr, u) {
  const layer = scr.one('panel_hud');
  if (!layer || !scr.ctx.pack.screens.unit) return null;
  /** @type {Map<number, Hud>} */
  const huds = new Map();
  return {
    huds,
    /** @param {UnitBar[]} units @param {number[]} canvas the canvas size [w, h] */
    update(units, canvas) {
      const seen = new Set();
      for (const b of units) {
        seen.add(b.id);
        let h = huds.get(b.id);
        if (h && h.kind !== b.kind) { scr.remove(h.root); h = undefined; }
        if (!h) { h = makeHud(scr, layer, u, b.kind); huds.set(b.id, h); }
        h.root.rt.pos = [b.at[0] - canvas[0] / 2, canvas[1] / 2 - b.at[1]];
        fill(scr, u, h, b);
      }
      for (const [id, h] of huds) if (!seen.has(id)) { scr.remove(h.root); huds.delete(id); }
    },
  };
}

/** A unit's HUD: the unit prefab with its HP bar in the first slider group and its plate. @param {Screen} scr @param {UiNode} layer @param {Record<string, any>} u @param {'char' | 'enemy' | 'boss'} kind @returns {Hud} */
function makeHud(scr, layer, u, kind) {
  const root = scr.instantiate(layer, 'unit'), at = (/** @type {string} */ ref) => /** @type {UiNode} */ (refNode(root, ref));
  const p = PREFABS[kind], hp = scr.instantiate(at(u.groupA), p.hp);
  if (p.back) { const back = scr.instantiate(at(u.plugins), p.back, 0); back.free = true; }
  return { root, kind, hp, sp: null, spName: '', ep: null, mark: null, markName: '' };
}

/**
 * Sets a bar's value: its slider, and the slider trailing it with no trail — at the same value, or empty when it is
 * appended to the fill's end (the share lost).
 * @param {UiNode} bar the bar's root @param {BarParts | undefined} parts @param {number} v
 */
function setBar(bar, parts, v) {
  if (!parts) return;
  const s = refNode(bar, parts.slider), back = parts.back ? refNode(bar, parts.back) : null;
  if (s) setSlider(s, v);
  if (back) setSlider(back, parts.end ? 0 : v);
}

/**
 * Fills a unit's HUD (界面-19, 界面-20): the HP bar's value, the SP bar of the skill's state in the second slider group,
 * the element dial.
 * @param {Screen} scr @param {Record<string, any>} u @param {Hud} h @param {UnitBar} b
 */
function fill(scr, u, h, b) {
  setBar(h.hp, u.bars?.[PREFABS[b.kind].hp], b.hp);
  const want = b.kind === 'char' && b.sp ? (b.sp.state === 'running' ? 'bar.charCast' : 'bar.charSp') : '';
  if (want !== h.spName) {
    if (h.sp) scr.remove(h.sp);
    h.sp = want ? scr.instantiate(/** @type {UiNode} */ (refNode(h.root, u.groupB)), want) : null;
    h.spName = want;
  }
  if (h.sp && b.sp) setBar(h.sp, u.bars?.[want], b.sp.state === 'ready' ? 1 : b.sp.share);
  showElement(scr, u, h, b);
  showMark(scr, u, h, b);
}

/**
 * The skill mark (界面-19): the pack's mark panel at the unit's feet showing only the part for the mark — the ready
 * mark, or the stop mark — made again when the mark changes, removed without one.
 * @param {Screen} scr @param {Record<string, any>} u @param {Hud} h @param {UnitBar} b
 */
function showMark(scr, u, h, b) {
  const want = b.kind === 'char' && b.mark && u.skillMark && scr.ctx.pack.screens['unit.skillMark'] ? b.mark : '';
  if (want === h.markName) return;
  if (h.mark) { scr.remove(h.mark); h.mark = null; }
  h.markName = want;
  if (!want) return;
  h.mark = scr.instantiate(h.root, 'unit.skillMark');
  for (const [part, ref] of Object.entries(u.skillMark)) {
    const n = part === 'count' ? null : refNode(h.mark, ref);
    if (n) n.active = part === want;
  }
}

/**
 * The element dial (界面-20): the value's share, the centre in the element's colour, the operator's dial its icon; the
 * burst image (an enemy's) in the burst colour only during a burst, the hit image not shown.
 * @param {Screen} scr @param {Record<string, any>} u @param {Hud} h @param {UnitBar} b
 */
function showElement(scr, u, h, b) {
  if (!b.el || b.el.element < 1) { if (h.ep) { scr.remove(h.ep); h.ep = null; } return; }
  const name = PREFABS[b.kind].ep, parts = /** @type {BarParts | undefined} */ (u.bars?.[name]);
  if (!h.ep) h.ep = scr.instantiate(/** @type {UiNode} */ (refNode(h.root, u.normal)), name);
  setBar(h.ep, parts, b.el.share);
  const e = ((b.kind === 'char' ? u.charElements : u.enemyElements) ?? [])[b.el.element - 1];
  if (parts && e) paintDial(h.ep, parts, e, b.el.burst);
}

/**
 * A dial's images for its element: the centre colour, the icon, the hit image hidden, the burst image in the burst
 * colour while bursting.
 * @param {UiNode} dial @param {BarParts} parts @param {{ color: number[], icon?: string | null, burst: number[] }} e @param {boolean} bursting
 */
function paintDial(dial, parts, e, bursting) {
  const at = (/** @type {string | undefined} */ ref) => (ref ? refNode(dial, ref) : null);
  const color = at(parts.color), icon = at(parts.icon), hit = at(parts.hit), burst = at(parts.burst);
  if (color?.color) color.color = [...e.color];
  if (icon && e.icon) icon.sprite = e.icon;
  if (hit) hit.active = false;
  if (burst) {
    burst.active = bursting;
    if (burst.color) burst.color = [...e.burst];
  }
}
