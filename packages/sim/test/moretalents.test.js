// More talents in the simulation (docs/spec/traits.md 职业-31): a random gain, buffs and stuns on deployment, a blast
// after an operator of a faction, heals for enemies falling, SP for damage, what heals leave, 元素损伤 heals on the ground,
// 隐匿 enemies, the floor of an attack's damage, the conditions kept, the regen for the field, a skill's chance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { dealDamage } from '../src/damage.js';
import { traitDealt } from '../src/traits.js';
import { traitWhiles } from '../src/whiles.js';
import { auras } from '../src/aura.js';
import { targetsOf } from '../src/combat.js';
import { activate, endSkill } from '../src/skills.js';
import { withdraw } from '../src/deck.js';
import { healGives, epHealMul } from '../src/talentmore.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** A skill record that gains no SP by itself. @param {Record<string, unknown>} [o] */
const skill = (o = {}) => ({ id: 's', type: 'MANUAL', sp: 'none', cost: 10, init: 0, charges: 1, duration: 5, ammo: false, bb: {}, ...o });

/**
 * The tiny level without waves for two seats, cost enough; the guard (its tile and two ahead, 攻击力 50, 生命 1000) with
 * these record fields, more records over the sniper's. `deploy` deploys a record of seat 0 facing right, `foe` adds a
 * rooted enemy (防御 and 法术抗性 0 unless given), `ally` an operator of seat 1, `frames` steps.
 * @param {Record<string, any>} rec @param {Record<string, Record<string, any>>} [others]
 */
function arena(rec = {}, others = {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  for (const [k, v] of Object.entries(others)) c.operators[k] = { ...c.operators.sniper, ...v };
  const w = createWorld(c, { seed: 1, players: 2 });
  w.players[0].cost = 99;
  const unit = (/** @type {string} */ key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
  const deploy = (key = 'guard', row = 1, col = 1) => { step(w, c, [[0, { type: 'deploy', op: key, row, col, dir: 0 }]]); return unit(key); };
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
  const ally = (/** @type {string} */ key, /** @type {number} */ row, /** @type {number} */ col) => {
    const u = makeOperator(w, c, { key, owner: 1, row, col, dir: 0 });
    w.units.push(u);
    return u;
  };
  const frames = (/** @type {number} */ n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  return { w, c, deploy, foe, ally, frames, unit };
}

test('[职业-31] a random gain for the deployment, without an end, the same for the same seed', () => {
  const picks = [{ atkPct: 0.15 }, { aspd: 15 }, { hpPct: 0.22 }];
  const got = [1, 1].map(() => arena({ talentTrait: { deployPick: picks } }).deploy().buffs.find((b) => b.key === 'pick'));
  assert.ok(got[0] && picks.some((p) => JSON.stringify(p) === JSON.stringify(got[0]?.mods)));
  assert.deepEqual([got[0]?.left, got[0]?.mods], [-1, got[1]?.mods]);
});

test('[职业-31] buffs on deployment for each operator of the profession on the field, itself and other seats\' too, for their seconds', () => {
  const { deploy, ally } = arena({ profession: 'MEDIC', talentTrait: { deployBuff: { profession: 'MEDIC', seconds: 17, mods: { atkPct: 0.12, defFlat: 120 } } } },
    { medic: { profession: 'MEDIC' }, archer: { profession: 'SNIPER' } });
  const [m, s] = [ally('medic', 0, 2), ally('archer', 2, 2)], g = deploy();
  const of = (/** @type {Unit} */ u) => u.buffs.find((b) => b.key === `deployBuff:${g.id}`);
  assert.deepEqual([of(m)?.mods, of(m)?.left, !!of(g), of(s)], [{ atkPct: 0.12, defFlat: 120 }, 510 - 1, true, undefined], '17 s, less the frame of the deployment');
  assert.equal(statsOf(m).def, 20 + 120);
});

test('[职业-31] a stun on deployment: the first target and the enemies within the radius of it; none without a target', () => {
  const a = arena({ talentTrait: { deployStun: { seconds: 4, radius: 1 } } });
  const [e1, e2, e3] = [a.foe(1, 2), a.foe(2, 2), a.foe(1, 4)];
  a.deploy();
  assert.deepEqual([e1, e2, e3].map((e) => !!statsOf(e).flags.stun), [true, true, false]);
  const b = arena({ talentTrait: { deployStun: { seconds: 4, radius: 1 } } });
  const far = b.foe(2, 5);
  b.deploy();
  assert.equal(!!statsOf(far).flags.stun, false);
});

test('[职业-31] a blast on deployment on its tile and the 4 next to it: true damage and a stun, twice after its seat deployed one of the faction', () => {
  const a = arena({ trait: { noAttack: true }, talentTrait: { deployBlast: { scale: 0.8, stun: 3, again: 'kazimierz' } } }, { knight: { powers: ['kazimierz'] } });
  a.c.decks = [['guard', 'knight'], []];
  const [e1, e2] = [a.foe(1, 2), a.foe(2, 2)], hp = e1.hp;
  const g = a.deploy();
  assert.deepEqual([hp - e1.hp, !!statsOf(e1).flags.stun, e2.hp, a.w.players[0].last], [40, true, hp, 'guard']);
  withdraw(a.w, a.c, g);
  a.w.players[0].cards.guard.ready = a.w.frame;
  a.deploy('knight', 0, 2);
  const before = e1.hp;
  a.deploy();
  assert.equal(before - e1.hp, 80);
});

test('[职业-31] heals for an enemy falling on its tile or the 8 around it, or that it blocked, 禁疗 no matter', () => {
  const { w, deploy, foe, frames } = arena({ talentTrait: { downHeal: [{ where: 'around', share: 0.1 }, { where: 'blocked', share: 0.2 }] } });
  const g = deploy();
  addBuff(g, makeBuff({ key: 'noheal', src: g.id, flags: { healFree: true } }));
  g.hp = 500;
  const near = foe(2, 2), held = foe(1, 4), far = foe(1, 5);
  held.blockedBy = g.id;
  near.hp = 0; far.hp = 0;
  frames(1);
  assert.equal(g.hp, 600, 'the one near; not the far one');
  held.hp = 0;
  frames(1);
  assert.equal(w.units.includes(held), false);
  assert.equal(g.hp, 800);
});

test('[职业-31] SP for a hit that took HP at its chance', () => {
  const a = arena({ skill: skill(), talentTrait: { talentSp: [{ on: 'dealt', prob: 1, sp: 1 }] } });
  const g = a.deploy(), e = a.foe(1, 3);
  traitDealt(a.w, a.c, g, e, { dmg: { type: 'phys', amount: 10 }, taken: 10 });
  traitDealt(a.w, a.c, g, e, { dmg: { type: 'phys', amount: 10 }, taken: 0 });
  assert.equal(g.skill?.sp, 1);
  a.c.operators.guard.talentTrait = { talentSp: [{ on: 'dealt', prob: 0, sp: 1 }] };
  traitDealt(a.w, a.c, g, e, { dmg: { type: 'phys', amount: 10 }, taken: 10 });
  assert.equal(g.skill?.sp, 1);
});

test('[职业-31] what a heal leaves on the one healed — longer when it had more HP —; 元素损伤 heals × on a ground tile', () => {
  const { c, deploy, ally } = arena({ talentTrait: { healGives: { seconds: 4, mods: { statusResFlat: -0.5 }, above: 0.75, aboveSeconds: 6 }, groundEpHeal: 1.23 } });
  const g = deploy(), u = ally('sniper', 0, 2);
  healGives(c, g, u, 0.5);
  const b = u.buffs.find((x) => x.key === `healGives:${g.id}`);
  assert.deepEqual([b?.left, b?.mods], [120, { statusResFlat: -0.5 }]);
  healGives(c, g, u, 0.8);
  assert.deepEqual([u.buffs.filter((x) => x.key === `healGives:${g.id}`).length, b?.left], [1, 180]);
  assert.deepEqual([epHealMul(c, g, g), epHealMul(c, g, u)], [1.23, 1], 'the road is 低地, the wall 高台');
});

test('[职业-31] 隐匿 enemies: selected with the talent, and its modifiers while one is in its range', () => {
  const { c, w, deploy, foe } = arena({ talentTrait: { seeStealth: true, whiles: [{ when: 'stealthEnemies', mods: { atkPct: 0.2 } }] } });
  const g = deploy(), e = foe(1, 2);
  addBuff(e, makeBuff({ key: 'hide', src: e.id, flags: { stealth: true } }));
  traitWhiles(w, c, g);
  assert.deepEqual([targetsOf(w, c, g), statsOf(g).atk], [[e], 60]);
  const b = arena(), g2 = b.deploy(), e2 = b.foe(1, 2);
  addBuff(e2, makeBuff({ key: 'hide', src: e2.id, flags: { stealth: true } }));
  traitWhiles(b.w, b.c, g2);
  assert.deepEqual([targetsOf(b.w, b.c, g2), statsOf(g2).atk], [[], 50], 'without the talent');
});

test('[职业-31] the floor of an attack\'s hit after the defences: a share of the attack, more straight ahead; not for another hit', () => {
  const a = arena({ talentTrait: { minDamage: { scale: 0.25, front: 0.4 } } });
  const g = a.deploy(), near = a.foe(1, 3, { def: 1e4 }), far = a.foe(1, 4, { def: 1e4 });
  const hit = (/** @type {Unit} */ e, /** @type {boolean} */ isAttack) => dealDamage(a.w, g, e, { type: 'phys', amount: 50, isAttack }, a.c);
  assert.deepEqual([hit(near, true), hit(far, true), hit(near, false)], [20, 12.5, 2.5]);
});

test('[职业-31] conditions: until hurt, while its skill runs and seconds after, at low SP, by the enemies around, by HP', () => {
  const { w, c, deploy, foe, frames } = arena({ skill: skill(), talentTrait: { whiles: [
    { when: 'neverHurt', mods: { aspd: 12 } }, { when: 'skillOrAfter', value: 10, mods: { atkPct: 0.16 } },
    { when: 'lowSp', value: 0.5, mods: { hpRegenRatio: 0.035 }, flags: { noAttack: true } }, { when: 'enemiesNear', value: 3, mods: { atkScaleMul: 1.18 } },
    { when: 'fewEnemiesNear', value: 3, mods: { atkScaleMul: 1.13 } }, { when: 'hpBelow', value: 0.5, mods: { healingTakenMul: 1.45 } },
    { when: 'hpNotBelow', value: 0.5, mods: { healingTakenMul: 1.25 } },
  ] } });
  const g = deploy(), st = /** @type {any} */ (g.skill);
  const on = () => { traitWhiles(w, c, g); return g.buffs.filter((b) => b.key.startsWith('while:')).map((b) => Number(b.key.slice(6))).sort((x, y) => x - y); };
  st.sp = 6;
  assert.deepEqual(on(), [0, 4, 6]);
  st.sp = 5;
  assert.deepEqual([on(), statsOf(g).flags.noAttack], [[0, 2, 4, 6], true]);
  const e = foe(1, 1);
  dealDamage(w, e, g, { type: 'true', amount: 600 }, c);
  for (const [r, col] of [[1, 2], [0, 0]]) foe(r, col);
  assert.deepEqual(on(), [2, 3, 5]);
  activate(w, c, g, 'manual', true);
  endSkill(w, c, g);
  st.sp = 9;
  frames(299);
  assert.ok(on().includes(1), '299 frames after its end');
  frames(1);
  assert.ok(!on().includes(1), '300');
});

test('[职业-31] a regen for every friendly unit of any seat: a share of its attack', () => {
  const { w, c, deploy, ally } = arena({ talentTrait: { fieldRegen: 0.055 } });
  const g = deploy(), u = ally('sniper', 0, 2);
  auras(w, c);
  assert.deepEqual([u, g].map((x) => x.buffs.find((b) => b.key === `fieldRegen:${g.id}`)?.mods), [{ hpRegen: 0.055 * 50 }, { hpRegen: 0.055 * 50 }]);
});

test('[职业-31] [攻击-4] a chance talent\'s chance while the skill runs', () => {
  const { w, c, deploy, foe } = arena({ skill: skill(), critTalents: [{ prob: 0, skillProb: 1, scale: 1, atk: 1 }] });
  const g = deploy(), e = foe(1, 2);
  const hits = (/** @type {number} */ n) => { const out = []; for (let i = 0; i < 80 && out.length < n; i++) out.push(...step(w, c, []).filter((x) => x.type === 'hit' && x.target === e.id)); return out.map((x) => x.damage); };
  assert.deepEqual(hits(1), [50]);
  activate(w, c, g, 'manual', true);
  assert.deepEqual(hits(1), [100]);
});
