// The two 32-bit words of a float64 (IEEE 754), as fdlibm reads them: `hi` the sign, exponent and top 20 bits of the
// fraction (signed), `lo` the low 32 bits (unsigned). The byte order is detected once.

const F64 = new Float64Array(1);
const I32 = new Int32Array(F64.buffer);
const HW = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0;
const LW = 1 - HW;

/** @param {number} x */
export const hi = (x) => { F64[0] = x; return I32[HW]; };
/** @param {number} x */
export const lo = (x) => { F64[0] = x; return I32[LW] >>> 0; };
/** @param {number} h @param {number} l */
export const fromWords = (h, l) => { I32[HW] = h; I32[LW] = l; return F64[0]; };
/** Exactly 2^e for a normal exponent e. @param {number} e */
export const pow2 = (e) => fromWords((e + 1023) << 20, 0);
