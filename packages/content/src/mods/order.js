// Reading mods and their load order (docs/spec/mods.md mod-1, mod-3, mod-4, mod-9): each mod's manifest, its data files
// within the limits and as strict JSON, their tables and ids; then the order — what a mod needs first, then by priority
// and id —, a mod that cannot load reported with why, and the mods that need it with it.
import { CONTENT_ID, MOD_LIMITS, MOD_TABLES, readModManifest, versionInRange } from '@aue/schema';
import { strictJson, utf8Bytes } from './strict.js';
import { sha256Text } from './sha256.js';

/**
 * A mod handed to the loader: its folder's id, its pack.json as parsed JSON, its files' texts by path in the folder.
 * @typedef {{ id: string, manifest: unknown, files: Readonly<Record<string, string>> }} ModInput
 */
/**
 * What became of a mod (mod-3): whether it loaded, why not, its warnings; once loaded, the records it added and the
 * ones it changed ("operators/char_010_chen").
 * @typedef {{ id: string, version: string | null, name: string | null, loaded: boolean, problems: string[], warnings: string[], added?: string[], changed?: string[] }} ModReport
 */
/**
 * A mod read, ready to lay over the content: its manifest, its data files in order, the sha256 of its data (mod-8).
 * @typedef {{ manifest: import('@aue/schema').ModManifest, data: { path: string, tables: Record<string, Record<string, Record<string, unknown>>> }[], sha: string, report: ModReport }} ReadMod
 */

/** @param {unknown} x @returns {x is Record<string, any>} */
const isPlain = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * The problems of a data file's value (mod-4): an object of tables, each an object of content id → object.
 * @param {unknown} v @param {string} path @returns {string[]}
 */
function tablesProblems(v, path) {
  if (!isPlain(v)) return [`${path}: not an object of tables`];
  /** @type {string[]} */
  const out = [];
  for (const [table, entries] of Object.entries(v)) {
    if (table === '$schema') continue;
    if (!MOD_TABLES.includes(table)) out.push(`${path}: "${table}" is not a table (${MOD_TABLES.join(', ')})`);
    else if (!isPlain(entries)) out.push(`${path}/${table}: not an object of content id → record or patch`);
    else {
      for (const [id, e] of Object.entries(entries)) {
        if (!CONTENT_ID.test(id) || id.length > 64) out.push(`${path}/${table}/${id}: not a content id`);
        else if (!isPlain(e)) out.push(`${path}/${table}/${id}: not an object`);
      }
    }
  }
  return out;
}

/**
 * A mod's data files read (mod-9): each named, within the limits, strict JSON, of tables (mod-4).
 * @param {import('@aue/schema').ModManifest} manifest @param {Readonly<Record<string, string>>} files @param {string[]} problems
 * @returns {{ path: string, text: string, tables: any }[]}
 */
function dataOf(manifest, files, problems) {
  let total = 0;
  const out = [];
  for (const path of manifest.files.data) {
    const text = Object.hasOwn(files, path) ? files[path] : null;
    if (typeof text !== 'string') {
      problems.push(`${path}: missing`);
      continue;
    }
    const bytes = utf8Bytes(text);
    total += bytes;
    if (bytes > MOD_LIMITS.fileBytes) {
      problems.push(`${path}: ${bytes} bytes, more than ${MOD_LIMITS.fileBytes}`);
      continue;
    }
    try {
      const tables = strictJson(text);
      problems.push(...tablesProblems(tables, path));
      out.push({ path, text, tables });
    } catch (e) {
      problems.push(`${path}: ${/** @type {Error} */ (e).message}`);
    }
  }
  if (total > MOD_LIMITS.modBytes) problems.push(`its data files are ${total} bytes, more than ${MOD_LIMITS.modBytes}`);
  return out;
}

/**
 * A mod read (mod-1, mod-9): its manifest and its data files; null with the report's problems when it cannot load.
 * @param {ModInput} input @returns {{ mod: ReadMod | null, report: ModReport }}
 */
export function readMod(input) {
  const { manifest, problems, warnings } = readModManifest(input.manifest, input.id);
  const m = isPlain(input.manifest) ? input.manifest : {};
  /** @type {ModReport} */
  const report = { id: input.id, version: typeof m.version === 'string' ? m.version : null, name: typeof m.name === 'string' ? m.name : null, loaded: false, problems, warnings };
  if (!manifest) return { mod: null, report };
  const data = dataOf(manifest, input.files, problems);
  if (problems.length > 0) return { mod: null, report };
  const sha = sha256Text(data.map((d) => `${d.path}\n${d.text}\n`).join(''));
  return { mod: { manifest, data: data.map(({ path, tables }) => ({ path, tables })), sha, report }, report };
}

/**
 * The mods a mod still lacks (mod-3): each dependency missing, of a version outside its range, or not loading.
 * @param {ReadMod} m @param {Map<string, ReadMod>} ok @returns {string[]}
 */
function lacking(m, ok) {
  return Object.entries(m.manifest.dependencies).flatMap(([id, range]) => {
    const dep = ok.get(id);
    if (!dep) return [`needs ${id} ${range}, which is not installed or does not load`];
    return versionInRange(dep.manifest.version, range) ? [] : [`needs ${id} ${range}, the installed one is ${dep.manifest.version}`];
  });
}

/**
 * The mods' load order (mod-3): every mod after the mods it needs; of those ready, the lower priority first, then by
 * id. A mod that lacks a dependency, or whose dependencies go round in a circle, does not load, and neither do the mods
 * that need it; their reports say why.
 * @param {ReadMod[]} mods @returns {ReadMod[]}
 */
export function loadOrder(mods) {
  const ok = new Map(mods.map((m) => [m.manifest.id, m]));
  for (let changed = true; changed;) {
    changed = false;
    for (const m of ok.values()) {
      const why = lacking(m, ok);
      if (why.length === 0) continue;
      m.report.problems.push(...why);
      ok.delete(m.manifest.id);
      changed = true;
    }
  }
  /** @type {ReadMod[]} */
  const order = [];
  const placed = new Set();
  const ready = () => [...ok.values()].filter((m) => !placed.has(m.manifest.id) && Object.keys(m.manifest.dependencies).every((d) => placed.has(d)));
  for (let next = ready(); next.length > 0; next = ready()) {
    const m = next.sort((a, b) => a.manifest.priority - b.manifest.priority || (a.manifest.id < b.manifest.id ? -1 : 1))[0];
    order.push(m);
    placed.add(m.manifest.id);
  }
  const circle = [...ok.keys()].filter((id) => !placed.has(id));
  for (const id of circle) /** @type {ReadMod} */ (ok.get(id)).report.problems.push(`its dependencies go round in a circle among ${circle.join(', ')}`);
  return order;
}
