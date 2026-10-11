// atan2 the same on every engine (spec 数值-5): fdlibm as in FreeBSD msun (s_atan.c, e_atan2.c), written with correctly
// rounded operations only. The angle of (x, y) in [−π, π]; the special values are those ECMA-262 gives Math.atan2.
import { hi, lo } from './words.js';

const ATAN_HI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02,
];

/** The argument reduction of atan for 0.4375 ≤ |x| < 2^66: [interval id, reduced x]. @param {number} ax |x| @param {number} ix */
function reduce(ax, ix) {
  if (ix < 0x3ff30000) return ix < 0x3fe60000 ? [0, (2 * ax - 1) / (2 + ax)] : [1, (ax - 1) / (ax + 1)];
  return ix < 0x40038000 ? [2, (ax - 1.5) / (1 + 1.5 * ax)] : [3, -1 / ax];
}

/** @param {number} x0 */
function atan(x0) {
  const hx = hi(x0), ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) { // |x| ≥ 2^66, ∞ or NaN
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lo(x0) !== 0)) return x0 + x0;
    return hx > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
  }
  if (ix < 0x3e200000) return x0; // |x| < 2^-29
  const [id, x] = ix < 0x3fdc0000 ? [-1, x0] : reduce(Math.abs(x0), ix);
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATAN_HI[id] - ((x * (s1 + s2) - ATAN_LO[id]) - x);
  return hx < 0 ? -r : r;
}

const PI_O_4 = 7.8539816339744827900E-01, PI_O_2 = 1.5707963267948965580E+00, PI = 3.1415926535897931160E+00;
const PI_LO = 1.2246467991473532e-16;

/**
 * The results ECMA-262 fixes when y or x is 0 or infinite, or undefined when atan2 has to compute.
 * @param {number} y @param {number} m 2·sign(x) + sign(y) @param {{ hx: number, ix: number, lx: number, hy: number, iy: number, ly: number }} w
 */
function special(y, m, w) {
  if ((w.iy | w.ly) === 0) return m === 2 ? PI : m === 3 ? -PI : y; // y = ±0
  if ((w.ix | w.lx) === 0) return w.hy < 0 ? -PI_O_2 : PI_O_2; // x = ±0
  if (w.ix === 0x7ff00000) { // x = ±∞
    if (w.iy === 0x7ff00000) return [PI_O_4, -PI_O_4, 3 * PI_O_4, -3 * PI_O_4][m];
    return [0, -0, PI, -PI][m];
  }
  if (w.iy === 0x7ff00000) return w.hy < 0 ? -PI_O_2 : PI_O_2; // y = ±∞
  return undefined;
}

/**
 * The angle of (x, y), in [−π, π].
 * @param {number} y @param {number} x
 */
export function atan2(y, x) {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const hx = hi(x), lx = lo(x), hy = hi(y), ly = lo(y);
  const w = { hx, ix: hx & 0x7fffffff, lx, hy, iy: hy & 0x7fffffff, ly };
  if (((hx - 0x3ff00000) | lx) === 0) return atan(y); // x = 1
  let m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);
  const s = special(y, m, w);
  if (s !== undefined) return s;
  const k = (w.iy - w.ix) >> 20;
  let z;
  if (k > 60) { z = PI_O_2 + 0.5 * PI_LO; m &= 1; } // |y/x| > 2^60
  else if (hx < 0 && k < -60) z = 0; // |y|/x < −2^60
  else z = atan(Math.abs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return PI - (z - PI_LO);
    default: return (z - PI_LO) - PI;
  }
}
