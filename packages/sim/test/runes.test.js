// Seat runes in battle (docs/spec/runes.md): a seat's deploy limit, the always-on rune buff, SP on dealing damage and
// SP in the attack range of an operator whose runes give it.
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
/** A skill that never starts on its own: `sp` recovery, 99 SP. @param {'time' | 'attack'} sp */
const skill = (sp) => ({ id: 's', type: 'MANUAL', sp, cost: 99, init: 0, charges: 1, duration: 5, ammo: false, bb: {} });

/** @param {(c: any) => void} tweak @param {number} [players] */
function arena(tweak, players = 1) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  tweak(c);
  const w = createWorld(c, { seed: 1, players });
  /** @param {string} op @param {number} row @param {number} col @param {number} [seat] */
  const put = (op, row, col, seat = 0) => { step(w, c, [[seat, { type: 'deploy', op, row, col, dir: 0 }]]); return /** @type {Unit} */ (w.units.at(-1)); };
  /** @param {number} n */
  const run = (n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  /** A rooted enemy without defence at (row, col). @param {number} row @param {number} col */
  const foe = (row, col) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, def: 0, maxHp: 1e6 };
    e.hp = e.maxHp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  return { w, c, put, run, foe };
}

test('[符文-2] a seat deploys as many operators as the level allows changed by its runes, the other seat as the level allows', () => {
  const { w, c, put } = arena((x) => { x.level.options = { ...x.level.options, characterLimit: 2, characterLimitAdd: [-1, 0] }; x.operators.guard2 = { ...x.operators.guard }; }, 2);
  put('guard', 1, 0, 0);
  assert.equal(deployProblem(w, c, 0, { type: 'deploy', op: 'guard2', row: 1, col: 1, dir: 0 }), 'deploy limit reached');
  put('sniper', 0, 2, 1);
  assert.equal(deployProblem(w, c, 1, { type: 'deploy', op: 'guard2', row: 1, col: 1, dir: 0 }), null, 'seat 1: 2 places');
});

test('[符文-3] the rune buff: damage dealt and taken, heals and 技力自然回复速度 times the runes\' factors', () => {
  const { w, put } = arena((x) => { x.operators.guard = { ...x.operators.guard, runeMods: { dmgDealtMul: 0.9, dmgTakenMul: 1.2, healingDealtMul: 1.4, spRecoveryMul: 0.25 } }; });
  const g = put('guard', 1, 1), s = statsOf(g);
  assert.ok(g.buffs.some((b) => b.key === 'rune'));
  assert.deepEqual([s.dmgDealtMul, s.healingDealtMul, s.spRecovery], [0.9, 1.4, 0.25]);
  assert.equal(dealDamage(w, null, g, { type: 'true', amount: 100 }), 120, 'taken × 1.2');
});

test('[符文-4] SP on dealing damage: each hit with its chance (1: always, 0: never), besides the attack\'s own point', () => {
  const { foe, put, run } = arena((x) => {
    x.operators.guard = { ...x.operators.guard, range: AROUND, skill: skill('attack'), probSp: [{ prob: 1, sp: 2 }] };
    x.operators.sniper = { ...x.operators.sniper, range: AROUND, skill: skill('attack'), probSp: [{ prob: 0, sp: 2 }] };
  });
  foe(1, 2);
  const g = put('guard', 1, 1), sn = put('sniper', 0, 3);
  run(150);
  const sp = /** @type {NonNullable<Unit['skill']>} */ (g.skill).sp, snSp = /** @type {NonNullable<Unit['skill']>} */ (sn.skill).sp;
  assert.ok(sp >= 3 && sp % 3 === 0, `guard: 1 for each attack and 2 for its hit, got ${sp}`);
  assert.ok(snSp >= 1 && snSp < sp / 2, `sniper: 1 for each attack only, got ${snSp}`);
});

test('[符文-5] SP in the attack range every interval from the start: each operator in range once, however many ranges hold it', () => {
  const { w, put, run } = arena((x) => {
    const giver = { ...x.operators.sniper, range: AROUND, rangeSp: { sp: 1, interval: 1 } };
    Object.assign(x.operators, { a: giver, b: { ...giver }, mate: { ...x.operators.guard, skill: skill('attack') }, far: { ...x.operators.guard, skill: skill('attack') } });
  });
  put('a', 0, 2); put('b', 0, 3);
  const mate = put('mate', 1, 2), far = put('far', 1, 0);
  run(61 - w.frame);
  assert.equal(/** @type {NonNullable<Unit['skill']>} */ (mate.skill).sp, 2, 'frames 30 and 60: one point each, from two givers');
  assert.equal(/** @type {NonNullable<Unit['skill']>} */ (far.skill).sp, 0, 'out of range');
});
