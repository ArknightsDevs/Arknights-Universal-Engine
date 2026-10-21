// The mods a host serves its players (docs/spec/mods.md mod-10): the list — the mods that loaded, in load order, each
// with its manifest and its data files' bytes and sha256 —, and on a player's side the mods fetched from the host by
// that list, every file checked against it.
import { ENGINE_VERSION, MOD_INDEX_VERSION, modIndexProblem } from '@aue/schema';
import { sha256Text } from './sha256.js';
import { utf8Bytes } from './strict.js';
import { OFFICIAL_SOURCE, createSource } from './source.js';

/**
 * A host's list of its mods (mod-10).
 * @typedef {{ version: 1, engine: string, mods: { id: string, version: string, sha: string, manifest: Record<string, unknown>,
 *   files: { path: string, size: number, sha256: string }[] }[] }} ModIndex
 */

/**
 * The list a host serves (mod-10): the mods its source loaded, in load order, each with its manifest and its data files'
 * UTF-8 bytes and sha256 — the files it serves are these texts.
 * @param {readonly import('./order.js').ModInput[]} inputs the mods the source was made from
 * @param {import('./source.js').ContentSource} source @returns {ModIndex}
 */
export function modIndex(inputs, source) {
  const byId = new Map(inputs.map((i) => [i.id, i]));
  return {
    version: MOD_INDEX_VERSION, engine: ENGINE_VERSION,
    mods: source.mods.map((m) => {
      const input = /** @type {import('./order.js').ModInput} */ (byId.get(m.id)), manifest = /** @type {Record<string, any>} */ (input.manifest);
      const paths = /** @type {string[]} */ (typeof manifest.files.data === 'string' ? [manifest.files.data] : manifest.files.data);
      return { id: m.id, version: m.version, sha: m.sha, manifest, files: paths.map((path) => ({ path, size: utf8Bytes(input.files[path]), sha256: sha256Text(input.files[path]) })) };
    }),
  };
}

/**
 * The mods of a host's list, fetched (mod-10): each data file from `base` + "<mod id>/<path>", its UTF-8 bytes and sha256
 * checked against the list. Throws when the list is malformed or a file differs.
 * @param {string} base a URL ending in "/" @param {unknown} index the list, untrusted
 * @param {(url: string) => Promise<string>} get a file's text
 * @returns {Promise<import('./order.js').ModInput[]>}
 */
export async function fetchMods(base, index, get) {
  const why = modIndexProblem(index);
  if (why) throw new Error(`the host's list of mods: ${why}`);
  const list = /** @type {ModIndex} */ (index);
  /** @type {import('./order.js').ModInput[]} */
  const out = [];
  for (const m of list.mods) {
    /** @type {Record<string, string>} */
    const files = {};
    for (const f of m.files) {
      const text = await get(`${base}${m.id}/${f.path}`);
      if (utf8Bytes(text) !== f.size || sha256Text(text) !== f.sha256) throw new Error(`${m.id}/${f.path} differs from the host's list`);
      files[f.path] = text;
    }
    out.push({ id: m.id, manifest: m.manifest, files });
  }
  return out;
}

/**
 * A player's content source from a host (mod-10): the host's list at `base` + "index.json", its mods fetched and checked,
 * laid over the official content as the host did; the official content alone when the host lists none. Throws when
 * the list or a file is not as it should be.
 * @param {string} base a URL ending in "/" @param {(url: string) => Promise<string>} get a file's text
 * @returns {Promise<import('./source.js').ContentSource>}
 */
export async function hostedSource(base, get) {
  const index = JSON.parse(await get(`${base}index.json`));
  if (Array.isArray(index?.mods) && index.mods.length === 0 && modIndexProblem(index) === null) return OFFICIAL_SOURCE;
  return createSource(await fetchMods(base, index, get));
}
