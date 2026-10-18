// Skills that run until they are closed, AUTO skills of operators that do not attack, skills that cost deployment cost,
// and what a running skill gives the friendly units in its range (docs/spec/skills.md 技能-3, 技能-4, 技能-10, 技能-11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { kindOf } from '../src/skills.js';
import { forceSp } from '../src/sp.js';
import { makeOperator } from '../src/units.js';
import { statsOf } from '../src/attrs.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit */

/** @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'test', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 10, ammo: false, bb: {}, ...o });

/**
 * The tiny level without spawns or cost over time: the guard (range: its tile and two ahead) with the skill and trait,
 * deployed at (1, 1) facing right; `ally` adds another operator at a tile.
 * @param {SkillDef} skill @param {Record<string, any>} [trait]
 */
function arena(skill, trait = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.level.options.costIncreaseTime = 1e9;
  Object.assign(c.operators.guard, { skill, trait, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] });
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {string} key @param {number} row @param {number} col @param {number} [dir] */
  const ally = (key, row, col, dir = 0) => {
    const u = makeOperator(w, c, { key, owner: 0, row, col, dir });
    w.units.push(u);
    return u;
  };
  /** The skill command for a unit, after filling its SP. @param {Unit} u */
  const cast = (u) => { forceSp(/** @type {any} */ (u.skill), 99); return step(w, c, [[u.owner, { type: 'skill', unit: u.id }]]); };
  return { w, c, op, ally, cast };
}

/** Runs n frames. @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c, []); };

test('[技能-4] a skill that says 持续时间无限 runs until it is closed: a duration skill with no end, its attack keys on every attack', () => {
  assert.equal(kindOf(sk({ type: 'AUTO', duration: -1, forever: true, bb: { atk: 0.5, 'attack@max_target': 2 } })), 'duration', '铃兰 S2, not a next-attack skill');
  assert.equal(kindOf(sk({ type: 'AUTO', duration: -1, forever: true, bb: { atk: 0.5 } })), 'duration', '拉普兰德 S1, not an instant one');
  const { w, c, op, cast } = arena(sk({ duration: -1, forever: true, stoppable: true, bb: { atk: 0.5 } }));
  cast(op);
  run(w, c, 30 * 600);
  assert.deepEqual([op.skill?.active, op.skill?.dur, statsOf(op).atk], [true, -1, 75], 'ten minutes on');
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  assert.deepEqual([op.skill?.active, statsOf(op).atk], [false, 50], 'closed');
});

test('[技能-3] the AUTO skill of an operator that makes no normal attacks starts as soon as it is ready; another\'s waits for an attack', () => {
  const skill = sk({ type: 'AUTO', duration: -1, forever: true, bb: { atk: 0.5 } });
  const bard = arena(skill, { noAttack: true }), guard = arena(skill);
  for (const a of [bard, guard]) { forceSp(/** @type {any} */ (a.op.skill), 99); step(a.w, a.c, []); }
  assert.deepEqual([bard.op.skill?.active, guard.op.skill?.active], [true, false], 'no enemy to attack');
});

test('[技能-10] a skill that costs deployment cost starts only while the owner holds it, which it pays; its blackboard cost is no gain', () => {
  const { w, op, cast } = arena(sk({ spend: 8, bb: { cost: 8, atk: 0.2 } }));
  assert.equal(w.players[0].cost, 5, 'the guard took 5 of 10');
  cast(op);
  assert.deepEqual([op.skill?.active, op.skill?.sp, w.players[0].cost], [false, 5, 5], 'not enough: the command is ignored');
  w.players[0].cost = 9;
  cast(op);
  assert.deepEqual([op.skill?.active, w.players[0].cost, statsOf(op).atk], [true, 1, 60]);
});

test('[技能-10] [职业-20] 佣兵 MCN-X: attack + atk for each cost the skill paid, at most max, until it ends', () => {
  const { w, c, op, cast } = arena(sk({ spend: 8, bb: { cost: 8 } }), { spendAtk: { atk: 0.1, max: 5 } });
  w.players[0].cost = 12;
  cast(op);
  assert.deepEqual([op.buffs.find((b) => b.key === 'spendAtk')?.value, statsOf(op).atk], [5, 75], 'eight paid, five steps');
  run(w, c, 30 * 10 + 2);
  assert.deepEqual([op.skill?.active, op.buffs.some((b) => b.key === 'spendAtk'), statsOf(op).atk], [false, false, 50]);
});

test('[技能-11] 鼓舞: a 最终加算 of the source\'s attribute × the ratio for the friendly units in its range, not itself (其他), not a 吟游者', () => {
  const allies = { others: true, inspire: { atk: 1, maxHp: 0.5 }, mods: { blockCnt: -3 } };
  const { w, c, op, ally, cast } = arena(sk({ bb: { atk: 1 }, allies, extra: { mods: { atkPct: 0 } } }), { noAttack: true, noInspire: true });
  c.operators.bard = { ...c.operators.sniper, trait: { noInspire: true } };
  const sniper = ally('sniper', 1, 2), bard = ally('bard', 1, 3), far = ally('sniper', 0, 4);
  cast(op);
  step(w, c, []);
  assert.deepEqual([statsOf(sniper).atk, statsOf(sniper).maxHp, statsOf(sniper).blockCnt], [30 + 50, 500 + 1000 * 0.5, 0]);
  assert.deepEqual([statsOf(bard).atk, statsOf(bard).blockCnt], [30, 0], 'a 吟游者: the block count, no 鼓舞');
  assert.deepEqual([statsOf(op).atk, statsOf(op).blockCnt, statsOf(far).atk], [50, 2, 30], 'not itself; not one out of range');
  run(w, c, 30 * 10 + 2);
  assert.deepEqual([statsOf(sniper).atk, statsOf(sniper).blockCnt, sniper.buffs.length], [30, 1, 0], 'gone with the skill');
});

test('[技能-11] of several 鼓舞 of one attribute the highest ratio, not the highest amount; a skill without 其他 reaches its own operator', () => {
  const { w, c, op, ally, cast } = arena(sk({ allies: { others: false, inspire: { atk: 1 } } }));
  c.operators.strong = { ...c.operators.guard, atk: 400, skill: sk({ id: 'strong', allies: { others: false, inspire: { atk: 0.5 } } }) };
  const sniper = ally('sniper', 1, 2), strong = ally('strong', 1, 4, 2);
  cast(op);
  cast(strong);
  step(w, c, []);
  assert.deepEqual([statsOf(sniper).atk, sniper.buffs.find((b) => b.key === 'inspire:atk')?.src], [30 + 50, op.id], '50 × 1 over 400 × 0.5');
  run(w, c, 5);
  assert.deepEqual([statsOf(op).atk, statsOf(strong).atk], [50 + 50, 400 + 200], '其他 not said: each its own 鼓舞 too, of its attack without it');
});
