// sin and cos the same on every engine (spec 数值-4): fdlibm 5.3 (__kernel_sin, __kernel_cos, the medium path of
// __ieee754_rem_pio2), written with correctly rounded operations only. Arguments beyond 2^19·π/2 are first reduced
// modulo the double nearest 2π (an exact %): deterministic, though not accurate there; the simulation never goes near.
import { hi, fromWords } from './words.js';

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;

/** sin on [−π/4, π/4]; y is the tail of x, iy 0 when y is 0. @param {number} x @param {number} y @param {number} iy */
function kSin(x, y, iy) {
  if ((hi(x) & 0x7fffffff) < 0x3e400000 && Math.trunc(x) === 0) return x;
  const z = x * x, v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

/** cos on [−π/4, π/4]; y is the tail of x. @param {number} x @param {number} y */
function kCos(x, y) {
  const ix = hi(x) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0) return 1;
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0);
  return (1 - qx) - ((0.5 * z - qx) - (z * r - x * y));
}

const NPIO2_HW = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A,
  0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A,
  0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
  0x404858EB, 0x404921FB,
];
const INV_PIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
const TWO_PI = 6.283185307179586;

/** @typedef {{ n: number, y0: number, y1: number }} Reduced x − n·π/2 as head y0 + tail y1 */

/** |x| < 3π/4: n = ±1. @param {number} x @param {number} hx @param {number} ix @returns {Reduced} */
function reduceOne(x, hx, ix) {
  const s = hx > 0 ? 1 : -1;
  let z = x - s * PIO2_1;
  if (ix !== 0x3ff921fb) { const y0 = z - s * PIO2_1T; return { n: s, y0, y1: (z - y0) - s * PIO2_1T }; }
  z -= s * PIO2_2;
  const y0 = z - s * PIO2_2T;
  return { n: s, y0, y1: (z - y0) - s * PIO2_2T };
}

/** One more step of the reduction with a finer piece of π/2. @param {number} r @param {number} n @param {number} p @param {number} pt */
function refine(r, n, p, pt) {
  const t = r, w0 = n * p, r2 = t - w0, w = n * pt - ((t - r2) - w0);
  return { r: r2, w, y0: r2 - w };
}

/** fdlibm's medium path: n = round(|x|·2/π), up to three steps (good to 151 bits). @param {number} x @param {number} hx @param {number} ix @returns {Reduced} */
function reduceMedium(x, hx, ix) {
  const t = Math.abs(x), n = Math.trunc(t * INV_PIO2 + 0.5);
  let r = t - n * PIO2_1, w = n * PIO2_1T, y0 = r - w;
  if (!(n < 32 && ix !== NPIO2_HW[n - 1])) {
    const j = ix >> 20;
    if (j - ((hi(y0) >> 20) & 0x7ff) > 16) {
      ({ r, w, y0 } = refine(r, n, PIO2_2, PIO2_2T));
      if (j - ((hi(y0) >> 20) & 0x7ff) > 49) ({ r, w, y0 } = refine(r, n, PIO2_3, PIO2_3T));
    }
  }
  const y1 = (r - y0) - w;
  return hx < 0 ? { n: -n, y0: -y0, y1: -y1 } : { n, y0, y1 };
}

/** x − n·π/2. @param {number} x0 @returns {Reduced} */
function remPio2(x0) {
  const x = (hi(x0) & 0x7fffffff) > 0x413921fb ? x0 % TWO_PI : x0;
  const hx = hi(x), ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) return { n: 0, y0: x, y1: 0 };
  return ix < 0x4002d97c ? reduceOne(x, hx, ix) : reduceMedium(x, hx, ix);
}

/** @param {number} x radians */
export function sin(x) {
  if (!Number.isFinite(x)) return NaN;
  if ((hi(x) & 0x7fffffff) <= 0x3fe921fb) return kSin(x, 0, 0);
  const { n, y0, y1 } = remPio2(x);
  switch (n & 3) {
    case 0: return kSin(y0, y1, 1);
    case 1: return kCos(y0, y1);
    case 2: return -kSin(y0, y1, 1);
    default: return -kCos(y0, y1);
  }
}

/** @param {number} x radians */
export function cos(x) {
  if (!Number.isFinite(x)) return NaN;
  if ((hi(x) & 0x7fffffff) <= 0x3fe921fb) return kCos(x, 0);
  const { n, y0, y1 } = remPio2(x);
  switch (n & 3) {
    case 0: return kCos(y0, y1);
    case 1: return -kSin(y0, y1, 1);
    case 2: return -kCos(y0, y1);
    default: return kSin(y0, y1, 1);
  }
}
