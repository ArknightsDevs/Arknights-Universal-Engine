// Elements (docs/spec/elements.md) and 麻痹 (docs/spec/status.md 状态-8, 状态-9): element values and their maximum, the
// 元素损伤 formula, the burst and its lock, each element's burst on a character and on another unit, the 当前损伤元素,
// an attack's 元素损伤 after its damage; 麻痹 interrupting enemy attacks and wearing off only under 抵抗.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, loadOracle, oneWave, spawnAt } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot, bus } from '../src/index.js';
import { dealEp, epOf, epTaken, currentElement, bursting, rampageDamage, ELEMENTS, LEADER_MAX_EP } from '../src/elements.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus, palsyInterrupts, PALSY_DECAY_FRAMES, PALSY_SHAKE_FRAMES } from '../src/status.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { statsOf } from '../src/attrs.js';
import { canStart } from '../src/skills.js';
import { elementOf } from '../src/view.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** @type {any} */
let shK;
/** @type {any} */
let shD;
before(async () => { shK = await loadOracle('server/sim/constants.js'); shD = await loadOracle('server/sim/damage.js'); });

/**
 * The tiny level without waves: a guard (def 100, res 0, 1000 HP raised to a million) at (1, 1) facing right, and a
 * rooted slime (def 10, res 0, a million HP) at (1, 4), out of its range. Returns the world, content, guard and slime.
 * @param {(c: any) => void} [tweak]
 */
function arena(tweak) {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.guard.maxHp = 1e6;
  c.enemies.slime.maxHp = 1e6;
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = w.units[0], slime = makeEnemy(w, c, { key: 'slime', route: 0 });
  slime.x = 4; slime.y = 1;
  applyStatus(slime, 'root', {});
  w.units.push(slime);
  return { w, c, guard, slime };
}
/** Runs n frames; returns the HP each unit lost in each. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c)) ev.push({ ...e, f: w.frame - 1 });
  return ev;
}
const hits = (/** @type {any[]} */ ev, /** @type {number} */ id) => ev.filter((e) => e.type === 'hit' && e.target === id);
/** A unit's layers of 麻痹. @param {Unit} u */
const layersOf = (u) => u.buffs.find((b) => b.key === 'palsy')?.stacks ?? 0;

test('[元素-1] element values start at the maximum: 1000, 2000 for a leader, or the record\'s own; none recorded is full', () => {
  const { w, c, guard, slime } = arena((cc) => { cc.enemies.boss = { ...cc.enemies.slime, levelType: 'BOSS' }; cc.enemies.big = { ...cc.enemies.slime, maxEp: 1500 }; });
  assert.deepEqual([guard.ep, slime.ep], [{}, {}]);
  assert.deepEqual(ELEMENTS.map((el) => epOf(guard, el)), [1000, 1000, 1000, 1000, 1000]);
  assert.equal(statsOf(makeEnemy(w, c, { key: 'boss', route: 0 })).maxEp, LEADER_MAX_EP);
  assert.equal(statsOf(makeEnemy(w, c, { key: 'big', route: 0 })).maxEp, 1500);
  assert.equal(statsOf({ base: { ...slime.base, maxEp: 1000 }, buffs: [makeBuff({ key: 'x', mods: { maxEpFlat: 500 } })] }).maxEp, 1500, 'an attribute like the others');
});

test('[元素-2] 元素损伤: A with no 损伤抵抗; max(0.05A, A(1 − 0.01D)) with D > 0; times the taken multiplier', () => {
  const s = (/** @type {number} */ d, /** @type {number} */ m = 1) => /** @type {any} */ ({ epResistance: d, epTakenMul: m });
  assert.equal(epTaken(300, s(0)), 300);
  assert.equal(epTaken(300, s(10)), 270);
  assert.equal(epTaken(300, s(99)), 15, '300 × 0.01 = 3 < 0.05 × 300');
  assert.equal(epTaken(300, s(100)), 15);
  assert.equal(epTaken(300, s(0, 1.5)), 450);
  const { w, guard, slime } = arena();
  slime.base.epResistance = 15;
  assert.equal(dealEp(w, slime, 'FIRE', 200), 170);
  assert.equal(epOf(slime, 'FIRE'), 830);
  assert.equal(dealEp(w, guard, 'WATER', 0), 0);
  addBuff(guard, makeBuff({ key: 'amp', mods: { epTakenMul: 2 } }));
  assert.equal(dealEp(w, guard, 'WATER', 100), 200);
  assert.equal(epOf(guard, 'WATER'), 800);
});

test('[元素-2] no 元素损伤 to a unit at 0 HP, invincible, disappeared or under 元素免疫', () => {
  const { w, guard, slime } = arena();
  applyStatus(guard, 'invincible', { frames: 5 });
  assert.equal(dealEp(w, guard, 'SANITY', 100), 0);
  applyStatus(slime, 'elementFree', { frames: 5 });
  assert.equal(dealEp(w, slime, 'SANITY', 100), 0);
  const { w: w2, guard: g2, slime: s2 } = arena();
  s2.hidden = true;
  assert.equal(dealEp(w2, s2, 'SANITY', 100), 0);
  g2.hp = 0;
  assert.equal(dealEp(w2, g2, 'SANITY', 100), 0);
  assert.deepEqual([guard.ep, slime.ep, g2.ep, s2.ep], [{}, {}, {}, {}]);
});

test('[元素-3] at 0 the burst begins: the values lock, the first element to reach 0 bursts, at the end all are full again', () => {
  const { w, c, guard } = arena();
  dealEp(w, guard, 'DARK', 400);
  dealEp(w, guard, 'FIRE', 999);
  assert.equal(dealEp(w, guard, 'FIRE', 1), 1, 'exactly to 0');
  assert.equal(epOf(guard, 'FIRE'), 0);
  assert.ok(bursting(guard));
  assert.deepEqual(w.events.filter((e) => e.type === 'burst'), [{ type: 'burst', id: guard.id, el: 3 }]);
  assert.equal(dealEp(w, guard, 'DARK', 2000), 0, 'locked: DARK does not burst too');
  assert.equal(epOf(guard, 'DARK'), 600);
  assert.equal(currentElement(guard), 'FIRE');
  run(w, c, 299);
  assert.ok(bursting(guard), 'FIRE lasts 10 s = 300 frames');
  run(w, c, 1);
  assert.ok(!bursting(guard));
  assert.deepEqual(guard.ep, {}, 'all back at the maximum');
  assert.equal(currentElement(guard), null);
});

test('[界面-20] [元素-5] the render state’s element: none and full, the current element’s share, the share of a burst gone by', () => {
  const { w, c, guard } = arena();
  assert.deepEqual(elementOf(guard), { element: 0, ep: 1, burst: 0 });
  dealEp(w, guard, 'FIRE', 250);
  dealEp(w, guard, 'DARK', 100);
  assert.deepEqual(elementOf(guard), { element: 3, ep: 0.75, burst: 0 }, 'FIRE (3) is the lowest');
  dealEp(w, guard, 'FIRE', 750);
  assert.deepEqual(elementOf(guard), { element: 3, ep: 0, burst: 1 });
  run(w, c, 150);
  assert.deepEqual(elementOf(guard), { element: 3, ep: 0.5, burst: 1 }, 'half the 10 s burst gone');
});

test('[元素-5] the 当前损伤元素: the lowest value, the lower id of equals', () => {
  const { w, guard } = arena();
  dealEp(w, guard, 'ANGER', 300);
  dealEp(w, guard, 'WATER', 300);
  assert.equal(currentElement(guard), 'WATER', 'equal: WATER (2) before ANGER (5)');
  dealEp(w, guard, 'ANGER', 1);
  assert.equal(currentElement(guard), 'ANGER');
});

test('[元素-4] 神经: a character is stunned for 10 s, then takes 1000 true damage; another unit gets 3 × 1 layer of 麻痹 and 6000 elemental', () => {
  const { w, guard, slime } = arena();
  const hp = guard.hp;
  dealEp(w, guard, 'SANITY', 1000);
  assert.equal(hp - guard.hp, 1000, 'true damage ignores its 100 def');
  const stun = guard.buffs.find((b) => b.key === 'stun');
  assert.equal(stun?.left, 300);
  assert.ok(statsOf(guard).disabled);
  slime.base.epDamageResistance = 10;
  const shp = slime.hp;
  dealEp(w, slime, 'SANITY', 1000);
  assert.equal(slime.buffs.find((b) => b.key === 'palsy')?.stacks, 3);
  assert.equal(shp - slime.hp, 5400, '6000 × (1 − 10/100)');
  const { w: w2, slime: s2 } = arena((cc) => { cc.enemies.slime.immune = ['palsy']; });
  dealEp(w2, s2, 'SANITY', 1000);
  assert.equal(s2.buffs.find((b) => b.key === 'palsy'), undefined, '麻痹免疫: none');
});

test('[元素-4] 侵蚀: −100 def for good on a character, then 800 physical; on another unit 8 s, −120 def, 5000 elemental', () => {
  const { w, c, guard, slime } = arena();
  const hp = guard.hp;
  dealEp(w, guard, 'WATER', 1000);
  assert.equal(statsOf(guard).def, 0);
  assert.equal(hp - guard.hp, 800, 'after the −100: 800 − 0');
  run(w, c, 300);
  assert.ok(!bursting(guard));
  dealEp(w, guard, 'WATER', 1000);
  assert.equal(guard.buffs.find((b) => b.key === 'erosion')?.stacks, 2, 'it stacks without end');
  addBuff(guard, makeBuff({ key: 'thick', mods: { defFlat: 500 } }));
  assert.equal(statsOf(guard).def, 400);
  dealEp(w, slime, 'WATER', 1000);
  assert.equal(statsOf(slime).def, 0, '10 − 120, at least 0');
  assert.equal(slime.buffs.find((b) => b.key === 'burst:WATER')?.left, 240);
});

test('[元素-4] 灼燃: res −20 during the burst, then the damage (1200 arts on a character, 7000 elemental otherwise) after it', () => {
  const { w, c, guard, slime } = arena((cc) => { cc.operators.guard.res = 50; });
  const hp = guard.hp;
  dealEp(w, guard, 'FIRE', 1000);
  assert.equal(statsOf(guard).res, 30);
  assert.equal(hp - guard.hp, 1200 * 0.7, 'the lowered res already counts');
  const shp = slime.hp;
  dealEp(w, slime, 'FIRE', 1000);
  assert.equal(shp - slime.hp, 7000);
  run(w, c, 300);
  assert.equal(statsOf(guard).res, 50);
});

test('[元素-4] [状态-9] 凋亡 on a character: 阻回 and 静默 for 15 s; each second −1 SP and 100 arts damage', () => {
  const { w, c, guard } = arena((cc) => {
    cc.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 20, charges: 1, duration: 0, ammo: false, bb: {} };
  });
  const hp = guard.hp, st = /** @type {any} */ (guard.skill);
  dealEp(w, guard, 'DARK', 1000);
  assert.ok(statsOf(guard).flags.noSp && statsOf(guard).flags.mute);
  st.sp = 30;
  assert.equal(canStart(c, guard, 'MANUAL'), false, '静默');
  st.sp = 20;
  const ev = run(w, c, 450);
  assert.equal(hits(ev, guard.id).length, 15);
  assert.deepEqual(hits(ev, guard.id).map((e) => e.f), Array.from({ length: 15 }, (_, k) => 30 * (k + 1)), 'one a second from the burst at frame 1');
  assert.equal(hp - guard.hp, 1500);
  assert.equal(st.sp, 5, 'no recovery, one lost each second');
  assert.ok(!bursting(guard) && !statsOf(guard).flags.noSp && !statsOf(guard).flags.mute);
});

test('[元素-4] 凋亡 on another unit: 50% 虚弱 that each second drops to 50% × time left ÷ 15 s, and 800 elemental a second', () => {
  const { w, c, slime } = arena((cc) => { cc.enemies.slime.atk = 100; });
  dealEp(w, slime, 'DARK', 1000);
  assert.equal(statsOf(slime).atk, 50);
  const hp = slime.hp;
  run(w, c, 30);
  assert.equal(hp - slime.hp, 800);
  const weak = slime.buffs.find((b) => b.key === 'weaken');
  assert.ok(weak && Math.abs(weak.value - 0.5 * 14 / 15) < 1e-12);
  assert.ok(Math.abs(statsOf(slime).atk - 100 * (1 - 0.5 * 14 / 15)) < 1e-9);
  run(w, c, 420);
  assert.equal(slime.buffs.find((b) => b.key === 'weaken'), undefined);
  assert.equal(statsOf(slime).atk, 100);
  assert.equal(hp - slime.hp, 800 * 15);
});

test('[元素-4] 狂躁 on a character: aspd +50, each second X true damage, X from 100 by 50 an attack up to 600; nothing on another unit', () => {
  assert.deepEqual([0, 1, 9, 10, 11, 50].map(rampageDamage), [100, 150, 550, 600, 600, 600]);
  const { w, c, guard, slime } = arena();
  dealEp(w, guard, 'ANGER', 1000);
  assert.equal(statsOf(guard).aspd, 150);
  const foe = makeEnemy(w, c, { key: 'slime', route: 0 });
  foe.x = 2; foe.y = 1; foe.base.def = 0;
  applyStatus(foe, 'root', {});
  w.units.push(foe);
  const ev = run(w, c, 30);
  const attacks = ev.filter((e) => e.type === 'attack' && e.id === guard.id);
  const burns = hits(ev, guard.id);
  assert.equal(burns.length, 1);
  const before = attacks.filter((a) => a.f <= burns[0].f).length;
  assert.equal(burns[0].damage, rampageDamage(before), `${before} attacks so far`);
  assert.ok(before >= 2, 'interval 1 s / 1.5');
  dealEp(w, slime, 'ANGER', 1000);
  assert.ok(bursting(slime));
  assert.deepEqual([statsOf(slime).aspd, hits(run(w, c, 60), slime.id).length], [100, 0]);
});

test('[元素-2] an attack\'s 元素损伤 comes after its damage: a 灼燃 attack\'s first hit does not get the −20 res', () => {
  const { w, c, guard } = arena((cc) => {
    cc.operators.guard.skill = { id: 'fire', type: 'AUTO', sp: 'time', cost: 1, init: 1, charges: 1, duration: 10, ammo: false, bb: {} };
    cc.behaviors = { skills: { fire: { attack: (/** @type {any} */ _ctx, /** @type {any} */ m) => ({ ...m, element: 'FIRE', ep: 1000 }) } } };
    cc.operators.guard.dmgType = 'arts';
    cc.enemies.slime.res = 50;
  });
  const foe = makeEnemy(w, c, { key: 'slime', route: 0 });
  foe.x = 2; foe.y = 1;
  applyStatus(foe, 'root', {});
  w.units.push(foe);
  const ev = run(w, c, 3);
  const mine = hits(ev, foe.id);
  assert.equal(mine[0].damage, 50 * 0.5, 'the hit, at res 50');
  assert.equal(mine[1].damage, 7000, 'then the burst');
  assert.equal(statsOf(foe).res, 30);
  assert.equal(guard.hp, guard.maxHp);
});

test('[状态-8] 麻痹 interrupts an enemy\'s attack: a layer goes, 0.5 s of 麻痹震颤, no hit, the cooldown starts over', () => {
  const c = tinyContent();
  Object.assign(c.enemies.slime, { atk: 300, baseAttackTime: 2, maxHp: 1e6 });
  c.level.waves = [oneWave([spawnAt(0.5, 'slime')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  const guard = w.units[0];
  while (!w.units.some((u) => u.kind === KIND.ENEMY && u.blockedBy === guard.id)) step(w, c);
  const slime = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  for (let i = 0; i < 3; i++) applyStatus(slime, 'palsy');
  /** @type {number[]} */
  const cut = [];
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 4 * 60; i++) {
    const layers = layersOf(slime);
    ev.push(...run(w, c, 1));
    if (layersOf(slime) < layers) cut.push(w.frame - 1);
  }
  assert.equal(cut.length, 3);
  const gap = 59 + PALSY_SHAKE_FRAMES;
  assert.deepEqual([cut[1] - cut[0], cut[2] - cut[1]], [gap, gap], 'the 2 s cooldown starts over, and it pauses while 麻痹震颤 lasts (敌人攻击-1)');
  assert.deepEqual(hits(ev, guard.id).map((e) => e.f), [cut[2] + gap], 'three interrupted, the fourth lands');
  assert.equal(ev.filter((e) => e.type === 'attack' && e.id === slime.id).length, 4, 'every swing starts (攻击-2); three are cut at their hit');
  const e2 = makeEnemy(w, c, { key: 'slime', route: 0 });
  applyStatus(e2, 'palsy');
  assert.equal(palsyInterrupts(e2), true);
  assert.equal(e2.buffs.find((b) => b.key === 'palsyShake')?.left, PALSY_SHAKE_FRAMES);
  assert.ok(statsOf(e2).disabled && statsOf(e2).immobile, '无法攻击、移动');
  assert.equal(palsyInterrupts(e2), false, 'no layer left');
  assert.equal(palsyInterrupts(guard), false, 'only enemies');
  e2.base.immune = ['palsy'];
  applyStatus(e2, 'palsy');
  assert.equal(palsyInterrupts(e2), false, '麻痹免疫: the buff stays, without effect');
});

test('[状态-8] 麻痹 wears off only under 抵抗: a layer per 10 / 综合抵抗衰减率 seconds', () => {
  const { w, c, slime } = arena();
  for (let i = 0; i < 3; i++) applyStatus(slime, 'palsy');
  addBuff(slime, makeBuff({ key: 'calm', mods: { statusResMul: 0.5 } }));
  run(w, c, 600);
  assert.equal(slime.buffs.find((b) => b.key === 'palsy')?.stacks, 3, 'a lower 一减状态抵抗率 alone does not');
  slime.buffs = slime.buffs.filter((b) => b.key !== 'calm');
  applyStatus(slime, 'buffres', {});
  run(w, c, PALSY_DECAY_FRAMES / 2 - 1);
  assert.equal(slime.buffs.find((b) => b.key === 'palsy')?.stacks, 3);
  run(w, c, 1);
  assert.equal(slime.buffs.find((b) => b.key === 'palsy')?.stacks, 2, '抵抗 0.5: rate 2, 5 s');
  run(w, c, 2 * PALSY_DECAY_FRAMES / 2);
  assert.equal(slime.buffs.find((b) => b.key === 'palsy'), undefined);
});

test('[元素-3] [同步-1] a snapshot in a burst restores to the same hash and runs on the same', () => {
  const { w, c, guard, slime } = arena();
  dealEp(w, guard, 'DARK', 500);
  dealEp(w, slime, 'DARK', 1000);
  run(w, c, 45);
  const snap = JSON.parse(JSON.stringify(takeSnapshot(w))), copy = restoreSnapshot(snap);
  assert.equal(stateHash(copy), stateHash(w));
  run(w, c, 100);
  run(copy, c, 100);
  assert.equal(stateHash(copy), stateHash(w));
  assert.equal(copy.units[0].ep.DARK, 500);
});

test('[元素-1] [元素-4] the oracle\'s element table: maxima, and each shared burst\'s time and amounts (it has no 狂躁)', () => {
  assert.deepEqual([shK.ELEMENT_GAUGE_MAX, shK.ELEMENT_GAUGE_MAX_LEADER, shK.PALSY_MAX], [1000, LEADER_MAX_EP, 3]);
  const E = shK.ELEMENT;
  /** Burst on [character, other]: seconds, then what the burst does, read off the units. */
  const ours = (/** @type {import('../src/elements.js').Element} */ el) => {
    const out = [];
    for (const who of ['guard', 'slime']) {
      const { w, guard, slime } = arena((cc) => { cc.operators.guard.def = 0; cc.operators.guard.res = 0; cc.enemies.slime.def = 0; });
      const u = who === 'guard' ? guard : slime, hp = u.hp;
      dealEp(w, u, el, 2000);
      out.push({ secs: (u.buffs.find((b) => b.key === `burst:${el}`)?.left ?? 0) / 30, dmg: hp - u.hp });
    }
    return out;
  };
  const [cs, os] = ours('SANITY');
  assert.deepEqual([cs.secs, cs.dmg, os.secs, os.dmg], [E.neural.ally.duration, E.neural.ally.damage, E.neural.enemy.duration, E.neural.enemy.elemDamage]);
  const [cw, ow] = ours('WATER');
  assert.deepEqual([cw.secs, cw.dmg, ow.secs, ow.dmg], [E.erosion.ally.duration, E.erosion.ally.damage, E.erosion.enemy.duration, E.erosion.enemy.elemDamage]);
  const [cf, of] = ours('FIRE');
  assert.deepEqual([cf.secs, cf.dmg, of.secs, of.dmg], [E.burn.ally.duration, E.burn.ally.damage, E.burn.enemy.duration, E.burn.enemy.elemDamage]);
  const [cd, od] = ours('DARK');
  assert.deepEqual([cd.secs, od.secs], [E.apoptosis.ally.duration, E.apoptosis.enemy.duration]);
  assert.deepEqual([E.burn.ally.resDown, E.erosion.ally.defDown, E.erosion.enemy.defDown, E.apoptosis.ally.dps, E.apoptosis.enemy.elemDps, E.apoptosis.enemy.weaken],
    [20, 100, 120, 100, 800, 0.5]);
  assert.ok(!('anger' in E) && !shK.ELEMENTS.includes('anger'));
});

test('[元素-2] the intake equals the oracle\'s elementIntake: exactly with no 损伤抵抗, to the last bits with some', () => {
  for (const d of [0, 5, 10, 15, 50, 95, 99, 100]) for (const m of [1, 0.5, 1.3]) for (const a of [1, 70, 300, 1000, 1234.5]) {
    const theirs = a * shD.elementIntake({ def: { epResistance: d }, s: { elemTakenMul: m } });
    const mine = epTaken(a, /** @type {any} */ ({ epResistance: d, epTakenMul: m }));
    if (d === 0) assert.equal(mine, theirs);
    else assert.ok(Math.abs(mine - theirs) <= 1e-12 * theirs, `${a} ${d} ${m}: ${mine} vs ${theirs}`);
  }
});

test('[元素-2] [元素-3] [钩子-3] elementHit before each 元素损伤 (its amount and multiplier changed, or cancelled); elementBurst as a burst begins', () => {
  const { w, slime, guard } = arena();
  const seen = /** @type {any[]} */ ([]);
  bus.on(w, 'elementHit', (k) => { seen.push(['hit', k.dmg.element, k.dmg.amount, k.source === guard]); if (k.dmg.amount === 300) k.dmg.cancel = true; else k.dmg.mul = 2; });
  bus.on(w, 'elementBurst', (k) => { seen.push(['burst', k.element, k.target === slime, bursting(slime)]); assert.equal(dealEp(w, slime, 'FIRE', 5000, guard), 0, 'nothing while it begins'); });
  assert.equal(dealEp(w, slime, 'WATER', 100, guard), 200);
  assert.equal(dealEp(w, slime, 'WATER', 300, guard), 0, 'cancelled');
  assert.equal(epOf(slime, 'WATER'), 800);
  dealEp(w, slime, 'WATER', 400, guard);
  assert.deepEqual(seen, [['hit', 'WATER', 100, true], ['hit', 'WATER', 300, true], ['hit', 'WATER', 400, true], ['burst', 'WATER', true, false]]);
  assert.equal(bursting(slime), true, 'the burst buff after its handlers');
});
