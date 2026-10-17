// Enemies an enemy brings in (docs/spec/foes.md 敌能-22) and 吞噬 (敌能-30) in the engine, and what IG-14's enemies use
// from it (敌能-25…敌能-29): lent buffs, the units around a target, several targets at once, a tile splash's share, hits
// without a projectile and a 倍率 on frozen targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { foeSpawn } from '../src/foes.js';
import { nearestGround } from '../src/broods.js';
import { deployProblem } from '../src/commands.js';
import { inflict } from '../src/status.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny map without waves; enemy `foe` with the given record and behaviours, and `pup`, an enemy with none.
 * @param {Record<string, unknown>} def @param {Record<string, any>} behaviors
 */
function arena(def, behaviors) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.enemies.foe = { name: 'foe', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0, ...def };
  c.enemies.pup = { name: 'pup', maxHp: 10, atk: 0, def: 0, res: 0, moveSpeed: 1 };
  c.behaviors = { foes: behaviors };
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w };
}
/** An enemy of a key (`foe` by default) at (x, y) on route leg `leg` (2 by default). @param {World} w @param {any} c @param {{ x: number, y: number, leg?: number, key?: string }} at */
function foe(w, c, at) {
  const e = makeEnemy(w, c, { key: at.key ?? 'foe', route: 0 });
  Object.assign(e, { x: at.x, y: at.y, leg: at.leg ?? 2 });
  w.units.push(e);
  foeSpawn(w, c, e);
  return e;
}
/** An operator at (row, col). @param {World} w @param {any} c @param {string} key @param {number} row @param {number} col */
function op(w, c, key, row, col) {
  const u = makeOperator(w, c, { key, owner: 0, row, col, dir: 0 });
  w.units.push(u);
  w.players[0].deployed.push(key);
  return u;
}
/** Runs n frames, returning the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c)) out.push({ ...e, f: w.frame - 1 });
  return out;
}
const pups = (/** @type {World} */ w) => w.units.filter((u) => u.key === 'pup');

test('[敌能-22] brought in at once: around the nearest passable ground tile\'s centre or at the enemy itself, on its route from its leg; an unknown key brings none', () => {
  /** @type {any[]} */
  const got = [];
  const { c, w } = arena({}, { call: { tick: (/** @type {any} */ ctx) => {
    if (ctx.state.get('done')) return;
    ctx.state.set('done', 1);
    const [self] = ctx.summon('pup', {});
    got.push(ctx.summon('pup', { cnt: 2, bound: 0.2, tile: true }).length, [self.x, self.y], ctx.summon('nope', { cnt: 3 }).length);
  } } });
  c.enemies.foe.talents = { call: {} };
  foe(w, c, { x: 2.3, y: 1.1 });
  const ev = run(w, c, 1);
  assert.deepEqual(got, [2, [2.3, 1.1], 0], 'two around the tile, one at the enemy itself, none of an unknown key');
  const [at, a, b] = pups(w);
  for (const p of [a, b]) assert.ok(Math.abs(p.x - 2) <= 0.2 && Math.abs(p.y - 1) <= 0.2 && (p.x !== 2 || p.y !== 1), `(${p.x}, ${p.y}) around (2, 1)`);
  assert.ok([a, b, at].every((p) => p.route === 0 && p.leg === 2 && p.wave === -1));
  assert.equal(ev.filter((e) => e.type === 'spawn').length, 3);
  const goal = run(w, c, 120).filter((e) => e.type === 'goal').length;
  assert.equal(goal, 3, 'they go on to the end of the route');
});

test('[敌能-22] brought in later: kept in the world (state, snapshot) until the delay is over, then on the route — a wait leg skipped', () => {
  const { c, w } = arena({}, { call: { death: (/** @type {any} */ ctx) => { ctx.summon('pup', { cnt: 2, delay: 0.2 }); } } });
  c.enemies.foe.talents = { call: {} };
  const e = foe(w, c, { x: 0, y: 1, leg: 1 });
  run(w, c, 2);
  e.hp = 0;
  const died = w.frame;
  run(w, c, 1);
  assert.equal(w.broods?.length, 2);
  const h = stateHash(w), again = restoreSnapshot(takeSnapshot(w));
  assert.equal(stateHash(again), h);
  const ev = run(w, c, 10), ev2 = run(again, c, 10);
  assert.equal(stateHash(w), stateHash(again), 'the snapshot runs on the same');
  assert.deepEqual(ev.filter((x) => x.type === 'spawn').map((x) => x.f), [died + 6, died + 6]);
  assert.equal(ev2.filter((x) => x.type === 'spawn').length, 2);
  assert.deepEqual([w.broods?.length, pups(w).map((p) => p.leg)], [0, [2, 2]], 'the wait it was in skipped');
});

test('[敌能-22] the nearest passable ground tile: not a closed tile nor a 地穴; ties to the first in row order; none on a map without one', () => {
  const m = /** @type {any} */ (tinyContent()).level;
  m.tiles[1][2] = { ...m.tiles[1][2], passable: 'NONE' };
  m.tiles[1][3] = { ...m.tiles[1][3], key: 'tile_hole' };
  assert.deepEqual(nearestGround(m, { x: 2, y: 1 }), { x: 2, y: 0 });
  assert.deepEqual(nearestGround(m, { x: 3, y: 1 }), { x: 3, y: 0 }, 'three at 1: the first in row order');
  m.tiles = m.tiles.map((/** @type {any[]} */ r) => r.map((t) => ({ ...t, passable: 'NONE' })));
  assert.equal(nearestGround(m, { x: 0, y: 0 }), null);
});

test('[敌能-30] 吞噬: the operator is knocked down at the frame\'s end, its card locked while the devourer is on the field, deployable at once after', () => {
  /** @type {boolean[]} */
  const ate = [];
  const { c, w } = arena({}, { eat: { tick: (/** @type {any} */ ctx) => {
    const b = ctx.blocker();
    if (b && !ctx.state.get('done')) { ctx.state.set('done', 1); ate.push(ctx.devour(b), ctx.devour(ctx.self)); }
  } } });
  c.enemies.foe.talents = { eat: {} };
  c.operators.guard.respawnTime = 30;
  const g = op(w, c, 'guard', 1, 2), e = foe(w, c, { x: 2, y: 1 });
  const ev = run(w, c, 3);
  assert.deepEqual(ate, [true, false], 'an enemy is not devoured');
  assert.ok(ev.some((x) => x.type === 'death' && x.id === g.id) && !w.units.includes(g));
  const card = w.players[0].cards.guard, deploy = { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 };
  assert.deepEqual([card.lock, card.ready <= w.frame, card.penalty], [e.id, true, 1]);
  assert.equal(deployProblem(w, c, 0, /** @type {any} */ (deploy)), 'devoured');
  e.hp = 0;
  run(w, c, 1);
  assert.equal(deployProblem(w, c, 0, /** @type {any} */ (deploy)), null, 'the devourer gone: deployable at once');
  step(w, c, [[0, /** @type {any} */ (deploy)]]);
  const g2 = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  g2.hp = 0;
  run(w, c, 1);
  assert.ok(w.players[0].cards.guard.ready >= w.frame + 29 * 30, 'a plain fall after: its 再部署时间 again');
});

test('[敌能-25] [敌能-29] a lent buff lasts while given each turn and ends within two frames of the last; every enemy; the units around a target', () => {
  /** @type {any} */
  let seen = null;
  const { c, w } = arena({}, { lend: { tick: (/** @type {any} */ ctx) => {
    if (ctx.frame < 5) for (const u of ctx.enemies()) ctx.lend(u, 'cheer', { mods: { atkPct: ctx.frame < 3 ? 0.1 : 0.2 } });
    seen ??= { all: ctx.enemies().length, cross: ctx.around(ctx.self, 'cross').map((/** @type {Unit} */ u) => u.key), square: ctx.around(ctx.self, 'square').map((/** @type {Unit} */ u) => u.key) };
  } } });
  c.enemies.foe.talents = { lend: {} };
  const e = foe(w, c, { x: 2, y: 1 }), hid = foe(w, c, { x: 0, y: 1, key: 'pup' });
  hid.hidden = true;
  op(w, c, 'guard', 1, 3);
  op(w, c, 'sniper', 2, 3);
  run(w, c, 4);
  assert.deepEqual(seen, { all: 2, cross: ['guard'], square: ['guard', 'sniper'] });
  assert.deepEqual([e.buffs.find((b) => b.key === 'cheer')?.mods, hid.buffs.length], [{ atkPct: 0.2 }, 1], 'retuned; the hidden one too');
  run(w, c, 2);
  assert.ok(e.buffs.some((b) => b.key === 'cheer'), 'still there a frame after the last');
  run(w, c, 1);
  assert.ok(!e.buffs.some((b) => b.key === 'cheer'), 'gone');
});

test('[敌能-27] [敌能-26] an enemy\'s attack on several targets, without a projectile, with a 倍率 on frozen targets; a tile splash\'s share on the others', () => {
  /** @param {any} mods @param {number} radius */
  const fight = (mods, radius = 2) => {
    const { c, w } = arena({ applyWay: 'RANGED', rangeRadius: radius, baseAttackTime: 1 }, { hit: { attack: (/** @type {any} */ _ctx, /** @type {any} */ m) => ({ ...m, ...mods }) } });
    c.enemies.foe.talents = { hit: {} };
    Object.assign(c.operators.guard, { def: 0, maxHp: 1e6 });
    Object.assign(c.operators.sniper, { def: 0, maxHp: 1e6 });
    foe(w, c, { x: 2, y: 1 });
    const g = op(w, c, 'guard', 1, 3), s = op(w, c, 'sniper', 0, 3);
    return { c, w, g, s };
  };
  const two = fight({ targets: 2 }), ev = run(two.w, two.c, 40);
  assert.ok(two.g.hp < 1e6 && two.s.hp < 1e6, 'both hit');
  assert.ok(ev.some((x) => x.type === 'shot'), 'a ranged enemy shoots');
  const direct = fight({ direct: true });
  assert.ok(!run(direct.w, direct.c, 40).some((x) => x.type === 'shot') && direct.g.hp + direct.s.hp < 2e6, 'hits without a projectile');
  const cold = fight({ frozen: 2.5, direct: true }, 1), warm = fight({ direct: true }, 1);
  inflict(cold.w, cold.g, 'freeze', { seconds: 100 });
  run(cold.w, cold.c, 40);
  run(warm.w, warm.c, 40);
  assert.equal(1e6 - cold.g.hp, (1e6 - warm.g.hp) * 2.5, 'a frozen target: × 2.5');
  const splash = fight({ cross: true, splashScale: 0.5, direct: true }, 1);
  run(splash.w, splash.c, 40);
  assert.equal(1e6 - splash.s.hp, (1e6 - splash.g.hp) / 2, 'the one next to it: half');
});
