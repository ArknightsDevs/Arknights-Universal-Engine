// Talents on the enemies they meet (docs/spec/traits.md 职业-28, docs/spec/damage.md 伤害-7): targets preferred and
// their 倍率, sleeping enemies selected and hurt, 停顿/束缚 checked a moment later, enemies standing still, heals for a
// 可抵抗 status, full HP, the first hit on each enemy, marks, 偷取, the weakest targets, what leaving takes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff, removeBuff } from '../src/buffs.js';
import { creditedDamage } from '../src/traits.js';
import { targetsOf } from '../src/combat.js';
import { vsHeal } from '../src/vs.js';
import { traitWhiles } from '../src/whiles.js';
import { foeLeave, lowestArts } from '../src/talentfoe.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without spawns, the guard (its tile and two ahead, 攻击力 50) with these record fields, deployed at
 * (1, 1) facing right at frame 0; `foe` adds an enemy (rooted unless `free`; 防御 and 法术抗性 0), `ally` an operator.
 * @param {Record<string, any>} rec
 */
function arena(rec = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] @param {boolean} [free] */
  const foe = (row, col, over = {}, free = false) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, ...over };
    e.maxHp = statsOf(e).maxHp;
    e.hp = e.maxHp;
    if (!free) applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  /** @param {number} row @param {number} col @param {Record<string, any>} [o] */
  const ally = (row, col, o = {}) => {
    const u = makeOperator(w, c, { key: 'sniper', owner: 1, row, col, dir: 0, ...o });
    w.units.push(u);
    return u;
  };
  /** The HP a hit of the guard takes from a unit (and what rides on it). @param {Unit} t @param {Record<string, any>} [dmg] */
  const hit = (t, dmg = {}) => { const hp = t.hp; creditedDamage(w, c, op, t, { type: 'phys', amount: 100, isAttack: true, ...dmg }); return hp - t.hp; };
  /** @param {number} n */
  const frames = (n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  return { w, c, op, foe, ally, hit, frames };
}

test('[职业-28] a preferred status or tag goes first after the 二次过滤器, the enemies an operator blocks still before it; its 倍率 on such a target', () => {
  const { w, c, op, foe, hit } = arena({ talentTrait: { prefer: [{ status: 'stun' }], vs: [{ when: 'status', status: 'stun', atk: 1.65 }] } });
  const a = foe(1, 2), b = foe(1, 3);
  applyStatus(b, 'stun', { seconds: 5 });
  assert.equal(targetsOf(w, c, op)[0], b, 'the stunned one first');
  assert.deepEqual([hit(a), hit(b)], [100, 165]);
  a.blockedBy = op.id;
  assert.equal(targetsOf(w, c, op)[0], a, 'the one it blocks before it');
  const drone = arena({ talentTrait: { prefer: [{ tag: 'drone' }] } });
  drone.c.enemies.drone = { ...drone.c.enemies.slime, tags: ['drone'] };
  const plain = drone.foe(1, 2), tagged = drone.foe(1, 3);
  tagged.key = 'drone';
  assert.deepEqual(targetsOf(drone.w, drone.c, drone.op).map((u) => u.id), [tagged.id, plain.id], 'a tag');
});

test('[职业-28] [伤害-7] sleeping enemies: selected and preferred, hurt through 沉睡 — not when also 隐匿 —; without the talent neither', () => {
  const t = { hurtSleeping: true, prefer: [{ status: 'sleep' }], vs: [{ when: 'status', status: 'sleep', atk: 1.44 }] };
  const { w, c, op, foe, hit } = arena({ talentTrait: t });
  const awake = foe(1, 2), asleep = foe(1, 3);
  applyStatus(asleep, 'sleep', { seconds: 10 });
  assert.deepEqual(targetsOf(w, c, op).map((u) => u.id), [asleep.id, awake.id]);
  assert.equal(hit(asleep), 144);
  addBuff(asleep, makeBuff({ key: 'hide', flags: { stealth: true } }));
  assert.equal(hit(asleep), 0, '隐匿 and asleep: invincible anyway');
  const plain = arena();
  const s = plain.foe(1, 3);
  applyStatus(s, 'sleep', { seconds: 10 });
  assert.deepEqual([targetsOf(plain.w, plain.c, plain.op).length, plain.hit(s)], [0, 0]);
});

test('[职业-28] 停顿/束缚 checked 0.1 s after the damage: a status the same hit brings counts; none then, no damage; a rider leaves no check', () => {
  const { w, op, foe, hit, frames } = arena({ talentTrait: { vs: [{ when: 'statusAny', statuses: ['sluggish', 'root'], on: 'damage', arts: 0.43, later: true }] } });
  const rooted = foe(2, 4), free = foe(2, 4, {}, true), late = foe(2, 4, {}, true);
  const hp = [rooted, free, late].map((u) => u.hp);
  hit(rooted); hit(free); hit(late);
  applyStatus(late, 'sluggish', { seconds: 5 });
  assert.deepEqual([rooted, free, late].map((u, i) => hp[i] - u.hp), [100, 100, 100], 'nothing yet');
  frames(3);
  assert.deepEqual([rooted, free, late].map((u, i) => hp[i] - u.hp), [100 + 50 * 0.43, 100, 100 + 50 * 0.43]);
  hit(rooted, { tags: ['rider'] });
  assert.equal(rooted.buffs.some((b) => b.key.startsWith(`later:${op.id}:`)), false);
  assert.ok(w.frame > 3);
});

test('[职业-28] arts damage at once on an enemy standing still; every second from 0.5 s each sleeping enemy, not one also 隐匿', () => {
  const { w, op, foe, hit, frames } = arena({ talentTrait: { hurtSleeping: true, vs: [{ when: 'still', on: 'damage', arts: 0.16 }], sleepDot: 0.32 } });
  const still = foe(2, 4), moving = foe(2, 4, {}, true);
  assert.deepEqual([hit(still), hit(moving)], [100 + 50 * 0.16, 100]);
  const z = foe(2, 4), hidden = foe(2, 4);
  applyStatus(z, 'sleep', { seconds: 100 });
  applyStatus(hidden, 'sleep', { seconds: 100 });
  addBuff(hidden, makeBuff({ key: 'hide', flags: { stealth: true } }));
  const [zHp, hHp] = [z.hp, hidden.hp];
  assert.equal(op.born, 0);
  frames(15 - w.frame);
  assert.equal(zHp - z.hp, 0, 'not before 0.5 s');
  frames(1);
  assert.equal(zHp - z.hp, 50 * 0.32, 'at 0.5 s');
  frames(30);
  assert.deepEqual([zHp - z.hp, hHp - hidden.hp], [2 * 50 * 0.32, 0], 'then each second');
});

test('[职业-28] a heal on an operator with a 可抵抗 status (晕眩, 寒冷), not 停顿', () => {
  const { w, c, op, ally } = arena({ talentTrait: { vs: [{ when: 'abnormal', heal: 1.23 }] } });
  const a = ally(0, 0);
  const k = () => vsHeal(w, c, op, a);
  const plain = k();
  applyStatus(a, 'sluggish', { seconds: 3 });
  const slow = k();
  applyStatus(a, 'stun', { seconds: 3 });
  const stun = k();
  removeBuff(a, 'stun');
  applyStatus(a, 'cold', { seconds: 3 });
  assert.deepEqual([plain, slow, stun, k()], [1, 1, 1.23, 1.23]);
});

test('[职业-28] an attack on an enemy at full HP: its 倍率 and SP; not on a later hit nor a skill\'s damage', () => {
  const { op, foe, hit } = arena({ talentTrait: { vs: [{ when: 'hpFull', on: 'attack', atk: 1.25, sp: 2 }] },
    skill: { id: 's', type: 'MANUAL', sp: 'time', cost: 10, init: 0, charges: 1, duration: 10, bb: {} } });
  const e = foe(2, 4), f = foe(2, 4);
  assert.deepEqual([hit(e), op.skill?.sp], [125, 2]);
  assert.deepEqual([hit(e), op.skill?.sp], [100, 2]);
  assert.deepEqual([hit(f, { isAttack: false, isSkill: true }), op.skill?.sp], [100, 2]);
});

test('[职业-28] a mark after a hit on an enemy above 80%: the operator\'s later damage on it × the mark for its seconds, the time starting again', () => {
  const { foe, hit, frames } = arena({ talentTrait: { vs: [{ when: 'hpAbove', value: 0.8, on: 'attack', mark: { seconds: 3, dmg: 1.25 } }] } });
  const e = foe(2, 4);
  assert.deepEqual([hit(e), hit(e)], [100, 125]);
  frames(89);
  assert.equal(hit(e), 125, 'started again by the second hit');
  frames(91);
  assert.equal(hit(e), 100);
});

test('[职业-28] the first damage on each enemy: a mark with arts damage, the hit that set it too; a rider neither; no second time until the operator leaves', () => {
  const { w, op, foe, hit, frames } = arena({ talentTrait: { vs: [{ when: 'first', seen: 'damage', on: 'damage', mark: { seconds: 10, arts: 0.3 } }] } });
  const e = foe(2, 4), arts = 50 * 0.3;
  assert.deepEqual([hit(e), hit(e), hit(e, { amount: 10, tags: ['rider'] })], [100 + arts, 100 + arts, 10]);
  frames(301);
  assert.equal(hit(e), 100, 'the mark is over, the 非首次标记 stays');
  foeLeave(w, op);
  assert.equal(hit(e), 100 + arts, 'gone with the operator');
});

test('[职业-28] the first attack on each enemy: its 伤害倍率 and 浮空; the mark is one for every operator of the record until the one that left it leaves', () => {
  const { w, c, op, foe, hit } = arena({ talentTrait: { vs: [{ when: 'first', seen: 'attack', on: 'attack', dmg: 1.15, inflict: { key: 'levitate', seconds: 2.5 } }] } });
  const e = foe(2, 4, {}, true), f = foe(2, 4, {}, true);
  assert.deepEqual([hit(e), e.buffs.some((b) => b.key === 'levitate'), hit(e)], [115, true, 100]);
  assert.deepEqual([hit(f, { isAttack: false }), hit(f)], [100, 115], 'a skill\'s damage is no attack');
  const other = makeOperator(w, c, { key: 'guard', owner: 1, row: 0, col: 0, dir: 0 });
  w.units.push(other);
  const g = foe(2, 4, {}, true), by = (/** @type {Unit} */ u) => { const hp = g.hp; creditedDamage(w, c, u, g, { type: 'phys', amount: 100, isAttack: true }); return hp - g.hp; };
  assert.deepEqual([by(op), by(other)], [115, 100]);
  foeLeave(w, op);
  assert.equal(by(other), 115);
});

test('[职业-28] 偷取 on the first damage: the target rooted and 攻击力 − N, the operator + N for each, at most the cap; a target down or the operator gone takes it back', () => {
  const { w, c, op, foe, hit } = arena({ talentTrait: { vs: [{ when: 'first', seen: 'damage', on: 'damage', inflict: { key: 'root', seconds: 5 }, steal: { atk: 100, max: 150 } }] } });
  const a = foe(2, 4, { atk: 300 }, true), b = foe(2, 4, { atk: 300 }, true);
  hit(a);
  assert.deepEqual([statsOf(a).atk, statsOf(op).atk, a.buffs.find((x) => x.key === 'root')?.src], [200, 150, op.id]);
  hit(a);
  hit(b);
  assert.deepEqual([statsOf(a).atk, statsOf(b).atk, statsOf(op).atk], [200, 200, 200], 'at most 150 in all');
  a.hp = 0;
  traitWhiles(w, c, op);
  assert.equal(statsOf(op).atk, 150);
  foeLeave(w, op);
  assert.equal(statsOf(b).atk, 300);
});

test('[职业-28] after an attack, arts damage on its targets with the least HP', () => {
  const { w, c, op, foe } = arena({ talentTrait: { lowestArts: { scale: 0.5, n: 1 } } });
  const a = foe(1, 2), b = foe(1, 3);
  a.hp = 500; b.hp = 300;
  lowestArts(w, c, op, [a.id, b.id]);
  assert.deepEqual([500 - a.hp, 300 - b.hp], [0, 25]);
});

test('[职业-28] through a real attack: the first one on an enemy deals the 伤害倍率 and makes it 浮空', () => {
  const { foe, frames } = arena({ talentTrait: { vs: [{ when: 'first', seen: 'attack', on: 'attack', dmg: 1.15, inflict: { key: 'levitate', seconds: 2.5 } }] } });
  const e = foe(1, 2), hp = e.hp;
  for (let i = 0; i < 90 && e.hp === hp; i++) frames(1);
  assert.ok(Math.abs(hp - e.hp - 57.5) < 1e-9, `${hp - e.hp}`);
  assert.ok(e.buffs.some((b) => b.key === 'levitate'));
});
