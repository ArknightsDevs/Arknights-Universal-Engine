// What content may set on the field's units (攻击-1, 状态-2, 技能-4) on the tiny level. Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, reachKeys, setExtraRange, buffs, skills, attrs } from '../src/index.js';

const c = /** @type {any} */ (tinyContent());
c.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: true, bb: { 'attack@trigger_time': 5 } };
const fresh = () => {
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return { w, guard: /** @type {any} */ (w.units.find((u) => u.key === 'guard')) };
};

test('[攻击-1] content gives an operator extra tiles its attack reaches, kept until set again; off-map ones are left out', () => {
  const { guard } = fresh();
  assert.deepEqual([...reachKeys(c, guard)].sort((a, b) => a - b), [8, 9]);
  setExtraRange(c, guard, [0, 17, 9, 0, 99, -1, 2.5]);
  assert.deepEqual([...reachKeys(c, guard)].sort((a, b) => a - b), [0, 8, 9, 17]);
  setExtraRange(c, guard, null);
  assert.deepEqual([[...reachKeys(c, guard)].sort((a, b) => a - b), guard.reachExtra], [[8, 9], undefined]);
});

test('[状态-2] content sets a buff\'s layers within 1 and its maximum; the HP keeps its ratio', () => {
  const { guard } = fresh();
  const b = buffs.makeBuff({ key: 'hp', rule: 'stack', maxStacks: 3, mods: { hpPct: 0.5 } });
  buffs.addBuff(guard, b);
  const hp = guard.hp;
  buffs.setStacks(guard, b, 3);
  assert.deepEqual([b.stacks, attrs.statsOf(guard).maxHp, guard.hp], [3, 2500, hp * 2500 / 1500]);
  buffs.setStacks(guard, b, 9);
  assert.equal(b.stacks, 3);
  buffs.setStacks(guard, b, 0);
  assert.equal(b.stacks, 1);
});

test('[技能-4] content sets the shots a running ammo skill has left, at least 0; not while it does not run', () => {
  const { w, guard } = fresh();
  skills.setAmmo(guard.skill, 7);
  assert.equal(guard.skill.ammo, 0, 'not running');
  step(w, c, [[0, { type: 'skill', unit: guard.id }]]);
  assert.deepEqual([guard.skill.active, guard.skill.ammo], [true, 5]);
  skills.setAmmo(guard.skill, 7.4);
  assert.equal(guard.skill.ammo, 7);
  skills.setAmmo(guard.skill, -2);
  assert.equal(guard.skill.ammo, 0);
});
