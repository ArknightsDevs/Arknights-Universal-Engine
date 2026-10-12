// The events the engine sends on the way (docs/spec/hooks.md 钩子-3): of damage and healing (伤害-7, 伤害-11) — hit before
// the defences, dodge, hpDamage, fatal, damaged, heal; kill and the killer at the frame's end; where an attack's hit comes
// from —, of attacks (beforeAttack, attack), skills (skillStart, skillEnd) and statuses (beforeStatus).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, summons as summonsApi } from '../src/index.js';
import { on, after } from '../src/bus.js';
import { dealDamage, heal } from '../src/damage.js';
import { makeOperator, makeEnemy } from '../src/units.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { applyStatus, inflict } from '../src/status.js';

/** A world with a guard on the road and a slime (1000 HP, DEF 10) at the start; nothing else happens on its own. */
function field() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.enemies.slime.maxHp = 1000;
  const w = createWorld(c, { seed: 1, players: 1 });
  const guard = makeOperator(w, c, { key: 'guard', owner: 0, row: 1, col: 1, dir: 0 }), slime = makeEnemy(w, c, { key: 'slime', route: 0 });
  w.units.push(guard, slime);
  return { c, w, guard, slime };
}

test('[钩子-3] hit, before the defences: the hit with mul 1, no tags, not cancelled; mul scales what the defences leave; cancel stops it', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  on(w, 'hit', (k) => {
    seen.push(`${k.source.key}>${k.target.key}:${k.dmg.amount}:${k.dmg.mul}:${k.dmg.cancel}`);
    if (k.dmg.tags?.includes('double')) k.dmg.mul = 2;
    if (k.dmg.tags?.includes('stop')) k.dmg.cancel = true;
  });
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50 }), 40);
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50, tags: ['double'] }), 80, '(50 − 10) × 2');
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50, tags: ['stop'] }), 0);
  assert.deepEqual([seen, slime.hp], [['guard>slime:50:1:false', 'guard>slime:50:1:false', 'guard>slime:50:1:false'], 1000 - 120]);
});

test('[钩子-3] dodge in the 伤判 effects; hpDamage may lower what reaches the HP, never raise it', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  let to = 5;
  on(w, 'dodge', (k) => seen.push(`dodge:${k.source.key}`));
  on(w, 'hpDamage', (k) => { seen.push(`hp:${k.amount}`); k.amount = to; });
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50 }), 5);
  to = 1e9;
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50 }), 40);
  addBuff(slime, makeBuff({ key: 'evade', mods: { dodgePhys: 1 } }));
  assert.equal(dealDamage(w, guard, slime, { type: 'phys', amount: 50 }), 0);
  assert.deepEqual([seen, slime.hp], [['hp:40', 'hp:40', 'dodge:guard'], 955]);
});

test('[钩子-3] fatal may keep a unit at 1 HP; damaged after the HP, 生命流失 too', () => {
  const { w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  let save = true;
  on(w, 'fatal', (k) => { seen.push(`fatal:${k.amount}`); k.prevented = save; });
  on(w, 'damaged', (k) => seen.push(`damaged:${k.amount}:${k.type}:${!!k.dmg.hpLoss}:${k.target.hp}`));
  slime.hp = 30;
  dealDamage(w, guard, slime, { type: 'phys', amount: 50 });
  assert.equal(slime.hp, 1, 'saved');
  dealDamage(w, null, slime, { type: 'true', amount: 3, hpLoss: true });
  assert.equal(slime.hp, 1, 'saved from a 流失 too');
  save = false;
  dealDamage(w, guard, slime, { type: 'phys', amount: 50 });
  assert.deepEqual(seen, ['fatal:40', 'damaged:40:phys:false:1', 'fatal:3', 'damaged:3:true:true:1', 'fatal:40', 'damaged:40:phys:false:0']);
});

test('[钩子-3] the dead leave at the frame’s end: kill, then death with the unit whose hit was the last', () => {
  const { c, w, guard, slime } = field(), seen = /** @type {string[]} */ ([]);
  on(w, 'kill', (k) => seen.push(`kill:${k.killer.key}>${k.victim.key}`));
  on(w, 'death', (k) => seen.push(`death:${k.unit.key}:${k.reason}:${k.killer?.key ?? null}`));
  slime.hp = 1;
  after(w, 1, () => dealDamage(w, guard, slime, { type: 'phys', amount: 50 }));
  step(w, c);
  step(w, c);
  guard.hp = 1;
  after(w, 1, () => dealDamage(w, null, guard, { type: 'true', amount: 5 }));
  step(w, c);
  step(w, c);
  assert.deepEqual(seen, ['kill:guard>slime', 'death:slime:killed:guard', 'death:guard:killed:null']);
});

test('[钩子-3] heal: a handler may change the amount, before the maximum HP caps it', () => {
  const { w, guard } = field();
  guard.hp = 500;
  on(w, 'heal', (k) => { k.amount = k.amount === 7 ? Number.NaN : k.amount * 2; });
  assert.equal(heal(w, guard, guard, 100), 200);
  assert.equal(heal(w, guard, guard, 7), 0, 'not a number: nothing');
  assert.equal(heal(w, guard, guard, 1000), 300, 'up to the maximum');
});

test('[钩子-3] an attack’s hit is marked as one, not the skill’s', () => {
  const c = /** @type {any} */ (tinyContent());
  const w = createWorld(c, { seed: 1, players: 1 }), seen = /** @type {Record<string, unknown>[]} */ ([]);
  on(w, 'hit', (k) => { if (k.source?.key === 'guard') seen.push({ isAttack: k.dmg.isAttack, isSkill: k.dmg.isSkill, isSplash: k.dmg.isSplash, tags: k.dmg.tags }); });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 2 }]]);
  for (let i = 0; i < 200 && seen.length === 0; i++) step(w, c);
  assert.deepEqual(seen[0], { isAttack: true, isSkill: false, isSplash: undefined, tags: [] });
});

/**
 * The guard (ATK 50, 1 s) at (1, 1) facing right with a skill, and a rooted dummy (a billion HP, DEF 0) at (1, 2).
 * @param {Record<string, unknown>} skill
 */
function arena(skill) {
  const c = /** @type {any} */ (tinyContent());
  c.operators.guard.skill = { id: 'test', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 0, ammo: false, bb: {}, ...skill };
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = w.units[0], foe = makeEnemy(w, c, { key: 'slime', route: 0 });
  Object.assign(foe, { x: 2, y: 1, hp: 1e9, maxHp: 1e9, base: { ...foe.base, maxHp: 1e9, def: 0 } });
  applyStatus(foe, 'root', {});
  w.units.push(foe);
  return { c, w, guard, foe };
}

test('[钩子-3] skillStart and skillEnd, with why: started by hand or on its own, closed, its time out, at once, leaving', () => {
  const a = arena({ cost: 1, init: 1, duration: 1, stoppable: true }), seen = /** @type {string[]} */ ([]);
  on(a.w, 'skillStart', (k) => seen.push(`start:${k.reason}`));
  on(a.w, 'skillEnd', (k) => seen.push(`end:${k.reason}`));
  on(a.w, 'death', (k) => seen.push(`death:${k.reason}`));
  const cast = () => step(a.w, a.c, [[0, { type: 'skill', unit: a.guard.id }]]);
  const charge = () => { for (let i = 0; i < 31 && a.guard.skill?.sp === 0; i++) step(a.w, a.c); };
  cast();
  for (let i = 0; i < 31; i++) step(a.w, a.c);
  charge();
  cast();
  cast();
  charge();
  cast();
  step(a.w, a.c, [[0, { type: 'retreat', unit: a.guard.id }]]);
  const b = arena({ type: 'AUTO', cost: 1, init: 0, bb: { cost: 1 } });
  on(b.w, 'skillStart', (k) => seen.push(`b:start:${k.reason}`));
  on(b.w, 'skillEnd', (k) => seen.push(`b:end:${k.reason}`));
  for (let i = 0; i < 31; i++) step(b.w, b.c);
  assert.deepEqual(seen, ['start:manual', 'end:duration', 'start:manual', 'end:stopped', 'start:manual', 'end:death', 'death:retreat', 'b:start:auto', 'b:end:instant']);
});

test('[钩子-3] beforeAttack as an attack locks its targets: handlers may change them; none left, no attack, the cooldown runs', () => {
  const a = arena({}), seen = /** @type {string[]} */ ([]);
  let mode = 'none';
  const other = makeEnemy(a.w, a.c, { key: 'slime', route: 0 });
  Object.assign(other, { x: 4, y: 1, hp: 500, maxHp: 500, base: { ...other.base, maxHp: 500 } });
  applyStatus(other, 'root', {});
  a.w.units.push(other);
  on(a.w, 'beforeAttack', (k) => {
    seen.push(`before@${a.w.frame}:${k.targets.map((/** @type {any} */ t) => t.id).join(',')}`);
    if (mode === 'none') k.targets = []; else k.targets.push(other);
  });
  on(a.w, 'attack', (k) => seen.push(`attack@${a.w.frame}:${k.targets.map((/** @type {any} */ t) => t.id).join(',')}`));
  for (let i = 0; i < 31; i++) step(a.w, a.c);
  mode = 'more';
  for (let i = 0; i < 31; i++) step(a.w, a.c);
  const f = Number(seen[0].split(/[@:]/)[1]), id = a.foe.id;
  assert.deepEqual(seen, [`before@${f}:${id}`, `before@${f + 30}:${id}`, `before@${f + 60}:${id}`, `attack@${f + 60}:${id},${other.id}`],
    'cleared: no attack, the next a whole interval later; added: hit too');
  assert.equal(other.hp, 460, 'the target a handler added took the hit (50 − DEF 10), out of range');
});

test('[钩子-3] beforeStatus: a handler may cancel a status, change its frames or its strength', () => {
  const { w, guard, foe } = arena({}), seen = /** @type {string[]} */ ([]);
  on(w, 'beforeStatus', (k) => {
    seen.push(`${k.status}:${k.frames}:${k.strength ?? '-'}:${k.source?.key ?? null}`);
    if (k.status === 'sleep') k.cancel = true;
    if (k.status === 'stun') k.frames *= 2;
    if (k.status === 'fragile') k.strength = 0.5;
  });
  assert.equal(inflict(w, foe, 'sleep', { seconds: 1, src: guard }), null);
  assert.equal(inflict(w, foe, 'stun', { seconds: 1, src: guard })?.left, 60);
  assert.equal(inflict(w, foe, 'fragile', { seconds: 1, value: 0.2 })?.value, 0.5);
  assert.deepEqual(seen, ['sleep:30:-:guard', 'stun:30:-:guard', 'fragile:30:0.2:null']);
});

test('[钩子-3] enter: an operator or a summon on the field, before its passive skill starts and before deploy', () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.guard.skill = { id: 'p', type: 'PASSIVE', sp: 'none', cost: 0, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };
  c.operators.shadow = { ...c.operators.sniper, position: 'MELEE', summoner: 'guard', summon: { deployLimit: 1, holdLimit: 1, supply: 0, occupy: 0, respawn: 'default' } };
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {string[]} */
  const seen = [];
  for (const name of ['enter', 'skillStart', 'deploy']) on(w, name, (k) => { seen.push(`${name} ${k.unit.key} ${k.unit.skill?.active ?? '-'}`); });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  assert.deepEqual(seen, ['enter guard false', 'skillStart guard true', 'deploy guard true']);
  seen.length = 0;
  summonsApi.spawnSummon(w, c, /** @type {any} */ (w.units.find((u) => u.key === 'guard')), 'shadow', { row: 1, col: 3 });
  assert.deepEqual(seen, ['enter shadow -', 'deploy shadow -']);
});
