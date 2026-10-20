// Data mods' pieces (docs/spec/mods.md): the records' checks over the whole official data and on broken records, the
// patch rules, strict parsing and SHA-256.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { ROSTER, TOKENS, LEVELS, loadTraining, loadToken, recordProblems, applyPatch, PatchError, strictJson, sha256, sha256Text } from '../src/index.js';

/** @param {unknown} v @returns {any} */
const copy = (v) => JSON.parse(JSON.stringify(v));

test('[mod-6] every official operator, summon, level and enemy passes the records\' checks', async () => {
  const bad = [];
  for (const id of Object.keys(ROSTER)) bad.push(...recordProblems('operators', await loadTraining(id), id));
  for (const id of Object.keys(TOKENS)) bad.push(...recordProblems('tokens', await loadToken(id), id));
  for (const [id, lv] of Object.entries(LEVELS)) {
    bad.push(...recordProblems('levels', lv, id));
    for (const [k, e] of Object.entries(lv.enemies)) bad.push(...recordProblems('enemies', e, `${id}/${k}`));
  }
  assert.deepEqual(bad, []);
  assert.ok(Object.keys(ROSTER).length > 400 && Object.keys(LEVELS).length >= 9);
});

test('[mod-6] a broken record: wrong types and ranges, unknown and missing fields, at most 20 problems', async () => {
  const chen = copy(await loadTraining('char_010_chen'));
  assert.deepEqual(recordProblems('operators', { ...chen, rarity: 7 }, 'x'), ['x/rarity: not an integer in [1, 6]']);
  assert.deepEqual(recordProblems('operators', { ...chen, colour: 'red' }, 'x'), ['x: unknown field colour']);
  const { name, ...nameless } = chen;
  assert.equal(name, '陈');
  assert.deepEqual(recordProblems('operators', nameless, 'x'), ['x: missing field name']);
  chen.phases[2].frames[1].stats.baseAttackTime = 0;
  chen.skills[1].levels[9].blackboard[0].value = 'six';
  assert.deepEqual(recordProblems('operators', chen, 'x'), ['x/phases/2/frames/1/stats/baseAttackTime: not a number in [0.05, 60]', 'x/skills/1/levels/9/blackboard/0/value: not a number in [-1000000000, 1000000000]']);
  chen.phases[2].frames = [chen.phases[2].frames[1], chen.phases[2].frames[0]];
  assert.ok(recordProblems('operators', chen, 'x').includes('x/phases/2/frames: levels do not start at 1 and rise'));
  assert.equal(recordProblems('operators', Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}`, i])), 'x').length, 20);
  assert.deepEqual(recordProblems('enemies', { ...LEVELS.act1multi_01.enemies.enemy_1067_snslime, motion: 'SWIM' }, 'e'), ['e/motion: not one of WALK, FLY']);
});

test('[mod-6] a level: its tiles fill its width and height, a spawn\'s route and enemy exist, predefined units stand on the map', () => {
  const lv = copy(LEVELS.act1multi_01);
  assert.deepEqual(recordProblems('levels', lv), []);
  lv.level.tiles[0].pop();
  assert.deepEqual(recordProblems('levels', lv, 'l'), [`l/level/tiles: not ${lv.level.height} rows of ${lv.level.width} tiles`]);
  lv.level.tiles = copy(LEVELS.act1multi_01.level.tiles);
  const spawn = lv.level.waves.flatMap((/** @type {any} */ w) => w.fragments).flatMap((/** @type {any} */ f) => f.actions).find((/** @type {any} */ a) => a.type === 'SPAWN');
  spawn.route = lv.level.routes.length;
  spawn.key = 'enemy_nobody';
  assert.deepEqual(recordProblems('levels', lv, 'l'), [`l/level/waves: a spawn of enemy_nobody takes route ${lv.level.routes.length}, the level has ${lv.level.routes.length}`, 'l/level/waves: a spawn of enemy_nobody, not one of the level\'s enemies']);
});

/** @param {unknown} target @param {unknown} patch @returns {{ out: any, paths: string[] }} */
function patched(target, patch) {
  /** @type {string[]} */
  const paths = [];
  const out = applyPatch(target, patch, 'r', (p) => paths.push(p));
  return { out, paths };
}

test('[mod-5] objects merge key by key, null removes a key, lists and other values replace; the target is left as it was', () => {
  const target = Object.freeze({ a: 1, b: Object.freeze({ c: 2, d: 3 }), e: Object.freeze([1, 2]), f: 'x' });
  const { out, paths } = patched(target, { b: { c: 20, d: null }, e: [3], f: { g: 1 }, h: true });
  assert.deepEqual(out, { a: 1, b: { c: 20 }, e: [3], f: { g: 1 }, h: true });
  assert.deepEqual(paths, ['r/b/c', 'r/b/d', 'r/e', 'r/f/g', 'r/h']);
  assert.deepEqual(target, { a: 1, b: { c: 2, d: 3 }, e: [1, 2], f: 'x' });
});

test('[mod-5] a list patched by an object: by index, by key with values alone, by id; null removes, a new name adds at the end', () => {
  const bb = [{ key: 'atk_scale', value: 5 }, { key: 'max_target', value: 7 }];
  assert.deepEqual(patched(bb, { atk_scale: 6, max_target: null, prob: { value: 0.5 } }).out, [{ key: 'atk_scale', value: 6 }, { key: 'prob', value: 0.5 }]);
  assert.deepEqual(patched(bb, { atk_scale: 6 }).paths, ['r/atk_scale/value']);
  assert.deepEqual(patched([[1, 2], [3, 4]], { 1: { 0: 30 } }).out, [[1, 2], [30, 4]]);
  assert.deepEqual(patched([1, 2, 3], { 0: null, 2: 33 }).out, [2, 33]);
  const skills = [{ id: 's1', n: 1 }, null, { id: 's2', n: 2 }];
  assert.deepEqual(patched(skills, { s2: { n: 20 }, s3: { n: 3 } }).out, [{ id: 's1', n: 1 }, null, { id: 's2', n: 20 }, { id: 's3', n: 3 }]);
  assert.deepEqual(patched({ blackboard: [], skills: [] }, { blackboard: { atk: { value: 1 } }, skills: { s: { phase: 0 } } }).out, { blackboard: [{ key: 'atk', value: 1 }], skills: [{ id: 's', phase: 0 }] });
});

test('[mod-5] a list that cannot be addressed so: an index past its end, elements without names or sharing one, a new element not an object', () => {
  assert.throws(() => patched([1, 2], { 2: 3 }), (e) => e instanceof PatchError && e.message === 'r/2: no element 2: the list has 2');
  assert.throws(() => patched([1, 2], { a: 3 }), /r: its elements have no key or id/);
  assert.throws(() => patched([{ key: 'tile_road' }, { key: 'tile_road' }], { tile_road: { key: 'x' } }), /r: its elements share a key: patch them by index/);
  assert.throws(() => patched([{ id: 'a' }], { b: 3 }), /r\/b: no element of id "b" to set/);
  assert.throws(() => patched({ traits: [] }, { traits: { x: {} } }), /r\/traits: its elements have no key or id/);
});

test('[mod-9] data files are strict JSON: no prototype keys, at most 64 deep', () => {
  assert.deepEqual(strictJson('{"a":[1,{"b":null}]}'), { a: [1, { b: null }] });
  assert.throws(() => strictJson('{"a":1,}'), SyntaxError);
  assert.throws(() => strictJson('{"operators":{"x":{"__proto__":{"polluted":1}}}}'), /\/operators\/x\/__proto__: the key "__proto__" is not allowed/);
  assert.throws(() => strictJson('{"constructor":{}}'), RangeError);
  const deep = (/** @type {number} */ n) => '['.repeat(n) + ']'.repeat(n);
  assert.doesNotThrow(() => strictJson(deep(64)));
  assert.throws(() => strictJson(deep(65)), /nested deeper than 64/);
  assert.equal(/** @type {any} */ ({}).polluted, undefined);
});

test('[mod-10] SHA-256 in plain JavaScript matches node:crypto, over bytes and UTF-8 text', () => {
  for (let n = 0; n < 200; n++) {
    const b = randomBytes((n * 37) % 700);
    assert.equal(sha256(b), createHash('sha256').update(b).digest('hex'));
  }
  assert.equal(sha256(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const t = '陈 atk_scale ✓'.repeat(500);
  assert.equal(sha256Text(t), createHash('sha256').update(t, 'utf8').digest('hex'));
});
