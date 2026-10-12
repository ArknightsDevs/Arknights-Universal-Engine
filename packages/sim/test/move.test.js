// An operator's 移动 (docs/spec/field.md 部署-9) on the tiny level: afresh by default, keeping all with `keep`, a retreat
// on a tile it may not take.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, moveOperator, attrs, buffs, damage, bus } from '../src/index.js';

/** The tiny level with the guard deployed on (1, 1), at half HP, with a buff of its own and some SP. */
function field() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 0, charges: 1, duration: 5, ammo: false, bb: {} };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  for (let f = 0; f < 60; f++) step(w, c);
  damage.dealDamage(w, null, guard, { type: 'true', amount: attrs.statsOf(guard).maxHp / 2 });
  buffs.addBuff(guard, buffs.makeBuff({ key: 'mine', mods: { atkFlat: 10 } }));
  return { w, c, guard };
}

test('[部署-9] a move: the same unit afresh on the tile — no buff or SP, its deployment again, its HP ratio kept', () => {
  const { w, c, guard } = field(), seen = /** @type {string[]} */ ([]);
  for (const name of /** @type {const} */ (['enter', 'skillEnd', 'deploy'])) bus.on(w, name, (k) => seen.push(`${name}:${k.reason ?? k.move ?? ''}`));
  guard.skill.sp = 30;
  step(w, c, [[0, { type: 'skill', unit: guard.id }]]);
  assert.ok(guard.skill.active);
  const u = /** @type {any} */ (moveOperator(w, c, guard, { row: 1, col: 3 }));
  assert.deepEqual(seen, ['skillEnd:move', 'enter:', 'deploy:true']);
  assert.ok(u && u !== guard && u.id === guard.id && w.units.includes(u) && !w.units.includes(guard));
  assert.deepEqual([u.x, u.y, u.dir, u.buffs.some((/** @type {any} */ b) => b.key === 'mine'), u.skill.sp, u.born], [3, 1, guard.dir, false, 0, w.frame]);
  assert.ok(Math.abs(u.hp / attrs.statsOf(u).maxHp - 0.5) < 1e-9, 'half HP still');
  assert.equal(w.players[0].deployed.filter((k) => k === 'guard').length, 1, 'still one deployment');
});

test('[部署-9] keep: buffs, skill and HP stay; a tile it may not take retreats it', () => {
  const { w, c, guard } = field(), hp = guard.hp, sp = guard.skill.sp, seen = /** @type {string[]} */ ([]);
  for (const name of /** @type {const} */ (['enter', 'deploy'])) bus.on(w, name, () => seen.push(name));
  const u = /** @type {any} */ (moveOperator(w, c, guard, { row: 1, col: 3 }, { keep: true }));
  assert.deepEqual([u, seen], [guard, ['deploy']]);
  assert.deepEqual([u.x, u.y, u.hp, u.skill.sp, u.buffs.some((/** @type {any} */ b) => b.key === 'mine'), u.born], [3, 1, hp, sp, true, w.frame]);
  assert.equal(moveOperator(w, c, guard, { row: 99, col: 99 }), false);
  assert.equal(w.units.includes(guard), false, 'retreated');
});
