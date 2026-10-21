// Talents on attacks and statuses (docs/spec/traits.md 职业-34): steps for the same target, statuses at a chance, targets
// left alone, hits beyond the range, an attacker weakened, longer 停顿, one effect of several, a chance growing with kills,
// kinds killed, a strike at the skill's start, gains for spending cost, steps for statuses dealt, 脆弱 by time and status,
// 隐匿 undone, a run of hits, 重伤, 起飞, riders at full charge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus, inflict } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { dealDamage } from '../src/damage.js';
import { traitHit, creditedDamage } from '../src/traits.js';
import { traitWhiles } from '../src/whiles.js';
import { auras } from '../src/aura.js';
import { targetsOf } from '../src/combat.js';
import { selectable } from '../src/targeting.js';
import { activate } from '../src/skills.js';
import { sameTargetStep, attackerHit, fightKill, comboHit } from '../src/talentfight.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** A skill record that gains no SP by itself. @param {Record<string, unknown>} [o] */
const skill = (o = {}) => ({ id: 's', type: 'MANUAL', sp: 'none', cost: 10, init: 0, charges: 1, duration: 5, ammo: false, bb: {}, ...o });

/**
 * The tiny level without waves for two seats; the guard (its tile and two ahead, 攻击力 50) with these record fields
 * deployed at (1, 1) facing right — a step runs, so the hooks are set —; `foe` adds an enemy (防御 and 法术抗性 0 unless
 * given; rooted unless `free`), `put` an operator of seat 1, `frames` steps.
 * @param {Record<string, any>} rec @param {Record<string, Record<string, any>>} [others]
 */
function arena(rec = {}, others = {}) {
  const c = tinyContent();
  c.level.waves = [];
  c.enemies.blob = { ...c.enemies.slime, name: 'blob' };
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  for (const [k, v] of Object.entries(others)) c.operators[k] = { ...c.operators.sniper, ...v };
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] @param {string} [key] */
  const foe = (row, col, over = {}, key = 'slime') => {
    const e = makeEnemy(w, c, { key, route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0, ...over };
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
/** A buff's value on a unit, or 0. @param {Unit} u @param {string} key */
const valueOf = (u, key) => u.buffs.find((b) => b.key === key)?.value ?? 0;

test('[职业-34] steps for attacking the same target, gone for another; an attacker it could select weakened for a while', () => {
  const { c, g, foe } = arena({ talentTrait: { sameTarget: { max: 2, mods: { atkPct: 0.06 } }, attackerMods: { seconds: 5, mods: { atkPct: -0.08 } } } });
  const [e1, e2] = [foe(1, 2), foe(1, 3)];
  for (let i = 0; i < 3; i++) sameTargetStep(c, g, e1);
  assert.deepEqual([valueOf(g, `sameTarget:${e1.id}`), Math.round(statsOf(g).atk * 1e6) / 1e6], [2, 56]);
  sameTargetStep(c, g, e2);
  assert.deepEqual([valueOf(g, `sameTarget:${e1.id}`), valueOf(g, `sameTarget:${e2.id}`)], [0, 1]);
  const fly = foe(1, 2, { motion: 'FLY' });
  attackerHit(c, g, e1);
  attackerHit(c, g, fly);
  assert.deepEqual([e1.buffs.find((b) => b.key === `attackerMods:${g.id}`)?.left, fly.buffs.some((b) => b.key.startsWith('attackerMods:'))], [150, false], 'a melee one does not select flying ones');
});

test('[职业-34] a status at a chance and targets under it left alone; a hit beyond the range without its extension; longer 停顿', () => {
  const a = arena({ trait: { hitStatus: { key: 'sluggish', seconds: 1 } }, talentTrait: { onHit: [{ prob: 1, status: { key: 'stun', seconds: 2 } }, { when: 'beyondRange', prob: 1, status: { key: 'cold', seconds: 1 } }],
    skipStatus: 'stun', hitStatusPlus: 0.13 } });
  const [near, far] = [a.foe(1, 2, { free: true }), a.foe(1, 4, { free: true })];
  addBuff(a.g, makeBuff({ key: 'ext', src: a.g.id, mods: { rangeExtend: 1 } }));
  assert.deepEqual(targetsOf(a.w, a.c, a.g).map((u) => u.id), [near.id, far.id]);
  traitHit(a.w, a.c, a.g, near);
  traitHit(a.w, a.c, a.g, far);
  const has = (/** @type {Unit} */ u, /** @type {string} */ k) => u.buffs.find((b) => b.key === k);
  assert.deepEqual([!!has(near, 'stun'), !!has(near, 'cold'), !!has(far, 'cold'), has(near, 'sluggish')?.left], [true, false, true, secondsToFrames(1.13)]);
  assert.deepEqual(targetsOf(a.w, a.c, a.g), [], 'both stunned now');
});

test('[职业-34] [攻击-4] one of several effects at a chance; a chance\'s 倍率 growing with enemies falling near an operator of a faction', () => {
  const hits = (/** @type {Record<string, any>} */ rec, /** @type {(a: ReturnType<typeof arena>) => void} */ before = () => {}) => {
    const a = arena(rec, { gang: { powers: ['glasgow'] } });
    before(a);
    const e = a.foe(1, 2);
    for (let i = 0; i < 60; i++) {
      const got = step(a.w, a.c, []).filter((x) => x.type === 'hit' && x.target === e.id);
      if (got.length) return got.map((x) => x.damage);
    }
    return [];
  };
  assert.deepEqual(hits({ critTalents: [{ prob: 1, scale: 1, pick: [{ times: 2 }] }] }), [50, 50]);
  const grow = { critTalents: [{ prob: 1, scale: 1.5, grow: { power: 'glasgow', step: 0.05, max: 2.4 } }] };
  assert.deepEqual(hits(grow), [75]);
  assert.deepEqual(hits(grow, (a) => {
    a.put('gang', 2, 2);
    const d = a.foe(2, 3);
    d.hp = 0;
    a.frames(1);
  }), [77.5]);
});

test('[职业-34] kinds killed: steps by the kinds since the deployment, the seat keeps a card\'s kinds, 防御 ignored for them; 重伤\'s SP for its killer', () => {
  const a = arena({ skill: skill(), talentTrait: { kindStack: { max: 3, mods: { dmgDealtMul: 1.07 } }, slainKinds: true, vs: [{ when: 'slainKind', defPct: 0.4 }] } });
  for (const key of ['slime', 'slime', 'blob']) fightKill(a.w, a.c, a.g, a.foe(1, 2, {}, key));
  assert.deepEqual([valueOf(a.g, 'kinds'), a.w.players[0].slain], [2, { guard: ['slime', 'blob'] }]);
  a.c.enemies.other = { ...a.c.enemies.slime };
  const tough = a.foe(1, 2, { def: 40 }), other = a.foe(1, 3, { def: 40 }, 'other');
  const hp = [tough.hp, other.hp];
  creditedDamage(a.w, a.c, a.g, tough, { type: 'phys', amount: 50 });
  creditedDamage(a.w, a.c, a.g, other, { type: 'phys', amount: 50 });
  const want = [(50 - 24) * 1.14, 10 * 1.14];
  assert.ok([hp[0] - tough.hp, hp[1] - other.hp].every((x, i) => Math.abs(x - want[i]) < 1e-6), '40% of 防御 40 ignored for a kind killed; × 1.14 for two kinds');
  const dying = a.foe(1, 2);
  inflict(a.w, dying, 'dying', { seconds: 10, value: 2 });
  fightKill(a.w, a.c, a.g, dying);
  assert.equal(a.g.skill?.sp, 2);
});

test('[职业-34] a strike as the skill starts; gains for spending cost — the deployment, a skill that spends', () => {
  const a = arena({ skill: skill({ spend: 5 }), talentTrait: { skillStrike: { scale: 1.85, cold: 3 }, spendBoost: { max: 5, mods: { atkPct: 0.05 }, stun: 2 } } });
  assert.equal(valueOf(a.g, 'spendBoost'), 1, 'deployed');
  const [e, fly] = [a.foe(1, 2), a.foe(1, 3, { motion: 'FLY' })];
  const hp = e.hp;
  a.w.players[0].cost = 99;
  activate(a.w, a.c, a.g, 'manual');
  assert.deepEqual([hp - e.hp, e.buffs.some((b) => b.key === 'cold'), valueOf(a.g, 'spendBoost'), e.buffs.some((b) => b.key === 'stun'), fly.buffs.some((b) => b.key === 'stun')],
    [1.85 * 52.5, true, 2, true, false], '攻击力 50 × 1.05 after the step of the deployment');
});

test('[职业-34] [部署-6] steps for 停顿 dealt, not on the immune; 脆弱 growing with the time in range; 脆弱 for 停顿, 寒冷 and 冻结; 隐匿 undone', () => {
  const a = arena({ talentTrait: { stacks: [{ on: 'status', status: 'sluggish', max: 18, mods: { aspd: 1 } }], stayVuln: { base: 1.12, after: 7, max: 1.16 } },
    rangeTalents: [{ side: 'enemy', ranged: false, when: { when: 'sluggish' }, mods: { dmgTakenMul: 1.23 } }, { side: 'enemy', ranged: false, when: { when: 'coldOnly' }, mods: { artsTakenMul: 1.27 } },
      { side: 'enemy', ranged: false, when: { when: 'frozen' }, mods: { artsTakenMul: 1.54 } }, { side: 'enemy', ranged: false, mods: {}, flags: { unstealth: true } }] });
  const [e, immune] = [a.foe(1, 2), a.foe(1, 3)];
  addBuff(immune, makeBuff({ key: 'imm', src: immune.id, flags: { 'immune:sluggish': true } }));
  inflict(a.w, e, 'sluggish', { seconds: 1, src: a.g });
  inflict(a.w, immune, 'sluggish', { seconds: 1, src: a.g });
  assert.equal(valueOf(a.g, 'stack:0'), 1);
  auras(a.w, a.c);
  const took = (/** @type {Unit} */ u, type = 'true') => { const hp = u.hp; dealDamage(a.w, null, u, { type: /** @type {any} */ (type), amount: 100 }, a.c); return Math.round((hp - u.hp) * 1e6) / 1e6; };
  assert.deepEqual([took(e), took(immune)], [Math.round(112 * 1.23 * 1e6) / 1e6, 112]);
  inflict(a.w, immune, 'cold', { seconds: 9, src: a.g });
  addBuff(immune, makeBuff({ key: 'hide', src: immune.id, flags: { stealth: true } }));
  auras(a.w, a.c);
  assert.deepEqual([took(immune, 'arts'), selectable(immune, {})], [Math.round(112 * 1.27 * 1e6) / 1e6, true]);
  a.frames(210);
  auras(a.w, a.c);
  assert.equal(took(immune), 116, 'after 7 s');
  immune.x = 5;
  auras(a.w, a.c);
  assert.deepEqual([took(immune), immune.buffs.some((b) => b.key.startsWith('stay:')), selectable(immune, {})], [100, false, false], 'out of range');
});

test('[职业-34] a run of hits outside the skill: a step each so many, the count gone after a gap or a stun', () => {
  const { w, c, g, frames } = arena({ skill: skill(), talentTrait: { combo: { hits: 3, gap: 1.5, max: 2, mods: { atkPct: 0.07 } } } });
  for (let i = 0; i < 3; i++) comboHit(w, c, g);
  assert.deepEqual([valueOf(g, 'comboStack'), valueOf(g, 'combo')], [1, 0]);
  comboHit(w, c, g);
  comboHit(w, c, g);
  frames(46);
  comboHit(w, c, g);
  assert.deepEqual([valueOf(g, 'combo'), valueOf(g, 'comboStack')], [1, 1], 'after the gap');
  comboHit(w, c, g);
  applyStatus(g, 'stun', { seconds: 1 });
  traitWhiles(w, c, g);
  assert.equal(valueOf(g, 'combo'), 0, 'stunned');
  /** @type {any} */ (g.skill).active = true;
  for (let i = 0; i < 3; i++) comboHit(w, c, g);
  assert.equal(valueOf(g, 'combo'), 0, 'not in its skill');
});

test('[职业-34] hits that do not kill but leave 重伤: slowed, its killer\'s SP, dead after its seconds; not attacked by its maker', () => {
  const a = arena({ talentTrait: { nonLethal: { seconds: 10, sp: 2 } } });
  const e = a.foe(1, 2, { maxHp: 100 });
  creditedDamage(a.w, a.c, a.g, e, { type: 'phys', amount: 500, isAttack: true });
  assert.deepEqual([e.hp, statsOf(e).flags.dying, statsOf(e).flags.unblockable, e.buffs.find((b) => b.key === 'dying')?.value], [1, true, true, 2]);
  assert.deepEqual(targetsOf(a.w, a.c, a.g), []);
  creditedDamage(a.w, a.c, a.g, e, { type: 'phys', amount: 500 });
  assert.equal(e.hp, 1, 'its damage never kills');
  a.frames(301);
  assert.equal(a.w.units.includes(e), false, 'dead after 10 s');
});

test('[职业-34] a stance by 起飞; a rider at full charge', () => {
  const a = arena({ trait: { charge: { atk: 0.1, steps: 2 } }, talentTrait: { whiles: [{ when: 'grounded', mods: { defPct: 0.12 } }, { when: 'liftoff', mods: { atkScaleMul: 1.12 } }], chargedRider: 0.43 } });
  const on = () => { traitWhiles(a.w, a.c, a.g); return a.g.buffs.filter((b) => b.key.startsWith('while:')).map((b) => b.key); };
  assert.deepEqual(on(), ['while:0']);
  addBuff(a.g, makeBuff({ key: 'up', src: a.g.id, flags: { liftoff: true } }));
  assert.deepEqual(on(), ['while:1']);
  const e = a.foe(1, 2), hp = e.hp;
  creditedDamage(a.w, a.c, a.g, e, { type: 'phys', amount: 10 });
  const charge = /** @type {import('../src/types.js').Buff} */ (a.g.buffs.find((b) => b.key === 'charge'));
  const atk = statsOf(a.g).atk;
  assert.equal(hp - e.hp, 10, 'not full');
  charge.value = 2;
  const hp2 = e.hp;
  creditedDamage(a.w, a.c, a.g, e, { type: 'phys', amount: 10 });
  assert.equal(Math.round((hp2 - e.hp) * 1e6) / 1e6, Math.round((10 + 0.43 * atk) * 1e6) / 1e6);
});
