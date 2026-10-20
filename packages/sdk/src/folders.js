// Mods in folders (docs/mods.md): a mod's folder read as the loader takes it — its pack.json and the data files it
// names, each inside the folder once links are resolved, within the limits, as UTF-8 text (a byte order mark dropped).
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { MOD_LIMITS, isDataPath } from '@aue/schema';

/** The most bytes of a pack.json. */
const MANIFEST_BYTES = 64 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** @typedef {import('@aue/content').ModInput} ModInput */
/** A mod's folder read: what the loader takes, and the problems reading it. @typedef {{ input: ModInput, problems: string[] }} ReadFolder */

/**
 * A file's text in a folder, or why not: missing, outside the folder once links are resolved, not a file, larger than
 * `max` bytes, not UTF-8.
 * @param {string} dir @param {string} rel @param {number} max @returns {{ text: string } | { why: string }}
 */
function textIn(dir, rel, max) {
  const p = resolve(dir, rel);
  if (!existsSync(p)) return { why: 'missing' };
  if (!realpathSync(p).startsWith(realpathSync(dir) + sep)) return { why: 'outside the folder' };
  const st = statSync(p);
  if (!st.isFile()) return { why: 'not a file' };
  if (st.size > max) return { why: `${st.size} bytes, more than ${max}` };
  try {
    return { text: UTF8.decode(readFileSync(p)) };
  } catch {
    return { why: 'not UTF-8 text' };
  }
}

/** @param {unknown} m @returns {string[]} the data files a manifest names, the well-formed paths among them */
function namedData(m) {
  const data = /** @type {any} */ (m)?.files?.data;
  return (typeof data === 'string' ? [data] : Array.isArray(data) ? data : []).filter(isDataPath);
}

/**
 * A mod's folder as the loader takes it (mod-1): its id the folder's name, its pack.json parsed, the texts of the data
 * files it names; the problems reading them (a file missing is the loader's to report).
 * @param {string} dir @returns {ReadFolder}
 */
export function readModFolder(dir) {
  /** @type {string[]} */
  const problems = [];
  const m = textIn(dir, 'pack.json', MANIFEST_BYTES);
  /** @type {unknown} */
  let manifest = null;
  if ('why' in m) problems.push(`pack.json: ${m.why}`);
  else {
    try {
      manifest = JSON.parse(m.text);
    } catch (e) {
      problems.push(`pack.json: ${/** @type {Error} */ (e).message}`);
    }
  }
  /** @type {Record<string, string>} */
  const files = {};
  for (const p of namedData(manifest)) {
    const t = textIn(dir, p, MOD_LIMITS.fileBytes);
    if ('text' in t) files[p] = t.text;
    else if (t.why !== 'missing') problems.push(`${p}: ${t.why}`);
  }
  return { input: { id: basename(resolve(dir)), manifest, files }, problems };
}

/** @param {string} dir @returns {boolean} whether a folder holds a mod (a pack.json) */
export const isModFolder = (dir) => existsSync(join(dir, 'pack.json'));

/**
 * The mods in a folder of mods (mod-10): each sub-folder with a pack.json, by name, at most the mods' limit; the
 * folders read with problems, and those over the limit, are skipped with why.
 * @param {string} root @returns {{ inputs: ModInput[], skipped: { id: string, problems: string[] }[] }}
 */
export function readModFolders(root) {
  const dirs = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => join(root, d.name)) : [];
  const read = dirs.filter(isModFolder).sort().map(readModFolder);
  /** @type {ModInput[]} */
  const inputs = [];
  /** @type {{ id: string, problems: string[] }[]} */
  const skipped = [];
  for (const r of read) {
    if (r.problems.length > 0) skipped.push({ id: r.input.id, problems: r.problems });
    else if (inputs.length >= MOD_LIMITS.mods) skipped.push({ id: r.input.id, problems: [`more than ${MOD_LIMITS.mods} mods`] });
    else inputs.push(r.input);
  }
  return { inputs, skipped };
}
