// The attack multiplier of a running skill (docs/spec/skills.md 技能-5): the key content names (`scaleKey`, `''` for none),
// else `attack@atk_scale`, else the plain `atk_scale` a claim did not take.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { attackMods, skillMods } from '../src/skills.js';
import { statsOf } from '../src/attrs.js';
import { makeEnemy } from '../src/units.js';

/** @typedef {import('../src/types.js').SkillDef} SkillDef */

test('[技能-5] skillMods: the key content names; none; attack@atk_scale before the plain one; a claimed plain one is left', () => {
  const bb = { atk_scale: 0.4, 'attack@atk_scale': 1.5, 'attack@atk_scale_s2': 3.5, times: 2 };
  assert.equal(skillMods(bb, undefined, 'attack@atk_scale_s2').scale, 3.5, 'a key content names');
  assert.equal(skillMods(bb, undefined, 'atk_scale').scale, 0.4, 'even the plain one');
  assert.equal(skillMods(bb, undefined, '').scale, 1, 'none: the attacks keep 1');
  assert.equal(skillMods(bb, undefined, 'missing').scale, 1, 'a key the blackboard does not have');
  assert.equal(skillMods(bb).scale, 1.5, 'attack@ before the plain one');
  assert.equal(skillMods({ atk_scale: 0.4 }).scale, 0.4, 'a plain one alone');
  assert.equal(skillMods({ atk_scale: 0.4 }, 'attack').scale, 1, 'claimed by 技能-14');
  assert.equal(skillMods(bb, 'attack').scale, 1.5);
  assert.deepEqual([skillMods(bb).times, skillMods(bb).targets, skillMods(bb).skill], [2, 1, true], 'the rest as before');
});

/** The tiny level with a guard that has `skill`, started; one enemy beside it. @param {Partial<SkillDef>} skill */
function started(skill) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.baseAttackTime = 1;
  c.operators.guard.skill = { id: 't', type: 'MANUAL', sp: 'time', cost: 5, init: 5, charges: 1, duration: 20, ammo: false, bb: {}, ...skill };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = 2; e.y = 1; e.base = { ...e.base, maxHp: 1e9, def: 0, res: 0, moveSpeed: 0, atk: 0 }; e.hp = 1e9; e.maxHp = 1e9;
  w.units.push(e);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  return { w, c, op, e };
}

test('[技能-5] a running skill\'s attack hits for the named key; a key content leaves out does not scale it', () => {
  const key = started({ bb: { atk_scale: 0.4, 'attack@atk_scale_s3': 2.5 }, extra: { scaleKey: 'attack@atk_scale_s3' } });
  assert.equal(attackMods(key.w, key.c, key.op).scale, 2.5);
  const none = started({ bb: { atk_scale: 0.4 }, extra: { scaleKey: '' } });
  assert.equal(attackMods(none.w, none.c, none.op).scale, 1);
  const old = started({ bb: { atk_scale: 0.4 } });
  assert.equal(attackMods(old.w, old.c, old.op).scale, 0.4, 'a skill content says nothing of: as before');
  for (const x of [key, none]) {
    const before = x.e.hp;
    for (let i = 0; i < 60 && x.e.hp === before; i++) step(x.w, x.c, []);
    assert.equal(before - x.e.hp, statsOf(x.op).atk * (x === key ? 2.5 : 1), x === key ? 'the hit' : 'a plain hit');
  }
});
