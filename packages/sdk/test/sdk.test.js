// The SDK (docs/spec/mods.md mod-12, mod-13): mods' folders read as a host reads them, the template checked and played,
// packs, and the JSON Schemas — the committed ones are the generated ones, and they accept what the checks accept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ROSTER, LEVELS, loadTraining } from '@aue/content';
import { newMod, checkMods, playMods, packMod, readModFolder, readModFolders, schemaFiles, crc32 } from '../src/index.js';

const temp = () => mkdtempSync(join(tmpdir(), 'aue-sdk-'));

/**
 * Whether a value passes a JSON Schema, for the keywords the schemas use.
 * @param {any} s @param {unknown} v @param {any} root @returns {boolean}
 */
function valid(s, v, root = s) {
  if (s.$ref) return valid(root.$defs[s.$ref.split('/').pop()], v, root);
  if (s.anyOf) return s.anyOf.some((/** @type {any} */ x) => valid(x, v, root));
  if (s.enum) return s.enum.includes(v);
  return typeOk(s, v) && (Array.isArray(v) ? listOk(s, v, root) : typeof v === 'object' && v !== null ? objectOk(s, /** @type {Record<string, unknown>} */ (v), root) : scalarOk(s, v));
}
/** @param {any} s @param {unknown} v */
function typeOk(s, v) {
  const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  return !s.type || s.type === t || (s.type === 'integer' && Number.isInteger(v));
}
/** @param {any} s @param {number} v */
const numberOk = (s, v) => v >= (s.minimum ?? -Infinity) && v <= (s.maximum ?? Infinity);
/** @param {any} s @param {string} v */
const textOk = (s, v) => v.length <= (s.maxLength ?? Infinity) && v.length >= (s.minLength ?? 0) && (!s.pattern || new RegExp(s.pattern).test(v));
/** @param {any} s @param {unknown} v */
const scalarOk = (s, v) => (typeof v === 'number' ? numberOk(s, v) : typeof v === 'string' ? textOk(s, v) : true);
/** @param {any} s @param {unknown[]} v @param {any} root */
const listOk = (s, v, root) => v.length >= (s.minItems ?? 0) && v.length <= (s.maxItems ?? Infinity) && (!s.items || v.every((x) => valid(s.items, x, root)));
/** @param {any} s @param {Record<string, unknown>} v @param {any} root */
function objectOk(s, v, root) {
  const keys = Object.keys(v);
  if (keys.length > (s.maxProperties ?? Infinity) || (s.required ?? []).some((/** @type {string} */ k) => !(k in v))) return false;
  if (s.propertyNames && !keys.every((k) => valid(s.propertyNames, k, root))) return false;
  return keys.every((k) => (s.properties && k in s.properties ? valid(s.properties[k], v[k], root) : s.additionalProperties === false ? false : !s.additionalProperties || valid(s.additionalProperties, v[k], root)));
}

test('[mod-12] a new mod from the template checks clean, changes 陈\'s 赤霄·拔刀 and plays a match', async () => {
  const root = temp(), dir = newMod(root, 'strong', { name: '更强的陈' });
  const { source, lines, ok } = await checkMods([dir]);
  assert.equal(ok, true);
  assert.deepEqual(lines, ['strong 0.1.0 (更强的陈): loaded', '  changes operators/char_010_chen', '1 of 1 mods loaded']);
  assert.equal((await source.training('char_010_chen')).skills[1]?.levels[9].blackboard[0].value, 6);
  const played = await playMods(source, { seconds: 20 });
  assert.deepEqual(played.map((p) => [p.what, p.level, p.error, p.seconds]), [['operators/char_010_chen', 'act1multi_01', null, 20]]);
  assert.throws(() => newMod(root, 'strong'), /is there already/);
  assert.throws(() => newMod(root, 'Strong'), /is not a mod id/);
  rmSync(root, { recursive: true });
});

test('[mod-12] a level a mod adds is played at both difficulties; a match that throws is reported, not thrown', async () => {
  const root = temp(), dir = join(root, 'day');
  mkdirSync(dir);
  const lv = LEVELS.act1multi_01;
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({ type: 'data', version: '1.0.0', app: '*', name: 'day', files: { data: 'data.json' } }));
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ levels: { 'day:one': { ...lv, level: { ...lv.level, id: 'day:one' } } } }));
  const { source } = await checkMods([dir]);
  const played = await playMods(source, { seconds: 5 });
  assert.deepEqual(played.map((p) => [p.what, p.difficulty, p.error]), [['levels/day:one', 'NORMAL', null], ['levels/day:one', 'FOUR_STAR', null]]);
  const broken = await playMods({ ...source, training: () => Promise.reject(new Error('no record')), reports: [{ ...source.reports[0], added: ['operators/x'] }] }, { seconds: 1 });
  assert.match(String(broken[0].error), /no record/);
  rmSync(root, { recursive: true });
});

test('[mod-12] folders are read as a host reads them: a byte order mark dropped, problems reading kept apart, broken ones skipped', () => {
  const root = temp(), good = newMod(root, 'good'), bad = join(root, 'bad'), latin = join(root, 'latin');
  writeFileSync(join(good, 'data.json'), String.fromCharCode(0xfeff) + readFileSync(join(good, 'data.json'), 'utf8'));
  mkdirSync(bad);
  writeFileSync(join(bad, 'pack.json'), '{ not json');
  mkdirSync(latin);
  writeFileSync(join(latin, 'pack.json'), JSON.stringify({ type: 'data', version: '1.0.0', name: 'l', files: { data: 'd.json' } }));
  writeFileSync(join(latin, 'd.json'), Buffer.from([0x7b, 0xe9, 0x7d]));
  mkdirSync(join(root, 'not-a-mod'));
  assert.equal(readModFolder(good).input.files['data.json'].charCodeAt(0), 0x7b);
  const { inputs, skipped } = readModFolders(root);
  assert.deepEqual(inputs.map((i) => i.id), ['good']);
  assert.deepEqual(skipped.map((s) => [s.id, s.problems[0].split(':')[0]]), [['bad', 'pack.json'], ['latin', 'd.json']]);
  assert.equal(skipped[1].problems[0], 'd.json: not UTF-8 text');
  assert.deepEqual(readModFolders(join(root, 'nowhere')), { inputs: [], skipped: [] });
  rmSync(root, { recursive: true });
});

/** The entries of a zip as this writer makes them: name → bytes. @param {Buffer} z */
function unzip(z) {
  const end = z.length - 22, n = z.readUInt16LE(end + 10);
  let at = z.readUInt32LE(end + 16);
  /** @type {Record<string, Buffer>} */
  const out = {};
  for (let i = 0; i < n; i++) {
    const nameLen = z.readUInt16LE(at + 28), local = z.readUInt32LE(at + 42), packed = z.readUInt32LE(at + 20), crc = z.readUInt32LE(at + 16);
    const name = z.toString('utf8', at + 46, at + 46 + nameLen), start = local + 30 + z.readUInt16LE(local + 26);
    out[name] = inflateRawSync(z.subarray(start, start + packed));
    assert.equal(crc32(out[name]), crc);
    at += 46 + nameLen;
  }
  return out;
}

test('[mod-12] a pack: the folder named by the id, its files and SHA256SUMS; the same bytes every time; a broken mod is refused', () => {
  const root = temp(), dir = newMod(root, 'strong'), out = join(root, 'a.zip');
  const r = packMod(dir, out);
  assert.deepEqual(r.files.map((f) => f.path), ['pack.json', 'data.json', 'README.md']);
  const files = unzip(readFileSync(out));
  assert.deepEqual(Object.keys(files), ['strong/pack.json', 'strong/data.json', 'strong/README.md', 'strong/SHA256SUMS']);
  const sha = (/** @type {Buffer} */ b) => createHash('sha256').update(b).digest('hex');
  assert.equal(files['strong/SHA256SUMS'].toString(), ['pack.json', 'data.json', 'README.md'].map((p) => `${sha(files[`strong/${p}`])}  ${p}\n`).join(''));
  assert.deepEqual(files['strong/data.json'], readFileSync(join(dir, 'data.json')));
  packMod(dir, join(root, 'b.zip'));
  assert.deepEqual(readFileSync(join(root, 'b.zip')), readFileSync(out));
  writeFileSync(join(dir, 'data.json'), '[]');
  assert.throws(() => packMod(dir, join(root, 'c.zip')), /strong cannot be packed: data.json: not an object of tables/);
  rmSync(root, { recursive: true });
});

test('[mod-13] the committed schemas are the generated ones', () => {
  for (const [name, text] of Object.entries(schemaFiles())) assert.equal(readFileSync(new URL(`../schemas/${name}`, import.meta.url), 'utf8'), text, `${name}: run node packages/sdk/src/cli.js schemas --out packages/sdk/schemas`);
});

test('[mod-13] the schemas accept what the checks accept: the template, every official operator and level whole; not a broken record', async () => {
  const files = schemaFiles(), pack = JSON.parse(files['pack.schema.json']), data = JSON.parse(files['data.schema.json']);
  const root = temp(), dir = newMod(root, 'strong');
  assert.equal(valid(pack, JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'))), true);
  assert.equal(valid(data, JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'))), true);
  assert.equal(valid(pack, { type: 'data', version: '1.0', name: 'x', files: { data: 'd.json' } }), false);
  const operators = Object.fromEntries(await Promise.all(Object.keys(ROSTER).map(async (id) => [id, await loadTraining(id)])));
  assert.equal(valid(data, { operators, levels: LEVELS }), true);
  const chen = operators.char_010_chen;
  assert.equal(valid(data, { operators: { char_010_chen: { ...chen, rarity: 7 } } }), false);
  assert.equal(valid(data, { operators: { char_010_chen: { colour: 'red' } } }), false);
  assert.equal(valid(data, { operators: { char_010_chen: { skills: { skchr_chen_2: { levels: { 9: { blackboard: { atk_scale: 6, max_target: null } } } } } } } }), true);
  assert.equal(valid(data, { operators: { 'Bad#id': {} } }), false);
  rmSync(root, { recursive: true });
});
