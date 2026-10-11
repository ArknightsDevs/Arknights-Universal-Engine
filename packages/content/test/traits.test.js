// Branch traits of the official content (docs/spec/traits.md 职业-7): the covered branches are real ones
// (test/fixtures/branches.json, from character_table), operator records take their branch's damage type and trait, an
// uncovered branch takes the defaults; covered traits play out in the simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step, traits, attrs } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { BRANCHES, coveredBranch, withTrait, skeletonContent } from '../src/index.js';

/** @type {Record<string, { name: string, profession: string, position: string[] }>} */
const ALL = JSON.parse(readFileSync(new URL('fixtures/branches.json', import.meta.url), 'utf8')).branches;

test('[职业-7] the covered branches are 24 of the 72 official ones', () => {
  assert.equal(Object.keys(ALL).length, 72);
  for (const b of Object.keys(BRANCHES)) assert.ok(Object.hasOwn(ALL, b), b);
  assert.equal(Object.keys(BRANCHES).length, 24);
  assert.ok(coveredBranch('fastshot') && !coveredBranch('mystic') && !coveredBranch('toString'));
});

test('[职业-7] an operator record takes its branch\'s damage type and trait; the blackboard moves into the trait', () => {
  const base = { name: 'x', position: 'MELEE', cost: 9, blockCnt: 1, baseAttackTime: 1, maxHp: 1, atk: 1, def: 0, res: 0, range: [] };
  const charger = withTrait({ ...base, branch: 'charger', traitBb: { cost: 1 } });
  assert.deepEqual(charger.trait, { killCost: 1, refund: 1, bb: { cost: 1 } });
  assert.equal('traitBb' in charger, false);
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'corecaster' }).dmgType, 'arts');
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'slower', traitBb: { sluggish: 0.8 } }).trait?.hitStatus, { key: 'sluggish', seconds: 0.8 });
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'ringhealer' }).trait, { heal: true, targets: 3, bb: {} });
  const mystic = withTrait({ ...base, position: 'RANGED', branch: 'mystic', traitBb: { times: 3 } });
  assert.equal(mystic.trait, undefined, 'not covered: the position\'s defaults');
  assert.deepEqual(traits.traitOfDef(mystic).antiAir, true);
});

test('[职业-7] the skeleton\'s operators carry their branches: 铁卫, 尖兵, 速射手', () => {
  const ops = skeletonContent.operators;
  assert.deepEqual(['char_500_noirc', 'char_502_nblade', 'char_503_rang'].map((k) => [ops[k].branch, ops[k].respawnTime]), [['protector', 70], ['pioneer', 70], ['fastshot', 70]]);
  assert.equal(traits.traitOfDef(ops.char_503_rang).secondary, 'FLY_FIRST');
});

test('[职业-2] [职业-7] a 医师 from the table heals the wounded guard in the simulation', () => {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.medic = withTrait({ ...c.operators.sniper, branch: 'physician', atk: 200, range: [{ row: 0, col: 0 }, { row: -1, col: 0 }] });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'medic', row: 2, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  const guard = w.units[1];
  guard.hp = 500;
  const ev = step(w, c);
  assert.deepEqual(ev.filter((e) => e.type === 'heal').map((e) => [e.target, e.amount]), [[guard.id, 200]]);
  assert.equal(guard.hp, 700);
  assert.equal(attrs.statsOf(guard).maxHp, 1000);
});
