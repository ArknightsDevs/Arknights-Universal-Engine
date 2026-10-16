// Legacy AnimationClip curves (docs/spec/ui.md 界面-5): cubic Hermite keys, a slope of ±1e30 or more holding the
// previous key (a stepped key); and how a curve's value lands on a node's state.

/** @typedef {[number, number, number, number]} Key1 time, value, in slope, out slope */
/** @typedef {[number, number[], number[], number[]]} Key3 time, value, in slopes, out slopes */
/**
 * @typedef {{ kind: 'position' | 'scale' | 'euler', path: string, keys: Key3[] }
 *   | { kind: 'float', path: string, attr: string, keys: Key1[] }
 *   | { kind: 'sprite', path: string, attr: string, keys: [number, string | null][] }} Curve
 */
/** A clip's event (界面-32): its time, its kind (start, end, sound, call), a sound's bank, a call's name. @typedef {{ t: number, kind: string, bank?: string, data?: string }} ClipEvent */
/** @typedef {{ wrap: number, length: number, curves: Curve[], events?: ClipEvent[], rate?: number }} Clip */
/**
 * The animated state of a node; a 3D node's (界面-35) local position in all three axes and a camera's field of view.
 * @typedef {{ rt: import('./rect.js').Rect, lp: (number | null)[] | null, alpha: number, color?: number[], active: boolean,
 *   gEnabled: boolean, fill?: number, sprite?: string | null, blocks?: boolean, ray?: boolean,
 *   circle?: { start: number, span: number } | null, prefOver?: (number | null)[] | null, p3?: number[] | null, fov?: number }} Animated
 */

const STEP = 1e29;

/**
 * One Hermite segment, or the first value when either slope is a step.
 * @param {number} a @param {number} b @param {number[]} m [out slope of a, in slope of b] @param {number[]} ut [u, dt]
 */
function hermite(a, b, m, ut) {
  const [m0, m1] = m, [u, dt] = ut;
  if (Math.abs(m0) >= STEP || Math.abs(m1) >= STEP) return a;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * dt * m0 + (-2 * u3 + 3 * u2) * b + (u3 - u2) * dt * m1;
}

/**
 * A curve's value at time t: the first key's value before it, the last key's after it.
 * @template {Key1 | Key3} K @param {K[]} keys @param {number} t @returns {K[1] | null}
 */
export function evalKeys(keys, t) {
  if (!keys.length) return null;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const k0 = keys[i], k1 = keys[i + 1], dt = k1[0] - k0[0], u = (t - k0[0]) / dt;
  if (Array.isArray(k0[1])) {
    const v0 = /** @type {number[]} */ (k0[1]), v1 = /** @type {number[]} */ (k1[1]);
    const o0 = /** @type {number[]} */ (k0[3]), i1 = /** @type {number[]} */ (k1[2]);
    return /** @type {K[1]} */ (v0.map((a, j) => hermite(a, v1[j], [o0[j], i1[j]], [u, dt])));
  }
  return /** @type {K[1]} */ (hermite(/** @type {number} */ (k0[1]), /** @type {number} */ (k1[1]), [/** @type {number} */ (k0[3]), /** @type {number} */ (k1[2])], [u, dt]));
}

/** A sprite curve's sprite at time t: the last key at or before it. @param {[number, string | null][]} keys @param {number} t */
export function spriteAt(keys, t) {
  let v = keys.length ? keys[0][1] : null;
  for (const [at, s] of keys) if (at <= t) v = s;
  return v;
}

const AXIS = /** @type {Record<string, number>} */ ({ x: 0, y: 1, z: 2 });
const CHANNEL = /** @type {Record<string, number>} */ ({ r: 0, g: 1, b: 2, a: 3 });

/** A RectTransform property. @param {Animated} s @param {string} prop @param {number} ax @param {number} v */
function rectProp(s, prop, ax, v) {
  const rt = s.rt;
  switch (prop) {
    case 'm_AnchoredPosition': rt.pos[ax] = v; return true;
    case 'm_SizeDelta': rt.size[ax] = v; return true;
    case 'm_AnchorMin': rt.amin[ax] = v; return true;
    case 'm_AnchorMax': rt.amax[ax] = v; return true;
    case 'm_Pivot': rt.pivot[ax] = v; return true;
    case 'm_LocalScale': if (ax < 2) rt.scale[ax] = v; return true;
    case 'm_LocalPosition': if (ax < 2) { s.lp ??= [null, null]; s.lp[ax] = v; } return true;
    case 'localEulerAngles': case 'localEulerAnglesRaw': case 'localEulerAnglesBaked': if (ax === 2) rt.rotz = v; return true;
    default: return false;
  }
}

/** Any other float property. @param {Animated} s @param {string} prop @param {string} axis @param {number} v */
function otherProp(s, prop, axis, v) {
  switch (prop) {
    case 'm_Alpha': s.alpha = v; return;
    case 'm_Color': case '_color': if (s.color) s.color[CHANNEL[axis] ?? 0] = v; return;
    case 'm_IsActive': s.active = v > 0.5; return;
    case 'm_Enabled': s.gEnabled = v > 0.5; return;
    case 'm_FillAmount': s.fill = v; return;
    default: lobbyProp(s, prop, axis, v);
  }
}

/**
 * The properties the lobby's clips add (界面-24, 界面-34): whether a canvas group blocks taps, whether a graphic is a
 * tap target, a circle bar's start and span, a layout element's preferred size.
 * @param {Animated} s @param {string} prop @param {string} axis @param {number} v
 */
function lobbyProp(s, prop, axis, v) {
  if (prop === 'm_BlocksRaycasts') s.blocks = v > 0.5;
  else if (prop === 'm_RaycastTarget') s.ray = v > 0.5;
  else if (prop === 'circle') { if (s.circle && (axis === 'start' || axis === 'span')) s.circle[axis] = v; }
  else if (prop === 'm_PreferredWidth' || prop === 'm_PreferredHeight') (s.prefOver ??= [null, null])[prop === 'm_PreferredWidth' ? 0 : 1] = v;
  else if (prop === 'field of view') s.fov = v;
}

/**
 * A curve's value at time t applied to a node (界面-5): local position, scale and rotation; the RectTransform's fields;
 * a canvas group's alpha; a graphic's colour, enabled flag and fill amount; the GameObject's active flag; a sprite.
 * @param {Animated} s @param {Curve} c @param {number} t
 */
export function applyCurve(s, c, t) {
  if (c.kind === 'sprite') { s.sprite = spriteAt(c.keys, t); return; }
  if (c.kind === 'float') {
    const v = evalKeys(c.keys, t);
    if (v == null) return;
    const [prop, axis = ''] = c.attr.split('.');
    if (!rectProp(s, prop, AXIS[axis] ?? 0, v)) otherProp(s, prop, axis, v);
    return;
  }
  const p = evalKeys(c.keys, t);
  if (p == null) return;
  if (c.kind === 'position') { s.lp = [p[0], p[1]]; s.p3 = [p[0], p[1], p[2]]; }
  else if (c.kind === 'scale') s.rt.scale = [p[0], p[1]];
  else s.rt.rotz = p[2];
}
