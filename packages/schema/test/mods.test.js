// A mod's manifest and version ranges (docs/spec/mods.md mod-1, mod-2), and the host's list (mod-10): what is a
// problem, what a warning, and that no input makes a reader throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { ENGINE_VERSION, readModManifest, parseVersion, isRange, versionInRange, isDataPath, modIndexProblem, MOD_LIMITS } from '../src/index.js';

const BASE = { type: 'data', version: '1.2.0', app: '>=0.1.3', name: '更强的陈', files: { data: 'data.json' } };

test('[mod-1] a manifest: the loader\'s reading of it, a problem keeps it from loading, a warning does not', () => {
  const ok = readModManifest({ ...BASE, authors: ['某人'], license: 'CC-BY-4.0', dependencies: { other: '^1.0.0' }, priority: 3 }, 'strong');
  assert.deepEqual(ok, {
    manifest: { id: 'strong', type: 'data', version: '1.2.0', app: '>=0.1.3', name: '更强的陈', englishName: null, authors: ['某人'], credits: null, license: 'CC-BY-4.0',
      files: { data: ['data.json'] }, dependencies: { other: '^1.0.0' }, priority: 3 },
    problems: [], warnings: [],
  });
  const warned = readModManifest({ ...BASE, id: 'other', app: '>=9.0.0', license: 7, colour: 'red', files: { data: ['a.json', 'b/c.json'], art: 'x.png' } }, 'strong');
  assert.deepEqual(warned.warnings, [
    'unknown field colour, ignored', 'id "other" differs from the folder\'s "strong"; the folder\'s counts', `made for engine >=9.0.0, this is ${ENGINE_VERSION}`,
    'files.art: not a role of a data mod, ignored', 'license is not a text of at most 256 characters, ignored',
  ]);
  assert.deepEqual([warned.manifest?.files.data, warned.manifest?.license], [['a.json', 'b/c.json'], null]);
  assert.deepEqual(readModManifest({ ...BASE, app: undefined }, 'x').warnings, ['no app range: the engine versions it is made for are unknown']);
});

test('[mod-1] the problems: the id, the type, the version, the name, the files, dependencies, priority', () => {
  /** @param {Record<string, unknown>} m @param {string} [id] */
  const problems = (m, id = 'strong') => readModManifest({ ...BASE, ...m }, id).problems;
  assert.deepEqual(problems({}, 'Strong'), ['id "Strong" is not 1–32 of a–z 0–9 _ -']);
  assert.deepEqual(problems({}, 'official'), ['id "official" is the official content\'s']);
  assert.deepEqual(problems({ type: 'assets' }), ['type "assets" is planned, not loaded by this version']);
  assert.deepEqual(problems({ type: 'lang' }), ['type "lang" is not a pack type (data, assets)']);
  assert.deepEqual(problems({ version: '1.2' }), ['version "1.2" is not a semantic version']);
  assert.deepEqual(problems({ app: '>=one' }), ['app ">=one" is not a version range']);
  assert.deepEqual(problems({ name: '' }), ['name is not a text of 1–64 characters']);
  assert.deepEqual(problems({ files: { data: '../x.json' } }), ['files.data: "../x.json" is not a .json path inside the folder']);
  assert.deepEqual(problems({ files: { data: ['a.json', 'A.json'] } }), ['files.data names a file twice']);
  assert.deepEqual(problems({ files: {} }), ['files.data names no data file, or more than 64']);
  assert.deepEqual(problems({ dependencies: { official: '*', Bad: '*', ok: 'soon' } }), ['dependencies: "official" is not another mod\'s id', 'dependencies: "Bad" is not another mod\'s id', 'dependencies.ok: "soon" is not a version range']);
  assert.deepEqual(problems({ priority: 1.5 }), ['priority is not an integer in [-1000, 1000]']);
  assert.equal(readModManifest(null, 'x').manifest, null);
  assert.deepEqual([isDataPath('a/b.json'), isDataPath('/a.json'), isDataPath('a\\b.json'), isDataPath('a/./b.json'), isDataPath('a.js')], [true, false, false, false, false]);
});

test('[mod-1] no value makes the manifest reader throw', () => {
  fc.assert(fc.property(fc.jsonValue(), fc.string(), (m, id) => {
    const r = readModManifest(m, id);
    return Array.isArray(r.problems) && Array.isArray(r.warnings) && (r.manifest === null) === (r.problems.length > 0);
  }), { seed: 20261020, numRuns: 500 });
});

test('[mod-2] versions and ranges: comparators, caret, tilde, x-ranges, alternatives; a pre-release counts as its release', () => {
  assert.deepEqual([parseVersion('1.2.3'), parseVersion('0.2.0-dev'), parseVersion('1.0.0+b5'), parseVersion('01.2.3'), parseVersion('1.2')], [[1, 2, 3], [0, 2, 0], [1, 0, 0], null, null]);
  /** @type {[string, string, boolean][]} */
  const cases = [
    ['0.1.3', '>=0.1.3', true], ['0.1.2', '>=0.1.3', false], ['0.2.0', '>=0.1.3 <0.2.0', false], ['0.1.9', '>=0.1.3 <0.2.0', true],
    ['0.1.3', '0.1.x', true], ['0.2.0', '0.1.x', false], ['1.9.0', '1.x', true], ['0.1.3', '*', true], ['0.1.3', '0.1.3', true], ['0.1.4', '=0.1.3', false],
    ['1.9.9', '^1.2.3', true], ['2.0.0', '^1.2.3', false], ['0.2.9', '^0.2.3', true], ['0.3.0', '^0.2.3', false], ['0.0.4', '^0.0.3', false],
    ['1.2.9', '~1.2.3', true], ['1.3.0', '~1.2.3', false], ['0.3.1', '<0.2.0 || >=0.3.0', true], ['0.2.5', '<0.2.0 || >=0.3.0', false], ['0.2.0-dev', '>=0.2.0', true],
    ['1.0.0', '>1.0.0', false], ['1.0.0', '<=1.0.0', true],
  ];
  for (const [v, r, want] of cases) assert.equal(versionInRange(v, r), want, `${v} in ${r}`);
  assert.deepEqual(['', '>=1', '^1.x', '1.x.2', 'abc', '>= 1.0.0', '1.0.0 ||'].map(isRange), [false, false, false, false, false, false, false]);
});

/** A well-formed list of one mod. @returns {any} */
const LIST = () => ({ version: 1, engine: '0.1.3', mods: [{ id: 'strong', version: '1.0.0', sha: 'a'.repeat(64), manifest: { ...BASE }, files: [{ path: 'data.json', size: 10, sha256: 'b'.repeat(64) }] }] });

test('[mod-10] the host\'s list: exactly the well-formed ones pass; never throws', () => {
  assert.equal(modIndexProblem(LIST()), null);
  /** @type {[(l: any) => void, string][]} */
  const broken = [
    [(l) => { l.extra = 1; }, 'unknown field extra'], [(l) => { l.version = 2; }, 'list version 2 is not 1'],
    [(l) => { l.mods.push(l.mods[0]); }, '"strong" is not a mod id, or is listed twice'], [(l) => { l.mods[0].sha = 'x'; }, 'strong: its version, sha or manifest is malformed'],
    [(l) => { l.mods[0].files[0].size = MOD_LIMITS.fileBytes + 1; }, 'strong: a file\'s path, size or sha256 is malformed'],
    [(l) => { l.mods[0].files[0].path = 'other.json'; }, 'strong: the files are not its manifest\'s data files'],
  ];
  for (const [change, why] of broken) {
    const l = LIST();
    change(l);
    assert.equal(modIndexProblem(l), why);
  }
  fc.assert(fc.property(fc.jsonValue(), (v) => typeof modIndexProblem(v) === 'string' || v === null), { seed: 20261020, numRuns: 300 });
});
