// The state hash (spec 同步-1): FNV-1a (32 bit) over the IEEE-754 bits of a sequence of numbers, little-endian. Equal
// sequences give equal hashes on every engine; −0 and 0 differ, and every NaN is hashed as the canonical NaN.

const FNV_OFFSET = 0x811c9dc5, FNV_PRIME = 0x01000193;
/** FNV_PRIME⁴ (mod 2³²): four zero bytes in one step — (h ^ 0) × P four times is h × P⁴. */
const PRIME4 = Math.imul(Math.imul(FNV_PRIME, FNV_PRIME), Math.imul(FNV_PRIME, FNV_PRIME));

/** A number's IEEE-754 bits as two 32-bit words; which word is the low one depends on the platform's byte order. */
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
F64[0] = 1;
const LO = U32[1] === 0x3ff00000 ? 0 : 1, HI = 1 - LO;

/** FNV-1a over a 32-bit word's four bytes, the low byte first. @param {number} h @param {number} x */
function word(h, x) {
  h = Math.imul(h ^ (x & 0xff), FNV_PRIME);
  h = Math.imul(h ^ ((x >>> 8) & 0xff), FNV_PRIME);
  h = Math.imul(h ^ ((x >>> 16) & 0xff), FNV_PRIME);
  return Math.imul(h ^ (x >>> 24), FNV_PRIME);
}

/**
 * FNV-1a over one number's eight bytes, little-endian (every NaN as the canonical one); a zero low word — every whole
 * number below 2²¹ — is one step. @param {number} h @param {number} v @returns {number} uint32
 */
function hashNumber(h, v) {
  F64[0] = v === v ? v : NaN;
  const lo = U32[LO];
  return word(lo === 0 ? Math.imul(h, PRIME4) : word(h, lo), U32[HI]) >>> 0;
}

/**
 * Folds numbers into a running hash.
 * @param {number} h uint32 @param {Iterable<number>} values @returns {number} uint32
 */
export function hashNumbers(h, values) {
  for (const v of values) h = hashNumber(h, v);
  return h;
}

/** A string in the encoding of 同步-1: its tag 1, its length, its UTF-16 code units. @param {number} h @param {string} text */
function hashText(h, text) {
  h = hashNumber(hashNumber(h, 1), text.length);
  for (let i = 0; i < text.length; i++) h = hashNumber(h, text.charCodeAt(i));
  return h;
}

/** How many of an object's own keys hold something (keys holding undefined are skipped, 同步-1). @param {Record<string, unknown>} o */
function definedKeys(o) {
  let n = 0;
  for (const k in o) if (Object.hasOwn(o, k) && o[k] !== undefined) n++;
  return n;
}

/** An object in the encoding of 同步-1: its tag 5, its key count, then each key and value. @param {number} h @param {Record<string, unknown>} o */
function hashObject(h, o) {
  h = hashNumber(hashNumber(h, 5), definedKeys(o));
  for (const k in o) {
    if (!Object.hasOwn(o, k)) continue;
    const x = o[k];
    if (x !== undefined) h = hashValue(hashText(h, k), x);
  }
  return h;
}

/**
 * Plain data in the tagged encoding of 同步-1 (world.js pushValue), folded into a running hash as it is walked: a tag,
 * then the value — numbers (−0 as 0), strings by length and UTF-16 code units, booleans, null, arrays by length then
 * items, objects by key count then each key and value in order; keys holding undefined are skipped.
 * @param {number} h @param {unknown} v @returns {number}
 */
export function hashValue(h, v) {
  if (typeof v === 'number') return hashNumber(hashNumber(h, 0), v + 0);
  if (typeof v === 'string') return hashText(h, v);
  if (typeof v === 'boolean') return hashNumber(hashNumber(h, 2), v ? 1 : 0);
  if (v === null) return hashNumber(h, 3);
  if (Array.isArray(v)) {
    h = hashNumber(hashNumber(h, 4), v.length);
    for (let i = 0; i < v.length; i++) h = hashValue(h, v[i]);
    return h;
  }
  if (typeof v !== 'object') throw new TypeError(`stateHash: not plain data: ${typeof v}`);
  return hashObject(h, /** @type {Record<string, unknown>} */ (v));
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
 * canonical JSON of its level, enemies, operators and decks, the kits it uses when it uses some (兼容-6) and the mods it
 * is made with when there are some (mod-8). Behaviours are code and not hashed.
 * @param {{ level: unknown, enemies: unknown, operators: unknown, decks?: unknown, kits?: unknown, mods?: unknown }} c @returns {number} uint32
 */
export function contentHash(c) {
  const text = canonicalJson({ level: c.level, enemies: c.enemies, operators: c.operators, decks: c.decks ?? null, ...(c.kits ? { kits: c.kits } : {}), ...(c.mods ? { mods: c.mods } : {}) });
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    const u = text.charCodeAt(i);
    h = Math.imul(h ^ (u & 0xff), FNV_PRIME) >>> 0;
    h = Math.imul(h ^ (u >>> 8), FNV_PRIME) >>> 0;
  }
  return h;
}
