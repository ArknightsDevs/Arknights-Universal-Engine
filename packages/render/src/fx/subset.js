// An attack effect pack cut down to some units (docs/spec/render.md 渲染-10): their own effects, the shared ones
// (`common`, `named`) and only the textures those name. A host builds the pack's index once — each effect and texture
// kept as JSON text, each effect with the textures it names — and answers each match from it without holding the
// parsed pack. No three.js here: a server uses it.

/**
 * Every string in a value, at any depth. @param {unknown} v @param {Set<string>} [out] @returns {Set<string>}
 */
function stringsIn(v, out = new Set()) {
  if (typeof v === 'string') out.add(v);
  else if (Array.isArray(v)) for (const x of v) stringsIn(x, out);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) stringsIn(x, out);
  return out;
}

/**
 * The index of an effect pack: its unit and shared tables as they are, each effect as JSON text with the textures it
 * names, each texture as JSON text.
 * @typedef {{ by: Record<string, unknown>, common: Record<string, unknown>, named: Record<string, unknown>, clamp: string[],
 *   fx: Map<string, { json: string, tex: string[] }>, tex: Map<string, string> }} EffectIndex
 */

/** The index of an effect pack (`fx/units.json`'s data). @param {Record<string, any>} data @returns {EffectIndex} */
export function effectIndex(data) {
  /** @type {Map<string, string>} */
  const tex = new Map(Object.entries(data.tex ?? {}).map(([k, uri]) => [k, JSON.stringify(uri)]));
  /** @type {EffectIndex['fx']} */
  const fx = new Map();
  for (const [name, e] of Object.entries(data.fx ?? {})) fx.set(name, { json: JSON.stringify(e), tex: [...stringsIn(e)].filter((s) => tex.has(s)) });
  return { by: data.by ?? {}, common: data.common ?? {}, named: data.named ?? {}, clamp: data.clamp ?? [], fx, tex };
}

/**
 * The pack for some units, as JSON text (渲染-10): `by` for those of the units it has, every effect they or the shared
 * tables name, every texture those effects name, `clamp` of those textures; `common` and `named` whole.
 * @param {EffectIndex} index @param {Iterable<string>} units content keys (operators by character ID, enemies by key)
 * @returns {string}
 */
export function effectSubsetJson(index, units) {
  /** @type {Record<string, unknown>} */
  const by = {};
  const names = stringsIn([index.common, index.named]);
  for (const k of [...new Set(units)].sort()) if (Object.hasOwn(index.by, k)) { by[k] = index.by[k]; stringsIn(by[k], names); }
  const fx = [...names].filter((n) => index.fx.has(n)).sort();
  const kept = new Set(fx.flatMap((n) => /** @type {{ tex: string[] }} */ (index.fx.get(n)).tex)), tex = [...kept].sort();
  const J = JSON.stringify, pairs = (/** @type {string[]} */ ks, /** @type {(k: string) => string} */ at) => ks.map((k) => `${J(k)}:${at(k)}`).join(',');
  return `{"by":${J(by)},"common":${J(index.common)},"named":${J(index.named)},`
    + `"fx":{${pairs(fx, (k) => /** @type {{ json: string }} */ (index.fx.get(k)).json)}},`
    + `"tex":{${pairs(tex, (k) => /** @type {string} */ (index.tex.get(k)))}},"clamp":${J(index.clamp.filter((k) => kept.has(k)))}}`;
}
