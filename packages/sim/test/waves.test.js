// Waves (docs/spec/waves.md): fragments one after another, actions side by side, waves waiting for their enemies,
// hidden groups, random alternatives, predefined units, and the end of the battle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { tinyContent, spawnAt } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { weightedPick, draw, seedState } from '../src/rng.js';

/** @typedef {import('../src/types.js').World} World */

/**
 * The tiny level with these waves; enemies are slimes that never reach the goal in time unless said.
 * @param {any[]} waves @param {Record<string, unknown>} [level] more level fields
 */
function arena(waves, level = {}) {
  const c = tinyContent();
  c.level = { ...c.level, waves, ...level };
  c.enemies.slime.moveSpeed = 0;
  return c;
}
/** A wave of fragments: [preDelay, actions][]. @param {[number, any[]][]} frags @param {Record<string, number>} [o] */
const wave = (frags, o = {}) => ({ preDelay: 0, postDelay: 0, maxWait: -1, ...o, fragments: frags.map(([preDelay, actions]) => ({ preDelay, actions })) });

/**
 * Runs `n` frames and returns the events with the frame they happened in.
 * @param {World} w @param {any} c @param {number} n @param {(w: World) => void} [each] called before every frame
 */
function run(w, c, n, each) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) { each?.(w); for (const e of step(w, c)) out.push({ ...e, f: w.frame - 1 }); }
  return out;
}
const spawns = (/** @type {any[]} */ ev) => ev.filter((e) => e.type === 'spawn').map((e) => [e.f, e.key]);
const kill = (/** @type {World} */ w) => { for (const u of w.units) if (u.kind === KIND.ENEMY) u.hp = 0; };

test('[波次-2] fragments run one after another, actions side by side: the i-th time at preDelay + i × interval', () => {
  const c = arena([wave([
    [1, [spawnAt(0, 'slime', { count: 3, interval: 2 }), spawnAt(1, 'slime')]],
    [0.5, [spawnAt(0, 'slime'), { type: 'NONE', key: '', route: -1, count: 1, preDelay: 3, interval: 0 }]],
    [0, [spawnAt(0, 'slime')]],
  ])]);
  const w = createWorld(c, { seed: 1, players: 1 });
  const ev = run(w, c, 600);
  // F0 starts at 1 s: 1, 3, 5 s and 2 s; it ends at 5 s, F1 starts 0.5 s later (5.5 s); its NONE action holds it to 8.5 s
  assert.deepEqual(spawns(ev).map(([f]) => f), [30, 60, 90, 150, 165, 255]);
  assert.deepEqual(w.units.map((u) => u.frag), [30, 30, 30, 30, 165, 255], 'each enemy knows its fragment start');
  assert.deepEqual(ev.filter((e) => e.type === 'wave').map((e) => [e.f, e.index]), [[0, 0]]);
});

test('[波次-3] a wave ends when its enemies are handled — dontBlockWave ones aside — then postDelay, then the next wave and its preDelay', () => {
  const c = arena([
    wave([[0, [spawnAt(0, 'slime'), spawnAt(0, 'slime', { dontBlockWave: true })]]], { postDelay: 2 }),
    wave([[0, [spawnAt(0, 'slime')]]], { preDelay: 1 }),
  ]);
  const w = createWorld(c, { seed: 1, players: 1 });
  let ev = run(w, c, 300);
  assert.equal(spawns(ev).length, 2, 'the second wave waits for the first wave\'s enemy');
  w.units[0].hp = 0;
  ev = run(w, c, 200);
  // seen handled in frame 300; + 2 s post: the next wave in frame 360, + 1 s pre: its enemy in frame 390
  assert.deepEqual(ev.filter((e) => e.type === 'wave').map((e) => [e.f, e.index]), [[360, 1]]);
  assert.deepEqual(spawns(ev).map(([f]) => f), [390]);
  assert.equal(w.units.length, 2, 'the dontBlockWave enemy is still there');
});

test('[波次-3] maxTimeWaitingForNextWave caps the wait, counted from when the fragments ended', () => {
  const c = arena([wave([[0, [spawnAt(1, 'slime')]]], { maxWait: 4 }), wave([[0, [spawnAt(0, 'slime')]]])]);
  const w = createWorld(c, { seed: 1, players: 1 });
  const ev = run(w, c, 300);
  assert.deepEqual(spawns(ev).map(([f]) => f), [30, 150], 'the fragments end at 1 s; the next wave comes 4 s later');
});

test('[波次-4] an action of a hidden group acts only when its group is enabled; skipped actions take no time', () => {
  const waves = [wave([[0, [spawnAt(0, 'slime'), spawnAt(5, 'slime', { hidden: 'raid' }), spawnAt(1, 'slime', { hidden: 'normal' })]], [0, [spawnAt(0, 'slime')]]])];
  const normal = arena(waves, { hiddenGroups: ['normal'] }), w = createWorld(normal, { seed: 1, players: 1 });
  assert.deepEqual(spawns(run(w, normal, 200)).map(([f]) => f), [0, 30, 30]);
  const none = arena(waves), w2 = createWorld(none, { seed: 1, players: 1 });
  assert.deepEqual(spawns(run(w2, none, 200)).map(([f]) => f), [0, 0]);
});

test('[波次-5] each group picks one candidate by weight when its wave begins; the chosen pack\'s members act, the others not', () => {
  const pack = (/** @type {string} */ p, /** @type {string} */ key) => [
    spawnAt(0, key, { group: 'g1', pack: p, weight: 1 }), spawnAt(1, key, { pack: p }),
  ];
  const c = arena([wave([[0, [...pack('a1', 'a'), ...pack('a2', 'b'), spawnAt(2, 'slime'), spawnAt(3, 'c', { pack: 'z' })]]])]);
  for (const k of ['a', 'b', 'c']) c.enemies[k] = c.enemies.slime;
  /** @type {Record<string, number>} */
  const seen = {};
  for (let seed = 1; seed <= 40; seed++) {
    const w = createWorld(c, { seed, players: 1 });
    const keys = spawns(run(w, c, 120)).map(([, k]) => k);
    assert.equal(keys.length, 4, 'one candidate, its member, the plain action and the action of a pack nobody leads');
    assert.ok((keys[0] === 'a' && keys[1] === 'a') || (keys[0] === 'b' && keys[1] === 'b'), keys.join());
    seen[keys[0]] = (seen[keys[0]] ?? 0) + 1;
  }
  assert.ok(seen.a > 5 && seen.b > 5, JSON.stringify(seen));
});

test('[波次-5] [随机-2] a single candidate is taken without a draw; hidden candidates are not candidates', () => {
  const c = arena([wave([[0, [spawnAt(0, 'slime', { group: 'g', pack: 'p', weight: 5 }), spawnAt(0, 'slime', { group: 'g', pack: 'q', hidden: 'raid' }), spawnAt(1, 'slime', { pack: 'q' })]]])]);
  const w = createWorld(c, { seed: 7, players: 1 });
  run(w, c, 60);
  assert.equal(w.rng, seedState(7), 'no draw');
  assert.equal(w.units.length, 1, 'q\'s member stays out: q is a candidate\'s pack, and that candidate is hidden');
});

test('[随机-2] the weighted pick subtracts the weights in order from X in [0, total)', () => {
  fc.assert(fc.property(fc.integer(), fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 6 }), (seed, weights) => {
    const w = { rng: seedState(seed) }, x = draw({ rng: seedState(seed) }) * weights.reduce((a, b) => a + b, 0);
    let acc = 0, want = weights.length - 1;
    for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (x - acc <= 0) { want = i; break; } }
    return weightedPick(w, weights) === want;
  }), { seed: 20261012, numRuns: 500 });
  const w = { rng: 5 };
  assert.equal(weightedPick(w, [3]), 0);
  assert.equal(w.rng, 5, 'one choice: no draw');
});

test('[波次-6] predefined units: the visible in effect from the start, the hidden by ACTIVATE; WITHDRAW takes them out; repeats do nothing', () => {
  const act = (/** @type {string} */ type, /** @type {string} */ key, /** @type {number} */ preDelay) => ({ type, key, route: -1, count: 1, preDelay, interval: 0 });
  const c = arena([wave([[0, [act('ACTIVATE', 'ctrl#1', 1), act('ACTIVATE', 'ctrl#1', 2), act('WITHDRAW', 'tower#1', 3), act('WITHDRAW', 'tower#1', 4)]]])],
    { predefines: [{ alias: 'ctrl#1', key: 'trap_ctrl', hidden: true }, { alias: 'tower#1', key: 'trap_tower', hidden: false }] });
  const w = createWorld(c, { seed: 1, players: 1 });
  assert.deepEqual(w.predefined, ['tower#1']);
  const ev = run(w, c, 150);
  assert.deepEqual(ev.filter((e) => e.type === 'predefine').map((e) => [e.f, e.key, e.on]), [[30, 'ctrl#1', 1], [90, 'tower#1', 0]]);
  assert.deepEqual(w.predefined, ['ctrl#1']);
});

test('[结束-1] won when the last wave is over; lost when every player is down; the first result stands', () => {
  const c = arena([wave([[0, [spawnAt(0, 'slime')]]])]);
  const w = createWorld(c, { seed: 1, players: 1 });
  run(w, c, 10);
  assert.equal(w.result, -1);
  const ev = run(w, c, 5, kill);
  assert.deepEqual(ev.filter((e) => e.type === 'end').map((e) => [e.f, e.result]), [[10, 1]]);
  w.players[0].revive = 5;
  assert.deepEqual(run(w, c, 5).filter((e) => e.type === 'end'), [], 'decided once');
  const lose = createWorld(c, { seed: 1, players: 2 });
  lose.players[0].revive = 900;
  assert.equal(run(lose, c, 3).filter((e) => e.type === 'end').length, 0, 'one of two down: going on');
  lose.players[1].revive = 900;
  assert.deepEqual(run(lose, c, 3).filter((e) => e.type === 'end').map((e) => e.result), [0]);
  const empty = arena([]), w3 = createWorld(empty, { seed: 1, players: 1 });
  assert.equal(run(w3, empty, 30).filter((e) => e.type === 'end').length, 0, 'no waves: nothing to win');
});

test('[结束-1] alone, life 0 loses at once', () => {
  const c = arena([wave([[0, [spawnAt(0, 'slime')]]])]);
  c.enemies.slime.moveSpeed = 4;
  c.level.options.maxLifePoint = 1;
  const w = createWorld(c, { seed: 1, players: 1 });
  const ev = run(w, c, 600);
  assert.deepEqual(ev.filter((e) => e.type === 'end').map((e) => e.result), [0]);
  assert.equal(w.result, 0);
});

test('[波次-2] [同步-2] the waves\' progress is state: a snapshot taken mid-wave runs on the same', () => {
  const c = arena([wave([[0, [spawnAt(0, 'slime', { count: 4, interval: 1 })]], [1, [spawnAt(0, 'slime', { group: 'g', pack: 'x' }), spawnAt(0, 'slime', { group: 'g', pack: 'y' })]]])]);
  const w = createWorld(c, { seed: 3, players: 1 });
  run(w, c, 50);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  assert.equal(stateHash(copy), stateHash(w));
  run(w, c, 200);
  run(copy, c, 200);
  assert.equal(stateHash(copy), stateHash(w));
  assert.equal(w.units.length, 5);
});
