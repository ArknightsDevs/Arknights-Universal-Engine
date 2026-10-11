// xⁿ for an integer n the same on every engine (spec 数值-3): square-and-multiply in double-double (Dekker's split, no
// fused multiply-add) with one final rounding. The domain is an integer n with |n| ≤ 2^31 and a finite x with
// |x| ≤ 2^500; anything else is refused rather than handed to Math.pow, whose result differs between engines. A zero
// base takes ECMA-262's exact results, signed zero included (the double-double sum would lose the sign of −0).
import { pow2 } from './words.js';

const SPLIT = 134217729; // 2^27 + 1
const P500 = pow2(500);
const MAX_N = 2147483648;

/**
 * (ah + al)·(bh + bl) in double-double, as [head, tail].
 * @param {number} ah @param {number} al @param {number} bh @param {number} bl @returns {[number, number]}
 */
function mul2(ah, al, bh, bl) {
  const p = ah * bh;
  let t = SPLIT * ah;
  const ahh = t - (t - ah), ahl = ah - ahh;
  t = SPLIT * bh;
  const bhh = t - (t - bh), bhl = bh - bhh;
  const e = ((ahh * bhh - p) + ahh * bhl + ahl * bhh) + ahl * bhl + (ah * bl + al * bh);
  const s = p + e;
  return [s, e - (s - p)];
}

/** ±0 to an integer power, as Math.pow: 1, ±0 (odd n keeps the sign) or ±∞. @param {number} x @param {number} n */
function zeroPow(x, n) {
  if (n === 0) return 1;
  const odd = n % 2 !== 0;
  if (n > 0) return odd ? x : 0;
  return odd ? 1 / x : Infinity;
}

/** @param {number} x @param {number} n @returns {number} */
export function powi(x, n) {
  if (!Number.isInteger(n) || Math.abs(n) > MAX_N || !Number.isFinite(x) || Math.abs(x) > P500) {
    throw new RangeError(`powi: needs an integer exponent and a finite base up to 2^500, got ${x} ** ${n}`);
  }
  if (x === 0) return zeroPow(x, n);
  if (n < 0) return 1 / powi(x, -n);
  let acc = /** @type {[number, number]} */ ([1, 0]), base = /** @type {[number, number]} */ ([x, 0]), k = n;
  while (k > 0) {
    if (k % 2 === 1) acc = mul2(acc[0], acc[1], base[0], base[1]);
    k = Math.floor(k / 2);
    if (k > 0) base = mul2(base[0], base[1], base[0], base[1]);
  }
  return acc[0] + acc[1];
}
