// Graphics (docs/spec/ui.md 界面-4, 界面-9): an image's sprite tinted by its colour — simple, sliced, tiled or filled —,
// a graphic without a sprite as its colour, gradients, the materials the engine knows (additive blending, scrolling
// UVs), written as CSS on the node's graphic div.
import { slicedUri, tintedUri } from './raster.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/**
 * What a graphic's material does, as the pack names it: plain or additive blending, scrolling UVs (UV units a second,
 * additive when `add`), a stencil shape (a rounded rect [w, h, corner] or a circle [radius] in UV units of the rect),
 * an outline around a text (界面-29), grey, or something the engine does not draw ('none'; with an effect hint `fx`
 * it is drawn plainly by its blending, 界面-9).
 * @typedef {{ kind: 'blend' | 'add' | 'uv' | 'rect' | 'circle' | 'outline' | 'grey' | 'none', uv?: number[], add?: boolean, shape?: number[],
 *   fx?: string, width?: number, color?: number[] }} Material
 */

/** Whether a graphic with this material is drawn (界面-9; no material: the default). @param {Material | undefined} mat */
export const drawable = (mat) => !mat || mat.kind !== 'none' || !!mat.fx;

/** CSS rgba of a colour. @param {readonly number[]} c */
export const rgba = (c) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${+c[3].toFixed(3)})`;

/** The CSS blend of a material: additive for an additive one. @param {Material | undefined} mat */
export const blendOf = (mat) => (mat && (mat.kind === 'add' || mat.add) ? 'plus-lighter' : '');

/**
 * A circle bar's arc (界面-34) as a CSS mask: degrees counter-clockwise from the right, from `start` over `span`.
 * @param {{ start: number, span: number }} c @returns {string}
 */
export function arcMask(c) {
  const span = Math.max(0, Math.min(360, c.span)), from = 90 - c.start - span;
  return `conic-gradient(from ${+from.toFixed(2)}deg, #000 ${+span.toFixed(2)}deg, transparent 0)`;
}

/** The UV scroll of a scrolling material in UV units a second, or null. @param {Material | undefined} mat @returns {number[] | null} */
export const uvSpeed = (mat) => (mat?.kind === 'uv' && mat.uv ? mat.uv : null);

/**
 * The nine-slice borders [left, right, top, bottom] of an image in sprite pixels: an atlas sprite's slice is in UV
 * units of the sprite, an image's border in pixels (left, bottom, right, top).
 * @param {Record<string, any>} im @param {{ w: number, h: number } | undefined} sp
 */
export function sliceOf(im, sp) {
  if (im.kind === 'atlas' && im.slice && sp) {
    const [x0, y0, x1, y1] = im.slice;
    return [Math.round(x0 * sp.w), Math.round((1 - x1) * sp.w), Math.round((1 - y1) * sp.h), Math.round(y0 * sp.h)];
  }
  if (im.border) { const [L, B, R, T] = im.border.map(Math.round); return [L, R, T, B]; }
  return [0, 0, 0, 0];
}

/** Whether an image is nine-sliced. @param {Record<string, any>} im */
export const isSliced = (im) => (im.kind === 'atlas' && im.mesh === 1) || (im.kind === 'image' && im.type === 1 && im.border?.some((/** @type {number} */ v) => v > 0));

/**
 * A filled image's clip (界面-4): horizontal from the left (origin 0) or right, vertical from the bottom (origin 0) or
 * top, radial 360 from the bottom, right, top or left (origin 0–3) clockwise or not.
 * @param {number} f the fill amount @param {number} method @param {number} origin @param {boolean} clockwise
 * @returns {[string, string][]} CSS properties
 */
export function fillCss(f, method, origin, clockwise) {
  const p = (1 - Math.max(0, Math.min(1, f))) * 100;
  if (method === 0) return [['clipPath', origin ? `inset(0 0 0 ${p}%)` : `inset(0 ${p}% 0 0)`]];
  if (method === 1) return [['clipPath', origin ? `inset(0 0 ${p}% 0)` : `inset(${p}% 0 0 0)`]];
  const from = [180, 90, 0, 270][origin] ?? 180, deg = (100 - p) * 3.6;
  const v = clockwise ? `conic-gradient(from ${from}deg, #000 ${deg}deg, transparent 0)` : `conic-gradient(from ${from}deg, transparent ${360 - deg}deg, #000 0)`;
  return [['maskImage', v], ['webkitMaskImage', v]];
}

/**
 * A gradient graphic: its colour points times its colour, running left to right on a vertical tape (direction 1), else
 * bottom to top.
 * @param {{ dir: number, points: [number[], number][] }} grad @param {number[]} color
 */
export function gradientCss(grad, color) {
  const pts = grad.points.map(([c, p]) => `${rgba([c[0] * color[0], c[1] * color[1], c[2] * color[2], c[3] * color[3]])} ${p * 100}%`);
  return pts.length ? `linear-gradient(${grad.dir === 1 ? 'to right' : 'to top'}, ${pts.join(', ')})` : rgba(color);
}

/** Writes a style when it changed. @param {UiNode} s @param {HTMLElement} el @param {string} k @param {string} v */
export function sty(s, el, k, v) {
  const key = (el === s.el ? '' : el === s.g ? 'g.' : 't.') + k;
  if (s.css.get(key) !== v) { s.css.set(key, v); el.style.setProperty(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/^webkit-/, '-webkit-'), v); }
}

/**
 * The colour drawn: the node's colour times a pressed button's tint. A dissolving image's colour drives its effect
 * instead (界面-9): no tint, and it fades as its green channel (the dissolve amount) goes from 0 to 1. @param {UiNode} s
 */
export const drawnColor = (s) => {
  const c = /** @type {number[]} */ (s.color), k = s.tint;
  if (s.n.comps.img?.mat?.fx === 'dissolve') return [1, 1, 1, c[3] * Math.max(0, 1 - c[1]) * (k ? k[3] : 1)];
  return k ? [c[0] * k[0], c[1] * k[1], c[2] * k[2], c[3] * k[3]] : c;
};

/**
 * A picture the page gave (an avatar, an icon) filling the rect, multiplied by the colour: the colour under the
 * picture blended by multiply, cut to the picture's own shape.
 * @param {string} url @param {number[]} col @returns {[string, string][]}
 */
function pictureBackground(url, col) {
  const u = `url("${url}")`, white = col[0] > 0.995 && col[1] > 0.995 && col[2] > 0.995;
  const fit = /** @type {[string, string][]} */ ([['backgroundImage', u], ['backgroundSize', 'cover'], ['backgroundPosition', 'center'], ['backgroundRepeat', 'no-repeat']]);
  if (white) return [...fit, ['backgroundColor', ''], ['backgroundBlendMode', ''], ['maskImage', ''], ['webkitMaskImage', '']];
  return [...fit, ['backgroundColor', rgba([col[0], col[1], col[2], 1])], ['backgroundBlendMode', 'multiply'],
    ['maskImage', u], ['webkitMaskImage', u], ['maskSize', 'cover'], ['webkitMaskSize', 'cover'], ['maskPosition', 'center'], ['webkitMaskPosition', 'center']];
}

/**
 * The background of an image for its sprite, colour and size: none when its sprite is missing, the colour when it has
 * none (Unity draws white), the sprite tinted — nine-sliced to the size, tiled, or stretched (or fitted when it keeps
 * its aspect).
 * @param {UiNode} s @param {Record<string, any>} im @param {number[]} col @param {number} w @param {number} h
 * @returns {[string, string][]}
 */
function imageBackground(s, im, col, w, h) {
  const ctx = s.scr.ctx;
  if (s.picture) return pictureBackground(s.picture, col);
  if (!s.sprite) return im.kind === 'atlas' ? [['backgroundImage', 'none'], ['backgroundColor', '']] : [['backgroundImage', 'none'], ['backgroundColor', rgba([col[0], col[1], col[2], 1])]];
  const sp = ctx.pack.sprites[s.sprite];
  if (!sp) return [['backgroundImage', 'none'], ['backgroundColor', '']];
  if (isSliced(im) && w > 0 && h > 0) {
    const u = slicedUri(ctx, s.sprite, sliceOf(im, sp), col, [w, h]);
    return [['backgroundImage', `url("${u}")`], ['backgroundSize', '100% 100%'], ['backgroundRepeat', 'no-repeat'], ['backgroundColor', '']];
  }
  const url = `url("${tintedUri(ctx, s.sprite, col)}")`;
  if (im.kind === 'image' && im.type === 2) return [['backgroundImage', url], ['backgroundSize', `${sp.w}px ${sp.h}px`], ['backgroundRepeat', 'repeat'], ['backgroundColor', '']];
  return [['backgroundImage', url], ['backgroundSize', im.preserve ? 'contain' : '100% 100%'], ['backgroundRepeat', 'no-repeat'], ['backgroundPosition', 'center'], ['backgroundColor', '']];
}

/** An image's graphic. @param {UiNode} s @param {HTMLElement} g @param {Record<string, any>} im @param {number} w @param {number} h */
function paintImage(s, g, im, w, h) {
  const col = drawnColor(s), key = `${s.sprite}|${s.picture}|${col.slice(0, 3).map((v) => v.toFixed(2)).join(',')}|${Math.round(w)}x${Math.round(h)}`;
  if (key !== s.paintKey) {
    s.paintKey = key;
    for (const [k, v] of imageBackground(s, im, col, w, h)) sty(s, g, k, v);
  }
  sty(s, g, 'opacity', String(+col[3].toFixed(3)));
  const uv = uvSpeed(im.mat);
  if (uv && w > 0) {
    const sp = s.sprite ? s.scr.ctx.pack.sprites[s.sprite] : undefined, t = s.scr.ctx.time;
    const tw = im.type === 2 && sp ? sp.w : w, th = im.type === 2 && sp ? sp.h : h;
    sty(s, g, 'backgroundRepeat', 'repeat');
    sty(s, g, 'backgroundPosition', `${(-(uv[0] * t) % 1 * tw).toFixed(1)}px ${((uv[1] * t) % 1 * th).toFixed(1)}px`);
  }
  if (s.circle) { const m = arcMask(s.circle); sty(s, g, 'maskImage', m); sty(s, g, 'webkitMaskImage', m); }
  else if (s.fill != null) for (const [k, v] of fillCss(s.fill, im.fillMethod ?? 0, im.fillOrigin ?? 0, im.clockwise !== 0)) sty(s, g, k, v);
}

/**
 * Paints a node's graphic for its size: shown while its graphic is enabled (and not a hidden stencil writer); an
 * image, or a gradient.
 * @param {UiNode} s @param {number} w @param {number} h
 */
export function paintGraphic(s, w, h) {
  const c = s.n.comps, g = s.g;
  if (!g || !s.color) return;
  sty(s, g, 'display', s.gEnabled && !s.stHide ? '' : 'none');
  const mat = (c.img || c.grad)?.mat;
  sty(s, g, 'mixBlendMode', blendOf(mat));
  if (mat?.kind === 'grey') sty(s, g, 'filter', 'grayscale(1)');
  if (c.img) paintImage(s, g, c.img, w, h);
  else if (c.grad) sty(s, g, 'background', gradientCss(c.grad, drawnColor(s)));
}
