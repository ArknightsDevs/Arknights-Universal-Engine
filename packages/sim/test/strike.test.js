// A skill's hit on the enemies around its operator as it starts (docs/spec/skills.md 技能-16): who it reaches, what each takes.
// The strike is worked out here from hand-made skills; the reading of real descriptions is in packages/content/test/strike.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIR, KIND } from '@aue/schema';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus } from '../src/index.js';
import { statsOf } from '../src/attrs.js';
import { kindOf, GENERIC } from '../src/skills.js';
import { forceSp } from '../src/sp.js';
import { inflict } from '../src/status.js';
import { makeEnemy } from '../src/units.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef @typedef {import('../src/types.js').Unit} Unit */
/** @typedef {import('../src/types.js').Content} Content @typedef {import('../src/types.js').World} World */
/** @typedef {NonNullable<NonNullable<SkillDef['extra']>['bursts']>[number]} Strike */

/** The row of tiles in front of an operator facing right: 1 to 4 tiles ahead. */
const AHEAD = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }];

/** @param {Partial<SkillDef>} o @returns {SkillDef} */
const sk = (o) => ({ id: 'text', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 0, ammo: false, bb: { atk_scale: 2 }, ...o });

/**
 * A skill that strikes as it starts: an instant one — its attack key is the strike's —, `strike` its hit.
 * @param {Partial<Strike>} strike @param {Partial<SkillDef>} [o] @returns {SkillDef}
 */
const striking = (strike, o = {}) => sk({ instant: true, extra: { bursts: [{ at: 'start', scale: 2, type: 'phys', where: 'attack', ...strike }], hitScale: 'attack' }, ...o });

/**
 * The tiny level, no spawns, the guard (50 attack, slow to attack) with `skill`, deployed at (row 1, col 1) facing right unless told.
 * @param {SkillDef} skill @param {{ col?: number, dir?: number, prep?: (c: Content) => void }} [o]
 */
function field(skill, o = {}) {
  const c = /** @type {Content} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.baseAttackTime = 100;
  c.operators.guard.skill = skill;
  o.prep?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: o.col ?? 1, dir: o.dir ?? DIR.RIGHT }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  op.atkCd = 1e6; // it makes no attack: only the strike hits
  return { w, c, op };
}

/** @param {World} w @param {Content} c @param {Unit} op */
function arm(w, c, op) {
  forceSp(/** @type {import('../src/types.js').SkillState} */ (op.skill), 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
}

/** @param {World} w @param {Content} c @param {number} x @param {number} y @param {Record<string, unknown>} [more] */
function foe(w, c, x, y, more = {}) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = x; e.y = y;
  e.base = { ...e.base, maxHp: 1e9, def: 0, res: 0, moveSpeed: 0, atk: 0, ...more };
  e.hp = 1e9; e.maxHp = 1e9;
  w.units.push(e);
  return e;
}

/** The HP an enemy has lost. @param {Unit} e */
const lost = (e) => 1e9 - e.hp;

test('[技能-1] [技能-16] a skill whose hit at the start has taken its attack keys is instant; without that it is a next attack', () => {
  assert.equal(kindOf(striking({})), 'instant');
  assert.equal(kindOf(sk({ extra: { bursts: [{ at: 'start', scale: 2, type: 'phys', where: 'attack' }], hitScale: 'attack' } })), 'next');
  assert.equal(kindOf(striking({}, { duration: 5 })), 'duration');
  assert.equal(kindOf(striking({}, { type: 'PASSIVE' })), 'passive');
});

test('[技能-16] an instant strike hits the enemies in the attack range once, the operator\'s attack × the scale, and ends in the frame it starts', () => {
  const { w, c, op } = field(striking({}));
  const near = foe(w, c, 2, 1), far = foe(w, c, 4, 1);
  arm(w, c, op);
  assert.equal(lost(near), statsOf(op).atk * 2);
  assert.equal(far.hp, 1e9, 'out of the attack range');
  assert.equal(op.skill?.active, false, 'no next attack to wait for');
});

test('[技能-16] in the cells of a range: those cells, not the attack range; most takes the first in the attack order — the farthest first for a pull', () => {
  const cells = { where: /** @type {const} */ ('cells'), range: AHEAD };
  const lines = (/** @type {Partial<Strike>} */ s) => {
    const { w, c, op } = field(striking({ ...cells, most: 2, ...s }));
    const e = [1, 2, 3].map((k) => foe(w, c, 1 + k, 1));
    arm(w, c, op);
    return e.map((x) => lost(x) > 0);
  };
  // all three stand at the start of the road: the attack order is the order they appeared in
  assert.deepEqual(lines({}), [true, true, false], 'the first two to appear');
  assert.deepEqual(lines({ order: 'farthest' }), [false, true, true], 'the two farthest from her: the pull order');
  const all = field(striking({ ...cells }));
  const four = [1, 2, 3, 5].map((k) => foe(all.w, all.c, 1 + k, 1));
  arm(all.w, all.c, all.op);
  assert.deepEqual(four.map((x) => lost(x) > 0), [true, true, true, false], 'without most, every enemy in the cells; a fifth tile is out');
});

test('[技能-16] times: a hit each time, 防御 partly ignored; an enemy that falls takes no more; a type not written is the operator\'s own', () => {
  const tough = (/** @type {Partial<Strike>} */ s, /** @type {number} */ hp = 1e9) => {
    const { w, c, op } = field(striking(s));
    const e = foe(w, c, 2, 1, { def: 60 });
    e.hp = hp;
    arm(w, c, op);
    return hp - e.hp;
  };
  assert.equal(tough({ times: 3 }), 3 * 40, 'a hit of 100 against 60 防御, three times');
  assert.equal(tough({ times: 3, ignoreDef: { pct: 0.5 } }), 3 * 70);
  assert.equal(tough({ times: 3, ignoreDef: { flat: 40 } }), 3 * 80);
  assert.equal(tough({ times: 3, ignoreDef: { pct: 0.5, flat: 40 } }), 3 * 90, 'the share of what is left after the number');
  assert.equal(tough({ times: 3 }, 50), 50, 'the first hit takes 40, the second the last 10: no third');
  const { w, c, op } = field(striking({ type: undefined }));
  const e = foe(w, c, 2, 1, { def: 60, res: 50 });
  arm(w, c, op);
  assert.equal(lost(e), 100 - 60, 'the guard\'s own type is physical');
  const arts = field(striking({ type: 'arts' }));
  const f = foe(arts.w, arts.c, 2, 1, { def: 60, res: 50 });
  arm(arts.w, arts.c, arts.op);
  assert.equal(lost(f), 50, 'arts, against 50 法术抗性');
});

test('[技能-16] ground: no flying enemy; air: × on a flying one; in the attack range, most takes what the attack could take unless fly', () => {
  const { w, c, op } = field(striking({ ground: true, air: 2 }));
  const ground = foe(w, c, 2, 1), air = foe(w, c, 2, 1, { motion: 'FLY' });
  arm(w, c, op);
  assert.deepEqual([lost(ground), lost(air)], [100, 0]);
  const both = field(striking({ air: 2 }));
  const g = foe(both.w, both.c, 2, 1), a = foe(both.w, both.c, 2, 1, { motion: 'FLY' });
  arm(both.w, both.c, both.op);
  assert.deepEqual([lost(g), lost(a)], [100, 200], 'flying ones are hit and take the × of the sentence');
  const few = (/** @type {Partial<Strike>} */ s) => {
    const f = field(striking({ most: 2, ...s }));
    const x = foe(f.w, f.c, 2, 1, { motion: 'FLY' });
    arm(f.w, f.c, f.op);
    return lost(x) > 0;
  };
  assert.equal(few({}), false, 'a guard\'s attack cannot take it');
  assert.equal(few({ fly: true }), true);
});

test('[技能-16] neutral units and disappeared ones are left alone', () => {
  const { w, c, op } = field(striking({}));
  const neutral = foe(w, c, 2, 1, { neutral: true }), gone = foe(w, c, 2, 1), seen = foe(w, c, 2, 1);
  gone.hidden = true;
  arm(w, c, op);
  assert.deepEqual([lost(neutral), lost(gone), lost(seen)], [0, 0, 100]);
});

test('[技能-16] statuses after the hits; one for an enemy that had a status before is not given to the others; a dead enemy gets none', () => {
  const status = [{ key: /** @type {const} */ ('sluggish'), seconds: 4 }, { key: /** @type {const} */ ('stun'), seconds: 3, ifHas: 'sluggish' }];
  const { w, c, op } = field(striking({ status }));
  const slowed = foe(w, c, 2, 1), fresh = foe(w, c, 2, 1), dying = foe(w, c, 2, 1);
  inflict(w, slowed, 'sluggish', { seconds: 9 });
  dying.hp = 10;
  arm(w, c, op);
  const has = (/** @type {Unit} */ e, /** @type {string} */ k) => e.buffs.some((b) => b.key === k);
  assert.deepEqual([has(slowed, 'stun'), has(fresh, 'stun'), has(fresh, 'sluggish')], [true, false, true], '已经处于停顿状态 is asked for before the strike');
  assert.deepEqual([dying.hp <= 0, dying.buffs.some((b) => b.key === 'sluggish')], [true, false]);
});

test('[技能-16] statuses the sentence names before the damage come before it', () => {
  const order = (/** @type {boolean} */ first) => {
    const { w, c, op } = field(striking({ first, status: [{ key: 'stun', seconds: 2 }] }));
    foe(w, c, 2, 1);
    /** @type {string[]} */
    const seen = [];
    bus.on(w, 'beforeStatus', () => { seen.push('status'); });
    bus.on(w, 'damaged', () => { seen.push('hit'); });
    arm(w, c, op);
    return seen.join();
  };
  assert.equal(order(true), 'status,hit');
  assert.equal(order(false), 'hit,status');
});

test('[技能-16] timed modifiers on the enemies it hit: one buff of the operator\'s, its time starting again at the next hit', () => {
  const { w, c, op } = field(striking({ debuff: { seconds: 4, mods: { resPct: -0.2 } } }, { cost: 0, charges: 2 }));
  const e = foe(w, c, 2, 1);
  arm(w, c, op);
  const buff = () => e.buffs.filter((b) => b.key === `hitDebuff:${op.id}`);
  assert.deepEqual([buff().length, buff()[0].mods, buff()[0].left], [1, { resPct: -0.2 }, 119], 'four seconds, a frame spent');
  for (let i = 0; i < 40; i++) step(w, c, []);
  assert.ok(buff()[0].left < 90);
  forceSp(/** @type {import('../src/types.js').SkillState} */ (op.skill), 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  assert.deepEqual([buff().length, buff()[0].left], [1, 119], 'again: refreshed, not stacked');
});

test('[技能-16] a pull draws an enemy toward the operator; a push sends it away', () => {
  const run = (/** @type {{ pull: boolean, force: number, along?: boolean }} */ displace) => {
    const { w, c, op } = field(striking({ displace }), { col: 2 });
    const e = foe(w, c, 3.5, 1);
    arm(w, c, op);
    for (let i = 0; i < 60; i++) step(w, c, []);
    return e.x;
  };
  assert.ok(run({ pull: true, force: 1 }) < 3.5, 'toward her');
  assert.ok(run({ pull: false, force: 1 }) > 3.5, 'away');
  assert.ok(run({ pull: false, force: 1, along: true }) > 3.5, 'along her facing');
});

test('[技能-16] a strike every so often comes after its first delay, then each second, while the skill runs', () => {
  const every = { at: /** @type {const} */ ('every'), scale: 2, type: /** @type {const} */ ('arts'), where: /** @type {const} */ ('attack'), every: { seconds: 1, first: 0.67 } };
  const { w, c } = field(sk({ type: 'PASSIVE', sp: 'none', duration: 3, extra: { bursts: [every], hitScale: 'attack' } }), { prep: (cc) => { cc.operators.guard.res = 0; } });
  const e = foe(w, c, 2, 1);
  const at = /** @type {number[]} */ ([]);
  let hp = e.hp;
  for (let i = 0; i < 120; i++) {
    step(w, c, []);
    if (e.hp < hp) at.push(w.frame);
    hp = e.hp;
  }
  assert.equal(at.length, 3, '3 s: three volleys');
  assert.deepEqual(at.map((f, i) => (i ? f - at[i - 1] : 0)), [0, 30, 30]);
  assert.equal(at[0] - 1, Math.round(0.67 * 30), 'the first, 0.67 s after the skill started');
});

test('[技能-16] a skill id with a behaviour of its own is not also struck from the description', () => {
  const { w, c, op } = field(striking({}, { id: 'owned' }), { prep: (cc) => { cc.behaviors = { skills: { owned: { start() { /* the kit owns this id */ } } } }; } });
  const e = foe(w, c, 2, 1);
  arm(w, c, op);
  assert.equal(e.hp, 1e9);
});

test('[技能-16] [技能-6] 德克萨斯 skchr_texas_2: a behaviour that only gives the start timing is not a special one — the strike still comes; a real one stops it', () => {
  /** @param {import('../src/skills.js').SkillBehavior} behavior @returns {[number, boolean]} the enemy's loss, whether the skill is still running */
  const struck = (behavior) => {
    const { w, c, op } = field(striking({}, { id: 'skchr_texas_2' }), { prep: (cc) => { cc.behaviors = { skills: { skchr_texas_2: behavior } }; } });
    const e = foe(w, c, 2, 1);
    arm(w, c, op);
    return [lost(e), !!op.skill?.active];
  };
  const hit = statsOf(field(striking({})).op).atk * 2;
  assert.deepEqual(struck({ ...GENERIC, trigger: 'ready' }), [hit, false], 'only a trigger: the strike, and an instant skill ends in its frame');
  assert.deepEqual(struck({ ...GENERIC, end(ctx, reason) { GENERIC.end(ctx, reason); } })[0], 0, 'its own end: no strike');
  const every = { at: /** @type {const} */ ('every'), scale: 2, type: /** @type {const} */ ('arts'), where: /** @type {const} */ ('attack'), every: { seconds: 1, first: 0.67 } };
  const volleys = (/** @type {import('../src/skills.js').SkillBehavior} */ behavior) => {
    const { w, c } = field(sk({ id: 'skchr_texas_2', type: 'PASSIVE', sp: 'none', duration: 3, extra: { bursts: [every], hitScale: 'attack' } }), { prep: (cc) => { cc.operators.guard.res = 0; cc.behaviors = { skills: { skchr_texas_2: behavior } }; } });
    const e = foe(w, c, 2, 1);
    for (let i = 0; i < 60; i++) step(w, c, []);
    return lost(e) > 0;
  };
  assert.equal(volleys({ ...GENERIC, trigger: 'ready' }), true, 'the volleys of a running skill come too');
  assert.equal(volleys({ ...GENERIC, tick() { /* its own */ } }), false);
});

test('[技能-16] a left-facing operator: the stored cells turn with it', () => {
  const { w, c, op } = field(striking({ where: 'cells', range: AHEAD }), { col: 4, dir: DIR.LEFT });
  const east = foe(w, c, 5, 1), west = foe(w, c, 3, 1);
  arm(w, c, op);
  assert.deepEqual([lost(east), lost(west)], [0, 100]);
});

test('[技能-16] a splash: the nearest ground enemy in the attack range is the centre, and every enemy within `around` of it is hit — a flying one, one out of the range — but not a flying one that is nearer to the operator', () => {
  const { w, c, op } = field(striking({ around: 0.5 }));
  const first = foe(w, c, 2.3, 1), centre = foe(w, c, 1.7, 1), flyer = foe(w, c, 1.6, 1.4, { motion: 'FLY' }), nearer = foe(w, c, 1.0, 1.0, { motion: 'FLY' }), outside = foe(w, c, 2.6, 1);
  arm(w, c, op);
  assert.deepEqual([first, centre, flyer, nearer, outside].map((e) => lost(e) > 0), [false, true, true, false, false], '0.6 from the centre; the centre; flying, 0.41 from it; flying and the nearest to her, 0.7 from it; 0.9 from it');
  const wide = field(striking({ around: 1 }));
  const a = foe(wide.w, wide.c, 1.7, 1), b = foe(wide.w, wide.c, 2.6, 1);
  arm(wide.w, wide.c, wide.op);
  assert.deepEqual([lost(a), lost(b)], [100, 100], 'radius 1: the one on a tile past her range too');
  const air = field(striking({ around: 1 }));
  const only = foe(air.w, air.c, 1.4, 1, { motion: 'FLY' });
  arm(air.w, air.c, air.op);
  assert.equal(lost(only), 0, 'a flying enemy alone: no ground target, no projectile');
});

test('[技能-16] a second type: each hit is the strike\'s type and then the other, an enemy that falls between takes no more', () => {
  const run = (/** @type {number} */ hp) => {
    const { w, c, op } = field(striking({ type: 'arts', then: 'phys', times: 2 }));
    const e = foe(w, c, 2, 1, { def: 60, res: 50 });
    e.hp = hp;
    /** @type {string[]} */
    const seen = [];
    bus.on(w, 'damaged', (k) => { seen.push(k.dmg.type); });
    arm(w, c, op);
    return { seen: seen.join(), taken: hp - e.hp };
  };
  assert.deepEqual(run(1e9), { seen: 'arts,phys,arts,phys', taken: 2 * (50 + 40) }, '100 against 50 法术抗性, 100 against 60 防御, twice');
  assert.deepEqual(run(60).seen, 'arts,phys', 'the 法术 hit leaves 10, the 物理 one takes it: no more');
  assert.deepEqual(run(45).seen, 'arts', 'the 法术 hit takes all: no 物理 one');
});

test('[技能-16] a strike that pulled keeps its skill for `hold` seconds with no SP and then ends it by its time; one that did not pull ends in its frame', () => {
  const pull = { pull: true, force: 1 };
  const run = (/** @type {Partial<Strike>} */ s, /** @type {boolean} */ near = true) => {
    const { w, c, op } = field(striking({ displace: pull, hold: 2, ...s }), { col: 2 });
    foe(w, c, near ? 3.5 : 9, 1);
    /** @type {[number, string][]} */
    const ended = [];
    bus.on(w, 'skillEnd', (k) => { ended.push([w.frame - /** @type {import('../src/types.js').SkillState} */ (op.skill).at, k.reason]); });
    arm(w, c, op);
    const st = /** @type {import('../src/types.js').SkillState} */ (op.skill), started = { active: st.active, sp: st.sp };
    for (let i = 0; i < 100; i++) step(w, c, []);
    return { started, ended, sp: st.sp };
  };
  const held = run({});
  assert.equal(held.started.active, true);
  assert.deepEqual(held.ended, [[60, 'duration']], '2 s = 60 frames after it started');
  assert.ok(held.sp > held.started.sp, 'SP comes back once it is over');
  assert.deepEqual(run({}, false).ended, [[0, 'instant']], 'nobody to pull: over in its frame');
  assert.deepEqual(run({ displace: { pull: false, force: 1 } }).ended, [[0, 'instant']], 'a push holds nothing');
  assert.deepEqual(run({ hold: undefined }).ended, [[0, 'instant']], 'a pull that no remark holds');
});

test('[技能-16] hostile devices are struck as an attack would take them (装置-3); a device of our side and a neutral unit are not', () => {
  const { w, c, op } = field(striking({}));
  const device = foe(w, c, 2, 1), ours = foe(w, c, 2, 1);
  device.kind = KIND.DEVICE; device.base = { ...device.base, hostile: true };
  ours.kind = KIND.DEVICE;
  arm(w, c, op);
  assert.deepEqual([lost(device), lost(ours)], [100, 0]);
});
