// Images drawn on a canvas once and cached as data URLs (docs/spec/ui.md 界面-4): a sprite tinted by a colour (multiply,
// the sprite's own alpha kept), a nine-slice drawn at a size (its borders shrink in proportion when the size is smaller
// than they are, like Unity's), a stencil writer's shape as a mask. Before a sprite's image has loaded, or without a
// 2D canvas, the sprite's own file is used.

/** @typedef {import('./node.js').Ctx} Ctx */

const WHITE = 0.995, MAX_CACHE = 600;

/** The URL of a sprite's file. @param {Ctx} ctx @param {string} key */
export const spriteFile = (ctx, key) => ctx.base + (ctx.pack.sprites[key]?.uri ?? '');

/** Whether a colour leaves a sprite as it is. @param {readonly number[]} c */
const isWhite = (c) => c[0] > WHITE && c[1] > WHITE && c[2] > WHITE;

/** Caches a drawn image. @param {Ctx} ctx @param {string} key @param {string} url */
function remember(ctx, key, url) {
  if (ctx.cache.size > MAX_CACHE) ctx.cache.delete(/** @type {string} */ (ctx.cache.keys().next().value));
  ctx.cache.set(key, url);
  return url;
}

/** A canvas of a size, scaled by q, or null without a 2D context. @param {Ctx} ctx @param {number} w @param {number} h @param {number} q */
function canvas2d(ctx, w, h, q) {
  const c = /** @type {HTMLCanvasElement} */ (ctx.doc.createElement('canvas'));
  c.width = Math.max(1, Math.round(w * q)); c.height = Math.max(1, Math.round(h * q));
  const x = c.getContext?.('2d');
  if (!x) return null;
  x.scale(q, q);
  return { c, x };
}

/** Multiplies what is drawn by a colour, keeping its alpha. @param {CanvasRenderingContext2D} x @param {HTMLCanvasElement} c @param {readonly number[]} rgb */
function multiply(x, c, rgb) {
  const copy = /** @type {HTMLCanvasElement} */ (c.ownerDocument.createElement('canvas'));
  copy.width = c.width; copy.height = c.height;
  copy.getContext('2d')?.drawImage(c, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = `rgb(${rgb[0] * 255},${rgb[1] * 255},${rgb[2] * 255})`;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(copy, 0, 0);
}

/**
 * A sprite tinted by a colour (multiply). @param {Ctx} ctx @param {string} key @param {readonly number[]} rgb
 */
export function tintedUri(ctx, key, rgb) {
  const file = spriteFile(ctx, key), im = ctx.imgs.get(key);
  if (isWhite(rgb) || !im) return file;
  const ck = `t|${key}|${rgb.slice(0, 3).map((v) => v.toFixed(2)).join(',')}`;
  const hit = ctx.cache.get(ck);
  if (hit) return hit;
  const d = canvas2d(ctx, im.width, im.height, 1);
  if (!d) return file;
  d.x.drawImage(im, 0, 0);
  multiply(d.x, d.c, rgb);
  return remember(ctx, ck, d.c.toDataURL());
}

/**
 * Draws an image nine-sliced into (X, Y, W, H): corners at their size (all shrunk in proportion when they do not fit),
 * edges stretched along, the centre stretched.
 * @param {CanvasRenderingContext2D} x @param {HTMLImageElement} img @param {number[]} slice [left, right, top, bottom]
 * @param {number[]} box [X, Y, W, H]
 */
export function drawNine(x, img, slice, box) {
  const [L, R, T, B] = slice, [X, Y, W, H] = box, iw = img.width, ih = img.height;
  const kx = L + R > W ? W / (L + R) : 1, ky = T + B > H ? H / (T + B) : 1;
  const sx = [0, L, iw - R, iw], sy = [0, T, ih - B, ih];
  const dx = [X, X + L * kx, X + W - R * kx, X + W], dy = [Y, Y + T * ky, Y + H - B * ky, Y + H];
  // a middle column or row of no width (borders that meet) stretches the one line of pixels where they meet, as Unity does
  const mid = (/** @type {number[]} */ s, /** @type {number} */ i, /** @type {number} */ n) => (i === 1 && s[2] - s[1] <= 0 ? [Math.min(n - 1, Math.max(0, Math.floor(s[1]))), 1] : [s[i], s[i + 1] - s[i]]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const [x0, sw] = mid(sx, i, iw), [y0, sh] = mid(sy, j, ih), dw = dx[i + 1] - dx[i], dh = dy[j + 1] - dy[j];
    if (sw > 0 && sh > 0 && dw > 0 && dh > 0) x.drawImage(img, x0, y0, sw, sh, dx[i], dy[j], dw, dh);
  }
}

/**
 * A nine-sliced sprite at a size (whole pixels, drawn at twice the size), tinted.
 * @param {Ctx} ctx @param {string} key @param {number[]} slice @param {readonly number[]} rgb @param {number[]} size
 */
export function slicedUri(ctx, key, slice, rgb, size) {
  const im = ctx.imgs.get(key);
  if (!im) return spriteFile(ctx, key);
  const W = Math.max(1, Math.round(size[0])), H = Math.max(1, Math.round(size[1]));
  const ck = `s|${key}|${rgb.slice(0, 3).map((v) => v.toFixed(2)).join(',')}|${W}x${H}`;
  const hit = ctx.cache.get(ck);
  if (hit) return hit;
  const d = canvas2d(ctx, W, H, 2);
  if (!d) return spriteFile(ctx, key);
  d.x.imageSmoothingQuality = 'high';
  drawNine(d.x, im, slice, [0, 0, W, H]);
  if (!isWhite(rgb)) multiply(d.x, d.c, rgb);
  return remember(ctx, ck, d.c.toDataURL());
}

/**
 * How much of a wipe shows at a texel (界面-9, INF-0182): its wipe texture's value `n` (0–1) against the image's
 * colour's green `g` (0 shows nothing; about 0.94 and up, all), the material's softness, intensity and whether the
 * colour drives it; smoothed. @param {{ soft?: number, di?: number, rgb?: number }} mat @param {number} g @param {number} n
 */
export function wipeAlpha(mat, g, n) {
  const s = mat.soft ?? 0, u = (mat.rgb ? 1 : 0) * ((mat.di ?? 0) - (1 - g)) + (1 - g);
  const b = 0.55 - 1.05 * (u * (1.05 - s) + s / 2), d = 1 - 2 * s, x0 = n + 2 * b - s;
  const x = Math.max(0, Math.min(1, d > 1e-6 ? x0 / d : x0 > 0 ? 1 : 0));
  return x * x * (3 - 2 * x);
}

/**
 * A wiping image's mask at a green (界面-9): its wipe texture thresholded texel by texel (wipeAlpha), as an image the
 * size of the texture; the green rounded to 1/128; null before the texture has loaded or without a canvas.
 * @param {Ctx} ctx @param {{ noise: string, soft?: number, di?: number, rgb?: number }} mat @param {number} g
 */
export function wipeMaskUri(ctx, mat, g) {
  const q = Math.round(Math.max(0, Math.min(1, g)) * 128) / 128, ck = `w|${mat.noise}|${mat.soft}|${mat.di}|${mat.rgb}|${q}`;
  const hit = ctx.cache.get(ck);
  if (hit) return hit;
  const im = ctx.imgs.get(mat.noise);
  if (!im) return null;
  const d = canvas2d(ctx, im.width, im.height, 1);
  if (!d?.x.getImageData) return null;
  d.x.drawImage(im, 0, 0);
  const px = d.x.getImageData(0, 0, im.width, im.height), a = px.data, lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * wipeAlpha(mat, q, v / 255));
  for (let i = 0; i < a.length; i += 4) { a[i + 3] = lut[a[i]]; a[i] = a[i + 1] = a[i + 2] = 0; }
  d.x.putImageData(px, 0, 0);
  return remember(ctx, ck, d.c.toDataURL());
}

/**
 * A stencil writer's shape at its box: its sprite (sliced when it is), else the shape its material draws — a circle,
 * a rounded rect (UV units of the rect) —, else an ellipse for a round name, else the rect.
 * @param {CanvasRenderingContext2D} x @param {Ctx} ctx @param {import('./node.js').UiNode} k the writer @param {number[]} box
 */
function writerShape(x, ctx, k, [X, Y, W, H]) {
  const im = k.n.comps.img, img = im?.ref ? ctx.imgs.get(im.ref) : undefined;
  if (img) { x.drawImage(img, X, Y, W, H); return; }
  const mat = /** @type {import('./paint.js').Material | undefined} */ (k.n.comps.mat ?? im?.mat), sh = mat?.shape ?? [];
  x.beginPath();
  if (mat?.kind === 'circle') x.ellipse(X + W / 2, Y + H / 2, W * sh[0], H * sh[0], 0, 0, Math.PI * 2);
  else if (mat?.kind === 'rect') x.roundRect(X + (W - W * sh[0]) / 2, Y + (H - H * sh[1]) / 2, W * sh[0], H * sh[1], Math.min(W, H) * sh[2]);
  else if (/circle|round|avatar/i.test(k.n.name)) x.ellipse(X + W / 2, Y + H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
  else x.rect(X, Y, W, H);
  x.fill();
}

/**
 * A stencil writer's shape in a group of w × h (its box inside the group) as a white image (writerShape); with
 * `out`, all of the group but that shape. Null without a canvas.
 * @param {Ctx} ctx @param {import('./node.js').UiNode} k the writer @param {number[]} box [x, y, w, h] in the group
 * @param {number[]} size [w, h] of the group @param {boolean} [out] for readers that draw outside the shape
 */
export function stencilUri(ctx, k, box, [w, h], out = false) {
  const d = canvas2d(ctx, w, h, 2);
  if (!d) return null;
  d.x.fillStyle = '#fff';
  // read outside the shape: all of the group, the shape taken out of it
  if (out) { d.x.fillRect(0, 0, w, h); d.x.globalCompositeOperation = 'destination-out'; }
  writerShape(d.x, ctx, k, box);
  return d.c.toDataURL();
}
