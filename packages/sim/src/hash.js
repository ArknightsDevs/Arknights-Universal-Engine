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

/**
 * A value as canonical JSON (同步-10): object keys in code-unit order, members that are functions or undefined left out
 * (as null in arrays), numbers as JSON writes them.
 * @param {unknown} v @returns {string}
 */
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : canonicalJson(x))).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = /** @type {Record<string, unknown>} */ (v), keys = Object.keys(o).filter((k) => o[k] !== undefined && typeof o[k] !== 'function').sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * The hash of a battle's content (同步-10): FNV-1a (32 bit) over the UTF-16 code units (low byte first) of the
 * canonical JSON of its level, enemies, operators and decks, and the kits it uses when it uses some (兼容-6). Behaviours
 * are code and not hashed.
 * @param {{ level: unknown, enemies: unknown, operators: unknown, decks?: unknown, kits?: unknown }} c @returns {number} uint32
 */
export function contentHash(c) {
  const text = canonicalJson({ level: c.level, enemies: c.enemies, operators: c.operators, decks: c.decks ?? null, ...(c.kits ? { kits: c.kits } : {}) });
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    const u = text.charCodeAt(i);
    h = Math.imul(h ^ (u & 0xff), FNV_PRIME) >>> 0;
    h = Math.imul(h ^ (u >>> 8), FNV_PRIME) >>> 0;
  }
  return h;
}
