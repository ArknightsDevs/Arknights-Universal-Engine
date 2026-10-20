// Graphics (docs/spec/ui.md 界面-4, 界面-9): an image's sprite tinted by its colour — simple, sliced, tiled or filled —,
// a graphic without a sprite as its colour, gradients, the materials the engine knows (additive blending, scrolling
// UVs), written as CSS on the node's graphic div; an image drawn through its effect (界面-36) on a canvas in it.
import { slicedUri, tintedUri, wipeMaskUri } from './raster.js';
import { paintShaded, shaded, unshade } from './shade.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/**
 * What a graphic's material does, as the pack names it: plain or additive blending, scrolling UVs (UV units a second,
 * additive when `add`), a shape (a rounded rect [w, h, corner] or a circle [outer radius, inner radius, outer and
 * inner softness] in UV units of the rect: a stencil writer's shape, else the ring a shown image is cut to),
 * an outline around a text (界面-29), grey, or something the engine does not draw ('none'; with an effect hint `fx`
 * it is drawn plainly by its blending, 界面-9).
 * A wipe (fx 'dissolve') carries its main colour and gain, softness, intensity, whether the image's colour tints it,
 * and its wipe texture's sprite (`noise`). A warp (fx 'warp', 界面-36) carries its noise's sprite and tiling (`st`:
 * scale, offset), the noise's scroll (`speed`) and how far the UVs are pulled (`amount`, UV units), the image's scroll
 * (`scroll`); a fade (fx 'fade') its noise, tiling and scroll, its threshold (`di`), width (`border`), gain
 * (`opacity`), main colour and the image's scroll.
 * @typedef {{ kind: 'blend' | 'add' | 'uv' | 'rect' | 'circle' | 'outline' | 'grey' | 'none', uv?: number[], add?: boolean, shape?: number[],
 *   fx?: string, width?: number, color?: number[], main?: number[], gain?: number, soft?: number, di?: number, rgb?: number, noise?: string,
 *   st?: number[], speed?: number[], amount?: number[], scroll?: number[], border?: number, opacity?: number }} Material
 */

/** Whether a graphic with this material is drawn (界面-9; no material: the default). @param {Material | undefined} mat */
export const drawable = (mat) => !mat || mat.kind !== 'none' || !!mat.fx;

/** CSS rgba of a colour. @param {readonly number[]} c */
export const rgba = (c) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${+c[3].toFixed(3)})`;

/** The CSS blend of a material: additive for an additive one. @param {Material | undefined} mat */
export const blendOf = (mat) => (mat && (mat.kind === 'add' || mat.add) ? 'plus-lighter' : '');

/** Hermite smoothing of a clamped fraction (a shader's smoothstep). @param {number} t */
const smooth = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

/**
 * How opaque a circle shape is at a distance from its rect's centre (UV units: 0.5 is the middle of an edge): inside
 * the outer radius, outside the inner one, each edge softened over its width (界面-9, INF-0190). A shape with one
 * radius is a disk.
 * @param {number[]} shape @param {number} d
 */
export function ringAlpha(shape, d) {
  const [out, inner = 0, os = 0.005, is = 0.005] = shape;
  return Math.max(0, Math.min(1, smooth((out - d) / Math.max(1e-4, os)) - smooth((inner - d) / Math.max(1e-4, is))));
}

/** A circle shape as a CSS mask over its rect: the ring's opacity sampled every 0.01 out to the corners. @param {number[]} shape */
export function ringMask(shape) {
  const stops = [];
  for (let i = 0; i <= 71; i++) stops.push(`rgba(0,0,0,${+ringAlpha(shape, i / 100).toFixed(3)}) ${i}%`);
  return `radial-gradient(ellipse 100% 100% at 50% 50%, ${stops.join(', ')})`;
}

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
 * A gradient graphic as CSS (界面-4): its colour points times the graphic's colour, a vertical tape from left to right,
 * else from bottom to top. A point's place is measured as if the rect's pivot were at its centre: with the pivot on an
 * edge the tape runs from 0.5 at that edge (INF-0189).
 * @param {{ dir?: number, points: [number[], number][] }} grad @param {number[]} color @param {number[]} [pivot]
 */
export function gradientCss(grad, color, pivot = [0.5, 0.5]) {
  const off = 0.5 - (grad.dir === 1 ? pivot[0] : pivot[1]);
  const pts = grad.points.map(([c, p]) => `${rgba([c[0] * color[0], c[1] * color[1], c[2] * color[2], c[3] * color[3]])} ${+((p - off) * 100).toFixed(4)}%`);
  return pts.length ? `linear-gradient(${grad.dir === 1 ? 'to right' : 'to top'}, ${pts.join(', ')})` : rgba(color);
}

/** Writes a style when it changed. @param {UiNode} s @param {HTMLElement} el @param {string} k @param {string} v */
export function sty(s, el, k, v) {
  const key = (el === s.el ? '' : el === s.g ? 'g.' : el === s.uv ? 'u.' : 't.') + k;
  if (s.css.get(key) !== v) { s.css.set(key, v); el.style.setProperty(k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/^webkit-/, '-webkit-'), v); }
}

/**
 * The colour drawn: the node's colour times a pressed button's tint. A wiping image's colour drives its wipe instead
 * (界面-9, INF-0182): it is drawn in its material's main colour (times its own colour when the material says so), its
 * opacity its own times the main colour's; its green is how far the wipe has come (wipeMaskUri). @param {UiNode} s
 */
export const drawnColor = (s) => {
  const c = /** @type {number[]} */ (s.color), k = s.tint, mat = s.n.comps.img?.mat;
  if (mat?.fx === 'dissolve') {
    const m = mat.main ?? [1, 1, 1, 1], g = mat.gain ?? 1, own = mat.rgb ? c : [1, 1, 1];
    return [0, 1, 2].map((i) => Math.min(1, m[i] * own[i] * g)).concat(Math.min(1, c[3] * m[3] * g * (k ? k[3] : 1)));
  }
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
  const col = drawnColor(s);
  if (shaded(im.mat) && paintShaded(s, g, im, col, [w, h])) {
    // drawn through its effect on its canvas, the colour's alpha with it (界面-36)
    if (s.paintKey !== 'shade') { s.paintKey = 'shade'; sty(s, g, 'backgroundImage', 'none'); sty(s, g, 'backgroundColor', ''); }
    sty(s, g, 'opacity', '1');
    paintCut(s, g, im);
    return;
  }
  if (s.shade) { unshade(s); s.paintKey = ''; }
  if (largeRing(s, im, w, h)) { paintRing(s, g, im, col, [w, h]); return; }
  const { uv, tw, th } = scrollOf(s, im, w, h);
  const key = `${s.sprite}|${s.picture}|${col.slice(0, 3).map((v) => v.toFixed(2)).join(',')}|${Math.round(w)}x${Math.round(h)}|${uv ? 'uv' : ''}`;
  if (key !== s.paintKey) {
    s.paintKey = key;
    paintBackground(s, g, imageBackground(s, im, col, w, h), uv ? [tw, th] : null, [w, h]);
  }
  sty(s, g, 'opacity', String(+col[3].toFixed(3)));
  if (uv && s.uv) {
    const t = s.scr.ctx.time;
    sty(s, s.uv, 'transform', `translate3d(${(-(uv[0] * t) % 1 * tw).toFixed(1)}px, ${((uv[1] * t) % 1 * th).toFixed(1)}px, 0)`);
  }
  paintCut(s, g, im);
}

/**
 * How an image scrolls (界面-4): its material's speed (none for an empty box) and the period it repeats at — its
 * sprite's size when tiled, else its own.
 * @param {UiNode} s @param {Record<string, any>} im @param {number} w @param {number} h
 */
function scrollOf(s, im, w, h) {
  const uv = w > 0 ? uvSpeed(im.mat) : null, sp = s.sprite ? s.scr.ctx.pack.sprites[s.sprite] : undefined;
  return { uv, tw: im.type === 2 && sp ? sp.w : w, th: im.type === 2 && sp ? sp.h : h };
}

/**
 * A scrolling or a ring-shaped image as large as this (reference pixels²) or larger is drawn into a canvas of its own,
 * its longer side at most LARGE_CANVAS_MAX pixels (界面-4).
 */
export const LARGE_CANVAS_AREA = 2048 * 2048, LARGE_CANVAS_MAX = 2048;

/**
 * An image's background (界面-4), on its graphic — or, for one that scrolls (界面-4), on a layer inside it one period
 * [tw, th] larger on every side, tiled at that period, that a transform moves: moving the background itself made the
 * browser paint the whole layer again each frame, and a large one (the entry page's ground under its 3D map) went
 * missing on the frames a slower GPU could not paint it in time — the page flickered. A large one's layer is a canvas
 * the tiles are drawn into once at a capped resolution: tiled by the browser, a layer that size under the map's
 * perspective took GPU memory enough that phones dropped the UI above it.
 * @param {UiNode} s @param {HTMLElement} g @param {[string, string][]} bg @param {number[] | null} period @param {number[]} size
 */
function paintBackground(s, g, bg, period, size) {
  if (!period) {
    if (s.uv) dropScrollLayer(s, g);
    for (const [k, v] of bg) sty(s, g, k, v);
    return;
  }
  const [tw, th] = period, big = size[0] * size[1] >= LARGE_CANVAS_AREA;
  if (s.uv && (s.uv.tagName === 'CANVAS') !== big) dropScrollLayer(s, g);
  if (!s.uv) {
    s.uv = /** @type {HTMLElement} */ (g.ownerDocument.createElement(big ? 'canvas' : 'div'));
    Object.assign(s.uv.style, { position: 'absolute', pointerEvents: 'none', willChange: 'transform' });
    g.appendChild(s.uv);
  }
  for (const [k] of bg) if (k !== 'backgroundColor') sty(s, g, k, k === 'backgroundImage' ? 'none' : '');
  sty(s, g, 'backgroundColor', bg.find(([k]) => k === 'backgroundColor')?.[1] ?? '');
  sty(s, g, 'overflow', 'hidden');
  sty(s, s.uv, 'left', `${-tw}px`); sty(s, s.uv, 'top', `${-th}px`);
  sty(s, s.uv, 'width', `calc(100% + ${2 * tw}px)`); sty(s, s.uv, 'height', `calc(100% + ${2 * th}px)`);
  if (big) drawTiles(/** @type {HTMLCanvasElement} */ (s.uv), bg, [size[0] + 2 * tw, size[1] + 2 * th]);
  else tileLayer(s, s.uv, bg, tw, th);
}

/**
 * Whether an image is a large plain colour cut by a circle shape (界面-4; the entry page's ground edge under its 3D
 * map): drawn into a canvas, not masked by the browser. @param {UiNode} s @param {Record<string, any>} im @param {number} w @param {number} h
 */
const largeRing = (s, im, w, h) => im.mat?.kind === 'circle' && !!im.mat.shape && !s.n.comps.mask && !s.sprite && !s.picture && w * h >= LARGE_CANVAS_AREA;

/**
 * A large ring-shaped colour (界面-4) in a canvas filling its graphic, at a resolution whose longer side is at most
 * LARGE_CANVAS_MAX pixels: the ring's opacity over the ellipse of the rect as the CSS mask samples it. A mask that size
 * under the map's perspective took GPU memory enough that phones dropped the UI above it.
 * @param {UiNode} s @param {HTMLElement} g @param {Record<string, any>} im @param {number[]} col @param {number[]} size
 */
function paintRing(s, g, im, col, [w, h]) {
  sty(s, g, 'opacity', String(+col[3].toFixed(3)));
  const key = `ring|${col.slice(0, 3).map((v) => v.toFixed(2)).join(',')}|${Math.round(w)}x${Math.round(h)}`;
  if (key === s.paintKey) return;
  s.paintKey = key;
  if (s.uv && s.uv.tagName !== 'CANVAS') dropScrollLayer(s, g);
  for (const k of ['backgroundImage', 'backgroundColor', 'maskImage', 'webkitMaskImage']) sty(s, g, k, k === 'backgroundImage' ? 'none' : '');
  if (!s.uv) {
    s.uv = /** @type {HTMLElement} */ (g.ownerDocument.createElement('canvas'));
    Object.assign(s.uv.style, { position: 'absolute', pointerEvents: 'none', left: '0px', top: '0px', width: '100%', height: '100%' });
    g.appendChild(s.uv);
  }
  const c = /** @type {HTMLCanvasElement} */ (s.uv), k = Math.min(1, LARGE_CANVAS_MAX / Math.max(w, h, 1));
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext?.('2d');
  if (!x) return;
  // the ellipse of the rect as a circle of the canvas's width, squeezed to its height
  x.setTransform(1, 0, 0, c.height / c.width, c.width / 2, c.height / 2);
  const grad = x.createRadialGradient(0, 0, 0, 0, 0, c.width), rgb = col.slice(0, 3).map((v) => Math.round(v * 255)).join(',');
  for (let i = 0; i <= 71; i++) grad.addColorStop(i / 100, `rgba(${rgb},${+ringAlpha(im.mat.shape, i / 100).toFixed(3)})`);
  x.fillStyle = grad;
  x.fillRect(-c.width / 2, -c.width / 2, c.width, c.width);
}

/** A small scrolling image's layer tiled by the browser at its period. @param {UiNode} s @param {HTMLElement} el @param {[string, string][]} bg @param {number} tw @param {number} th */
function tileLayer(s, el, bg, tw, th) {
  for (const [k, v] of bg) if (k !== 'backgroundColor') sty(s, el, k, v);
  sty(s, el, 'backgroundSize', `${tw}px ${th}px`);
  sty(s, el, 'backgroundRepeat', 'repeat');
  sty(s, el, 'backgroundPosition', '0px 0px');
}

/** A scrolling image's layer gone (it no longer scrolls, or it changed size class). @param {UiNode} s @param {HTMLElement} g */
function dropScrollLayer(s, g) {
  s.uv?.remove(); s.uv = null;
  sty(s, g, 'overflow', '');
  for (const k of [...s.css.keys()]) if (k.startsWith('u.')) s.css.delete(k);
}

/**
 * A large scrolling image's tiles drawn into its canvas of W × H reference pixels once its picture loads: the canvas
 * at a resolution whose longer side is at most LARGE_CANVAS_MAX pixels, the tiles at their size in reference pixels.
 * @param {HTMLCanvasElement} c @param {[string, string][]} bg @param {number[]} WH
 */
function drawTiles(c, bg, [W, H]) {
  const url = /url\("(.*)"\)/.exec(bg.find(([k]) => k === 'backgroundImage')?.[1] ?? '')?.[1];
  const k = Math.min(1, LARGE_CANVAS_MAX / Math.max(W, H, 1));
  c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
  const x = c.getContext?.('2d');
  if (!url || !x) return;
  const img = new (/** @type {any} */ (c.ownerDocument.defaultView)).Image();
  img.onload = () => {
    if (c.parentNode === null) return;
    x.setTransform(k, 0, 0, k, 0, 0);
    x.clearRect(0, 0, W, H);
    x.fillStyle = /** @type {CanvasPattern} */ (x.createPattern(img, 'repeat'));
    x.fillRect(0, 0, W, H);
  };
  img.src = url;
}

/** A wiping image's mask now, as CSS, or null (no wipe, or its texture not loaded). @param {UiNode} s @param {Material | undefined} mat */
function wipeCss(s, mat) {
  if (mat?.fx !== 'dissolve' || !mat.noise || !s.color) return null;
  const u = wipeMaskUri(s.scr.ctx, /** @type {any} */ (mat), s.color[1]);
  return u ? `url("${u}")` : null;
}

/**
 * What of an image shows: a circle bar's arc, a shown circle shape's ring, a filled image's part.
 * @param {UiNode} s @param {HTMLElement} g @param {Record<string, any>} im
 */
function paintCut(s, g, im) {
  const m = s.circle ? arcMask(s.circle) : im.mat?.kind === 'circle' && !s.n.comps.mask && im.mat.shape ? ringMask(im.mat.shape) : wipeCss(s, im.mat);
  if (m) {
    sty(s, g, 'maskImage', m); sty(s, g, 'webkitMaskImage', m);
    if (im.mat?.noise) for (const k of ['maskSize', 'webkitMaskSize']) sty(s, g, k, '100% 100%');
  }
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
  else if (c.grad) sty(s, g, 'background', gradientCss(c.grad, drawnColor(s), s.rt.pivot));
}
