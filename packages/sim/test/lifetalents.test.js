// Talents in time, on life and by the damage's source (docs/spec/traits.md 职业-26, 职业-27, docs/spec/damage.md 伤害-12,
// docs/spec/field.md 部署-5, 部署-7): 抵挡, 近战物理闪避 and the taken multipliers by the source; the trackers, the
// conditions on them and the next attack; a heal once low, 护盾 layers, what keeps an operator at 0 HP, heals and statuses
// on hits taken, true damage returned; team talents after a while, more ammo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff, removeBuff, setLeft } from '../src/buffs.js';
import { takeDamage, dealDamage } from '../src/damage.js';
import { traitWhiles } from '../src/whiles.js';
import { timedAttack, attackEnded } from '../src/talenttime.js';
import { attacked } from '../src/riders.js';
import { activate } from '../src/skills.js';
import { auras } from '../src/aura.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without spawns, the guard (its tile and two ahead) with these record fields — the content changed by
 * `edit` first —, deployed at (1, 1) facing right at frame 0; `foe` adds a rooted enemy; `ally` another operator.
 * @param {Record<string, any>} rec @param {(c: any) => void} [edit]
 */
function arena(rec = {}, edit = () => {}) {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  edit(c);
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
  /** @param {number} row @param {number} col @param {Record<string, any>} [o] */
  const ally = (row, col, o = {}) => {
    const u = makeOperator(w, c, { key: 'sniper', owner: 1, row, col, dir: 0, ...o });
    w.units.push(u);
    return u;
  };
  /** Which of its `while:` buffs the guard has after its turn's update, in order. */
  const on = () => { traitWhiles(w, c, op); return op.buffs.filter((b) => b.key.startsWith('while:')).map((b) => Number(b.key.slice(6))).sort((x, y) => x - y); };
  return { w, c, op, foe, ally, on };
}

/** The mods of an attack before the talents in time (技能-5). */
const PLAIN = Object.freeze({ scale: 1, times: 1, targets: 1, skill: false });

test('[伤害-12] 抵挡 by type and by a ranged source, 近战物理闪避 only off the 近战途径, damage by a flying source and by tags, 物理闪避 ignored', () => {
  const { w, c, op, foe } = arena({}, (k) => { k.enemies.slime.tags = ['sarkaz']; });
  const melee = foe(1, 2, { applyWay: 'MELEE' }), ranged = foe(1, 3, { applyWay: 'RANGED' }), flyer = foe(1, 3, { motion: 'FLY' });
  const take = (/** @type {Record<string, any>} */ dmg, /** @type {Unit} */ src = melee, /** @type {string[]} */ tags = []) => takeDamage(w, op, 100, /** @type {any} */ ({ amount: 100, ...dmg }), { src, tags });
  const only = (/** @type {Record<string, number>} */ mods) => { removeBuff(op, 'g'); addBuff(op, makeBuff({ key: 'g', mods })); };
  only({ blockRangedPhys: 1 });
  assert.deepEqual([take({ type: 'phys' }), take({ type: 'phys' }, ranged), take({ type: 'arts' }, ranged)], [100, 0, 100], '远程物理抵挡');
  only({ blockAll: 1 });
  assert.deepEqual(['phys', 'arts', 'true', 'elemental'].map((type) => take({ type })), [0, 0, 0, 100], '伤害抵挡');
  only({ blockPA: 1 });
  assert.deepEqual(['phys', 'true'].map((type) => take({ type })), [0, 100]);
  only({ dodgeMelee: 1 });
  assert.deepEqual([take({ type: 'phys' }), take({ type: 'phys', isProjectile: true }), take({ type: 'arts' })], [0, 100, 100], '近战物理闪避');
  only({ airTakenMul: 0.5, 'from:sarkaz': 0.8, 'fromPA:sarkaz': 0.5 });
  assert.deepEqual([take({ type: 'phys' }, flyer), take({ type: 'phys' }, melee), take({ type: 'phys' }, melee, ['sarkaz']), take({ type: 'true' }, melee, ['sarkaz'])], [50, 100, 40, 80]);
  only({ dodgePhys: 1 });
  addBuff(melee, makeBuff({ key: 'sure', flags: { ignoreDodgePhys: true } }));
  assert.deepEqual([take({ type: 'phys' }), take({ type: 'phys' }, ranged)], [100, 0], 'a source that ignores 物理闪避');
  removeBuff(op, 'g');
  addBuff(op, makeBuff({ key: 'g', mods: { 'from:sarkaz': 0.5 } }));
  const hp = op.hp;
  dealDamage(w, melee, op, { type: 'true', amount: 100 }, c);
  assert.equal(hp - op.hp, 50, 'the tags of an enemy source come from its record');
});

test('[职业-26] trackers: the deployment counts as the last attack, a hit that took HP, a 伤判 begun; unhurt holds from the deployment on', () => {
  const { w, op, foe, on } = arena({ talentTrait: { whiles: [
    { when: 'idle', value: 2, mods: { aspd: 1 } }, { when: 'unhurt', value: 3, fresh: true, mods: { aspd: 1 } }, { when: 'calm', value: 3, mods: { aspd: 1 } },
  ] } });
  const e = foe(1, 2);
  assert.deepEqual(on(), [1], 'right after the deployment');
  w.frame = 90;
  assert.deepEqual(on(), [0, 1, 2]);
  dealDamage(w, e, op, { type: 'phys', amount: 300 });
  assert.deepEqual(on(), [0], 'a hit that took HP: not unhurt, not calm');
  w.frame = 120;
  addBuff(op, makeBuff({ key: 'wall', mods: { blockAll: 1 } }));
  dealDamage(w, e, op, { type: 'phys', amount: 300 });
  assert.deepEqual(on(), [0], 'a hit blocked: its 伤判 began, it took no HP');
  w.frame = 180;
  assert.deepEqual(on(), [0, 1], 'three seconds unhurt, but a hit blocked two seconds ago');
});

test('[职业-26] the next attack after a while without attacking, after a dodge (one spent each); the 倍率 by the time since the last start', () => {
  const { w, c, op, foe } = arena({ talentTrait: {
    nextAttack: [{ when: 'idle', value: 2, scale: 1.5, stun: 3 }, { when: 'dodged', atk: 1, times: 2, blocked: true }], rhythm: { min: 1, max: 2.5, top: 1.9 },
  } });
  const e = foe(1, 2);
  w.frame = 76;
  const first = timedAttack(w, c, op, { ...PLAIN });
  assert.deepEqual([first.scale, first.hitStatus], [1.5 * 1.9, { key: 'stun', seconds: 3 }], 'two seconds since the deployment; the most of the 倍率');
  attackEnded(w, op);
  const now = timedAttack(w, c, op, { ...PLAIN });
  assert.deepEqual([now.scale, now.hitStatus], [1, undefined], 'no time since that attack started and ended');
  addBuff(op, makeBuff({ key: 'evade', mods: { dodgePhys: 1 } }));
  dealDamage(w, e, op, { type: 'phys', amount: 10 });
  dealDamage(w, e, op, { type: 'phys', amount: 10 });
  w.frame += 31 + 45 / 3;
  const after = timedAttack(w, c, op, { ...PLAIN });
  assert.deepEqual([after.atkPct, after.times, after.blocked], [1, 2, true], 'after a dodge');
  assert.ok(Math.abs(after.scale - (1 + 0.9 / 3)) < 1e-12, 'a third of the way');
  assert.equal(op.buffs.find((b) => b.key === 'dodges')?.n, 1, 'one of the two spent');
});

test('[职业-26] a 屏障 after a while without attacking: its wait begins again while it holds it and when an attack ends', () => {
  const { w, c, op } = arena({ talentTrait: { idleShield: { value: 8, share: 0.2 } } });
  const shield = () => op.buffs.find((b) => b.key === 'idleShield')?.shield ?? 0;
  w.frame = 8 * 30 - 1;
  traitWhiles(w, c, op);
  assert.equal(shield(), 0);
  w.frame += 1;
  traitWhiles(w, c, op);
  assert.equal(shield(), 0.2 * statsOf(op).maxHp);
  w.frame += 100;
  traitWhiles(w, c, op);
  takeDamage(w, op, 1e6, { type: 'phys', amount: 1e6 });
  assert.equal(shield(), 0, 'used up');
  w.frame += 8 * 30 - 1;
  traitWhiles(w, c, op);
  assert.equal(shield(), 0, 'the wait began again when it last held it');
});

test('[职业-27] a heal once low, 不死 until then; 护盾 layers that heal as they break', () => {
  const { w, c, op } = arena({ talentTrait: { lowHp: { below: 0.25, heal: 0.5, mods: { physTakenMul: 0.8 } }, layers: { every: 9, max: 3, init: 1, heal: 0.2 } } });
  const max = statsOf(op).maxHp, layers = () => op.buffs.find((b) => b.key === 'layers')?.shieldHits;
  assert.deepEqual([statsOf(op).flags.undying, layers()], [true, 1]);
  takeDamage(w, op, 10, { type: 'phys', amount: 10 });
  assert.equal(layers(), 0, 'a layer broke');
  op.hp = 0.1 * max;
  traitWhiles(w, c, op);
  assert.equal(op.hp, 0.1 * max + 0.2 * max + 0.5 * max, 'a layer\'s heal, then the heal once low');
  assert.deepEqual([statsOf(op).flags.undying, op.buffs.some((b) => b.key === 'lowHpAfter')], [undefined, true]);
  w.frame = 9 * 30;
  traitWhiles(w, c, op);
  w.frame = 18 * 30;
  traitWhiles(w, c, op);
  w.frame = 27 * 30;
  traitWhiles(w, c, op);
  w.frame = 36 * 30;
  traitWhiles(w, c, op);
  assert.equal(layers(), 3, 'one every 9 s, at most 3');
});

test('[职业-27] what keeps it at 0 HP: a last stand that retreats it, a frozen life, a heal bought with cost that doubles; a second life from talents', () => {
  const stand = arena({ talentTrait: { lastStand: { seconds: 9 } } });
  stand.op.hp = 0;
  step(stand.w, stand.c, []);
  const b = stand.op.buffs.find((x) => x.key === 'lastStand');
  assert.deepEqual([stand.w.units.includes(stand.op), stand.op.hp, statsOf(stand.op).flags.healFree], [true, 1, true]);
  setLeft(/** @type {any} */ (b), 1);
  step(stand.w, stand.c, []);
  assert.equal(stand.w.units.includes(stand.op), false, 'it retreats when the stand runs out');
  assert.ok(stand.w.players[0].cards.guard?.penalty === 1, 'as a retreat');

  const frost = arena({ talentTrait: { frostLife: { hp: 1, self: 4, foes: 8 } } });
  const e = frost.foe(1, 2);
  frost.op.hp = 0;
  step(frost.w, frost.c, []);
  assert.deepEqual([frost.op.hp, statsOf(frost.op).flags.freeze, statsOf(e).flags.freeze], [statsOf(frost.op).maxHp, true, true]);
  assert.equal(frost.op.buffs.some((x) => x.key === 'freeze'), false, 'its own 冻结 is an enemy\'s');
  frost.op.hp = 0;
  step(frost.w, frost.c, []);
  assert.equal(frost.w.units.includes(frost.op), false, 'once');

  const bought = arena({ talentTrait: { costLife: { cost: 5, hp: 0.8, mul: 2 } } });
  const p = bought.w.players[0];
  p.cost = 15;
  for (const left of [10, 0]) {
    bought.op.hp = 0;
    step(bought.w, bought.c, []);
    assert.deepEqual([bought.w.units.includes(bought.op), p.cost], [true, left]);
  }
  p.cost = 19;
  bought.op.hp = 0;
  step(bought.w, bought.c, []);
  assert.equal(bought.w.units.includes(bought.op), false, '20 needed the third time');

  const horn = arena({ talentTrait: { secondLife: { hp: 1, mods: { hpMul: 0.5 } } } });
  horn.op.hp = 0;
  step(horn.w, horn.c, []);
  assert.deepEqual([horn.op.hp, statsOf(horn.op).maxHp], [500, 500]);
});

test('[职业-27] a hit taken: a heal of itself by its HP before it, 寒冷 on the enemy that dealt it; arts damage back while a condition holds; true damage for its faction', () => {
  const { w, c, op, foe, on } = arena({ talentTrait: { hurt: { heal: { low: 100, high: 160, below: 0.5 }, status: { key: 'cold', seconds: 2 } }, whiles: [{ when: 'notInSkill', mods: { counterArts: 0.2 } }],
    reflect: { power: 'kazimierz', scale: 0.5 } } }, (k) => { k.operators.guard.powers = ['kazimierz']; });
  const e = foe(1, 2);
  const max = statsOf(op).maxHp;
  op.hp = 0.6 * max;
  dealDamage(w, e, op, { type: 'true', amount: 300 }, c);
  assert.equal(op.hp, Math.min(max, 0.6 * max + 100) - 300, 'healed 100 before the hit');
  assert.equal(e.buffs.some((b) => b.key === 'cold'), true);
  op.hp = 0.4 * max;
  addBuff(op, makeBuff({ key: 'evade', mods: { dodgePhys: 1 } }));
  dealDamage(w, e, op, { type: 'phys', amount: 300 }, c);
  assert.equal(op.hp, 0.4 * max + 160, 'a dodged hit too, 160 below half');
  on();
  const hp = e.hp;
  attacked(w, c, op, e, { type: 'phys', amount: 1, isAttack: true });
  assert.equal(hp - e.hp, statsOf(op).atk * 0.2 + statsOf(op).atk * 0.5, 'its arts damage back, then the true damage for its faction');
});

test('[部署-5] [部署-7] a team talent once its holder has been on the field a while; more ammo for an ammo skill as it starts', () => {
  const { w, c, op } = arena({ fieldTalents: [{ all: true, bb: { atk: 0.1 }, after: 10 }], timedTalents: [{ kind: 'after', seconds: 1, max: 1, mods: { ammoFlat: 2 } }],
    skill: { id: 'shots', type: 'MANUAL', sp: 'time', cost: 0, init: 0, charges: 1, duration: -1, ammo: true, bb: { cnt: 3 } } });
  const field = () => op.buffs.some((b) => b.key.startsWith('field:'));
  w.frame = 299;
  auras(w, c);
  assert.equal(field(), false);
  w.frame = 300;
  auras(w, c);
  assert.equal(field(), true);
  for (let i = 0; i < 31; i++) step(w, c, []);
  activate(w, c, op, 'manual', true);
  assert.equal(op.skill?.ammo, 5);
});
