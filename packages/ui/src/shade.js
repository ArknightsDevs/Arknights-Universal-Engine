// Images drawn through their material's effect (docs/spec/ui.md 界面-36): a warp — the image's UVs pulled toward a
// scrolling noise — and a fade by a scrolling noise past a threshold, each from the values the pack gives, run by a
// small GL program on one canvas the UI shares and copied onto a canvas in the node's graphic. Without WebGL, or
// before the image and its noise have loaded, the image is drawn plainly (界面-9).

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {import('./node.js').Ctx} Ctx */
/** @typedef {import('./paint.js').Material} Material */

/** The largest side a drawn effect gets, in device pixels. */
const MAX_SIDE = 2560;
/** How far (texels) its noise or image moves before an effect is drawn again: a slow warp is not drawn every frame. */
const STEP = 0.25;

const VERT = `attribute vec2 p;
varying vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// mode 0, the warp: the UV (scrolled) pulled toward the noise's value by the amount, the image's own colours and alpha
// (its colour drives the speed and amount, not the colours); mode 1, the fade: the image twice its colour and the main
// colour, its alpha times the gain and how far the noise is past the threshold over the width (all of it when the
// threshold is 0)
const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D mainTex, noiseTex;
uniform float mode;
uniform vec4 st, col, mainCol;
uniform vec2 nOff, mOff, amount;
uniform vec3 fade;
void main() {
  float n = texture2D(noiseTex, fract(uv * st.xy + st.zw + nOff)).r;
  vec2 m = uv + mOff;
  if (mode < 0.5) {
    vec4 c = texture2D(mainTex, m + amount * (vec2(n) - m));
    float a = c.a * col.a;
    gl_FragColor = vec4(c.rgb * a, a);
  } else {
    vec4 c = texture2D(mainTex, m);
    float r = fade.x <= 0.0 ? 1.0 : (fade.x >= 1.0 ? -1.0 : 0.0);
    float d = clamp((fade.y * r + n - fade.x) / fade.y, 0.0, 1.0);
    float a = clamp(c.a * mainCol.a * col.a * fade.z * d, 0.0, 1.0);
    if (a < 0.001) a = 0.0;
    gl_FragColor = vec4(min(vec3(1.0), 2.0 * c.rgb * col.rgb * mainCol.rgb) * a, a);
  }
}`;

/** Whether a material is drawn by its effect here (界面-36). @param {Material | undefined} mat */
export const shaded = (mat) => (mat?.fx === 'warp' || mat?.fx === 'fade') && !!mat.noise;

/** A fraction's part in [0, 1). @param {number} v */
const frac = (v) => v - Math.floor(v);

/**
 * The noise's offset now (界面-36): its scroll times the time, a warp's scroll times twice the colour's green.
 * @param {Material} mat @param {readonly number[]} col @param {number} t seconds
 */
export function noiseOffset(mat, col, t) {
  const sp = mat.speed ?? [0, 0], k = mat.fx === 'warp' ? 2 * col[1] : 1;
  return [frac(sp[0] * k * t), frac(sp[1] * k * t)];
}

/**
 * Where a warp samples its image (界面-36): the UV, scrolled, pulled toward the noise's value `n` by the amount times
 * twice the colour's red. @param {Material} mat @param {readonly number[]} col @param {number} t @param {number[]} uv @param {number} n
 */
export function warpUv(mat, col, t, uv, n) {
  const a = mat.amount ?? [0, 0], s = mat.scroll ?? [0, 0];
  return [0, 1].map((i) => { const m = uv[i] + s[i] * t; return m + a[i] * 2 * col[0] * (n - m); });
}

/**
 * How opaque a fade is at a texel (界面-36): the image's alpha `a` (times its colour's and the main colour's) times
 * the gain and how far the noise's value `n` is past the threshold over the width, at most 1; all of it when the
 * threshold is 0. @param {Material} mat @param {number} a @param {number} n
 */
export function fadeAlpha(mat, a, n) {
  const di = mat.di ?? 0, bw = Math.max(1e-4, mat.border ?? 0.1), r = di <= 0 ? 1 : di >= 1 ? -1 : 0;
  const d = Math.max(0, Math.min(1, (bw * r + n - di) / bw)), v = Math.max(0, Math.min(1, a * (mat.opacity ?? 1) * d));
  return v < 0.001 ? 0 : v;
}

/**
 * The UI's shared GL canvas with the program, or null without WebGL (remembered).
 * @param {Ctx} ctx @returns {{ c: HTMLCanvasElement, gl: WebGLRenderingContext, u: Record<string, WebGLUniformLocation | null>, texs: Map<string, WebGLTexture> } | null}
 */
function glOf(ctx) {
  const box = /** @type {any} */ (ctx);
  if (box.gl !== undefined) return box.gl;
  box.gl = null;
  const c = /** @type {HTMLCanvasElement} */ (ctx.doc.createElement('canvas'));
  const o = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false };
  const gl = /** @type {WebGLRenderingContext | null} */ (c.getContext?.('webgl2', o) ?? c.getContext?.('webgl', o) ?? null);
  if (!gl) return null;
  const prog = gl.createProgram();
  for (const [type, src] of /** @type {[number, string][]} */ ([[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]])) {
    const sh = gl.createShader(type);
    if (!sh || !prog) return null;
    gl.shaderSource(sh, src); gl.compileShader(sh); gl.attachShader(prog, sh);
  }
  if (!prog) return null;
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  /** @type {Record<string, WebGLUniformLocation | null>} */
  const u = {};
  for (const k of ['mainTex', 'noiseTex', 'mode', 'st', 'col', 'mainCol', 'nOff', 'mOff', 'amount', 'fade']) u[k] = gl.getUniformLocation(prog, k);
  gl.uniform1i(u['mainTex'] ?? null, 0); gl.uniform1i(u['noiseTex'] ?? null, 1);
  box.gl = { c, gl, u, texs: new Map() };
  return box.gl;
}

/** Whether a size is a power of two. @param {number} v */
const pot = (v) => v > 0 && (v & (v - 1)) === 0;

/**
 * A sprite's texture (bottom row first, as UVs run), uploaded once; a noise repeats when it can.
 * @param {NonNullable<ReturnType<typeof glOf>>} G @param {string} key @param {HTMLImageElement} im @param {boolean} wrap
 */
function texOf(G, key, im, wrap) {
  const hit = G.texs.get(key);
  if (hit) return hit;
  const gl = G.gl, t = /** @type {WebGLTexture} */ (gl.createTexture());
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
  const rep = wrap && (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext || (pot(im.width) && pot(im.height)));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, rep ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  G.texs.set(key, t);
  return t;
}

/** Takes an effect's canvas off a node. @param {UiNode} s */
export function unshade(s) {
  if (!s.shade) return;
  s.shade.c.remove();
  s.shade = null;
}

/** The node's canvas for its effect, at a size. @param {UiNode} s @param {HTMLElement} g @param {number} W @param {number} H */
function canvasOn(s, g, W, H) {
  if (!s.shade) {
    const c = /** @type {HTMLCanvasElement} */ (s.scr.ctx.doc.createElement('canvas')), x = c.getContext('2d');
    if (!x) return null;
    Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    g.appendChild(c);
    s.shade = { c, x };
  }
  const { c, x } = s.shade;
  if (c.width !== W) c.width = W;
  if (c.height !== H) c.height = H;
  return x;
}

/**
 * The images an effect draws from, or null when it cannot run (its image or noise not loaded, a picture, a sliced,
 * tiled or aspect-kept image). @param {UiNode} s @param {Record<string, any>} im
 */
function sources(s, im) {
  const imgs = s.scr.ctx.imgs, main = s.sprite ? imgs.get(s.sprite) : undefined, noise = imgs.get(im.mat.noise);
  if (!main || !noise || s.picture || im.kind !== 'image' || (im.type !== 0 && im.type !== 3) || im.preserve) return null;
  return { main, noise };
}

/** The noise's and the image's offsets now (UV units). @param {Material} mat @param {readonly number[]} col @param {number} t */
function offsets(mat, col, t) {
  const warp = mat.fx === 'warp';
  return { no: noiseOffset(mat, col, t), mo: (mat.scroll ?? [0, 0]).map((v) => (warp ? v * t : frac(v * t))) };
}

/**
 * The program's values for a material at a colour and its offsets.
 * @param {NonNullable<ReturnType<typeof glOf>>} G @param {Material} mat @param {readonly number[]} col @param {ReturnType<typeof offsets>} off
 */
function setValues(G, mat, col, { no, mo }) {
  const gl = G.gl, u = (/** @type {string} */ k) => G.u[k] ?? null, warp = mat.fx === 'warp';
  const st = mat.st ?? [1, 1, 0, 0], am = (mat.amount ?? [0, 0]).map((v) => (warp ? v * 2 * col[0] : 0)), mc = mat.main ?? [1, 1, 1, 1];
  gl.uniform1f(u('mode'), warp ? 0 : 1);
  gl.uniform4f(u('st'), st[0], st[1], st[2], st[3]);
  gl.uniform4f(u('col'), col[0], col[1], col[2], col[3]);
  gl.uniform4f(u('mainCol'), mc[0], mc[1], mc[2], mc[3]);
  gl.uniform2f(u('nOff'), no[0], no[1]);
  gl.uniform2f(u('mOff'), mo[0], mo[1]);
  gl.uniform2f(u('amount'), am[0], am[1]);
  gl.uniform3f(u('fade'), mat.di ?? 0, Math.max(1e-4, mat.border ?? 0.1), mat.opacity ?? 1);
}

/**
 * Whether a node's canvas already shows the effect: drawn at this size and colour, its noise and image moved less than
 * STEP texels since. @param {NonNullable<UiNode['shade']>} sh @param {string} key @param {number[]} at
 */
const drawn = (sh, key, at) => sh.last?.key === key && at.every((v, i) => Math.abs(v - (sh.last?.at[i] ?? 0)) < STEP);

/**
 * Draws an image through its effect (界面-36) onto a canvas in its graphic, at its size on the page (w × h reference
 * pixels); false when it cannot (no WebGL, or see sources), so it is drawn plainly.
 * @param {UiNode} s @param {HTMLElement} g @param {Record<string, any>} im @param {readonly number[]} col @param {number[]} size
 */
export function paintShaded(s, g, im, col, [w, h]) {
  const ctx = s.scr.ctx, src = w > 0 && h > 0 ? sources(s, im) : null, G = src ? glOf(ctx) : null;
  if (!src || !G) return false;
  const dpr = ctx.doc.defaultView?.devicePixelRatio ?? 1, q = Math.min((ctx.k ?? 1) * dpr, MAX_SIDE / Math.max(w, h));
  const W = Math.max(1, Math.round(w * q)), H = Math.max(1, Math.round(h * q)), x = canvasOn(s, g, W, H);
  if (!x) return false;
  const off = offsets(im.mat, col, ctx.time), key = `${W}x${H}|${col.map((v) => v.toFixed(3)).join(',')}`, sh = /** @type {NonNullable<UiNode['shade']>} */ (s.shade);
  const at = [off.no[0] * src.noise.width, off.no[1] * src.noise.height, off.mo[0] * src.main.width, off.mo[1] * src.main.height];
  if (s.alpha <= 0 || drawn(sh, key, at)) return true;
  sh.last = { key, at };
  const gl = G.gl;
  if (G.c.width < W) G.c.width = W;
  if (G.c.height < H) G.c.height = H;
  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOf(G, /** @type {string} */ (s.sprite), src.main, false));
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texOf(G, im.mat.noise, src.noise, true));
  setValues(G, im.mat, col, off);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  x.clearRect(0, 0, W, H);
  x.drawImage(G.c, 0, G.c.height - H, W, H, 0, 0, W, H);
  return true;
}
