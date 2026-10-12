// The battle a kit sees (docs/spec/compat.md 兼容-4, 兼容-5) with a kit of our own in the tiny level: the battle's
// seconds and its end, a unit's deployment time, ground, leader, attack cooldown (read and set) and attack profile; a
// spec's kind and time, its attacks from the operator's own, its noAttack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

/**
 * The tiny level with the guard (ATK 50) under our kit against a slime (DEF 10); its AUTO skill `s` has no duration in its
 * record and the blackboard `bb`; `spec` is the kit's description of it.
 * @param {Record<string, any>} spec @param {Record<string, number>} [bb]
 */
function match(spec, bb = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  c.operators.guard.skill = { id: 's', type: 'AUTO', sp: 'time', cost: 2, init: 2, charges: 1, duration: 0, ammo: false, bb };
  c.decks = [['guard']];
  const box = /** @type {{ b: ShBattle | null, ticks: number[] }} */ ({ b: null, ticks: [] });
  const factory = () => ({ skills: { s: spec }, install(/** @type {any} */ b) { b.on('tick', () => { box.ticks.push(b.time); }); } });
  c.behaviors = kitsBehaviors({ guard: { factory, def: { name: 'guard', skill: { id: 's', bb: {} } } } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {number[]} */
  const hits = [];
  /** @type {number[]} */
  const durs = [];
  bus.on(w, 'skillStart', (k) => { durs.push(k.unit.skill.dur); });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  bus.on(w, 'damaged', (k) => { hits.push(k.amount); });
  return { w, c, box, hits, durs, guard: /** @type {any} */ (w.units.find((u) => u.key === 'guard')) };
}

/** @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };

test('[兼容-4] the battle\'s seconds and end; a unit\'s deployment time, ground, leader, attack cooldown, attack profile', () => {
  const { w, c, box, guard } = match({ kind: 'duration', duration: 2, attack: { atkScale: 2 }, targeting: { maxTargets: 3 } });
  run(w, c, 3);
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard);
  assert.deepEqual(box.ticks.slice(0, 3), [0, 1 / 30, 2 / 30], 'the frame\'s start, in seconds');
  assert.deepEqual([u.deployedAt, u.ground, u.isBoss], [0, true, false]);
  assert.equal(b.finished, false);
  u.atkCd = 0.5;
  assert.deepEqual([guard.atkCd, u.atkCd], [15, 0.5]);
  const p = b.effectiveProfile(u);
  assert.deepEqual([guard.skill.active, p.isSkill, p.atkScale, p.maxTargets], [true, true, 2, 3], 'its running skill\'s overrides');
  run(w, c, 70);
  assert.equal(guard.skill.active, false);
  assert.deepEqual(b.effectiveProfile(u), u.profile, 'no skill running: its own');
  w.result = 0;
  assert.equal(b.finished, true);
});

test('[兼容-5] a spec\'s kind and time over the record\'s; its attacks from the operator\'s own; noAttack; instant keeps the record\'s kind', () => {
  const timed = match({ kind: 'duration', duration: 2 });
  run(timed.w, timed.c, 1);
  assert.deepEqual([timed.guard.skill.active, timed.durs], [true, [60]], 'an instant skill by its record, two seconds by its spec');
  const own = match({ kind: 'duration', duration: 30 }, { atk_scale: 3 });
  run(own.w, own.c, 300);
  assert.ok(own.guard.skill.active && own.hits.length > 0);
  assert.deepEqual([...new Set(own.hits)], [40], 'its attacks: the guard\'s own 50 − 10, not the blackboard\'s 3 ×');
  const held = match({ kind: 'duration', duration: 30, attack: { noAttack: true } });
  run(held.w, held.c, 300);
  assert.deepEqual([held.guard.skill.active, held.hits], [true, []], 'noAttack: none while it runs');
  const next = match({ kind: 'instant', attack: { atkScale: 2 } }, { atk_scale: 3 });
  run(next.w, next.c, 300);
  assert.deepEqual([...new Set(next.hits)].slice(0, 1), [90], 'the record\'s next-attack kind: one attack at the spec\'s 2 ×');
});
