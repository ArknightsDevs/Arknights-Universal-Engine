// A mod's data files as JSON (docs/spec/mods.md mod-9): JSON.parse only, then the keys that would reach an object's
// prototype refused and the nesting bounded — a data file is untrusted input.
import { MOD_LIMITS } from '@aue/schema';

const FORBIDDEN = Object.freeze(['__proto__', 'constructor', 'prototype']);

/**
 * The problem of a parsed value, or null: a forbidden key, or nesting deeper than the limit.
 * @param {unknown} root @returns {string | null}
 */
function valueProblem(root) {
  /** @type {[unknown, number, string][]} */
  const stack = [[root, 1, '']];
  while (stack.length > 0) {
    const [v, depth, path] = /** @type {[unknown, number, string]} */ (stack.pop());
    if (v === null || typeof v !== 'object') continue;
    if (depth > MOD_LIMITS.depth) return `${path || '/'}: nested deeper than ${MOD_LIMITS.depth}`;
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN.includes(k)) return `${path}/${k}: the key "${k}" is not allowed`;
      stack.push([x, depth + 1, `${path}/${k}`]);
    }
  }
  return null;
}

/**
 * A data file's text read as JSON (mod-9). Throws a SyntaxError for text that is not JSON, a RangeError for a
 * forbidden key or nesting too deep.
 * @param {string} text @returns {unknown}
 */
export function strictJson(text) {
  const v = JSON.parse(text);
  const why = valueProblem(v);
  if (why) throw new RangeError(why);
  return v;
}

/** @param {string} text @returns {number} its UTF-8 bytes */
export const utf8Bytes = (text) => new TextEncoder().encode(text).length;
