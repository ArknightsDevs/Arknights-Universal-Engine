// A trait's modifiers while a condition on the operator holds (docs/spec/traits.md 职业-18): the buff given and taken
// back at its turn, each condition — blocking, HP, enemies and allies in its own range, operators around it, energy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { dealEp } from '../src/elements.js';
import { dealDamage } from '../src/damage.js';
import { traitWhiles } from '../src/whiles.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without spawns, the guard (range: its tile and two ahead) with these `whiles`; `foe` adds a rooted
 * enemy, `ally` another operator at a tile. @param {any[]} whiles
 */
function arena(whiles) {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.guard.trait = { whiles };
  c.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, ...over };
    e.hp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  /** @param {number} row @param {number} col @param {Record<string, any>} [o] */
  const ally = (row, col, o = {}) => {
    const u = makeOperator(w, c, { key: 'sniper', owner: 1, row, col, dir: 0, ...o });
    w.units.push(u);
    return u;
  };
  /** Which of its `while:` buffs the guard has after its turn's update. */
  const on = () => { traitWhiles(w, c, op); return op.buffs.filter((b) => b.key.startsWith('while:')).map((b) => Number(b.key.slice(6))); };
  return { w, c, op, foe, ally, on };
}

test('[职业-18] a buff with the modifiers while the condition holds, taken back when it no longer does: blocking or not', () => {
  const { w, c, op, foe, on } = arena([{ when: 'blocking', mods: { atkPct: 0.5 } }, { when: 'notBlocking', mods: { aspd: 10 } }]);
  assert.deepEqual([on(), statsOf(op).atk, statsOf(op).aspd], [[1], 50, 110], 'the guard: attack 50, attack speed 100');
  const e = foe(1, 1);
  e.blockedBy = op.id;
  assert.deepEqual([on(), statsOf(op).atk, statsOf(op).aspd], [[0], 75, 100]);
  e.hp = 0;
  assert.deepEqual(on(), [1], 'an enemy at 0 HP is blocked no more');
  e.hp = 1; e.blockedBy = op.id;
  step(w, c, []);
  assert.deepEqual(op.buffs.filter((b) => b.key.startsWith('while:')).map((b) => b.key), ['while:0'], 'the operator\'s turn updates it');
});

test('[职业-18] its HP above or below a share of its maximum', () => {
  const { op, on } = arena([{ when: 'hpAbove', value: 0.5, mods: { aspd: 1 } }, { when: 'hpBelow', value: 0.5, mods: { aspd: 2 } }]);
  op.hp = 0.6 * statsOf(op).maxHp;
  assert.deepEqual(on(), [0]);
  op.hp = 0.5 * statsOf(op).maxHp;
  assert.deepEqual(on(), [], 'neither at exactly the share');
  op.hp = 0.4 * statsOf(op).maxHp;
  assert.deepEqual(on(), [1]);
});

test('[职业-18] enemies in its own range: how many, ground ones, an elite or leader, one in a burst', () => {
  const { foe, on } = arena([
    { when: 'enemies', value: 2, mods: { aspd: 1 } }, { when: 'groundEnemies', value: 1, mods: { aspd: 1 } },
    { when: 'eliteEnemies', mods: { aspd: 1 } }, { when: 'burstEnemies', mods: { aspd: 1 } },
  ]);
  foe(0, 1); foe(1, 4);
  assert.deepEqual(on(), [], 'none in range');
  const fly = foe(1, 2, { motion: 'FLY' });
  assert.deepEqual(on(), []);
  foe(1, 3, { levelType: 'BOSS' });
  assert.deepEqual(on(), [0, 1, 2], 'two in range, one on the ground, a leader');
  addBuff(fly, makeBuff({ key: 'burst:fire' }));
  assert.deepEqual(on(), [0, 1, 2, 3]);
});

test('[职业-18] friendly units in its own range: other operators, a wounded one, one with element damage, another in its skill', () => {
  const { w, c, op, ally, on } = arena([
    { when: 'allies', value: 2, mods: { aspd: 1 } }, { when: 'injuredAllies', mods: { aspd: 1 } },
    { when: 'epAllies', mods: { aspd: 1 } }, { when: 'skillAllies', mods: { aspd: 1 } },
  ]);
  const a = ally(1, 2);
  ally(1, 3, { summoner: 'guard' });
  assert.deepEqual(on(), [], 'one operator and a summon');
  ally(1, 3);
  op.hp -= 1;
  assert.deepEqual(on(), [0, 1], 'two other operators; the operator itself wounded');
  op.hp += 1;
  assert.deepEqual(on(), [0]);
  dealEp(w, a, 'FIRE', 100);
  assert.deepEqual(on(), [0, 2], 'one with element damage');
  a.skill = /** @type {any} */ ({ active: true });
  assert.deepEqual(on(), [0, 2, 3], 'another operator in its skill');
  op.skill = /** @type {any} */ ({ active: true });
  a.skill = null;
  assert.ok(!on().includes(3) && c, 'not its own skill');
});

test('[职业-18] no other operator on the 4 tiles next to it, or the 8 around it; stored energy', () => {
  const { op, ally, on } = arena([{ when: 'alone4', mods: { aspd: 1 } }, { when: 'alone8', mods: { aspd: 1 } }, { when: 'energy', mods: { aspd: 1 } }]);
  assert.deepEqual(on(), [0, 1]);
  const d = ally(0, 2);
  assert.deepEqual(on(), [0], 'a diagonal one');
  d.hp = 0;
  ally(2, 1);
  assert.deepEqual(on(), [], 'one next to it');
  addBuff(op, makeBuff({ key: 'energy', value: 1 }));
  assert.deepEqual(on(), [2]);
});

test('[职业-18] always: the buff from its first turn on', () => {
  const { op, on } = arena([{ when: 'always', mods: { taunt: -1 } }]);
  assert.deepEqual([on(), statsOf(op).taunt], [[0], -1]);
});

test('[职业-18] [伤害-8] a 受到伤害倍率 for hits from a unit it blocks: those, not the others; its stacks\' power', () => {
  const { w, c, op, foe } = arena([]);
  addBuff(op, makeBuff({ key: 'unyield', mods: { blockedTakenMul: 0.8 } }));
  const held = foe(1, 1), free = foe(1, 2);
  held.blockedBy = op.id; free.blockedBy = -1;
  const hp = () => op.hp, start = hp();
  dealDamage(w, held, op, { type: 'true', amount: 100 }, c);
  const afterHeld = hp();
  dealDamage(w, free, op, { type: 'true', amount: 100 }, c);
  assert.deepEqual([start - afterHeld, afterHeld - hp()], [80, 100]);
  addBuff(op, makeBuff({ key: 'twice', mods: { blockedTakenMul: 0.5 }, stacks: 2 }));
  const before = hp();
  dealDamage(w, held, op, { type: 'true', amount: 100 }, c);
  assert.equal(before - hp(), 100 * 0.8 * 0.25);
});
