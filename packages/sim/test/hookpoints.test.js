// The events on the way of damage and healing (docs/spec/hooks.md 钩子-3, damage.md 伤害-7, 伤害-11): hit before the
// defences, dodge, hpDamage, fatal, damaged, heal; kill and the killer at the frame's end; where an attack's hit comes from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { on, after } from '../src/bus.js';
import { dealDamage, heal } from '../src/damage.js';
import { makeOperator, makeEnemy } from '../src/units.js';
import { makeBuff, addBuff } from '../src/buffs.js';

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
