// Talents on heals (docs/spec/traits.md 职业-33): on every heal — more for a low target, what it leaves, a 屏障, the heal
// beyond the maximum as a 屏障, a share for the healer —; heals for a status taken; heals at a skill's end; a regen for
// those with 抵抗; more heal taken for the sturdiest in range; one more heal target at a chance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeOperator } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { heal } from '../src/damage.js';
import { inflict } from '../src/status.js';
import { auras } from '../src/aura.js';
import { activate, endSkill } from '../src/skills.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** A skill record that gains no SP by itself. @param {Record<string, unknown>} [o] */
const skill = (o = {}) => ({ id: 's', type: 'MANUAL', sp: 'none', cost: 10, init: 0, charges: 1, duration: 5, ammo: false, bb: {}, ...o });

/**
 * The tiny level without waves for two seats; the guard (its tile and two ahead, 攻击力 50, 生命 1000) with these record
 * fields deployed at (1, 1) facing right — a step runs, so the hooks are set —; `put` puts a unit of seat 1 there, its HP
 * at `hp` of its maximum.
 * @param {Record<string, any>} rec @param {Record<string, Record<string, any>>} [others]
 */
function arena(rec = {}, others = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  for (const [k, v] of Object.entries(others)) c.operators[k] = { ...c.operators.sniper, ...v };
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  const put = (/** @type {string} */ key, /** @type {number} */ row, /** @type {number} */ col, hp = 1) => {
    const u = makeOperator(w, c, { key, owner: 1, row, col, dir: 0 });
    u.hp = hp * statsOf(u).maxHp;
    w.units.push(u);
    return u;
  };
  const frames = (/** @type {number} */ n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  /** A unit's 屏障 in a buff of this key. @param {Unit} u @param {string} key */
  const barrier = (u, key) => u.buffs.find((b) => b.key === key)?.shield;
  return { w, c, g, put, frames, barrier };
}

test('[职业-33] on a heal: more for a low target, what it leaves, a 屏障 set again not added, a share of the heal for the healer', () => {
  const { w, g, put, barrier } = arena({ talentTrait: { lowHeal: { below: 0.4, value: 150 }, healGives: { seconds: 3, mods: { dodgePhys: 0.25 } },
    healBarrier: { scale: 0.22, seconds: 8 }, healShare: 0.5 } });
  const u = put('sniper', 0, 2, 0.3);
  g.hp = 500;
  heal(w, g, u, 50);
  assert.deepEqual([u.hp, u.buffs.find((b) => b.key === `healGives:${g.id}`)?.mods, barrier(u, `healBarrier:${g.id}`), g.hp], [150 + 200, { dodgePhys: 0.25 }, 11, 500 + 100]);
  heal(w, g, u, 10);
  assert.deepEqual([u.hp, barrier(u, `healBarrier:${g.id}`), g.hp], [360, 11, 605], 'not low now; the 屏障 the same; half of 10');
  heal(w, g, g, 10);
  assert.equal(g.hp, 615, 'no share for itself');
});

test('[职业-33] the heal beyond the maximum: the healer\'s 屏障, at most a multiple of its attack, decaying from 1 s on; the target\'s own, at most a share of its maximum HP', () => {
  const { w, c, g, put, frames, barrier } = arena({ talentTrait: { overhealBarrier: { cap: 2, decay: 0.1 } } }, { humus: { talentTrait: { overflowBarrier: 1.04 } } });
  const u = put('sniper', 0, 2, 0.9);
  heal(w, g, u, 80);
  heal(w, g, u, 100);
  assert.equal(barrier(u, `overheal:${g.id}`), 100, '30 then 100, at most 2 × 50');
  frames(29);
  assert.equal(barrier(u, `overheal:${g.id}`), 100);
  frames(4);
  assert.ok(/** @type {number} */ (barrier(u, `overheal:${g.id}`)) < 100, 'decaying');
  const h = put('humus', 2, 2, 1);
  heal(w, h, h, 300);
  heal(w, g, h, 400);
  assert.deepEqual([barrier(h, 'overflow'), c.operators.humus.maxHp], [520, 500], 'at most 1.04 × 500');
});

test('[职业-33] a heal for a 可抵抗 status taken in range by a unit not at full HP, then a wait', () => {
  const { w, g, put, frames } = arena({ talentTrait: { statusHeal: { scale: 0.8, cooldown: 10 } } });
  const u = put('sniper', 1, 2, 0.5), full = put('sniper', 1, 3, 1), hp = u.hp;
  inflict(w, full, 'stun', { seconds: 1 });
  inflict(w, u, 'root', { seconds: 1 });
  assert.equal(u.hp, hp, 'full HP; 束缚 not 可抵抗');
  inflict(w, u, 'stun', { seconds: 1 });
  assert.equal(u.hp, hp + 40);
  inflict(w, u, 'stun', { seconds: 1 });
  assert.equal(u.hp, hp + 40, 'waiting');
  frames(300);
  u.hp = hp;
  inflict(w, u, 'stun', { seconds: 1 });
  assert.equal(u.hp, hp + 40, 'the wait over');
  assert.equal(g.buffs.some((b) => b.key === 'statusHealCd'), true);
});

test('[职业-33] heals at the skill\'s end: itself and the lowest of those in range not at full HP, at most the most', () => {
  const { w, c, g, put } = arena({ skill: skill(), talentTrait: { skillEndHeal: { scale: 1, max: 2 } } });
  const [a, b, d, full] = [put('sniper', 1, 2, 0.5), put('sniper', 1, 3, 0.3), put('sniper', 1, 1, 0.4), put('sniper', 2, 3, 1)];
  g.hp = 900;
  const before = [a, b, d].map((u) => u.hp);
  activate(w, c, g, 'manual', true);
  endSkill(w, c, g);
  assert.deepEqual([g.hp, a.hp - before[0], b.hp - before[1], d.hp - before[2], full.hp], [950, 0, 50, 50, statsOf(full).maxHp]);
});

test('[职业-33] [部署-6] a regen for those with 抵抗 in range; more heal taken for the one with the highest maximum HP in range', () => {
  const { w, c, put } = arena({ talentTrait: { resistRegen: 0.07 }, rangeTalents: [{ side: 'ally', ranged: false, when: { when: 'maxHpHighest' }, mods: { healingTakenMul: 1.18 } }] },
    { tank: { maxHp: 3000 } });
  const [plain, resist, tank] = [put('sniper', 1, 2), put('sniper', 1, 3), put('tank', 2, 2)];
  addBuff(resist, makeBuff({ key: 'res', src: resist.id, mods: { statusResFlat: -0.5 } }));
  auras(w, c);
  const regen = (/** @type {Unit} */ u) => u.buffs.find((b) => b.key.startsWith('resistRegen:'))?.mods;
  assert.deepEqual([regen(plain), regen(resist), statsOf(plain).healingTakenMul, statsOf(tank).healingTakenMul], [undefined, { hpRegen: 0.07 * 50 }, 1, 1], 'the tank not in range');
  c.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }];
  auras(w, c);
  assert.deepEqual([statsOf(plain).healingTakenMul, statsOf(tank).healingTakenMul], [1, 1.18]);
});

test('[职业-33] one more heal target at the chance', () => {
  const heals = (/** @type {number} */ more) => {
    const { w, c, g, put } = arena({ trait: { heal: true }, talentTrait: { healMore: more } });
    put('sniper', 1, 2, 0.5);
    put('sniper', 1, 3, 0.5);
    for (let i = 0; i < 60; i++) {
      const healed = step(w, c, []).filter((e) => e.type === 'heal' && e.id === g.id);
      if (healed.length) return new Set(healed.map((e) => e.target)).size;
    }
    return 0;
  };
  assert.deepEqual([heals(0), heals(1)], [1, 2]);
});
