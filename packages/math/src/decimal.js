// A finite number as the decimal it was written as (spec 数值-1). Game data gives durations and ratios as decimals
// (0.3, 1.2, 0.05); a float64 holds only the nearest binary value, so arithmetic on it can land an ulp off a whole frame
// or a half. ECMAScript fixes Number::toString to the shortest decimal that reads back to the same float64 (and the
// closest one when several are equally short), so every engine recovers the same decimal: mantissa × 10^exponent.

const FORM = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

/**
 * @param {number} x a finite number ≥ 0
 * @returns {{ mantissa: bigint, exponent: number }} x's shortest decimal, as mantissa × 10^exponent
 */
export function decimalOf(x) {
  if (!Number.isFinite(x) || x < 0) throw new RangeError(`decimalOf: expected a finite number ≥ 0, got ${x}`);
  // Number::toString of a finite x ≥ 0 is digits, optionally ".digits", optionally "e±digits" (−0 prints as "0"), so
  // FORM always matches.
  const [, int, frac = '', exp = '0'] = /** @type {RegExpExecArray} */ (FORM.exec(String(x)));
  return { mantissa: BigInt(int + frac), exponent: Number(exp) - frac.length };
}

/** 10^n for n ≥ 0, exactly. @param {number} n */
export function pow10(n) {
  let p = 1n;
  for (let i = 0; i < n; i++) p *= 10n;
  return p;
}
