// Small validators for untrusted messages: exact key sets, integers in a range, short identifiers.

/** @param {unknown} x @returns {x is Record<string, unknown>} a plain object (not an array, not null) */
export const isRecord = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/** @param {unknown} x @param {number} lo @param {number} hi @returns {x is number} an integer in [lo, hi] */
export const isInt = (x, lo, hi) => Number.isSafeInteger(x) && /** @type {number} */ (x) >= lo && /** @type {number} */ (x) <= hi;

const ID = /^[A-Za-z0-9_:#-]{1,64}$/;
/** @param {unknown} x @returns {x is string} a content or session id: 1–64 of A–Z a–z 0–9 _ : # - */
export const isId = (x) => typeof x === 'string' && ID.test(x);

/**
 * The problem with an object's keys, or null when they are exactly `keys`.
 * @param {Record<string, unknown>} o @param {readonly string[]} keys @returns {string | null}
 */
export function keyProblem(o, keys) {
  for (const k of Object.keys(o)) if (!keys.includes(k)) return `unknown field ${k}`;
  for (const k of keys) if (!(k in o)) return `missing field ${k}`;
  return null;
}
