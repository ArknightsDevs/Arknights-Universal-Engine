// Content sources (docs/spec/mods.md mod-3…mod-8): the official content — the built-in mod `official` (ADR 0037) — with
// mods laid over it in their load order. A mod changes records by patches (mod-5) and adds records under its own prefix
// (mod-4); what it leaves must pass the records' checks (mod-6), or none of it applies. Two mods changing the same value,
// neither needing the other, are reported (mod-7).
import { MOD_TABLES } from '@aue/schema';
import { LEVELS } from '../levels.js';
import { ROSTER, loadTraining } from '../operators.js';
import { TOKENS, loadToken } from '../tokens.js';
import { applyPatch, PatchError } from './patch.js';
import { recordProblems } from './shapes.js';
import { readMod, loadOrder } from './order.js';

/** @typedef {import('./order.js').ModInput} ModInput @typedef {import('./order.js').ModReport} ModReport @typedef {import('./order.js').ReadMod} ReadMod */
/** @typedef {{ name: string, rarity: number, profession: string, branch: string, mod?: string, look?: string }} RosterEntry */
/**
 * Where a match's content comes from (mod-8): the operators to choose from, the levels, an operator's and a summon's
 * record by id; the mods it is made with, in load order, what became of each mod given, and the conflicts between them.
 * @typedef {{ mods: readonly { id: string, version: string, sha: string }[], reports: readonly ModReport[], conflicts: readonly string[],
 *   roster: Readonly<Record<string, RosterEntry>>, levels: Readonly<Record<string, any>>,
 *   training: (id: string) => Promise<import('../operators.js').Training>, token: (id: string) => Promise<any> }} ContentSource
 */
/** @typedef {'operators' | 'tokens' | 'levels'} RecordTable */
/** The records changed or added so far, by table and id. @typedef {Record<RecordTable, Map<string, any>>} Layer */
/** A value a mod set or removed: its path, under its record's ("operators/char_010_chen"). @typedef {{ record: string, path: string, mod: string }} Touch */

/** The official content alone. @type {ContentSource} */
export const OFFICIAL_SOURCE = Object.freeze({
  mods: Object.freeze([]), reports: Object.freeze([]), conflicts: Object.freeze([]), roster: ROSTER, levels: LEVELS, training: loadTraining, token: loadToken,
});

/** The branches of the official operators: an operator's must be one (职业-7). */
const BRANCH_SET = new Set(Object.values(ROSTER).map((r) => r.branch));

/** A mod's changes that cannot apply: one problem or several. */
class ModProblem extends Error {
  /** @param {string | string[]} why */
  constructor(why) {
    const problems = typeof why === 'string' ? [why] : why;
    super(problems.join('; '));
    this.problems = problems;
  }
}

/**
 * An official record, or null.
 * @param {RecordTable} table @param {string} id @returns {Promise<any>}
 */
async function official(table, id) {
  if (table === 'operators') return Object.hasOwn(ROSTER, id) ? loadTraining(id) : null;
  if (table === 'tokens') return Object.hasOwn(TOKENS, id) ? loadToken(id) : null;
  return Object.hasOwn(LEVELS, id) ? /** @type {Record<string, any>} */ (LEVELS)[id] : null;
}

/**
 * One mod laid over the content so far (mod-4, mod-5): its records, and the values it touched.
 * @param {ReadMod} mod @param {Layer} base
 */
async function layOver(mod, base) {
  const id = mod.manifest.id;
  /** @type {Layer} */
  const staged = { operators: new Map(), tokens: new Map(), levels: new Map() };
  /** @type {Touch[]} */
  const touches = [];
  const entries = mod.data.flatMap(({ path, tables }) => MOD_TABLES.flatMap((table) => Object.entries(tables[table] ?? {}).map(([key, patch]) => ({ path, table, key, patch }))));
  for (const { path, table, key, patch } of entries) {
    const at = `${path}: ${table}/${key}`, record = `${table}/${key}`;
    /** @param {string} p */
    const touch = (p) => touches.push({ record, path: p, mod: id });
    try {
      if (table === 'enemies') await patchEnemy({ key, patch, at, touch, staged, base });
      else await patchRecord({ table: /** @type {RecordTable} */ (table), key, patch, at, mod: id }, touch, staged, base);
    } catch (e) {
      throw e instanceof PatchError ? new ModProblem(`${path}: ${e.message}`) : e;
    }
  }
  return { staged, touches };
}

/**
 * An operator's, a summon's or a level's patch, or a new record (mod-4).
 * @param {{ table: RecordTable, key: string, patch: Record<string, unknown>, at: string, mod: string }} a
 * @param {(p: string) => void} touch @param {Layer} staged @param {Layer} base
 */
async function patchRecord(a, touch, staged, base) {
  const { table, key } = a, record = `${table}/${key}`;
  const was = staged[table].get(key) ?? base[table].get(key) ?? (await official(table, key));
  staged[table].set(key, was ? applyPatch(was, a.patch, record, touch) : added(a));
  if (!was) touch(record);
}

/**
 * A record a mod adds (mod-4): an operator or a level under the mod's prefix, as written.
 * @param {{ table: RecordTable, key: string, patch: Record<string, unknown>, at: string, mod: string }} a @returns {any}
 */
function added({ table, key, patch, at, mod }) {
  if (table === 'tokens') throw new ModProblem(`${at}: no such summon; summons can be changed, not added`);
  if (!key.startsWith(`${mod}:`)) throw new ModProblem(`${at}: no such ${table === 'operators' ? 'operator' : 'level'}; a new one's id starts with "${mod}:"`);
  return JSON.parse(JSON.stringify(patch));
}

/**
 * An enemy's patch, in every level that has it (mod-4).
 * @param {{ key: string, patch: Record<string, unknown>, at: string, touch: (p: string) => void, staged: Layer, base: Layer }} a
 */
async function patchEnemy({ key, patch, at, touch, staged, base }) {
  if (key.includes(':')) throw new ModProblem(`${at}: enemies can be changed, not added`);
  const ids = new Set([...Object.keys(LEVELS), ...base.levels.keys(), ...staged.levels.keys()]);
  const seen = new Set();
  let found = false;
  for (const lv of ids) {
    const level = staged.levels.get(lv) ?? base.levels.get(lv) ?? (await official('levels', lv));
    if (!level || !Object.hasOwn(level.enemies, key)) continue;
    found = true;
    const enemy = applyPatch(level.enemies[key], patch, `enemies/${key}`, (p) => {
      if (!seen.has(p)) touch(p);
      seen.add(p);
    });
    staged.levels.set(lv, { ...level, enemies: { ...level.enemies, [key]: enemy } });
  }
  if (!found) throw new ModProblem(`${at}: no level has this enemy`);
}

/**
 * The problems of a mod's records (mod-6): their shapes, an operator's branch and summons, the look of one it adds, a
 * level's own id.
 * @param {Layer} staged @returns {string[]}
 */
function stagedProblems(staged) {
  const out = [];
  for (const [table, records] of /** @type {[RecordTable, Map<string, any>][]} */ (Object.entries(staged))) {
    for (const [key, rec] of records) {
      const shape = recordProblems(table, rec, `${table}/${key}`);
      out.push(...shape);
      if (shape.length === 0) out.push(...linkProblems(table, key, rec));
    }
  }
  return out;
}

/**
 * @param {RecordTable} table @param {string} key @param {any} rec @returns {string[]}
 */
function linkProblems(table, key, rec) {
  const at = `${table}/${key}`, out = [];
  if (table === 'levels' && rec.level.id !== key) out.push(`${at}/level/id: "${rec.level.id}", not the level's id "${key}"`);
  if (table !== 'operators') return out;
  if (!BRANCH_SET.has(rec.branch)) out.push(`${at}/branch: "${rec.branch}" is not an official branch`);
  for (const t of rec.tokens ?? []) if (!Object.hasOwn(TOKENS, t)) out.push(`${at}/tokens: "${t}" is not an official summon`);
  const own = Object.hasOwn(ROSTER, key);
  if (own && rec.look !== undefined) out.push(`${at}/look: an official operator looks like itself`);
  if (!own && !(typeof rec.look === 'string' && Object.hasOwn(ROSTER, rec.look))) out.push(`${at}/look: a new operator names the official operator it looks like`);
  return out;
}

/** @param {string} a @param {string} b @returns {boolean} whether two paths are the same value or one holds the other */
const overlap = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

/**
 * The conflicts of a mod's touches with the earlier mods' (mod-7): one line per other mod and record, the mods it needs
 * aside.
 * @param {Touch[]} touches @param {Map<string, Touch[]>} earlier by record @param {Set<string>} needs @returns {string[]}
 */
function conflictsOf(touches, earlier, needs) {
  /** @type {Map<string, { other: string, mod: string, record: string, paths: Set<string> }>} */
  const found = new Map();
  for (const t of touches) {
    for (const e of earlier.get(t.record) ?? []) {
      if (e.mod === t.mod || needs.has(e.mod) || !overlap(t.path, e.path)) continue;
      const k = `${e.mod} ${t.record}`;
      const f = found.get(k) ?? { other: e.mod, mod: t.mod, record: t.record, paths: new Set() };
      f.paths.add(t.path.length >= e.path.length ? t.path : e.path);
      found.set(k, f);
    }
  }
  return [...found.values()].map((f) => `${f.other} and ${f.mod} both change ${f.record} (${[...f.paths].slice(0, 3).join(', ')}${f.paths.size > 3 ? ', …' : ''}): ${f.mod} loads later and counts`);
}

/**
 * The mods a mod needs, directly or through others (mod-7).
 * @param {string} id @param {Map<string, ReadMod>} byId @returns {Set<string>}
 */
function needsOf(id, byId) {
  const out = new Set(), todo = Object.keys(byId.get(id)?.manifest.dependencies ?? {});
  while (todo.length > 0) {
    const d = /** @type {string} */ (todo.pop());
    if (out.has(d)) continue;
    out.add(d);
    todo.push(...Object.keys(byId.get(d)?.manifest.dependencies ?? {}));
  }
  return out;
}

/** @param {any} r @param {string} [mod] @returns {RosterEntry} */
const entryOf = (r, mod) => ({ name: r.name, rarity: r.rarity, profession: r.profession, branch: r.branch, ...(mod ? { mod, look: r.look } : {}) });

/**
 * The state of laying mods over the content: the records so far, the values touched by record, the mods loaded, the
 * mod that added each new operator, the conflicts found, every mod by id.
 * @typedef {{ layer: Layer, touched: Map<string, Touch[]>, loaded: ReadMod[], owner: Map<string, string>, conflicts: string[], byId: Map<string, ReadMod> }} Laying
 */

/**
 * One mod laid over the content (mod-3…mod-7), whole or not at all; its report says which.
 * @param {ReadMod} mod @param {Laying} s
 */
async function loadOne(mod, s) {
  const id = mod.manifest.id;
  if (Object.keys(mod.manifest.dependencies).some((d) => !s.loaded.includes(/** @type {ReadMod} */ (s.byId.get(d))))) {
    mod.report.problems.push('a mod it needs did not load');
    return;
  }
  try {
    const { staged, touches } = await layOver(mod, s.layer);
    const why = stagedProblems(staged);
    if (why.length > 0) throw new ModProblem(why);
    s.conflicts.push(...conflictsOf(touches, s.touched, needsOf(id, s.byId)));
    for (const t of /** @type {RecordTable[]} */ (['operators', 'tokens', 'levels'])) for (const [k, v] of staged[t]) s.layer[t].set(k, v);
    for (const k of staged.operators.keys()) if (!Object.hasOwn(ROSTER, k) && !s.owner.has(k)) s.owner.set(k, id);
    for (const t of touches) s.touched.set(t.record, [...(s.touched.get(t.record) ?? []), t]);
    const records = [...new Set(touches.map((t) => t.record))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), news = new Set(touches.filter((t) => t.path === t.record).map((t) => t.record));
    Object.assign(mod.report, { loaded: true, added: records.filter((r) => news.has(r)), changed: records.filter((r) => !news.has(r)) });
    s.loaded.push(mod);
  } catch (e) {
    mod.report.problems.push(...(e instanceof ModProblem ? e.problems : [/** @type {Error} */ (e).message]));
  }
}

/**
 * The official content with mods laid over it (mod-3…mod-8). Each mod is read and checked; the ones that can load are
 * laid over in their load order, each whole or not at all — a mod that needs one that did not load does not load either.
 * Never throws for a mod's content: its report says why it did not load.
 * @param {readonly ModInput[]} inputs @returns {Promise<ContentSource>}
 */
export async function createSource(inputs) {
  const read = inputs.map(readMod), ids = new Set();
  for (const r of read) {
    if (ids.has(r.report.id)) r.report.problems.push('another mod has this id');
    ids.add(r.report.id);
  }
  const ok = read.flatMap((r) => (r.mod && r.report.problems.length === 0 ? [r.mod] : []));
  /** @type {Laying} */
  const s = { layer: { operators: new Map(), tokens: new Map(), levels: new Map() }, touched: new Map(), loaded: [], owner: new Map(), conflicts: [], byId: new Map(ok.map((m) => [m.manifest.id, m])) };
  for (const mod of loadOrder(ok)) await loadOne(mod, s);
  const { layer } = s;
  const roster = { ...ROSTER, ...Object.fromEntries([...layer.operators].map(([k, r]) => [k, entryOf(r, s.owner.get(k))])) };
  return Object.freeze({
    mods: Object.freeze(s.loaded.map((m) => Object.freeze({ id: m.manifest.id, version: m.manifest.version, sha: m.sha }))),
    reports: Object.freeze(read.map((r) => r.report)), conflicts: Object.freeze(s.conflicts), roster: Object.freeze(roster),
    levels: Object.freeze({ ...LEVELS, ...Object.fromEntries(layer.levels) }),
    training: async (/** @type {string} */ k) => layer.operators.get(k) ?? loadTraining(k),
    token: async (/** @type {string} */ k) => layer.tokens.get(k) ?? loadToken(k),
  });
}
