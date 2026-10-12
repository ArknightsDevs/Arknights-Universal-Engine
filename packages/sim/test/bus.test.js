// The hook bus and timers (docs/spec/hooks.md 钩子-1…钩子-3): handlers by priority then registration, stopping, once,
// owners, the nesting limit; timers by frame; the engine's battleStart and tick events; none of it is state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, takeSnapshot } from '../src/index.js';
import { on, off, offOwner, emit, hasHook, after, every, runTimers, MAX_DEPTH, busOf } from '../src/bus.js';

const world = () => createWorld(tinyContent(), { seed: 1, players: 1 });

test('[钩子-1] handlers run by descending priority, then in registration order; stopPropagation ends the dispatch', () => {
  const w = world(), seen = /** @type {string[]} */ ([]);
  on(w, 'e', () => seen.push('a0'));
  on(w, 'e', () => seen.push('b5'), { priority: 5 });
  on(w, 'e', () => seen.push('c0'));
  on(w, 'e', () => seen.push('d-1'), { priority: -1 });
  on(w, 'e', () => seen.push('e5'), { priority: 5 });
  const ctx = emit(w, 'e', { n: 1 });
  assert.deepEqual(seen, ['b5', 'e5', 'a0', 'c0', 'd-1']);
  assert.deepEqual(ctx, { n: 1 }, 'the context comes back');
  seen.length = 0;
  on(w, 'e', (c) => { seen.push('stop'); c.stopPropagation = true; }, { priority: 1 });
  emit(w, 'e', {});
  assert.deepEqual(seen, ['b5', 'e5', 'stop']);
  assert.equal(emit(w, 'none', { x: 2 }).x, 2, 'no handler: the context as it was');
  assert.deepEqual([hasHook(w, 'e'), hasHook(w, 'none')], [true, false]);
});

test('[钩子-1] once, removal, additions during a dispatch, owners', () => {
  const w = world(), seen = /** @type {string[]} */ ([]), owner = { id: 7 };
  on(w, 'e', () => seen.push('once'), { once: true });
  const late = { h: /** @type {any} */ (null) };
  on(w, 'e', () => { seen.push('adder'); late.h ??= on(w, 'e', () => seen.push('late')); off(w, gone); });
  const gone = on(w, 'e', () => seen.push('gone'));
  on(w, 'e', () => seen.push('owned'), { owner });
  emit(w, 'e', {});
  assert.deepEqual(seen, ['once', 'adder', 'owned'], 'removed meanwhile: skipped; added meanwhile: from the next emit');
  seen.length = 0;
  emit(w, 'e', {});
  assert.deepEqual(seen, ['adder', 'owned', 'late']);
  const t = after(w, 3, () => seen.push('timer'), { owner });
  offOwner(w, owner);
  seen.length = 0;
  emit(w, 'e', {});
  assert.deepEqual(seen, ['adder', 'late'], 'its handler gone');
  assert.equal(t.cancelled, true, 'its timer cancelled');
});

test('[钩子-1] nesting deeper than 32 emits runs no handler', () => {
  const w = world();
  let depth = 0, most = 0;
  on(w, 'deep', () => { depth++; most = Math.max(most, depth); emit(w, 'deep', {}); depth--; });
  emit(w, 'deep', {});
  assert.equal(MAX_DEPTH, 32);
  assert.equal(most, 32);
  assert.equal(busOf(w).skipped, 1);
});

test('[钩子-2] after k frames: at the start of frame F + k (0 counts as 1); every n: F + n then each n, or at the next timers’ run when immediate', () => {
  const c = tinyContent(), w = createWorld(c, { seed: 1, players: 1 }), runs = /** @type {string[]} */ ([]);
  step(w, c);
  step(w, c); // registered before frame 2 runs
  after(w, 3, (x) => runs.push(`after3@${x.frame}`));
  after(w, 0, (x) => runs.push(`after0@${x.frame}`));
  const rep = every(w, 2, (x) => runs.push(`every2@${x.frame}`));
  every(w, 4, (x) => runs.push(`now4@${x.frame}`), { immediate: true });
  for (let i = 0; i < 6; i++) step(w, c); // frames 2 … 7
  assert.deepEqual(runs, ['now4@2', 'after0@3', 'every2@4', 'after3@5', 'every2@6', 'now4@6']);
  rep.cancel();
  runs.length = 0;
  for (let i = 0; i < 4; i++) step(w, c); // frames 8 … 11
  assert.deepEqual(runs, ['now4@10'], 'every2 cancelled: no more');
  every(w, 3, (x) => runs.push(`late@${x.frame}`), { immediate: true });
  runs.length = 0;
  step(w, c);
  assert.deepEqual(runs, ['late@12'], 'registered after frame 11 ran: at frame 12');
  const order = /** @type {string[]} */ ([]);
  after(w, 2, () => order.push('b'));
  after(w, 1, () => order.push('a'));
  after(w, 2, () => order.push('c'));
  w.frame += 2;
  runTimers(w);
  assert.deepEqual(order, ['a', 'b', 'c'], 'by due frame, then by when scheduled');
});

test('[钩子-3] battleStart on frame 0 once; tick every frame before the dead leave', () => {
  const c = tinyContent(), w = createWorld(c, { seed: 1, players: 1 }), seen = /** @type {string[]} */ ([]);
  on(w, 'battleStart', () => seen.push(`start@${w.frame}`));
  on(w, 'tick', (ctx) => seen.push(`tick@${w.frame}:${ctx.frames}`));
  step(w, c);
  step(w, c);
  assert.deepEqual(seen, ['start@0', 'tick@0:1', 'tick@1:1']);
});

test('[钩子-1] [钩子-2] handlers and timers are no state: the hash and the snapshot leave them out', () => {
  const c = tinyContent(), a = createWorld(c, { seed: 3, players: 1 }), b = createWorld(c, { seed: 3, players: 1 });
  on(b, 'tick', () => {});
  every(b, 5, () => {});
  for (let i = 0; i < 4; i++) { step(a, c); step(b, c); }
  assert.equal(stateHash(a), stateHash(b));
  assert.equal('bus' in /** @type {any} */ (takeSnapshot(b).data), false);
});

test('[钩子-3] deploy after an operator is deployed and when an enemy appears; enemySpawn; death when units leave', () => {
  const c = tinyContent(), w = createWorld(c, { seed: 1, players: 1 }), seen = /** @type {string[]} */ ([]);
  on(w, 'deploy', (x) => seen.push(`deploy:${x.unit.key}:${x.initial}`));
  on(w, 'enemySpawn', (x) => seen.push(`spawn:${x.enemy.key}`));
  on(w, 'death', (x) => seen.push(`death:${x.unit.key}:${x.reason}:${w.units.includes(x.unit)}`));
  step(w, c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }]]);
  assert.deepEqual(seen, ['deploy:sniper:false']);
  while (!seen.some((s) => s.startsWith('spawn'))) step(w, c);
  assert.deepEqual(seen.slice(1), ['deploy:slime:false', 'spawn:slime'], 'the enemy’s deploy, then enemySpawn');
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'sniper'));
  step(w, c, [[0, { type: 'retreat', unit: op.id }]]);
  assert.equal(seen.at(-1), 'death:sniper:retreat:false', 'retreated: off the field already');
  const e = /** @type {any} */ (w.units.find((u) => u.key === 'slime'));
  e.hp = 0;
  step(w, c);
  assert.equal(seen.at(-1), 'death:slime:killed:true', 'killed: at the frame’s end, still listed while its handlers run');
});

test('[钩子-4] a new world is handed to the content’s setup before its first frame', () => {
  const c = /** @type {any} */ (tinyContent()), seen = /** @type {string[]} */ ([]);
  c.behaviors = { world: (/** @type {any} */ w) => { seen.push(`setup@${w.frame}`); on(w, 'battleStart', () => seen.push('start')); } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  assert.deepEqual(seen, ['setup@0', 'start']);
});

