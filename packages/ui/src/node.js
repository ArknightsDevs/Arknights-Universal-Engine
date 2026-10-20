// A prefab node on the page (docs/spec/ui.md 界面-2–界面-4, 界面-9): a positioned div for the node, a div for its graphic
// and one for its text; its own copy of the rect and the animated state; stencil groups found over a built tree.
import { copyRect, DEF_RT, FULL_RT } from './rect.js';
import { alignCss, faceOf, isRich, richHtml, ringCss, shadowCss } from './text.js';
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
 * and the drawn images cached by key, a text measurer, the clock; whether the pack marks its tap targets (界面-24),
 * the page's sound for the pack's sound banks (界面-32), the behaviours advanced with the clock (scroll views, tweens),
 * and the canvas's scale (CSS pixels a reference pixel).
 * @typedef {{ doc: Document, pack: UiPack, base: string, fonts: Readonly<Record<string, import('./text.js').Face>>,
 *   imgs: Map<string, HTMLImageElement>, cache: Map<string, string>, measure: (s: UiNode, size?: number) => number[],
 *   time: number, rays?: boolean, sound?: (bank: string) => void, tickers?: Set<Ticker>, k?: number }} Ctx
 */
/** A behaviour the clock advances: its screen, and a step of dt seconds that returns false once it is done. @typedef {{ scr: Owner, step: (dt: number) => boolean | void }} Ticker */
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
    /** a scrolling image's background, inside its graphic and moved by a transform (界面-4) @type {HTMLElement | null} */ this.uv = null;
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
    /** the stencil it is masked by is read outside the writer's shape (a not-equal compare) */
    this.stOut = false;
    this.stHide = false; this.stKey = ''; this.paintKey = '';
    /** the canvas an image is drawn on through its effect (界面-36) @type {{ c: HTMLCanvasElement, x: CanvasRenderingContext2D, last?: { key: string, at: number[] } } | null} */ this.shade = null;
    /** its hidden subtree is marked not shown @type {boolean} */ this.sealed = false;
    /** placed by its rect even in a layout group (the page put it there) @type {boolean} */ this.free = false;
    /** @type {string} */ this.txt = '';
    /** @type {number} */ this.wrapW = 0;
    /** the root of the prefab instance the node belongs to, and that root's path in its prefab @type {UiNode} */
    this.proot = parent?.proot ?? this;
    this.pbase = '';
    const c = n.comps;
    /** a tap target (界面-24); its canvas group blocks taps, lets its buttons work @type {boolean} */
    this.ray = rayOf(c, !!scr.ctx.rays);
    this.blocks = c.group?.blocks !== 0; this.inter = c.group?.interactable !== 0;
    /** taps blocked, buttons usable from the groups above (界面-24) */
    this.blockedDown = false; this.interDown = true; this.pressed = false;
    /** a state the page set (界面-25: 0 normal, 1 pressed, 2 disabled; null: by its group) @type {number | null} */ this.look = null;
    /** a circle bar's start and span in degrees (界面-34) @type {{ start: number, span: number } | null} */
    this.circle = c.circle ? { start: c.circle.start, span: c.circle.span } : null;
    /** an animated preferred size [w, h] (null: the layout element's) @type {(number | null)[] | null} */ this.prefOver = null;
    /** a list's items (界面-26) @type {UiNode[] | null} */ this.items = null;
    /** a scaler's factor on the text's size (界面-30) */ this.fontK = 1;
    this.fitKey = ''; this.fadeSeq = 0;
    /** removed with its instance (界面-8) */ this.gone = false;
    /** a scaler's factor last applied (界面-30) @type {number | undefined} */ this.scaleK = undefined;
    this.el.className = 'aue-n';
    this.el.dataset.name = n.name;
  }
}

/**
 * Whether a node is a tap target (界面-24): in a pack that marks them, a graphic marked as one and a tap-only area.
 * @param {Record<string, any>} c @param {boolean} rays
 */
export const rayOf = (c, rays) => rays && (!!(c.img?.ray || c.text?.ray || c.grad?.ray) || c.nodraw === 'raycast');

/**
 * Whether a pack marks its tap targets (界面-24): some graphic of it says whether it is one.
 * @param {UiPack} pack
 */
export function marksRays(pack) {
  /** @param {PackNode} n @returns {boolean} */
  const has = (n) => ['img', 'text', 'grad'].some((k) => n.comps[k] && 'ray' in n.comps[k]) || n.children.some(has);
  return Object.values(pack.screens).some(has);
}

/**
 * A recycling list's content as a layout group (界面-26): a row or a column from the upper left with its padding and
 * spacing, every item built.
 * @param {PackNode} n @returns {PackNode}
 */
function withRecycle(n) {
  const r = n.comps.recycle;
  if (!r || n.comps.lg) return n;
  const lg = { dir: r.dir === 'h' ? 'h' : 'v', pad: [...r.pad], spacing: r.spacing, align: 0, cw: 0, ch: 0, fw: 0, fh: 0, rev: 0 };
  return { ...n, comps: { ...n.comps, lg } };
}

/**
 * The node at a path under a node ('' is the node itself): siblings may share a name, so each of them is tried in
 * order until the rest of the path is found (界面-8). @param {UiNode} s @param {string} path @returns {UiNode | null}
 */
export function nodeAt(s, path) {
  const parts = path ? path.split('/') : [];
  /** @param {UiNode} cur @param {number} i @returns {UiNode | null} */
  const go = (cur, i) => {
    if (i === parts.length) return cur;
    for (const k of cur.kids) {
      const r = k.n.name === parts[i] ? go(k, i + 1) : null;
      if (r) return r;
    }
    return null;
  };
  return go(s, 0);
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
 * The first clip of a node's own animation (界面-5: the clips its animation component holds), or null — what a
 * controller names by the node alone plays. @param {UiNode | null | undefined} s
 */
export const ownClip = (s) => /** @type {string | null} */ (s?.n.comps.anim?.clips?.[0] ?? null);

/**
 * Builds a node and its subtree (界面-9: a graphic is drawn only when its material's shader is one the engine knows; a
 * mask graphic hidden by its Mask, stencil and raycast-only graphics are not drawn).
 * @param {PackNode} n @param {UiNode | null} parent @param {string} path @param {Owner} scr
 * @param {string} [base] when given, the node starts a prefab instance: its path in its prefab
 */
export function build(n, parent, path, scr, base) {
  const nn = withRecycle(n), s = new UiNode(nn, parent, path, scr), c = nn.comps, doc = scr.ctx.doc;
  if (base != null) { s.proot = s; s.pbase = base; }
  buildGraphic(s, c, doc);
  if (c.text && drawable(c.text.mat)) buildText(s, c);
  // a soft mask reading another graphic shows its subtree through that graphic only, not cut to its own rect (layout.js)
  if (c.mask && !c.softMask?.mask) s.el.style.overflow = 'hidden';
  if (c.click) clickSound(s, c.click);
  scr.all.push(s);
  for (const ch of n.children) s.kids.push(build(ch, s, `${path}/${ch.name}`, scr));
  for (const k of s.kids) s.el.appendChild(k.el);
  return s;
}

/**
 * A click sound (界面-32): a tap on the node plays its type's bank from the pack, when the page gave a sound.
 * @param {UiNode} s @param {{ type: number }} click
 */
function clickSound(s, click) {
  const ctx = s.scr.ctx, bank = /** @type {any} */ (ctx.pack).sounds?.click?.[String(click.type)];
  if (bank) s.el.addEventListener('click', () => { if (s.shown && s.interDown) ctx.sound?.(bank); });
}

/**
 * An image whose look is all its effect's (界面-9): an effect hint, no material the engine draws, and no sprite of its
 * own — the effect's texture is not in the pack, so it is not drawn. @param {Record<string, any>} c
 */
const effectOnly = (c) => !!c.img && !c.img.ref && c.img.mat?.kind === 'none' && !!c.img.mat.fx;

/** A graphic's div, its colour, sprite and fill. @param {UiNode} s @param {Record<string, any>} c @param {Document} doc */
function buildGraphic(s, c, doc) {
  const g0 = c.img || c.grad;
  if (!g0 || c.maskHide || c.nodraw || !drawable(g0.mat) || effectOnly(c)) return;
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
  if (c.text.hwrap === 0 && c.text.best !== 1 && !ownWidth(s, c)) wrapText(s);
  const shadows = [c.outline ? shadowCss(c.outline) : '', c.text.mat?.kind === 'outline' ? ringCss(c.text.mat) : ''].filter(Boolean);
  if (shadows.length) t.style.textShadow = shadows.join(', ');
  setText(s, c.text.text || '');
}

/**
 * Whether a wrapping text never wraps (界面-4): sized to its own width — by a content size fitter at its preferred
 * width, or by a horizontal layout group that sets its children's widths without stretching them — it is that wide
 * unwrapped; dropping the lines it has no room for (vertical overflow: truncate) in a rect one line high, it shows one
 * — unless a layout group or a fitter sets its height, which is then all its lines.
 * @param {UiNode} s @param {Record<string, any>} c
 */
function ownWidth(s, c) {
  const lg = s.parent?.n.comps.lg;
  if (fittedWidth(c, lg)) return true;
  return lg?.ch !== 1 && c.csf?.[1] !== 2 && oneLineHigh(s, c);
}

/**
 * A text sized to its preferred width: by a content size fitter, or by a horizontal layout group that sets widths
 * without stretching it. @param {Record<string, any>} c @param {Record<string, any> | undefined} lg
 */
function fittedWidth(c, lg) {
  const flex = c.le?.flex?.[0] ?? -1;
  return c.csf?.[0] === 2 || (lg?.dir === 'h' && lg.cw === 1 && !lg.fw && !(flex > 0));
}

/** A truncating text whose rect is one line high. @param {UiNode} s @param {Record<string, any>} c */
function oneLineHigh(s, c) {
  const rt = s.n.rt;
  return c.text.vwrap === 0 && !!rt && rt.amin[1] === rt.amax[1] && rt.size[1] < 2 * c.text.size * 1.12;
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
  // rich text in one inline run: the text box lays its children out as flex items, which would split it into columns
  if (tc.rich !== 0 && isRich(txt)) s.t.innerHTML = `<span class="aue-r">${richHtml(txt)}</span>`;
  else s.t.textContent = txt;
  const [family, weight, caps] = faceOf(s.scr.ctx.fonts, tc.font, txt, tc.style);
  s.t.style.fontFamily = family; s.t.style.fontWeight = String(weight); s.t.style.textTransform = caps ? 'uppercase' : '';
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

/** Whether a subtree's stencil reader draws where its writer did not (a not-equal compare). @param {UiNode} k @returns {boolean} */
const readsOutside = (k) => (k.n.comps.mask === 'stencil' ? !!k.n.comps.stencilOut : k.kids.some(readsOutside));

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
  if (holders.length === others.length) { s.stW = wr; s.stOut = others.some(readsOutside); } else for (const k of holders) { k.stOuter = wr; k.stOut = readsOutside(k); }
  if (/mask/i.test(wr.n.name) || !wr.n.comps.img?.ref) wr.stHide = true;
}
