// Content sources with data mods (docs/spec/mods.md mod-3…mod-11): the load order, adding and patching records, a mod
// whole or not at all, conflicts, a match's content and its hash, the host's list and a player's fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash } from '@aue/sim';
import { ENGINE_VERSION } from '@aue/schema';
import { createSource, OFFICIAL_SOURCE, matchContent, loadTraining, modIndex, fetchMods, hostedSource, LEVELS, ROSTER } from '../src/index.js';

/** @typedef {import('../src/index.js').ModInput} ModInput */

/**
 * A mod with one data file. @param {string} id @param {Record<string, unknown>} data @param {Record<string, unknown>} [extra] manifest fields
 * @returns {ModInput}
 */
const mod = (id, data, extra = {}) => ({ id, manifest: { type: 'data', version: '1.0.0', app: '>=0.1.3', name: id, files: { data: 'data.json' }, ...extra }, files: { 'data.json': JSON.stringify(data) } });
/** @param {Awaited<ReturnType<typeof createSource>>} s */
const reportOf = (s) => Object.fromEntries(s.reports.map((r) => [r.id, r.loaded ? 'loaded' : r.problems]));
const E2 = { elite: 2, level: 90, potential: 1, trust: 0, skill: 1, skillLevel: 10 };
/** @param {string} id @param {string} [level] */
const match = (id, level = 'act1multi_01') => ({ level, difficulty: /** @type {const} */ ('NORMAL'), seed: 1, decks: [[{ id, build: E2 }]] });
const CHEN_S2 = { operators: { char_010_chen: { skills: { skchr_chen_2: { levels: { 9: { blackboard: { atk_scale: 6 } } } } } } } };

test('[mod-3] the load order: what a mod needs first, then the lower priority, then by id; later mods count', async () => {
  const atk = (/** @type {number} */ n) => ({ operators: { char_010_chen: { phases: { 2: { frames: { 1: { stats: { atk: n } } } } } } } });
  const s = await createSource([mod('zz', atk(700)), mod('aa', atk(800), { dependencies: { zz: '^1.0.0' } }), mod('mm', atk(900), { priority: -5 })]);
  assert.deepEqual(s.mods.map((m) => m.id), ['mm', 'zz', 'aa']);
  assert.equal((await s.training('char_010_chen')).phases[2].frames[1].stats.atk, 800);
  assert.equal((await loadTraining('char_010_chen')).phases[2].frames[1].stats.atk, 610, 'the official record is left as it was');
  assert.deepEqual(s.conflicts, [
    'mm and zz both change operators/char_010_chen (operators/char_010_chen/phases/2/frames/1/stats/atk): zz loads later and counts',
    'mm and aa both change operators/char_010_chen (operators/char_010_chen/phases/2/frames/1/stats/atk): aa loads later and counts',
  ], 'aa needs zz, not mm');
});

test('[mod-3] a mod lacking what it needs does not load, nor what needs it; circles; the same id twice', async () => {
  const s = await createSource([
    mod('a', {}, { dependencies: { gone: '*' } }), mod('b', {}, { dependencies: { a: '*' } }), mod('c', {}, { dependencies: { d: '*' } }), mod('d', {}, { dependencies: { c: '*' } }),
    mod('e', {}, { version: '2.0.0' }), mod('f', {}, { dependencies: { e: '^1.0.0' } }), mod('g', {}), mod('g', {}),
  ]);
  assert.deepEqual(reportOf(s), {
    a: ['needs gone *, which is not installed or does not load'], b: ['needs a *, which is not installed or does not load'],
    c: ['its dependencies go round in a circle among c, d'], d: ['its dependencies go round in a circle among c, d'], e: 'loaded',
    f: ['needs e ^1.0.0, the installed one is 2.0.0'], g: ['another mod has this id'],
  });
});

test('[mod-3] [mod-6] a mod applies whole or not at all: one broken record keeps all its changes out, and the mods needing it', async () => {
  const s = await createSource([mod('bad', { operators: { ...CHEN_S2.operators, char_122_beagle: { rarity: 9 } } }), mod('after', {}, { dependencies: { bad: '*' } })]);
  assert.deepEqual(reportOf(s), { bad: ['operators/char_122_beagle/rarity: not an integer in [1, 6]'], after: ['a mod it needs did not load'] });
  assert.equal((await s.training('char_010_chen')).skills[1]?.levels[9].blackboard[0].value, 5);
  assert.deepEqual(s.mods, []);
});

test('[mod-4] [mod-11] new records under the mod\'s prefix: an operator that looks like an official one, a level; others are problems', async () => {
  const chen = await loadTraining('char_010_chen'), lv = LEVELS.act1multi_01;
  const s = await createSource([mod('mine', { operators: { 'mine:chen_alt': { ...chen, name: '陈（另）', look: 'char_010_chen' } }, levels: { 'mine:day': { ...lv, level: { ...lv.level, id: 'mine:day' } } } })]);
  assert.deepEqual(reportOf(s), { mine: 'loaded' });
  assert.deepEqual([s.reports[0].added, s.reports[0].changed], [['levels/mine:day', 'operators/mine:chen_alt'], []]);
  assert.deepEqual(s.roster['mine:chen_alt'], { name: '陈（另）', rarity: 6, profession: 'WARRIOR', branch: 'sword', mod: 'mine', look: 'char_010_chen' });
  assert.equal(s.roster.char_010_chen, ROSTER.char_010_chen);
  assert.equal(s.levels['mine:day'].level.code, lv.level.code);
  const bad = await createSource([
    mod('x', { operators: { char_nobody: { ...chen } } }), mod('y', { operators: { 'y:look': { ...chen } } }), mod('z', { operators: { char_010_chen: { look: 'char_122_beagle' } } }),
    mod('t', { tokens: { 't:mon': {} } }), mod('u', { enemies: { 'u:slime': {} } }), mod('v', { enemies: { enemy_nobody: { atk: 1 } } }), mod('w', { levels: { 'w:l': { ...lv } } }),
  ]);
  assert.deepEqual(reportOf(bad), {
    x: ['data.json: operators/char_nobody: no such operator; a new one\'s id starts with "x:"'], y: ['operators/y:look/look: a new operator names the official operator it looks like'],
    z: ['operators/char_010_chen/look: an official operator looks like itself'], t: ['data.json: tokens/t:mon: no such summon; summons can be changed, not added'],
    u: ['data.json: enemies/u:slime: enemies can be changed, not added'], v: ['data.json: enemies/enemy_nobody: no level has this enemy'], w: ['levels/w:l/level/id: "act1multi_01", not the level\'s id "w:l"'],
  });
});

test('[mod-4] an enemy\'s patch changes it in every level that has it, a level added before it in the same file too; summons are patched', async () => {
  const key = 'enemy_1067_snslime', lv = LEVELS.act1multi_01, has = Object.keys(LEVELS).filter((k) => Object.hasOwn(LEVELS[/** @type {keyof typeof LEVELS} */ (k)].enemies, key));
  const s = await createSource([mod('foes', { levels: { 'foes:l': { ...lv, level: { ...lv.level, id: 'foes:l' } } }, enemies: { [key]: { atk: 999 } }, tokens: { token_10002_kalts_mon3tr: { rarity: 5 } } })]);
  assert.deepEqual(reportOf(s), { foes: 'loaded' });
  assert.deepEqual([s.reports[0].added, s.reports[0].changed], [['levels/foes:l'], [`enemies/${key}`, 'tokens/token_10002_kalts_mon3tr']]);
  for (const k of [...has, 'foes:l']) assert.equal(s.levels[k].enemies[key].atk, 999, k);
  assert.equal(LEVELS.act1multi_01.enemies[key].atk, 300);
  assert.equal((await s.token('token_10002_kalts_mon3tr')).rarity, 5);
});

test('[mod-7] a conflict is two mods changing the same value or one holding the other, neither needing the other', async () => {
  const whole = { operators: { char_010_chen: { skills: [] } } }, traits = { operators: { char_010_chen: { traits: { x: {} } } } };
  const s = await createSource([mod('a', CHEN_S2), mod('b', whole), mod('c', { operators: { char_010_chen: { name: 'C' } } }, { dependencies: { a: '*', b: '*' } }), mod('d', traits)]);
  assert.deepEqual(s.conflicts, ['a and b both change operators/char_010_chen (operators/char_010_chen/skills/skchr_chen_2/levels/9/blackboard/atk_scale/value): b loads later and counts']);
  assert.deepEqual(reportOf(s), { a: 'loaded', b: 'loaded', c: 'loaded', d: ['data.json: operators/char_010_chen/traits: its elements have no key or id to address them by: patch them by index, or write the whole list'] });
});

test('[mod-8] a match\'s content from a source: the patched values, the mods it is made with in its hash; the official one unchanged', async () => {
  const s = await createSource([mod('strong', CHEN_S2)]);
  const plain = await matchContent(match('char_010_chen')), same = await matchContent(match('char_010_chen'), { source: OFFICIAL_SOURCE }), modded = await matchContent(match('char_010_chen'), { source: s });
  assert.equal(contentHash(plain), contentHash(same));
  assert.equal(plain.mods, undefined);
  assert.deepEqual(modded.mods, [{ id: 'strong', version: '1.0.0', sha: s.mods[0].sha }]);
  assert.match(s.mods[0].sha, /^[0-9a-f]{64}$/);
  assert.notEqual(contentHash(modded), contentHash(plain));
  const scale = (/** @type {any} */ c) => c.operators['char_010_chen#0'].skill.bb.atk_scale;
  assert.deepEqual([scale(plain), scale(modded)], [5, 6]);
  const other = await createSource([mod('strong', CHEN_S2, { version: '1.0.1' })]);
  assert.notEqual(contentHash(await matchContent(match('char_010_chen'), { source: other })), contentHash(modded), 'another version is another content');
});

test('[mod-8] [mod-11] an added operator and level play in a match; the operator has the figure, voice and attack timing of its look', async () => {
  const chen = await loadTraining('char_010_chen'), lv = LEVELS.act1multi_01;
  const s = await createSource([mod('mine', { operators: { 'mine:chen_alt': { ...chen, look: 'char_010_chen' } }, levels: { 'mine:day': { ...lv, level: { ...lv.level, id: 'mine:day' } } } })]);
  const c = await matchContent(match('mine:chen_alt', 'mine:day'), { source: s });
  assert.equal(c.operators['mine:chen_alt#0'].char, 'mine:chen_alt');
  const own = await matchContent(match('char_010_chen'));
  assert.deepEqual([c.operators['mine:chen_alt#0'].look, c.operators['mine:chen_alt#0'].attack], ['char_010_chen', own.operators['char_010_chen#0'].attack], 'the attack timing of its look');
  assert.equal(own.operators['char_010_chen#0'].look, undefined);
  assert.deepEqual(c.decks, [['mine:chen_alt#0']]);
  assert.equal(c.level.id, 'mine:day');
});

test('[mod-10] the host\'s list and a player\'s fetch: every file checked; the same source on both sides', async () => {
  const inputs = [mod('strong', CHEN_S2), mod('broken', { operators: { char_010_chen: { rarity: 0 } } })], host = await createSource(inputs);
  const index = modIndex(inputs, host);
  assert.deepEqual([index.version, index.engine, index.mods.map((m) => m.id)], [1, ENGINE_VERSION, ['strong']]);
  assert.deepEqual(index.mods[0].files.map((f) => f.path), ['data.json']);
  /** @type {string[]} */
  const asked = [];
  const served = (/** @type {string} */ url) => {
    asked.push(url);
    return Promise.resolve(inputs[0].files['data.json']);
  };
  const fetched = await fetchMods('http://h/mods/', JSON.parse(JSON.stringify(index)), served), player = await createSource(fetched);
  assert.deepEqual(asked, ['http://h/mods/strong/data.json']);
  assert.deepEqual(player.mods, host.mods);
  await assert.rejects(fetchMods('http://h/mods/', index, () => Promise.resolve('{}')), /strong\/data.json differs from the host's list/);
  await assert.rejects(fetchMods('http://h/mods/', { ...index, version: 2 }, served), /the host's list of mods: list version 2 is not 1/);
  const twisted = { ...index, mods: [{ ...index.mods[0], files: [{ ...index.mods[0].files[0], path: '../x.json' }] }] };
  await assert.rejects(fetchMods('http://h/mods/', twisted, served), /a file's path, size or sha256 is malformed/);
});

test('[mod-10] the source a player makes from a host: its list and files fetched, the same mods; the official content when it lists none', async () => {
  const inputs = [mod('strong', CHEN_S2)], host = await createSource(inputs);
  /** @type {Record<string, string>} */
  const served = { 'http://h/mods/index.json': JSON.stringify(modIndex(inputs, host)), 'http://h/mods/strong/data.json': inputs[0].files['data.json'] };
  const get = (/** @type {string} */ url) => (Object.hasOwn(served, url) ? Promise.resolve(served[url]) : Promise.reject(new Error(`${url}: 404`)));
  assert.deepEqual((await hostedSource('http://h/mods/', get)).mods, host.mods);
  served['http://h/mods/index.json'] = JSON.stringify(modIndex([], await createSource([])));
  assert.equal(await hostedSource('http://h/mods/', get), OFFICIAL_SOURCE);
  await assert.rejects(hostedSource('http://h/none/', get), /404/);
});
