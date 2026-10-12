// A prefab node on the page (docs/spec/ui.md 界面-2–界面-4, 界面-9): a positioned div for the node, a div for its graphic
// and one for its text; its own copy of the rect and the animated state; stencil groups found over a built tree.
import { copyRect, DEF_RT, FULL_RT } from './rect.js';
import { alignCss, faceOf, isRich, richHtml, shadowCss } from './text.js';
import { drawable } from './paint.js';

/** @typedef {import('./rect.js').Rect} Rect */
/**
 * A node of an exported prefab.
 * @typedef {{ name: string, active: boolean, rt?: Rect, comps: Record<string, any>, children: PackNode[] }} PackNode
 */
/** @typedef {{ w: number, h: number, uri: string, border?: number[] }} PackSprite */
/**
 * A battle UI pack: the reference resolution, the prefabs by root name, the sprites by key, the clips by name.
 * @typedef {{ version: number, ref: number[], screens: Record<string, PackNode>, sprites: Record<string, PackSprite>,
 *   clips: Record<string, import('./curves.js').Clip> }} UiPack
 */
/**
 * What the nodes share: the page's document, the pack, the sprite files' base URL, the faces, the loaded sprite images
 * and the drawn images cached by key, a text measurer, the clock.
 * @typedef {{ doc: Document, pack: UiPack, base: string, fonts: Readonly<Record<string, [string, number]>>,
 *   imgs: Map<string, HTMLImageElement>, cache: Map<string, string>, measure: (s: UiNode, size?: number) => number[],
 *   time: number }} Ctx
 */
/** @typedef {import('./screen.js').Screen} Owner */

/** A nested canvas with no size of its own (a screen-space canvas) fills its parent. @param {PackNode} n @param {boolean} child */
function rectOf(n, child) {
  const rt = n.rt ?? DEF_RT;
  return n.comps.canvas && child && rt.size[0] === 0 && rt.size[1] === 0 ? FULL_RT : rt;
}

export class UiNode {
  /** @param {PackNode} n @param {UiNode | null} parent @param {string} path @param {Owner} scr */
  constructor(n, parent, path, scr) {
    const doc = scr.ctx.doc;
    this.n = n; this.parent = parent; this.path = path; this.scr = scr;
    this.el = doc.createElement('div');
    /** @type {HTMLElement | null} */ this.g = null;
    /** @type {HTMLElement | null} */ this.t = null;
    /** @type {UiNode[]} */ this.kids = [];
    this.rt = copyRect(rectOf(n, parent !== null));
    /** @type {(number | null)[] | null} */ this.lp = null;
    this.active = n.active;
    this.alpha = n.comps.group ? n.comps.group.alpha : 1;
    this.gEnabled = true;
    /** a pressed button's tint over its colour (1, 1, 1, 1 when not pressed) @type {number[] | null} */ this.tint = null;
    /** @type {number[] | undefined} */ this.color = undefined;
    /** @type {number | undefined} */ this.fill = undefined;
    /** the sprite drawn (the prefab's, an animation's or the page's) @type {string | null | undefined} */ this.sprite = undefined;
    /** a picture set at run time (a URL) @type {string | null} */ this.picture = null;
    this.css = new Map();
    this.shown = false; this.w = 0; this.h = 0;
    /** @type {number[] | null} */ this.box = null;
    /** @type {{ x: number, y: number, w: number, h: number } | null} */ this.lgRect = null;
    /** @type {UiNode | null} */ this.stW = null;
    /** @type {UiNode | null} */ this.stOuter = null;
    this.stHide = false; this.stKey = ''; this.paintKey = '';
    /** its hidden subtree is marked not shown @type {boolean} */ this.sealed = false;
    /** @type {string} */ this.txt = '';
    /** @type {number} */ this.wrapW = 0;
    /** the root of the prefab instance the node belongs to, and that root's path in its prefab @type {UiNode} */
    this.proot = parent?.proot ?? this;
    this.pbase = '';
    this.el.className = 'aue-n';
    this.el.dataset.name = n.name;
  }
}

/** The node at a path under a node ('' is the node itself). @param {UiNode} s @param {string} path @returns {UiNode | null} */
export function nodeAt(s, path) {
  /** @type {UiNode | null} */
  let cur = s;
  for (const part of path ? path.split('/') : []) {
    cur = cur.kids.find((k) => k.n.name === part) ?? null;
    if (!cur) return null;
  }
  return cur;
}

/**
 * The node a controller's reference names ('@' and its path from its prefab's root), in the prefab instance a node
 * belongs to; null when it is outside the part of the prefab on the page.
 * @param {UiNode} s @param {string | null | undefined} ref
 */
export function refNode(s, ref) {
  if (!ref || !ref.startsWith('@')) return null;
  const p = ref.slice(1), root = s.proot, base = root.pbase;
  if (!base) return nodeAt(root, p);
  if (p === base) return root;
  return p.startsWith(`${base}/`) ? nodeAt(root, p.slice(base.length + 1)) : null;
}

/**
 * Builds a node and its subtree (界面-9: a graphic is drawn only when its material's shader is one the engine knows; a
 * mask graphic hidden by its Mask, stencil and raycast-only graphics are not drawn).
 * @param {PackNode} n @param {UiNode | null} parent @param {string} path @param {Owner} scr
 * @param {string} [base] when given, the node starts a prefab instance: its path in its prefab
 */
export function build(n, parent, path, scr, base) {
  const s = new UiNode(n, parent, path, scr), c = n.comps, doc = scr.ctx.doc;
  if (base != null) { s.proot = s; s.pbase = base; }
  buildGraphic(s, c, doc);
  if (c.text && drawable(c.text.mat)) buildText(s, c);
  if (c.mask) s.el.style.overflow = 'hidden';
  scr.all.push(s);
  for (const ch of n.children) s.kids.push(build(ch, s, `${path}/${ch.name}`, scr));
  for (const k of s.kids) s.el.appendChild(k.el);
  return s;
}

/** A graphic's div, its colour, sprite and fill. @param {UiNode} s @param {Record<string, any>} c @param {Document} doc */
function buildGraphic(s, c, doc) {
  const g0 = c.img || c.grad;
  if (!g0 || c.maskHide || c.nodraw || !drawable(g0.mat)) return;
  s.g = doc.createElement('div'); s.g.className = 'aue-g'; s.el.appendChild(s.g);
  s.color = [...g0.color];
  if (c.img) s.sprite = c.img.ref ?? null;
  if (c.img?.kind === 'image' && c.img.type === 3) s.fill = c.img.fill ?? 1;
}

/** A text's div: alignment, size, style, outline. @param {UiNode} s @param {Record<string, any>} c */
function buildText(s, c) {
  const t = s.scr.ctx.doc.createElement('div');
  t.className = 'aue-t'; s.el.appendChild(t); s.t = t;
  s.color = [...c.text.color];
  Object.assign(t.style, alignCss(c.text.align));
  t.style.fontSize = `${c.text.size}px`;
  t.style.fontStyle = c.text.style & 2 ? 'italic' : 'normal';
  if (c.text.hwrap === 0 && c.text.best !== 1) wrapText(s);
  if (c.outline) t.style.textShadow = shadowCss(c.outline);
  setText(s, c.text.text || '');
}

/** A text that wraps at its rect's width (Unity's horizontal overflow: wrap), still placed by its alignment. @param {UiNode} s */
function wrapText(s) {
  if (!s.t) return;
  s.wrapW = -1;
  Object.assign(s.t.style, { whiteSpace: 'pre-wrap', wordBreak: 'break-all' });
}

/**
 * Sets a node's text (rich text when it has Unity's tags and the text allows it) in its prefab's face.
 * @param {UiNode} s @param {unknown} value
 */
export function setText(s, value) {
  if (!s.t) return;
  const txt = value == null ? '' : String(value), tc = s.n.comps.text;
  if (s.txt === txt && s.t.dataset.set) return;
  s.txt = txt; s.t.dataset.set = '1';
  if (tc.rich !== 0 && isRich(txt)) s.t.innerHTML = richHtml(txt);
  else s.t.textContent = txt;
  const [family, weight] = faceOf(s.scr.ctx.fonts, tc.font, txt, tc.style);
  s.t.style.fontFamily = family; s.t.style.fontWeight = String(weight);
}

/**
 * Shows a picture (a URL) in an image node, or its prefab's sprite again (null): an avatar, a skill icon. A slot for
 * a run-time picture is transparent until filled, and one with no size fills its parent.
 * @param {UiNode | null} s @param {string | null} url
 */
export function setPicture(s, url) {
  if (!s || !s.g || !s.color) return;
  s.picture = url; s.paintKey = '';
  if (url && s.color[3] < 0.05) s.color[3] = 1;
  const rt = s.rt;
  if (url && rt.size[0] <= 0 && rt.size[1] <= 0 && rt.amin[0] === rt.amax[0] && rt.amin[1] === rt.amax[1]) {
    rt.amin = [0, 0]; rt.amax = [1, 1]; rt.size = [0, 0]; rt.pos = [0, 0];
  }
}

/** Whether a subtree holds a stencil reader. @param {UiNode} k @returns {boolean} */
const hasReaders = (k) => k.n.comps.mask === 'stencil' || k.kids.some(hasReaders);

/**
 * Stencil groups, top-down over a built tree (界面-4): among siblings the first stencil graphic writes (a stencil graphic
 * that draws nothing when there is one) and the later ones read — siblings, or inside a sibling; when the group also
 * holds graphics that are not stencilled only the siblings holding readers are masked. Inside a masked subtree the
 * stencil graphics read that writer.
 * @param {UiNode} s @param {boolean} [covered]
 */
export function stencilScan(s, covered = false) {
  if (!covered) stencilGroup(s);
  for (const k of s.kids) stencilScan(k, covered || !!s.stW || !!k.stOuter || k === s.stW);
}

/** The stencil group among a node's children, if any. @param {UiNode} s */
function stencilGroup(s) {
  const st = s.kids.filter((k) => k.n.comps.mask === 'stencil');
  const sg = s.kids.find((k) => k.n.comps.nodraw === 'stencil');
  const wr = sg && (st.length || s.kids.some(hasReaders)) ? sg : st.find((k) => k.n.comps.img);
  if (!wr) return;
  const others = s.kids.filter((k) => k !== wr), holders = others.filter(hasReaders);
  if (!holders.length) return;
  if (holders.length === others.length) s.stW = wr; else for (const k of holders) k.stOuter = wr;
  if (/mask/i.test(wr.n.name) || !wr.n.comps.img?.ref) wr.stHide = true;
}
