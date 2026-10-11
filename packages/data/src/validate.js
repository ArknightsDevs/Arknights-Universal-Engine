// Validation helpers for untrusted game-data JSON. Every reader throws an Error naming the path of the offending field.

/**
 * @param {unknown} v
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
export function asObject(v, path) {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${path}: expected an object`);
  return /** @type {Record<string, unknown>} */ (v);
}

/**
 * @param {unknown} v
 * @param {string} path
 * @returns {unknown[]}
 */
export function asArray(v, path) {
  if (!Array.isArray(v)) throw new Error(`${path}: expected an array`);
  return v;
}

/**
 * @param {unknown} v
 * @param {string} path
 * @returns {string}
 */
export function asString(v, path) {
  if (typeof v !== 'string' || v === '') throw new Error(`${path}: expected a non-empty string`);
  return v;
}

/**
 * A finite number within [min, max].
 * @param {unknown} v
 * @param {string} path
 * @param {number} [min]
 * @param {number} [max]
 * @returns {number}
 */
export function asNumber(v, path, min = -1e9, max = 1e9) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${path}: expected a finite number`);
  if (v < min || v > max) throw new Error(`${path}: ${v} outside [${min}, ${max}]`);
  return v;
}

/**
 * An integer within [min, max].
 * @param {unknown} v
 * @param {string} path
 * @param {number} [min]
 * @param {number} [max]
 * @returns {number}
 */
export function asInt(v, path, min = -1e9, max = 1e9) {
  const n = asNumber(v, path, min, max);
  if (!Number.isInteger(n)) throw new Error(`${path}: expected an integer, got ${n}`);
  return n;
}

/**
 * A field of an object.
 * @param {Record<string, unknown>} o
 * @param {string} key
 * @param {string} path path of o
 * @returns {unknown}
 */
export function field(o, key, path) {
  if (!Object.hasOwn(o, key)) throw new Error(`${path}.${key}: missing`);
  return o[key];
}

/**
 * The m_value of a { m_defined, m_value } wrapper.
 * @param {Record<string, unknown>} o
 * @param {string} key
 * @param {string} path path of o
 * @returns {unknown}
 */
export function wrapped(o, key, path) {
  const w = asObject(field(o, key, path), `${path}.${key}`);
  return field(w, 'm_value', `${path}.${key}`);
}

/**
 * The m_value of a { m_defined, m_value } wrapper, a finite number.
 * @param {Record<string, unknown>} o
 * @param {string} key
 * @param {string} path path of o
 * @returns {number}
 */
export function wrappedNumber(o, key, path) {
  return asNumber(wrapped(o, key, path), `${path}.${key}.m_value`);
}

/**
 * A { row, col } position with row/col in 0..255 (from `min` when given: a position nothing walks to may lie off the map).
 * @param {unknown} v
 * @param {string} path
 * @param {number} [min]
 * @returns {{ row: number, col: number }}
 */
export function asPos(v, path, min = 0) {
  const o = asObject(v, path);
  return { row: asInt(field(o, 'row', path), `${path}.row`, min, 255), col: asInt(field(o, 'col', path), `${path}.col`, min, 255) };
}
