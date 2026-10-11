// √(x² + y²) the same on every engine (spec 数值-2): Math.sqrt(x·x + y·y) — correctly rounded operations only —
// rescaled by exact powers of two outside 2^±500 so it neither overflows nor loses subnormals. ±∞ and NaN arguments take
// the results ECMA-262 specifies exactly for Math.hypot.
import { pow2 } from './words.js';

const P500 = pow2(500), PM500 = pow2(-500), P600 = pow2(600), PM600 = pow2(-600);

/** @param {number} x @param {number} y */
export function hypot(x, y) {
  if (x === Infinity || x === -Infinity || y === Infinity || y === -Infinity) return Infinity;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  const m = Math.max(Math.abs(x), Math.abs(y));
  if (m > P500) { const a = x * PM600, b = y * PM600; return Math.sqrt(a * a + b * b) * P600; }
  if (m < PM500 && m !== 0) { const a = x * P600, b = y * P600; return Math.sqrt(a * a + b * b) * PM600; }
  return Math.sqrt(x * x + y * y);
}
