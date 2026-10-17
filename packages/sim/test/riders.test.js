// What a module adds to an operator's hits (docs/spec/traits.md 职业-20): arts damage on its hits and on its attackers,
// 元素损伤 on its damage, elemental damage on a target in a burst, SP for hits and catches, an attack bonus per upkeep
// payment, its auras on other units, and the 元素损伤 it deals (职业-17, 职业-18).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { epOf } from '../src/elements.js';
import { attacked, caughtSp, paidStack } from '../src/riders.js';
import { vsEp } from '../src/vs.js';
import { auras } from '../src/aura.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without spawns, the guard (its tile and two ahead) with this trait and a skill; `foe` adds a rooted
 * enemy; `hits` runs until its first attack lands and gives the hits. @param {Record<string, any>} trait
 */
function arena(trait) {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.guard.trait = { targets: 1, ...trait };
  c.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
  c.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 100, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, ...over };
    e.hp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  const hits = () => {
    /** @type {any[]} */
    const ev = [];
    for (let i = 0; i < 40 && !ev.some((e) => e.type === 'hit'); i++) ev.push(...step(w, c, []));
    return ev.filter((e) => e.type === 'hit').map((e) => e.damage);
  };
  return { w, c, op, foe, hits };
}

test('[职业-20] arts damage of a share of its attack on each hit of its attack; on the attacker of an enemy\'s attack', () => {
  const { w, c, op, foe, hits } = arena({ extraArts: 0.1, counterArts: 0.2 });
  const t = foe(1, 2);
  assert.deepEqual(hits(), [50, 5]);
  const hp = t.hp;
  attacked(w, c, op, t, { type: 'phys', amount: 10, isAttack: true });
  attacked(w, c, op, t, { type: 'phys', amount: 10 });
  attacked(w, c, t, op, { type: 'phys', amount: 10, isAttack: true });
  assert.equal(hp - t.hp, 10, 'one reply of 20 % of its attack, only to an attack');
});

test('[职业-20] 元素损伤 of a share of the HP its damage took, arts only when it says so; elemental damage on a target in a burst', () => {
  const any = arena({ epRider: { el: 'FIRE', ratio: 0.5, arts: false } }), t1 = any.foe(1, 2);
  any.hits();
  assert.equal(epOf(t1, 'FIRE'), statsOf(t1).maxEp - 25);
  const arts = arena({ epRider: { el: 'FIRE', ratio: 0.5, arts: true } }), t2 = arts.foe(1, 2);
  arts.hits();
  assert.equal(epOf(t2, 'FIRE'), statsOf(t2).maxEp, 'a physical hit');
  const burst = arena({ burstHit: { el: 'FIRE', scale: 0.15 } }), t3 = burst.foe(1, 2);
  addBuff(t3, makeBuff({ key: 'burst:FIRE' }));
  assert.deepEqual(burst.hits(), [50, 50 * 0.15]);
});

test('[职业-20] SP for a hit on an elite or leader, on a target still standing; for every n boomerangs caught', () => {
  const elite = arena({ spOn: { on: 'elite', sp: 3 } }), boss = elite.foe(1, 2, { levelType: 'BOSS' });
  elite.hits();
  assert.ok(boss.hp > 0 && /** @type {any} */ (elite.op.skill).sp >= 3);
  const plain = arena({ spOn: { on: 'elite', sp: 3 } });
  plain.foe(1, 2);
  plain.hits();
  assert.ok(/** @type {any} */ (plain.op.skill).sp < 3, 'not an elite');
  const stand = arena({ spOn: { on: 'survives', sp: 4 } }), weak = arena({ spOn: { on: 'survives', sp: 4 } });
  stand.foe(1, 2);
  weak.foe(1, 2, { maxHp: 10 });
  stand.hits(); weak.hits();
  assert.deepEqual([/** @type {any} */ (stand.op.skill).sp >= 4, /** @type {any} */ (weak.op.skill).sp < 4], [true, true]);
  const catch2 = arena({ spOn: { on: 'catch', sp: 5, every: 2 } }), st = /** @type {any} */ (catch2.op.skill), sp0 = st.sp;
  caughtSp(catch2.c, catch2.op);
  assert.equal(st.sp, sp0);
  caughtSp(catch2.c, catch2.op);
  assert.deepEqual([st.sp, catch2.op.buffs.find((b) => b.key === 'catches')?.value], [sp0 + 5, 0]);
  caughtSp(elite.c, elite.op);
});

test('[职业-20] an attack bonus for each upkeep payment, at most its steps; nothing without one', () => {
  const { c, op } = arena({ payStack: { atk: 0.04, max: 2 } });
  for (let k = 0; k < 3; k++) paidStack(c, op);
  assert.equal(statsOf(op).atk, 50 * 1.08);
  const none = arena({});
  paidStack(none.c, none.op);
  assert.equal(none.op.buffs.some((b) => b.key === 'payStack'), false);
});

test('[职业-20] its auras: the enemies it blocks, those its summons block, those in its range — a buff each while so', () => {
  const { w, c, op, foe } = arena({ auras: [{ to: 'blocked', mods: { artsTakenMul: 1.1 } }, { to: 'summonBlocked', mods: { taunt: 1 } }, { to: 'range', flags: { 'immune:stealth': true } }] });
  const held = foe(1, 1), byToken = foe(2, 4), far = foe(1, 5), near = foe(1, 3, { motion: 'FLY' });
  const token = makeOperator(w, c, { key: 'sniper', owner: 0, row: 2, col: 4, dir: 0, summoner: op.id });
  w.units.push(token);
  held.blockedBy = op.id; byToken.blockedBy = token.id; far.blockedBy = -1; near.blockedBy = -1;
  auras(w, c);
  const keys = (/** @type {Unit} */ u) => u.buffs.filter((b) => b.key.startsWith('mod:')).map((b) => b.key.split(':')[2]);
  assert.deepEqual([keys(held), keys(byToken), keys(far), keys(near)], [['0', '2'], ['1'], [], ['2']]);
  addBuff(near, makeBuff({ key: 'hide', flags: { stealth: true } }));
  assert.equal(statsOf(near).flags.stealth, undefined, '隐匿 lost in its range');
  held.blockedBy = -1;
  auras(w, c);
  assert.deepEqual(keys(held), ['2']);
});

test('[职业-17] [职业-18] the 元素损伤 an operator deals: its 元素损伤倍率 and its 倍率 on an elite or leader', () => {
  const { w, c, op, foe } = arena({ vs: [{ when: 'elite', ep: 1.2 }] });
  addBuff(op, makeBuff({ key: 'prp', mods: { epDealtMul: 1.5 } }));
  const boss = foe(1, 2, { levelType: 'BOSS' }), plain = foe(1, 3);
  assert.deepEqual([vsEp(w, c, op, boss), vsEp(w, c, op, plain), vsEp(w, c, boss, op), vsEp(w, c, null, op)], [1.5 * 1.2, 1.5, 1, 1]);
});

test('[职业-20] [状态-5] a hit status with its strength: 虚弱', () => {
  const { foe, hits } = arena({ hitStatus: { key: 'weaken', seconds: 2, value: 0.1 } });
  const t = foe(1, 2, { atk: 100 });
  hits();
  assert.equal(statsOf(t).atk, 90);
});
