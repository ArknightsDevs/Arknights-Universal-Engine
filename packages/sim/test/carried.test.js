// Carried units (docs/spec/devices.md 装置-6, docs/spec/runes.md 符文-6): their deployment's buffs, barrier, damage,
// ready cards and SP spray; a card that takes no place and never attacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { dealDamage } from '../src/damage.js';
import { deployProblem } from '../src/commands.js';

/** @typedef {import('../src/types.js').Unit} Unit */

const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));
/** A skill that never starts on its own and gains SP only by attacks. */
const SKILL = { id: 's', type: 'MANUAL', sp: 'attack', cost: 99, init: 0, charges: 1, duration: 5, ammo: false, bb: {} };
/** A carried unit with an effect. @param {import('../src/types.js').CarriedEffect} carried @param {number} [atk] */
const device = (carried, atk = 0) => ({
  name: 'box', position: 'ALL', profession: 'TRAP', cost: 1, blockCnt: 0, baseAttackTime: 1, maxHp: 100, atk, def: 0, res: 0, range: AROUND, respawnTime: 60,
  trait: { free: true, noAttack: true }, carried,
});

/** @param {Record<string, any>} more operators to add @param {number} [limit] */
function arena(more, limit = 9) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: limit, initialCost: 99, maxCost: 99 };
  Object.assign(c.operators, more);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** One frame with a command of seat 0. @param {any} cmd */
  const act = (cmd) => step(w, c, [[0, cmd]]);
  /** @param {string} op @param {number} row @param {number} col */
  const put = (op, row, col) => { act({ type: 'deploy', op, row, col, dir: 0 }); return /** @type {Unit} */ (w.units.at(-1)); };
  /** @param {number} n */
  const run = (n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  /** A rooted enemy without defence at (row, col). @param {number} row @param {number} col */
  const foe = (row, col) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, def: 0, res: 0, maxHp: 1e6 };
    e.hp = e.maxHp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  return { w, c, act, put, run, foe };
}

test('[装置-6] modifiers for the operators on the field when it is deployed, for their time; not the device, not one deployed later', () => {
  const { put, run } = arena({ cheer: device({ seconds: 1, allyMods: { atkPct: 0.2 } }) });
  const g = put('guard', 1, 1), box = put('cheer', 0, 2);
  assert.deepEqual([statsOf(g).atk, statsOf(box).atk], [60, 0]);
  const s = put('sniper', 0, 3);
  assert.equal(statsOf(s).atk, 30, 'deployed after it');
  run(30);
  assert.equal(statsOf(g).atk, 50, 'after its seconds');
});

test('[装置-6] a barrier for the operators on the field that takes damage of every type', () => {
  const { w, put } = arena({ armor: device({ seconds: 20, barrier: 6000 }) });
  const g = put('guard', 1, 1);
  put('armor', 0, 2);
  assert.equal(dealDamage(w, null, g, { type: 'true', amount: 100 }), 0);
  assert.equal(g.hp, statsOf(g).maxHp);
});

test('[装置-6] damage to every enemy from the device, and every redeploying operator card ready at once', () => {
  const { w, act, put, foe } = arena({ fireworks: device({ enemyDamage: { type: 'arts', amount: 3000 }, readyCards: true }) });
  const e = foe(1, 4), s = put('sniper', 0, 3);
  act({ type: 'retreat', unit: s.id });
  assert.ok(w.players[0].cards.sniper.ready > w.frame, 'redeploying');
  put('fireworks', 0, 2);
  assert.equal(e.hp, 1e6 - 3000);
  assert.equal(w.players[0].cards.sniper.ready, w.frame - 1, 'ready from the frame it was deployed');
});

test('[装置-6] a spray: a shot every interval, its SP to each operator on the field picked at random, none twice, then no more', () => {
  const { put, run } = arena({
    soda: device({ spray: { shots: 3, every: 0.2, targets: 3, sp: 3 } }),
    g2: { ...tinyContent().operators.guard, skill: SKILL }, s2: { ...tinyContent().operators.sniper, skill: SKILL },
  });
  const g = put('g2', 1, 1), s = put('s2', 0, 3), box = put('soda', 0, 2);
  run(6 * 3);
  assert.deepEqual([g.skill?.sp, s.skill?.sp], [9, 9], 'two operators, three targets a shot: both, each shot');
  assert.ok(!box.buffs.some((b) => b.key === 'spray'), 'its shots are spent');
  run(30);
  assert.deepEqual([g.skill?.sp, s.skill?.sp], [9, 9]);
});

test('[符文-6] a carried card takes no place in the deploy limit and its unit never attacks', () => {
  const { w, c, put, run, foe } = arena({ rage: device({}, 100) }, 1);
  put('guard', 1, 1);
  assert.equal(deployProblem(w, c, 0, { type: 'deploy', op: 'rage', row: 0, col: 2, dir: 0 }), null);
  const e = foe(0, 1);
  put('rage', 0, 2);
  run(60);
  assert.equal(e.hp, 1e6, 'in its range (atk 100), out of the guard\'s: never hit');
});
