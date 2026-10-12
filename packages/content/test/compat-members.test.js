// The battle a kit sees (docs/spec/compat.md 兼容-4, 兼容-5) with a kit of our own in the tiny level: the battle's
// seconds and its end, a unit's deployment time, ground, leader, attack cooldown (read and set) and attack profile; a
// spec's kind and time, its attacks from the operator's own, its noAttack; buffs with callbacks, the bursts' names, the
// 无来源 damage of a periodic effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus, buffs, attrs } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { periodicDamage } from '../src/compat/sh/damage.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

/**
 * The tiny level with the guard (ATK 50) under our kit against a slime (DEF 10); its AUTO skill `s` has no duration in its
 * record and the blackboard `bb`; `spec` is the kit's description of it.
 * @param {Record<string, any>} spec @param {Record<string, number>} [bb] @param {Record<string, any>} [skill] changes to its record
 */
function match(spec, bb = {}, skill = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  c.operators.guard.skill = { id: 's', type: 'AUTO', sp: 'time', cost: 2, init: 2, charges: 1, duration: 0, ammo: false, bb, ...skill };
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
/** A unit's DEF now. @param {any} u */
const attrsDef = (u) => attrs.statsOf(u).def;

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
  const charged = match({ kind: 'charges', attack: { atkScale: 2 } });
  run(charged.w, charged.c, 300);
  assert.deepEqual([...new Set(charged.hits)].slice(0, 1), [90], 'an instant record, a spec with an attack of its own: its next attack');
  const num = match({ kind: 'duration', duration: 30, attack: { dmgMul: 1.5 } }), fn = match({ kind: 'duration', duration: 30, attack: { dmgMul: () => 2 } });
  run(num.w, num.c, 300);
  run(fn.w, fn.c, 300);
  assert.deepEqual([[...new Set(num.hits)], [...new Set(fn.hits)]], [[65], [90]], 'dmgMul: 50 × 1.5 − 10; 50 × 2 − 10 on the main target');
});

test('[兼容-4] Stronghold\'s rng signatures, a unit\'s facing step and extra range, settable ammo and layers; aggregateMods', async () => {
  const { w, c, box, guard } = match({ kind: 'duration', duration: 30 });
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard);
  const ints = Array.from({ length: 200 }, () => b.rng.int(3));
  assert.deepEqual([...new Set(ints)].sort(), [0, 1, 2], 'int(n): 0 … n − 1');
  assert.equal(b.rng.weighted(['a', 'b'], (/** @type {string} */ x) => (x === 'b' ? 1 : 0)), 'b');
  assert.equal(b.rng.weighted(['a'], () => 0), undefined);
  assert.deepEqual(u.fwd, [0, 1], 'RIGHT: one column on');
  assert.equal(b.setExtraRange(u, [0, 1]), true);
  assert.deepEqual([u.extraRangeKeys, u.rangeKeySet.has(0)], [[0, 1], true]);
  b.setExtraRange(u, null);
  assert.equal(u.extraRangeKeys, null);
  b.addBuff(u, { key: 'k', mods: { atkPct: 0.1, atkMul: 1.5 }, refresh: 'stack', maxStacks: 3 });
  const buff = /** @type {any} */ (u.findBuff('k'));
  buff.stacks = 2;
  assert.equal(buff.stacks, 2);
  const { aggregateMods } = await import('../src/compat/sh/buffs.js');
  const agg = aggregateMods(u.buffs);
  assert.deepEqual([Math.round(agg.add.atkPct * 1e9) / 1e9, agg.mul.atkMul], [0.2, 2.25], 'adds × layers, multiplies to their power');
  run(w, c, 1);
});

test('[兼容-5] an activation is counted before its spec\'s onStart; a running ammo skill\'s ammo may be set', () => {
  /** @type {number[]} */
  const seen = [];
  const { w, c, box, guard } = match({ kind: 'duration', duration: 30, onStart: (/** @type {any} */ ctx) => { seen.push(ctx.skill.activations); } });
  run(w, c, 2);
  const u = /** @type {ShBattle} */ (box.b).unitOf(guard);
  assert.deepEqual([seen, u.skill?.activations], [[1], 1], 'counted once, before onStart');
  const ammo = match({ kind: 'ammo' }, { 'attack@trigger_time': 4 }, { ammo: true });
  for (let i = 0; i < 300 && !ammo.guard.skill.active; i++) step(ammo.w, ammo.c);
  const sk = /** @type {any} */ (/** @type {ShBattle} */ (ammo.box.b).unitOf(ammo.guard).skill);
  const left = sk.ammoLeft;
  assert.ok(left > 0 && left <= 4);
  sk.ammoLeft += 1;
  assert.deepEqual([sk.ammoLeft, ammo.guard.skill.ammo], [left + 1, left + 1]);
});

test('[兼容-4] a kit buff\'s onTick every interval or frame, onExpire, onRemove; the bursts\' names; 无来源 periodic damage', () => {
  const { w, c, box, guard } = match({ kind: 'duration', duration: 30 });
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard), log = /** @type {any[]} */ ([]);
  b.addBuff(u, { key: 't', duration: 1, interval: 0.2, onTick: (/** @type {any} */ x) => log.push(['tick', x.dt, x.buff.key, x.unit === u]), onExpire: () => log.push('expire') });
  b.addBuff(u, { key: 'f', duration: 0.1, onTick: (/** @type {any} */ x) => log.push(['frame', Math.round(x.dt * 30)]) });
  run(w, c, 30);
  assert.deepEqual(log, [['frame', 1], ['frame', 1], ['frame', 1], ...Array.from({ length: 5 }, () => ['tick', 0.2, 't', true]), 'expire'], 'every 6 frames for 30: 5 ticks, then it ends');
  b.addBuff(u, { key: 'r', onRemove: () => log.push('remove') });
  b.removeBuff(u, 'r');
  assert.equal(log.at(-1), 'remove');
  buffs.addBuff(guard, buffs.makeBuff({ key: 'burst:FIRE', left: 30 }));
  assert.deepEqual([u.hasBuff('burnBurst'), u.findBuff('burnBurst')?.key, u.hasBuff('neuralBurst')], [true, 'burnBurst', false], 'the engine\'s 灼燃 burst');
  b.removeBuff(u, 'burnBurst');
  assert.equal(u.hasBuff('burnBurst'), false);
  b.addBuff(u, { key: 'x2', mods: { dmgDealtMul: 2 } });
  const seen = /** @type {any[]} */ ([]);
  b.on('damaged', (/** @type {any} */ x) => { seen.push([x.source, x.credit === u]); });
  const hp = guard.hp;
  b.dealDamage(u, u, periodicDamage(100));
  assert.deepEqual([hp - guard.hp, seen], [100, [[null, true]]], 'not doubled; the hook sees no source, its credit is the dealer');
});

test('[兼容-4] a piece has one id for the whole battle, reserved before anything is deployed; unitById finds it by either', () => {
  const { box, guard } = match({ kind: 'duration', duration: 30 });
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard);
  assert.deepEqual([u.id, guard.id > u.id, b.unitById(u.id) === u, b.unitById(guard.id) === u], [1, true, true, true]);
});

test('[兼容-4] a stand-in status: defDown as a strongest-value buff of its key after beforeStatus, which may change it', () => {
  const { w, c, box, guard } = match({ kind: 'duration', duration: 30 });
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard), seen = /** @type {any[]} */ ([]);
  b.on('beforeStatus', (/** @type {any} */ k) => { seen.push([k.status, k.duration, k.value]); if (k.value > 0.5) k.cancel = true; });
  const def = guard.base.def;
  assert.deepEqual([b.applyStatus(u, 'defDown', { duration: 2, value: 0.2 }), b.applyStatus(u, 'defDown', { duration: 1 }), b.applyStatus(u, 'defDown', { value: 0.9 })], [true, true, false]);
  assert.deepEqual(seen, [['defDown', 2, 0.2], ['defDown', 1, 0.3], ['defDown', Infinity, 0.9]]);
  const held = /** @type {any} */ (u.findBuff('defDown'));
  assert.deepEqual([held.status, held.data, Math.round(attrsDef(guard) * 1e6) / 1e6], ['defDown', { value: 0.3 }, Math.round(def * 0.7 * 1e6) / 1e6], 'the strongest in effect');
  run(w, c, 31);
  assert.deepEqual([u.findBuff('defDown')?.data, Math.round(attrsDef(guard) * 1e6) / 1e6], [{ value: 0.2 }, Math.round(def * 0.8 * 1e6) / 1e6], 'the weaker resumes');
});

test('[兼容-5] a spec attack whose hitsFn gives 0 deals nothing itself; its hit callbacks still run, with nothing dealt', () => {
  /** @type {number[]} */
  const dealt = [];
  const { w, c, hits } = match({ kind: 'duration', duration: 30, attack: { hitsFn: () => 0, onHit: (/** @type {any} */ x) => { dealt.push(x.dealt); } } });
  run(w, c, 300);
  assert.deepEqual([hits, dealt.length > 0, [...new Set(dealt)]], [[], true, [0]]);
});

test('[兼容-3] battle.data.rawToken: none for a summon no piece of the battle owns', () => {
  const { box } = match({ kind: 'duration', duration: 30 });
  assert.equal(/** @type {ShBattle} */ (box.b).data.rawToken('token_nope'), null);
});

test('[兼容-4] the targets an attack would take, the tiles a way crosses, a unit a kit moves (路线-5)', async () => {
  const { acquireTargets } = await import('../src/compat/sh/ai.js');
  const { w, c, box, guard } = match({ kind: 'duration', duration: 30 });
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard);
  assert.deepEqual(acquireTargets(b, u, u.profile), [], 'nothing in range yet');
  /** @type {any} */
  let slime;
  for (let i = 0; i < 900 && !(slime = w.units.find((x) => x.key === 'slime')); i++) step(w, c);
  const s = b.unitOf(slime);
  s.x = guard.x;
  s.y = guard.y;
  assert.deepEqual([slime.x, slime.y, slime.path], [guard.x, guard.y, []], 'moved, its way planned afresh');
  assert.deepEqual(acquireTargets(b, u, u.profile).map((/** @type {any} */ x) => x.defId), ['slime']);
  const way = b.grid.findPath(1, 0, 1, 3);
  assert.deepEqual([way?.[0], way?.at(-1), b.grid.findPath(1, 0, 99, 99)], [[1, 0], [1, 3], null]);
});

test('[兼容-4] a kit\'s shots: to a point at its speed, homing on a unit, a fizzle when the target leaves unless hitDead', () => {
  const { w, c, box, guard } = match({ kind: 'duration', duration: 30 });
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard), got = /** @type {any[]} */ ([]);
  b.addProjectile({ from: { x: 0, y: 1 }, to: { x: 3, y: 1 }, speed: 3, onHit: (/** @type {any} */ x) => got.push(['point', w.frame, x.x, x.target]) });
  b.addProjectile({ from: { x: 0, y: 1 }, target: u, speed: 30, onHit: (/** @type {any} */ x) => got.push(['unit', x.target === u]) });
  run(w, c, 40);
  assert.deepEqual(got, [['unit', true], ['point', 30, 3, null]], 'a second at 3 tiles a second; the fast one first');
  b.addProjectile({ from: { x: 0, y: 1 }, target: u, speed: 1, onHit: () => got.push(['fizzled?', false]) });
  b.addProjectile({ from: { x: 0, y: 1 }, target: u, speed: 1, hitDead: true, onHit: (/** @type {any} */ x) => got.push(['dead', x.target]) });
  b.retreat(u);
  run(w, c, 90);
  assert.deepEqual(got.slice(2), [['dead', null]]);
});

test('[兼容-4] moveRedeploy: the 移动 that keeps all (部署-9), a new deployment; refused where Stronghold or the engine would not', () => {
  const { w, c, box, guard } = match({ kind: 'duration', duration: 30 });
  const b = /** @type {ShBattle} */ (box.b), u = b.unitOf(guard), got = /** @type {any[]} */ ([]);
  b.on('deploy', (/** @type {any} */ k) => { if (k.unit === u) got.push([k.unit.defId, k.initial, k.move]); });
  run(w, c, 45);
  const hp = guard.hp, seq = u.deploySeq;
  assert.deepEqual([b.moveRedeploy(u, 0, 0), b.moveRedeploy(u, 9, 9), b.moveRedeploy(u, 1.5, 3), w.units.includes(guard)], [false, false, false, true], 'no tile for it: nothing done');
  assert.equal(b.moveRedeploy(u, 1, 4, { clearSp: true }), true);
  assert.deepEqual([u.u, u.tileR, u.tileC, guard.hp, u.deploySeq, u.deployedAt, got], [guard, 1, 4, hp, seq + 1, w.frame / 30, [['guard', false, true]]]);
  assert.equal(guard.skill.active, true, 'its running skill kept');
});
