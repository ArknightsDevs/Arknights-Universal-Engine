// The UI on a page (docs/spec/ui.md 界面-1): a host element over the game, the pack's sprites loaded, screens opened on
// a canvas scaled to the page, a clock that advances the clips and lays every screen out each frame.
import { Animator } from './anim.js';
import { canvasSize } from './rect.js';
import { DEFAULT_FONTS } from './text.js';
import { Screen } from './screen.js';

/** @typedef {import('./node.js').UiPack} UiPack */
/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {import('./node.js').Ctx} Ctx */

/** The engine's base styles: nodes are absolutely placed and let the pointer through unless tappable. */
export const UI_CSS = `.aue-ui{position:absolute;inset:0;overflow:hidden;pointer-events:none;user-select:none;-webkit-user-select:none}
.aue-screen{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none}
.aue-n{position:absolute;box-sizing:border-box;pointer-events:none}
.aue-n.aue-hot{pointer-events:auto;cursor:pointer}
.aue-g{position:absolute;inset:0;background-repeat:no-repeat}
.aue-t{position:absolute;inset:0;display:flex;white-space:pre;line-height:1.12}
.aue-measure{position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre;line-height:1.12}`;

/**
 * A text's measured size in reference pixels (cached by its content and face), at a font size if given.
 * @param {HTMLElement} m the measurer @param {Map<string, number[]>} cache @param {UiNode} s @param {number} [size]
 */
function measureText(m, cache, s, size) {
  const t = /** @type {HTMLElement} */ (s.t), st = t.style, fs = size ? `${size}px` : st.fontSize, wrap = s.wrapW ? Math.round(s.w) : 0;
  const key = `${t.innerHTML}|${fs}|${st.fontFamily}|${st.fontWeight}|${wrap}`;
  const hit = cache.get(key);
  if (hit) return hit;
  Object.assign(m.style, { fontSize: fs, fontFamily: st.fontFamily, fontWeight: st.fontWeight, whiteSpace: wrap ? 'pre-wrap' : 'pre',
    wordBreak: wrap ? 'break-all' : 'normal', width: wrap ? `${wrap}px` : 'auto' });
  m.innerHTML = t.innerHTML;
  const v = [m.offsetWidth, m.offsetHeight];
  if (cache.size > 4000) cache.clear();
  cache.set(key, v);
  return v;
}

/**
 * Creates the UI over a host element.
 * @param {{ pack: UiPack, host: HTMLElement, base?: string, fonts?: Readonly<Record<string, [string, number]>>, doc?: Document }} o
 *   `base`: the URL the pack's sprite files are relative to; `fonts`: the page's faces for the prefabs' fonts
 */
export function createUi(o) {
  const doc = o.doc ?? o.host.ownerDocument, layer = doc.createElement('div'), measurer = doc.createElement('div');
  layer.className = 'aue-ui'; measurer.className = 'aue-measure';
  const style = doc.createElement('style');
  style.textContent = UI_CSS;
  layer.append(style, measurer);
  o.host.appendChild(layer);
  /** @type {Map<string, number[]>} */
  const mcache = new Map();
  /** @type {Ctx} */
  const ctx = { doc, pack: o.pack, base: o.base ?? '', fonts: o.fonts ?? DEFAULT_FONTS, imgs: new Map(), cache: new Map(),
    measure: (s, size) => measureText(measurer, mcache, s, size), time: 0 };
  const anim = new Animator(o.pack.clips);
  /** @type {Screen[]} */
  const screens = [];
  let size = canvasSize(1, 1, o.pack.ref);

  return {
    ctx, anim, screens, layer,
    /** Loads the pack's sprites (each resolves even when it fails; a missing one is not drawn tinted). */
    load() {
      return Promise.all(Object.entries(o.pack.sprites).map(([k, s]) => new Promise((done) => {
        const im = new Image();
        im.onload = () => { ctx.imgs.set(k, im); done(undefined); };
        im.onerror = () => done(undefined);
        im.src = ctx.base + s.uri;
      })));
    },
    /** Opens a prefab (or a subtree of one) as a screen. @param {string} name @param {import('./screen.js').OpenOptions} [opt] */
    open(name, opt) {
      const s = new Screen(ctx, anim, name, opt);
      layer.appendChild(s.wrap);
      screens.push(s);
      return s;
    },
    /** @param {Screen} s */
    close(s) { s.close(); screens.splice(screens.indexOf(s), 1); },
    /** The page's size in CSS pixels: the canvas follows it (界面-1). @param {number} width @param {number} height */
    resize(width, height) { size = canvasSize(width, height, o.pack.ref); },
    /** The canvas: its scale (CSS pixels a reference pixel) and size in reference pixels. */
    get canvas() { return size; },
    /** Advances the clock by dt seconds and lays every screen out. @param {number} dt */
    tick(dt) {
      ctx.time += dt;
      anim.tick(dt);
      for (const s of screens) {
        s.layout(size.w, size.h);
        if (!s.frame) s.wrap.style.transform = `scale(${size.k})`;
      }
    },
  };
}
