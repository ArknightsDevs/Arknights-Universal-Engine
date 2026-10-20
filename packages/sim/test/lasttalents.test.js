// More talents in time and on the field (docs/spec/traits.md 职业-35): a 倍率 for a faction against weaker enemies, a
// chance growing with ammo spent, stronger attacks after the first skill, buffs and auras for some seconds, a blast and
// a retreat, a gain for the first enemy blocked, hits that weaken 法抗 or add 元素损伤 for a while.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { dealDamage } from '../src/damage.js';
import { traitHit, creditedDamage } from '../src/traits.js';
import { traitWhiles } from '../src/whiles.js';
import { auras } from '../src/aura.js';
import { targetsOf } from '../src/combat.js';
import { activate, endSkill } from '../src/skills.js';
import { withdraw } from '../src/deck.js';
import { epOf } from '../src/elements.js';
import { powerAttack, ammoChance } from '../src/talentfight.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** A skill record that gains no SP by itself. @param {Record<string, unknown>} [o] */
const skill = (o = {}) => ({ id: 's', type: 'MANUAL', sp: 'none', cost: 10, init: 0, charges: 1, duration: 5, ammo: false, bb: {}, ...o });

/**
 * The tiny level without waves for two seats; the guard (its tile and two ahead, 攻击力 50) with these record fields
 * deployed at (1, 1) facing right; `foe` adds an enemy (防御 and 法术抗性 0, rooted unless `free`), `put` an operator of
 * seat 1, `frames` steps.
 * @param {Record<string, any>} rec @param {Record<string, Record<string, any>>} [others]
 */
function arena(rec = {}, others = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  for (const [k, v] of Object.entries(others)) c.operators[k] = { ...c.operators.sniper, ...v };
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  w.players[0].cost = 0;
  const g = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, epResistance: 0, ...over };
    e.hp = statsOf(e).maxHp;
    if (!over.free) applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  const put = (/** @type {string} */ key, /** @type {number} */ row, /** @type {number} */ col) => {
    const u = makeOperator(w, c, { key, owner: 1, row, col, dir: 0 });
    w.units.push(u);
    return u;
  };
  const frames = (/** @type {number} */ n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  return { w, c, g, foe, put, frames };
}

test('[职业-35] a 倍率 the field gives a faction against enemies with no more HP share than the attacker', () => {
  const a = arena({ talentTrait: { fieldVs: { power: 'minos', vs: [{ when: 'hpRatioAtMostOwn', atk: 1.12 }] } } }, { minos: { powers: ['minos'] }, other: {} });
  const [m, o] = [a.put('minos', 0, 2), a.put('other', 0, 3)];
  const e = a.foe(1, 2);
  e.hp = 0.5 * statsOf(e).maxHp;
  const took = (/** @type {Unit} */ u) => { const hp = e.hp; creditedDamage(a.w, a.c, u, e, { type: 'phys', amount: 100 }); return Math.round((hp - e.hp) * 1e6) / 1e6; };
  assert.deepEqual([took(m), took(o)], [112, 100]);
  m.hp = 0.1 * statsOf(m).maxHp;
  assert.equal(took(m), 100, 'the attacker with less HP');
});

test('[职业-35] [攻击-4] a chance growing with the ammo its skill spent, with SP for an attack-recovery skill', () => {
  const a = arena({ skill: skill({ ammo: true, sp: 'attack', bb: { trigger_time: 4 } }), critTalents: [{ prob: 0, scale: 1, times: 2, ammoProb: 0.5, sp: 1 }] });
  const k = /** @type {any} */ (a.c.operators.guard.critTalents)[0], st = /** @type {any} */ (a.g.skill);
  assert.equal(ammoChance(a.g, k), 0);
  activate(a.w, a.c, a.g, 'manual', true);
  assert.deepEqual([ammoChance(a.g, k), a.g.buffs.find((b) => b.key === 'ammoStart')?.value], [0, 4]);
  st.ammo = 2;
  assert.equal(ammoChance(a.g, k), 1);
  endSkill(a.w, a.c, a.g);
  assert.equal(ammoChance(a.g, k), 0, 'reset as the skill ends');
  const sp = (/** @type {number} */ prob) => {
    const b = arena({ skill: skill({ sp: 'attack', cost: 99 }), critTalents: [{ prob, scale: 1, times: 2, sp: 1 }] });
    b.foe(1, 2);
    for (let i = 0; i < 60 && !b.w.events.some((e) => e.type === 'hit'); i++) step(b.w, b.c, []);
    return b.g.skill?.sp;
  };
  assert.deepEqual([sp(0), sp(1)], [1, 2]);
});

test('[职业-35] after its first skill start in a deployment, its next attacks × the 倍率, spent one an attack', () => {
  const a = arena({ skill: skill(), talentTrait: { powerAttacks: { count: 2, scale: 1.2 } } });
  activate(a.w, a.c, a.g, 'manual', true);
  const b = () => a.g.buffs.find((x) => x.key === 'powerAttacks');
  assert.deepEqual([b()?.value, b()?.mods], [2, { atkScaleMul: 1.2 }]);
  powerAttack(a.g);
  powerAttack(a.g);
  assert.equal(b(), undefined);
  endSkill(a.w, a.c, a.g);
  activate(a.w, a.c, a.g, 'manual', true);
  assert.equal(b(), undefined, 'only the first start');
});

test('[职业-35] [部署-6] buffs for melee units and in-range auras for some seconds after the deployment', () => {
  const a = arena({ talentTrait: { fieldBuffs: [{ melee: true, during: 20, mods: { atkPct: 0.2 } }] },
    rangeTalents: [{ side: 'ally', ranged: true, during: 20, mods: { taunt: -1 } }, { side: 'enemy', ranged: false, when: { when: 'flying' }, during: 20, mods: { dmgTakenMul: 1.25 } }] },
  { knight: { position: 'MELEE' } });
  const [k, s] = [a.put('knight', 2, 2), a.put('sniper', 1, 2)];
  const fly = a.foe(1, 3, { motion: 'FLY' });
  auras(a.w, a.c);
  const took = () => { const hp = fly.hp; dealDamage(a.w, null, fly, { type: 'true', amount: 100 }, a.c); return hp - fly.hp; };
  assert.deepEqual([k.buffs.some((b) => b.key.startsWith('fieldBuff:')), s.buffs.some((b) => b.key.startsWith('fieldBuff:')), statsOf(s).taunt, took()], [true, false, -1, 125]);
  a.frames(600);
  auras(a.w, a.c);
  assert.deepEqual([k.buffs.some((b) => b.key.startsWith('fieldBuff:')), statsOf(s).taunt, took()], [false, 0, 100], 'after 20 s');
});

test('[职业-35] a blast after a while: physical damage and 脆弱 on the enemies around, then it retreats', () => {
  const a = arena({ talentTrait: { timedBlast: { after: 3, scale: 4, fragile: { value: 0.3, seconds: 8 } } } });
  const [near, fly, far] = [a.foe(2, 2), a.foe(0, 1, { motion: 'FLY' }), a.foe(1, 4)];
  const hp = near.hp;
  a.frames(88);
  assert.equal(near.hp, hp, 'not yet');
  a.frames(2);
  assert.deepEqual([hp - near.hp, hp - fly.hp, far.hp, near.buffs.find((b) => b.key === 'fragile')?.value, a.w.units.includes(a.g), !!a.w.players[0].cards.guard], [200, 200, hp, 0.3, false, true]);
});

test('[职业-35] the first enemy blocked: cost and a sleep, once; the sleep gone as it leaves', () => {
  const a = arena({ talentTrait: { firstBlock: { cost: 4, sleep: 8 } } });
  const [e1, e2] = [a.foe(1, 1), a.foe(1, 1)];
  traitWhiles(a.w, a.c, a.g);
  assert.equal(a.w.players[0].cost, 0, 'blocking none');
  e2.blockedBy = a.g.id; e1.blockedBy = a.g.id;
  traitWhiles(a.w, a.c, a.g);
  traitWhiles(a.w, a.c, a.g);
  assert.deepEqual([a.w.players[0].cost, statsOf(e1).flags.sleep, statsOf(e2).flags.sleep], [4, true, undefined]);
  withdraw(a.w, a.c, a.g);
  assert.equal(statsOf(e1).flags.sleep, undefined);
});

test('[职业-35] hits for a while: 法抗 weakened and those without the mark preferred; 元素损伤 added; an aura of 法术脆弱 and 元素脆弱', () => {
  const a = arena({ talentTrait: { onHit: [{ during: 20, debuff: { seconds: 10, mods: { resMul: 0.75 } } }, { during: 20, ep: { el: 'DARK', amount: 60 } }], prefer: [{ lacksHit: true, during: 20 }] },
    rangeTalents: [{ side: 'enemy', ranged: false, during: 20, mods: { artsTakenMul: 1.1 } }] });
  const [e1, e2] = [a.foe(1, 2, { res: 40 }), a.foe(1, 3, { res: 40 })];
  assert.deepEqual(targetsOf(a.w, a.c, a.g).map((u) => u.id), [e1.id, e2.id]);
  const ep = epOf(e1, 'DARK');
  traitHit(a.w, a.c, a.g, e1);
  auras(a.w, a.c);
  assert.deepEqual([statsOf(e1).res, ep - epOf(e1, 'DARK'), targetsOf(a.w, a.c, a.g).map((u) => u.id)], [30, 60, [e2.id, e1.id]]);
  const hp = e2.hp;
  dealDamage(a.w, null, e2, { type: 'arts', amount: 100 }, a.c);
  assert.equal(Math.round((hp - e2.hp) * 1e6) / 1e6, 66);
  a.frames(900);
  const ep2 = epOf(e2, 'DARK');
  traitHit(a.w, a.c, a.g, e2);
  assert.deepEqual([statsOf(e2).res, ep2 - epOf(e2, 'DARK')], [40, 0], 'after 20 s the hits give none, the last ones gone');
});
