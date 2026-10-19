// Talents on elements (docs/spec/traits.md 职业-29, docs/spec/elements.md 元素-2, 元素-3): what answers a burst as it
// begins, steps for bursts in range, elemental damage while a burst lasts, 元素损伤 over time, pulses each second, the
// element's own 元素损伤 multiplier, an aura for operators with much 元素损伤, 元素回复, 麻痹 cutting an attack, element
// values back on hits, heals over time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { creditedDamage } from '../src/traits.js';
import { dealEp, epOf, epRegenAll } from '../src/elements.js';
import { traitWhiles } from '../src/whiles.js';
import { auras } from '../src/aura.js';
import { foeLeave } from '../src/talentfoe.js';
import { palsyCut, epOnHit, healDotOn } from '../src/talentelem.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without spawns, the guard (its tile and two ahead, 攻击力 50, 生命 1000) with these record fields,
 * deployed at (1, 1) facing right at frame 0; `foe` adds an enemy (rooted; 防御, 法术抗性 and 元素抗性 0), `ally` an
 * operator.
 * @param {Record<string, any>} rec
 */
function arena(rec = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, ...over };
    e.maxHp = statsOf(e).maxHp;
    e.hp = e.maxHp;
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
  /** @param {number} n */
  const frames = (n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  return { w, c, op, foe, ally, frames };
}

/** The HP a unit lost while `f` ran. @param {Unit} u @param {() => void} f */
const lost = (u, f) => { const hp = u.hp; f(); return hp - u.hp; };

/** A 灼燃 burst's own elemental damage on an enemy (元素-4). */
const FIRE_BURST = 7000;

test('[职业-29] [元素-3] a burst as it begins: elemental damage from an operator whose range has the enemy, or from one for the whole field with a heal under 禁疗', () => {
  const near = arena({ talentTrait: { burstOn: [{ el: 'FIRE', where: 'range', dmg: 3.2 }] } });
  const a = near.foe(1, 2), b = near.foe(2, 4);
  assert.deepEqual([lost(a, () => dealEp(near.w, a, 'FIRE', 2000, near.op)), lost(b, () => dealEp(near.w, b, 'FIRE', 2000, near.op))], [FIRE_BURST + 160, FIRE_BURST], 'in range only');
  const field = arena({ talentTrait: { burstOn: [{ el: 'FIRE', where: 'field', dmg: 3.8, heal: 0.15 }] } });
  const far = field.foe(2, 4);
  field.op.hp = 500;
  addBuff(field.op, makeBuff({ key: 'no', flags: { healFree: true } }));
  assert.equal(lost(far, () => dealEp(field.w, far, 'FIRE', 2000, null)), FIRE_BURST + 190);
  assert.equal(field.op.hp, 650, '15% of 1000, 禁疗 or not');
  const water = field.foe(2, 4);
  assert.equal(lost(water, () => dealEp(field.w, water, 'WATER', 2000, null)), 5000, 'another element: the burst alone');
});

test('[职业-29] a step for each burst of the element in range, at most the steps', () => {
  const { w, op, foe } = arena({ talentTrait: { stacks: [{ on: 'burst', el: 'DARK', max: 2, mods: { atkPct: 0.02 } }] } });
  const [a, b, c, out] = [foe(1, 2), foe(1, 3), foe(1, 3), foe(2, 4)];
  dealEp(w, out, 'DARK', 2000, null);
  assert.equal(statsOf(op).atk, 50);
  dealEp(w, a, 'DARK', 2000, null);
  dealEp(w, b, 'DARK', 2000, null);
  dealEp(w, c, 'DARK', 2000, null);
  assert.equal(statsOf(op).atk, 52);
});

test('[职业-29] elemental damage each second while a 凋亡 burst lasts, from the attack that set it off too; gone with the burst', () => {
  const { w, c, op, foe, frames } = arena({ trait: { epRider: { el: 'DARK', ratio: 100 } }, talentTrait: { vs: [{ when: 'burstOf', el: 'DARK', on: 'attack', post: true, burstDot: 0.4 }] } });
  const hit = foe(2, 4), plain = foe(2, 4);
  creditedDamage(w, c, op, hit, { type: 'phys', amount: 100, isAttack: true });
  dealEp(w, plain, 'DARK', 2000, null);
  assert.ok(hit.buffs.some((b) => b.key === 'burst:DARK') && hit.buffs.some((b) => b.key === `burstDot:${op.id}`));
  frames(30);
  assert.equal(plain.hp - hit.hp, 100 + 0.4 * 50, 'its hit, then a second of it');
  frames(15 * 30);
  assert.equal(hit.buffs.some((b) => b.key === `burstDot:${op.id}`), false, 'the burst over');
  const again = foe(2, 4);
  dealEp(w, again, 'DARK', 2000, null);
  creditedDamage(w, c, op, again, { type: 'phys', amount: 100, isAttack: true });
  foeLeave(w, op);
  assert.equal(again.buffs.some((b) => b.key.startsWith('burstDot:')), false, 'and with the operator');
});

test('[职业-29] 元素损伤 over time on the first attack on each enemy: at once and each second for 5 s — six times —, not again', () => {
  const { w, c, op, foe, frames } = arena({ talentTrait: { vs: [{ when: 'first', seen: 'attack', on: 'attack', epDot: { el: 'FIRE', scale: 0.18, seconds: 5 } }] } });
  const e = foe(2, 4), hit = () => creditedDamage(w, c, op, e, { type: 'phys', amount: 100, isAttack: true });
  hit();
  assert.equal(epOf(e, 'FIRE'), 991);
  frames(200);
  hit();
  assert.equal(epOf(e, 'FIRE'), 1000 - 6 * 9);
});

test('[职业-29] pulses each second: on the enemies it blocks, then on those in range it can select — 元素损伤, arts damage, 停顿', () => {
  const { w, op, foe, frames } = arena({ trait: { noAttack: true }, talentTrait: { pulses: [
    { who: 'blocked', every: 1, ep: { el: 'FIRE', scale: 0.12 }, arts: 0.4 },
    { who: 'range', every: 1, ep: { el: 'DARK', scale: 0.1 }, status: { key: 'sluggish', seconds: 0.2 } },
  ] } });
  const held = foe(2, 4), near = foe(1, 3), hidden = foe(1, 3), out = foe(2, 4);
  held.blockedBy = op.id;
  addBuff(hidden, makeBuff({ key: 'hide', flags: { stealth: true } }));
  const hp = held.hp;
  frames(29);
  assert.deepEqual([epOf(held, 'FIRE'), epOf(near, 'DARK')], [1000, 1000], 'not before a second');
  frames(1);
  assert.deepEqual([epOf(held, 'FIRE'), hp - held.hp, epOf(near, 'DARK'), near.buffs.some((b) => b.key === 'sluggish'), epOf(hidden, 'DARK'), epOf(out, 'DARK')],
    [1000 - 6, 20, 1000 - 5, true, 1000, 1000]);
  assert.ok(w.frame === 31);
});

test('[元素-2] [职业-29] the element\'s own 元素损伤 multiplier on top of the one for all', () => {
  const { w, c, op, foe } = arena({ talentTrait: { whiles: [{ when: 'always', mods: { epTakenMul: 0.88, WATERTakenMul: 0.88 } }] } });
  const e = foe(2, 4);
  addBuff(e, makeBuff({ key: 'dark', mods: { DARKTakenMul: 1.22 } }));
  traitWhiles(w, c, op);
  const before = epOf(op, 'WATER');
  assert.deepEqual([dealEp(w, e, 'DARK', 100), dealEp(w, e, 'FIRE', 100)], [122, 100]);
  assert.ok(Math.abs(dealEp(w, op, 'WATER', 100) - 77.44) < 1e-9 && Math.abs(dealEp(w, op, 'FIRE', 100) - 88) < 1e-9 && before === 1000);
});

test('[部署-6] [职业-29] an aura for the operators in range with an element value below half its maximum', () => {
  const { w, c, ally } = arena({ rangeTalents: [{ side: 'ally', ranged: false, when: { when: 'epHalf' }, mods: { epTakenMul: 0.82 } }] });
  const hurt = ally(1, 2), fine = ally(1, 3);
  hurt.ep = { FIRE: 400 };
  fine.ep = { FIRE: 600 };
  auras(w, c);
  assert.deepEqual([statsOf(hurt).epTakenMul, statsOf(fine).epTakenMul], [0.82, 1]);
});

test('[职业-29] [元素-2] 元素回复 by a share of the maximum HP while enough operators are on the field, summons not counted', () => {
  const { w, c, op, ally } = arena({ talentTrait: { whiles: [{ when: 'fieldOps', value: 2, mods: { epRegenRatio: 0.02 } }] } });
  op.ep = { FIRE: 500 };
  ally(0, 0, { summoner: op.id });
  traitWhiles(w, c, op);
  for (let i = 0; i < 30; i++) epRegenAll(w);
  assert.equal(epOf(op, 'FIRE'), 500, 'a summon is no operator');
  ally(0, 1);
  traitWhiles(w, c, op);
  for (let i = 0; i < 30; i++) epRegenAll(w);
  assert.ok(Math.abs(epOf(op, 'FIRE') - 520) < 1e-9, `${epOf(op, 'FIRE')}`);
});

test('[职业-29] 麻痹 cutting an attack: elemental damage from each operator whose range has the enemy; element values back for the enemies an attack reached, at most its block count', () => {
  const { w, c, op, foe } = arena({ talentTrait: { palsyHit: 1.3, epOnHit: 35 }, blockCnt: 2 });
  const near = foe(1, 2), out = foe(2, 4);
  assert.deepEqual([lost(near, () => palsyCut(w, c, near)), lost(out, () => palsyCut(w, c, out))], [65, 0]);
  op.ep = { FIRE: 500 };
  epOnHit(c, op, 3);
  assert.equal(epOf(op, 'FIRE'), 570);
});

test('[职业-29] a heal over time from a normal heal: each second a share of the attack and element values back, for each layer up to the most, none under 禁疗', () => {
  const { c, op, ally, frames } = arena({ trait: { epHeal: 0.5 }, talentTrait: { healDot: { share: 0.1, seconds: 6, max: 2 } } });
  const a = ally(0, 0);
  a.hp = 100;
  a.ep = { FIRE: 500 };
  healDotOn(c, op, a);
  healDotOn(c, op, a);
  healDotOn(c, op, a);
  assert.equal(a.buffs.find((b) => b.key === `healDot:${op.id}`)?.stacks, 2);
  frames(30);
  assert.deepEqual([a.hp, epOf(a, 'FIRE')], [110, 505]);
  addBuff(a, makeBuff({ key: 'no', flags: { healFree: true } }));
  frames(30);
  assert.deepEqual([a.hp, epOf(a, 'FIRE')], [110, 505]);
});
