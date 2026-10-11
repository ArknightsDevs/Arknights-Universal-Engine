// The state hash (spec 同步-1): FNV-1a (32 bit) over the IEEE-754 bits of a sequence of numbers, little-endian. Equal
// sequences give equal hashes on every engine; −0 and 0 differ, and every NaN is hashed as the canonical NaN.

const buf = new DataView(new ArrayBuffer(8));
const FNV_OFFSET = 0x811c9dc5, FNV_PRIME = 0x01000193;

/**
 * Folds numbers into a running hash.
 * @param {number} h uint32 @param {Iterable<number>} values @returns {number} uint32
 */
export function hashNumbers(h, values) {
  for (const v of values) {
    buf.setFloat64(0, Number.isNaN(v) ? NaN : v, true);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ buf.getUint8(i), FNV_PRIME) >>> 0;
  }
  return h;
}

/** A fresh hash. */
export const HASH_START = FNV_OFFSET;
