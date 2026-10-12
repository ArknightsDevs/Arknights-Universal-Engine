// A screen: a prefab (or a subtree of one) on the page (docs/spec/ui.md 界面-6–界面-8). Nodes are found by the tail of
// their path; the page sets texts, pictures, sprites, colours, sliders and fills, plays clips, binds taps (a pressed
// button tints its target graphic), and instantiates templates into list containers.
import { build, refNode, setPicture, setText, stencilScan } from './node.js';
import { layout } from './layout.js';
import { FULL_RT, copyRect } from './rect.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {import('./node.js').Ctx} Ctx */
/** @typedef {import('./anim.js').Animator} Animator */
/** @typedef {{ z?: number, at?: string, frame?: number[] }} OpenOptions */

/**
 * Unity's Slider showing a value (界面-7): the normalized value fills its fill image when that is a filled image, else
 * sets its fill rect's anchors — 0 to 1 across, and on the slider's axis up to the value (from the far end when the
 * direction is reversed).
 * @param {UiNode} s the slider @param {number} value
 */
export function setSlider(s, value) {
  const sl = s.n.comps.slider;
  if (!sl) return;
  const v = sl.whole ? Math.round(value) : value, n = sl.max > sl.min ? Math.max(0, Math.min(1, (v - sl.min) / (sl.max - sl.min))) : 0;
  const fill = refNode(s, sl.fill);
  if (!fill) return;
  if (fill.n.comps.img?.type === 3) { fill.fill = n; return; }
  const ax = sl.dir < 2 ? 0 : 1, reverse = sl.dir === 1 || sl.dir === 3;
  fill.rt.amin = [0, 0]; fill.rt.amax = [1, 1];
  if (reverse) fill.rt.amin[ax] = 1 - n; else fill.rt.amax[ax] = n;
}

/** The Selectable a tapped node belongs to: the node's own, or its parent's for a hit area child. @param {UiNode} s */
const selectableOf = (s) => s.n.comps.button ?? s.n.comps.toggle ?? s.parent?.n.comps.button ?? s.parent?.n.comps.toggle ?? null;

export class Screen {
  /**
   * @param {Ctx} ctx @param {Animator} anim @param {string} name the prefab @param {OpenOptions} [o] `at`: the path of
   *   the subtree to open; `frame`: the size it is laid out in (else the canvas); `z`: its stacking order
   */
  constructor(ctx, anim, name, o = {}) {
    this.ctx = ctx; this.anim = anim; this.name = name; this.dead = false;
    /** @type {UiNode[]} */ this.all = [];
    /** @type {Map<string, UiNode[]>} */ this.found = new Map();
    this.frame = o.frame ?? null;
    const pn = o.at ? findPack(ctx.pack.screens[name], o.at) : ctx.pack.screens[name];
    if (!pn) throw new Error(`no prefab ${name}${o.at ? `/${o.at}` : ''} in the UI pack`);
    this.wrap = ctx.doc.createElement('div');
    this.wrap.className = 'aue-screen';
    if (o.z != null) this.wrap.style.zIndex = String(o.z);
    this.root = build(pn, null, o.at ?? '', this, o.at ?? '');
    // a root with a rect of its own (a top bar along the top edge, a part of a canvas) keeps it; one without fills
    // the canvas (or the frame)
    if (!pn.rt) this.root.rt = copyRect(FULL_RT);
    stencilScan(this.root);
    this.wrap.appendChild(this.root.el);
  }

  /**
   * Nodes whose path ends with a tail ('name' or 'parent/name'), in a node's subtree if given; an empty tail is that
   * node (or the screen's root).
   * @param {string} tail @param {UiNode} [under]
   */
  q(tail, under) {
    if (!tail) return [under ?? this.root];
    const key = `${under?.path ?? ''}|${tail}`, hit = this.found.get(key);
    if (hit) return hit;
    const base = under ? `${under.path}/` : '';
    const r = this.all.filter((s) => (!under || s === under || s.path.startsWith(base)) && (s.path === tail || s.path.endsWith(`/${tail}`)));
    this.found.set(key, r);
    return r;
  }

  /** @param {string} tail @param {UiNode} [under] */
  one(tail, under) { return this.q(tail, under)[0] ?? null; }
  /** @param {string} tail @param {unknown} v @param {UiNode} [under] */
  text(tail, v, under) { for (const s of this.q(tail, under)) setText(s, v); }
  /** @param {string} tail @param {unknown} v @param {UiNode} [under] */
  show(tail, v, under) { for (const s of this.q(tail, under)) s.active = !!v; }
  /** A picture (a URL; null for the prefab's sprite). @param {string} tail @param {string | null} url @param {UiNode} [under] */
  picture(tail, url, under) { for (const s of this.q(tail, under)) setPicture(s, url); }
  /** A sprite of the pack. @param {string} tail @param {string | null} key @param {UiNode} [under] */
  sprite(tail, key, under) { for (const s of this.q(tail, under)) { s.sprite = key; s.paintKey = ''; } }
  /** A graphic's or text's colour (r, g, b, a in 0–1). @param {string} tail @param {number[]} c @param {UiNode} [under] */
  color(tail, c, under) { for (const s of this.q(tail, under)) if (s.color) s.color = [...c]; }
  /** @param {string} tail @param {number} v @param {UiNode} [under] */
  slider(tail, v, under) { for (const s of this.q(tail, under)) setSlider(s, v); }
  /** A filled image's amount. @param {string} tail @param {number} v @param {UiNode} [under] */
  fill(tail, v, under) { for (const s of this.q(tail, under)) s.fill = v; }
  /** @param {string} tail @param {string} clip @param {import('./anim.js').PlayOptions} [o] @param {UiNode} [under] */
  play(tail, clip, o, under) { return this.anim.play(this.one(tail, under), clip, o); }

  /**
   * Makes nodes tappable: a click on a shown node calls fn; pressing tints its button's target graphic by the pressed
   * colour (界面-6).
   * @param {string} tail @param {(e: Event, s: UiNode) => void} fn @param {UiNode} [under]
   */
  tap(tail, fn, under) {
    for (const s of this.q(tail, under)) {
      s.el.classList.add('aue-hot');
      s.el.addEventListener('click', (e) => { e.stopPropagation(); if (s.shown) fn(e, s); });
      this.press(s);
    }
  }

  /** A listener on nodes (pointer events for drags). @param {string} tail @param {string} type @param {(e: Event, s: UiNode) => void} fn @param {UiNode} [under] */
  on(tail, type, fn, under) {
    for (const s of this.q(tail, under)) { s.el.classList.add('aue-hot'); s.el.addEventListener(type, (e) => fn(e, s)); }
  }

  /** The pressed tint of a node's Selectable on its target graphic. @param {UiNode} s */
  press(s) {
    const sel = selectableOf(s);
    if (!sel || sel.transition !== 1 || !sel.colors || !sel.target) return;
    const target = refNode(s, sel.target);
    if (!target) return;
    s.el.addEventListener('pointerdown', () => { target.tint = sel.colors.pressed; target.paintKey = ''; });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) s.el.addEventListener(ev, () => { target.tint = null; target.paintKey = ''; });
  }

  /**
   * A template prefab instantiated under a node (界面-8): its root keeps the template's rect; a layout group on the
   * container places it.
   * @param {UiNode} parent @param {string} tpl @param {number} [at] its index among the children (else last)
   */
  instantiate(parent, tpl, at) {
    const pn = this.ctx.pack.screens[tpl];
    if (!pn) throw new Error(`no prefab ${tpl} in the UI pack`);
    const s = build(pn, parent, `${parent.path}/${tpl}#${this.all.length}`, this, '');
    stencilScan(s);
    if (at != null && at < parent.kids.length) { parent.el.insertBefore(s.el, parent.kids[at].el); parent.kids.splice(at, 0, s); }
    else { parent.kids.push(s); parent.el.appendChild(s.el); }
    this.found.clear();
    return s;
  }

  /** Removes an instantiated node and its subtree. @param {UiNode} s */
  remove(s) {
    const p = s.parent;
    if (p) p.kids.splice(p.kids.indexOf(s), 1);
    s.el.remove();
    const pre = s.path;
    this.anim.drop((x) => x.s.path === pre || x.s.path.startsWith(`${pre}/`));
    this.all = this.all.filter((x) => x.path !== pre && !x.path.startsWith(`${pre}/`));
    this.found.clear();
  }

  /** Lays the screen out in its frame (or the canvas of w × h). @param {number} w @param {number} h */
  layout(w, h) {
    const [fw, fh] = this.frame ?? [w, h];
    this.wrap.style.width = `${fw}px`; this.wrap.style.height = `${fh}px`;
    layout(this.root, fw, fh, [0.5, 0.5], true);
  }

  close() {
    this.dead = true;
    this.anim.drop((p) => p.s.scr === this);
    this.wrap.remove();
  }
}

/** A prefab's node at a path. @param {import('./node.js').PackNode | undefined} n @param {string} path */
function findPack(n, path) {
  let cur = n;
  for (const part of path.split('/')) cur = cur?.children.find((c) => c.name === part);
  return cur;
}
