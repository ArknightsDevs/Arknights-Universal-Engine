// The direction a unit's model faces (docs/spec/render.md 渲染-4): the official client's four-direction resolution,
// reconstructed from its own code (TOLERANCE_L_OR_R_DIRECTION / ADDON_TO_L_OR_R_DIRECTION and the MapUtil / CharacterAnimator
// chain). The model of an operator attacking something turns toward it; `dir` — the deploy direction that rotates the
// attack range — never moves, this is presentation only.
//
//   ParseDirection(v, addon)   the four-direction argmax of the normalized offset, the HORIZONTAL entries (k = 1, 3)
//                              taking `addon`; the earlier index wins a tie
//   _CalculateLOrRDirection    a horizontal parse decides left / right outright; otherwise x < -0.2 is left, x > +0.2 is
//                              right, and inside that band the PREVIOUS sign is kept (the dead zone that keeps a model
//                              from flickering across the boundary)
//
// In this engine a direction is one of the four DIR values, and the sign is the official 1 (right) / 3 (left).
import { DIR } from '@aue/schema';

/** TOLERANCE_L_OR_R_DIRECTION: the dead zone on the normalized x (|x| <= 0.2 keeps the previous sign). */
export const FACING_TOLERANCE = 0.2;
/** ADDON_TO_L_OR_R_DIRECTION: the bias the horizontal directions get in a biased parse. */
export const FACING_ADDON = 0.25;
/** TOO_CLOSE_TOLERANCE_SQR = 0.0625 = 0.25²: a target closer than this judges no direction at all. */
export const FACING_TOO_CLOSE = 0.25;
/** DIRECTION_ZERO_TOLERANCE: an offset shorter than this is no direction. */
export const FACING_ZERO = 0.01;
/** The |v| threshold the official ParseDirection falls back on (1e-05, inlined there). */
export const FACING_PARSE_EPS = 1e-5;
/** The official sign encoding: 1 = right, 3 = left. */
export const FACE_SIGN_RIGHT = 1;
export const FACE_SIGN_LEFT = 3;
/** FaceSwitcher._defaultLOrR, the sign every operator starts with. */
export const FACE_DEFAULT_SIGN = FACE_SIGN_LEFT;

/** The four directions in ParseDirection's order: up, right, down, left. The board's y grows up, so "up" is +y. */
const DIRS = /** @type {const} */ ([[0, 1], [1, 0], [0, -1], [-1, 0]]);
/** The DIR value of each index of DIRS. */
const DIR_OF = /** @type {const} */ ([DIR.UP, DIR.RIGHT, DIR.DOWN, DIR.LEFT]);

/**
 * MapUtil.ParseDirection: the four-direction argmax with the horizontal bias.
 *
 * `best = dot(v, dirs[0]) + (0 & 1) * addon`, then for k = 1..3 `d = dot(v, dirs[k]) + ((k & 1) * addon)`: only the
 * horizontal entries take `addon`, and ties keep the earlier index (the comparison is a strict `>`).
 * @param {number} dx @param {number} dy @param {number} [addon]
 * @returns {number} 0..3 (up / right / down / left)
 */
export function parseDirection(dx, dy, addon = 0) {
  let x = Number(dx) || 0, y = Number(dy) || 0;
  let m = Math.hypot(x, y);
  if (m < FACING_PARSE_EPS) { x = DIRS[0][0]; y = DIRS[0][1]; m = 1; }
  x /= m; y /= m;
  let best = 0;
  let bestDot = x * DIRS[0][0] + y * DIRS[0][1];
  for (let k = 1; k < 4; k++) {
    const d = x * DIRS[k][0] + y * DIRS[k][1] + ((k & 1) ? Number(addon) || 0 : 0);
    if (d > bestDot) { bestDot = d; best = k; }
  }
  return best;
}

/**
 * The direction a model turns to for a target offset: the axis from a biased parse (so a target clearly above or below
 * takes the back model), the mirror sign from `_CalculateLOrRDirection` (so a target inside the dead zone keeps the
 * sign the model had).
 * @param {number} dx the target's offset in tiles (right positive, up positive) @param {number} dy
 * @param {number} [prevSign] the sign the model had (1 right / 3 left) @returns {{ dir: number | null, sign: number }}
 *   `dir` null = no direction (too close / no offset): keep everything
 */
export function facingDir(dx, dy, prevSign = FACE_DEFAULT_SIGN) {
  const x = Number(dx) || 0, y = Number(dy) || 0;
  const prev = prevSign === FACE_SIGN_RIGHT ? FACE_SIGN_RIGHT : prevSign === FACE_SIGN_LEFT ? FACE_SIGN_LEFT : FACE_DEFAULT_SIGN;
  if (x * x + y * y < FACING_TOO_CLOSE * FACING_TOO_CLOSE) return { dir: null, sign: prev };
  if (Math.abs(x) < FACING_ZERO && Math.abs(y) < FACING_ZERO) return { dir: null, sign: prev };
  const m = Math.hypot(x, y), nx = x / m, ny = y / m;
  const axis = parseDirection(nx, ny, FACING_ADDON);
  const parsed = parseDirection(nx, ny, 0);
  let sign;
  if (parsed === FACE_SIGN_RIGHT || parsed === FACE_SIGN_LEFT) sign = parsed;
  else if (nx < -FACING_TOLERANCE) sign = FACE_SIGN_LEFT;
  else if (nx > FACING_TOLERANCE) sign = FACE_SIGN_RIGHT;
  else sign = prev;
  return { dir: DIR_OF[axis], sign };
}

/** The sign a model facing `dir` alone has: the left direction is the left sign, every other one the right. @param {number} dir */
export const signOf = (dir) => (dir === DIR.LEFT ? FACE_SIGN_LEFT : FACE_SIGN_RIGHT);
