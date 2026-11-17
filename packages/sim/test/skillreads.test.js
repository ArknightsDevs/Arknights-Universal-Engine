// What a skill's description does to its operator's attacks and to the skill itself, as the content reads it
// (docs/spec/skills.md 技能-4, 技能-9; docs/spec/traits.md 职业-8, 职业-11): the damage type of a passive skill's attacks, hits for the
// boomerangs thrown, what a skill lifts of its trait, a passive skill's seconds, a bonus that wears off, the 蓄力 part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus } from '../src/index.js';
import { forceSp } from '../src/sp.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit */

/** A MANUAL skill running 20 s with a plain attack. @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'reads', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 20, ammo: false, bb: {}, ...o });

/**
 * The tiny level without spawns: the guard (attack 50, an attack a second; range: its tile and the next) with the skill and the
 * trait given, at (1, 1) facing right; rooted enemies (def 0, res 50, a billion HP) at the given x on its row, the first
 * blocked by the guard when `blocked`. A passive skill starts with the deployment; any other is started with all its SP when
 * `sp` is not given. Every hit the guard deals is recorded as [target id, type, amount].
 * @param {SkillDef} skill @param {number[]} at @param {{ trait?: object, blocked?: boolean, sp?: number }} [o]
 */
function arena(skill, at, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.skill = skill;
  if (o.trait) c.operators.guard.trait = o.trait;
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  const foes = at.map((x) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = x; e.y = 1; e.base = { ...e.base, maxHp: 1e9, def: 0, res: 50, moveSpeed: 1 }; e.hp = 1e9; e.maxHp = 1e9;
    w.units.push(e);
    applyStatus(e, 'root', {});
    return e;
  });
  if (o.blocked) foes[0].blockedBy = op.id;
  /** @type {[number, string, number][]} */
  const hits = [];
  bus.on(w, 'damaged', (k) => { if (k.source === op) hits.push([k.target.id, k.type, k.amount]); });
  if (skill.type !== 'PASSIVE') {
    forceSp(/** @type {any} */ (op.skill), o.sp ?? 99);
    step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  }
  return { w, c, op, foes, hits };
}

/** Runs n frames. @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c, []); };

test('[技能-9] a passive skill\'s attacks change their damage type too: arts against 50 % 法术抗性 hit for half', () => {
  const plain = arena(sk({ type: 'PASSIVE', sp: 'none', duration: -1 }), [2]);
  run(plain.w, plain.c, 40);
  assert.deepEqual([...new Set(plain.hits.map((h) => h[1]))], ['phys']);
  const arts = arena(sk({ type: 'PASSIVE', sp: 'none', duration: -1, extra: { attack: { type: 'arts' } } }), [2]);
  run(arts.w, arts.c, 40);
  assert.deepEqual([...new Set(arts.hits.map((h) => h[1]))], ['arts'], 'every attack of the passive skill');
  assert.equal(arts.hits[0][2], plain.hits[0][2] / 2, 'the 法术抗性 halves it, the 防御 does not');
});

test('[技能-9] [职业-12] hits for the boomerangs an attack throws: each target takes that many hits of the attack', () => {
  const one = arena(sk({}), [2]);
  run(one.w, one.c, 40);
  const two = arena(sk({ extra: { attack: { times: 2 } } }), [2]);
  run(two.w, two.c, 40);
  assert.equal(one.hits.length, 2, 'two attacks in 40 frames: one hit each');
  assert.equal(two.hits.length, 4, 'two hits each');
  assert.equal(two.hits[0][2], one.hits[0][2], 'each is the whole attack');
});

test('[职业-8] [技能-9] a skill that says its attacks are not lowered lifts a trait\'s lowered 倍率 for enemies the operator does not block', () => {
  const trait = { unblockedScale: 0.8 };
  const base = arena(sk({}), [2], { trait });
  run(base.w, base.c, 40);
  const lifted = arena(sk({ extra: { flags: { noUnblockedScale: true } } }), [2], { trait });
  run(lifted.w, lifted.c, 40);
  assert.equal(lifted.hits[0][2], base.hits[0][2] / 0.8, 'the 0.8 is gone while the skill runs');
  const after = arena(sk({ duration: 1, extra: { flags: { noUnblockedScale: true } } }), [2], { trait });
  run(after.w, after.c, 100);
  assert.equal(after.hits.at(-1)?.[2], base.hits[0][2], 'back when the skill is over');
});

test('[职业-8] a lifted 倍率 is only the lowering: a trait that raises it (1.2) keeps it; the enemy it blocks is hit at 1', () => {
  const up = arena(sk({ extra: { flags: { noUnblockedScale: true } } }), [2], { trait: { unblockedScale: 1.2 } });
  run(up.w, up.c, 40);
  const raised = arena(sk({}), [2], { trait: { unblockedScale: 1.2 } });
  run(raised.w, raised.c, 40);
  assert.equal(up.hits[0][2], raised.hits[0][2]);
  const held = arena(sk({}), [2], { trait: { unblockedScale: 0.8 }, blocked: true });
  run(held.w, held.c, 40);
  const free = arena(sk({}), [2], { trait: { unblockedScale: 1 } });
  run(free.w, free.c, 40);
  assert.equal(held.hits[0][2], free.hits[0][2]);
});

test('[职业-8] [技能-9] a next-attack skill that lifts the reduction does it for its attack only: the next ones are lowered again', () => {
  const trait = { unblockedScale: 0.8 };
  const { w, c, hits } = arena(sk({ duration: 0, bb: { atk_scale: 2 }, extra: { flags: { noUnblockedScale: true } } }), [2], { trait });
  run(w, c, 70);
  assert.deepEqual(hits.slice(0, 2).map((h) => h[2]), [100, 40], 'the skill attack (2 × 50) whole, the plain one at 0.8');
});

test('[职业-11] [技能-9] a skill that says the jump does not lower the damage keeps the whole damage at every jump', () => {
  const chain = { chain: { max: 3, scale: 0.5, radius: 3, cells: null } };
  const base = arena(sk({}), [2, 2.5, 3], { trait: chain });
  run(base.w, base.c, 40);
  const kept = arena(sk({ extra: { flags: { noChainDecay: true } } }), [2, 2.5, 3], { trait: chain });
  run(kept.w, kept.c, 40);
  const [first, second] = base.hits.slice(0, 2).map((h) => h[2]);
  assert.equal(second, first / 2, 'the jump halves it');
  assert.deepEqual(kept.hits.slice(0, 3).map((h) => h[2]), [first, first, first], 'whole at every jump');
});

test('[技能-9] a type for the enemies the operator blocks: another enemy keeps its own type', () => {
  const skill = sk({ extra: { attack: { typeBlocked: 'true' } } });
  const held = arena(skill, [2], { blocked: true });
  run(held.w, held.c, 40);
  assert.deepEqual([...new Set(held.hits.map((h) => h[1]))], ['true'], 'the blocked one');
  const free = arena(skill, [2]);
  run(free.w, free.c, 40);
  assert.deepEqual([...new Set(free.hits.map((h) => h[1]))], ['phys'], 'the one nobody blocks');
});

test('[技能-4] a passive skill with seconds ends after them and takes its modifiers with it', () => {
  const { w, c, op } = arena(sk({ type: 'PASSIVE', sp: 'none', duration: 3, bb: { atk: 1 } }), [2]);
  const base = statsOf(op).atk / 2;
  assert.equal(statsOf(op).atk, base * 2, 'on from the deployment');
  run(w, c, 85);
  assert.equal(statsOf(op).atk, base * 2, 'still on before the 3 s are over');
  run(w, c, 10);
  assert.equal(statsOf(op).atk, base, 'over');
  assert.equal(op.skill?.active, false);
  const forever = arena(sk({ type: 'PASSIVE', sp: 'none', duration: -1, bb: { atk: 1 } }), [2]);
  run(forever.w, forever.c, 200);
  assert.equal(statsOf(forever.op).atk, base * 2, 'a passive skill without seconds goes on');
});

test('[技能-4] a bonus that wears off: its keys fall evenly to 0 over the seconds, updated once a second; the others do not', () => {
  const { w, c, op } = arena(sk({ type: 'PASSIVE', sp: 'none', duration: 4, bb: { def: 1, atk: 0.5, duration: 4 }, extra: { decay: { seconds: 4, keys: ['def'] } } }), [2]);
  const def0 = statsOf(op).def / 2, atk0 = statsOf(op).atk / 1.5;
  assert.equal(statsOf(op).def, def0 * 2);
  run(w, c, 29);
  assert.equal(statsOf(op).def, def0 * 1.75, 'a quarter less after the first second');
  assert.equal(statsOf(op).atk, atk0 * 1.5, 'the attack bonus stays');
  run(w, c, 30);
  assert.equal(statsOf(op).def, def0 * 1.5, 'half after the second');
  run(w, c, 60);
  assert.equal(statsOf(op).def, def0, 'over');
});

/** A skill with a 蓄力 part: 5 SP to start, 10 held, atk +100 % only charged. @param {Partial<SkillDef>} [o] @returns {SkillDef} */
const charged = (o = {}) => sk({
  charges: 2, bb: { atk: 1 }, charged: { keys: ['atk'], attack: { times: 3, hitStatus: { key: 'stun', seconds: 1 } }, seconds: 30 }, ...o,
});

test('[技能-4] a skill with a 蓄力 part: started with less than all its SP the keys only that part uses are left out and the SP is all taken', () => {
  const { w, c, op } = arena(charged(), [2], { sp: 7 });
  const base = statsOf(op).atk;
  assert.equal(op.skill?.sp, 0, 'it takes what it holds, not only its 5');
  assert.equal(op.skill?.charged, undefined);
  assert.equal(base, 50, 'no atk bonus');
  run(w, c, 40);
  assert.equal(op.skill?.dur, 20 * 30 - 40, 'its own 20 s');
});

test('[技能-4] a skill with a 蓄力 part started with all its SP: the keys are in effect, its extra attack, its seconds; it ends charged no more', () => {
  const { w, c, op, hits } = arena(charged(), [2], { sp: 10 });
  assert.equal(op.skill?.sp, 0);
  assert.equal(op.skill?.charged, true);
  assert.equal(statsOf(op).atk, 100, 'atk +100 %');
  assert.equal(op.skill?.dur, 30 * 30, 'the charged seconds');
  run(w, c, 40);
  assert.equal(hits.length, 6, 'three hits an attack');
  assert.equal(hits[0][2], 100, 'of the raised attack: physical, the enemy has no 防御');
});

test('[技能-4] a skill the content runs itself keeps the SP the rule of its own: nothing of the 蓄力 part is read for it', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.skill = charged();
  c.behaviors = { skills: { reads: { start() {}, end() {} } } };
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  forceSp(/** @type {any} */ (op.skill), 10);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  assert.equal(op.skill?.sp, 5, 'one cost, the rest stays');
  assert.equal(op.skill?.charged, undefined);
});

test('[技能-4] [技能-8] 攻击距离+2 of a 蓄力 part on a next-attack skill: held from a charged start until its attack lands', () => {
  const skill = () => sk({ duration: 0, charges: 2, bb: { atk_scale: 2 }, charged: { keys: [], mods: { rangeExtend: 2 } } });
  // The range is 2 tiles from the guard's own; the dummy two tiles past it.
  const full = arena(skill(), [4], { sp: 10 });
  assert.deepEqual(full.hits.map((h) => h[2]), [100], 'charged: the dummy past the range is hit by the skill attack (2 × 50)');
  assert.equal(full.op.skill?.active, false);
  assert.equal(statsOf(full.op).rangeExtend, 0, 'gone with the attack');
  run(full.w, full.c, 70);
  assert.equal(full.hits.length, 1, 'the plain attacks do not reach it');
  const one = arena(skill(), [4], { sp: 5 });
  assert.equal(one.op.skill?.charged, undefined);
  assert.equal(statsOf(one.op).rangeExtend, 0, 'one charge: no 蓄力 part');
  run(one.w, one.c, 70);
  assert.equal(one.hits.length, 0, 'the dummy is out of its range');
  assert.equal(one.op.skill?.armed, true, 'still waiting for an attack');
  // Held while it waits: a dummy beyond even the extended range does not end it; one that comes into it does.
  const wait = arena(skill(), [5], { sp: 10 });
  run(wait.w, wait.c, 70);
  assert.deepEqual([wait.op.skill?.armed, statsOf(wait.op).rangeExtend, wait.hits.length], [true, 2, 0]);
  wait.foes[0].x = 4;
  run(wait.w, wait.c, 40);
  assert.deepEqual([wait.op.skill?.active, statsOf(wait.op).rangeExtend, wait.hits.map((h) => h[2])], [false, 0, [100]]);
});
