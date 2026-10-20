// Patches (docs/spec/mods.md mod-5): JSON Merge Patch (RFC 7386) with lists addressed by index, by `key` or by `id`; an
// element of the { key, value } form takes its value alone. A patch never changes what it is applied to; every value it
// sets or removes is reported by its path, for the conflicts between mods (mod-7).

/** @param {unknown} x @returns {x is Record<string, any>} */
const isPlain = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

const INDEX = /^(0|[1-9]\d{0,5})$/;
/** The identity of a list's elements by the list's name when it is empty: a blackboard's `key`, a skill's or module's `id`. */
const EMPTY_BY = Object.freeze({ blackboard: 'key', skills: 'id', modules: 'id' });

/** A patch that cannot apply: where, and why. */
export class PatchError extends Error {
  /** @param {string} path @param {string} why */
  constructor(path, why) {
    super(`${path}: ${why}`);
    this.name = 'PatchError';
    this.where = path;
  }
}

/** @param {unknown} v @returns {any} a deep copy of a JSON value */
const copy = (v) => (v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v)));

/**
 * The value with a patch applied (mod-5), as a new value: an object merges key by key (null removes the key); a list
 * patched by an object is addressed element by element; anything else replaces. `touched` hears the path of every value
 * set or removed. Throws a PatchError when a list cannot be addressed so.
 * @param {unknown} target @param {unknown} patch @param {string} path @param {(path: string) => void} touched
 * @returns {any}
 */
export function applyPatch(target, patch, path, touched) {
  if (!isPlain(patch)) {
    touched(path);
    return copy(patch);
  }
  if (Array.isArray(target)) return patchList(target, patch, path, touched);
  /** @type {Record<string, any>} */
  const out = isPlain(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    const p = `${path}/${k}`;
    if (v === null) {
      delete out[k];
      touched(p);
    } else {
      out[k] = applyPatch(Object.hasOwn(out, k) ? out[k] : undefined, v, p, touched);
    }
  }
  return out;
}

/**
 * The field that names a list's elements (mod-5): `key` when every element is an object with a text `key`, else `id`
 * alike — null elements aside —; an empty list by its name. Null when the elements cannot be named.
 * @param {unknown[]} list @param {string} path @returns {'key' | 'id' | null}
 */
function nameField(list, path) {
  const items = list.filter((e) => e !== null);
  if (items.length === 0) {
    const name = /** @type {string} */ (path.split('/').pop());
    return Object.hasOwn(EMPTY_BY, name) ? EMPTY_BY[/** @type {keyof typeof EMPTY_BY} */ (name)] : null;
  }
  for (const f of /** @type {const} */ (['key', 'id'])) if (items.every((e) => isPlain(e) && typeof e[f] === 'string')) return f;
  return null;
}

/** @param {Record<string, any>} e @returns {boolean} whether an element is a { key, value } pair */
const isPair = (e) => Object.keys(e).length === 2 && Object.hasOwn(e, 'key') && Object.hasOwn(e, 'value');

/**
 * A list patched by an object (mod-5): by index when every key is a number, else by its elements' names; a null
 * removes the element, a name not in the list adds one.
 * @param {unknown[]} list @param {Record<string, unknown>} patch @param {string} path @param {(path: string) => void} touched
 */
function patchList(list, patch, path, touched) {
  const keys = Object.keys(patch);
  if (keys.length > 0 && keys.every((k) => INDEX.test(k))) return byIndex(list, patch, path, touched);
  const field = nameField(list, path);
  if (field === null) throw new PatchError(path, 'its elements have no key or id to address them by: patch them by index, or write the whole list');
  const names = list.map((e) => (isPlain(e) ? e[field] : null));
  if (new Set(names.filter((n) => n !== null)).size !== names.filter((n) => n !== null).length) {
    throw new PatchError(path, `its elements share a ${field}: patch them by index`);
  }
  const pairs = field === 'key' && list.every((e) => e === null || (isPlain(e) && isPair(e)));
  let out = list.slice();
  for (const k of keys) {
    const p = `${path}/${k}`, v = patch[k], i = names.indexOf(k);
    if (v === null) {
      if (i >= 0) out = out.filter((e) => !(isPlain(e) && e[field] === k));
      touched(p);
      continue;
    }
    const value = pairs && !isPlain(v) ? { value: v } : v;
    if (i >= 0) {
      const at = out.findIndex((e) => isPlain(e) && e[field] === k);
      out[at] = applyPatch(out[at], value, p, touched);
    } else {
      if (!isPlain(value)) throw new PatchError(p, `no element of ${field} "${k}" to set, and a new element must be an object`);
      out.push({ [field]: k, ...applyPatch({}, value, p, touched) });
    }
  }
  return out;
}

/**
 * A list patched element by element at the given indexes (mod-5); the removed ones go after the others are patched.
 * @param {unknown[]} list @param {Record<string, unknown>} patch @param {string} path @param {(path: string) => void} touched
 */
function byIndex(list, patch, path, touched) {
  const out = list.slice(), removed = new Set();
  for (const [k, v] of Object.entries(patch)) {
    const i = Number(k);
    if (i >= list.length) throw new PatchError(`${path}/${k}`, `no element ${i}: the list has ${list.length}`);
    if (v === null) {
      removed.add(i);
      touched(`${path}/${k}`);
    } else {
      out[i] = applyPatch(list[i], v, `${path}/${k}`, touched);
    }
  }
  return out.filter((_, i) => !removed.has(i));
}
