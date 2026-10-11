// Branch traits of the official content (docs/spec/traits.md 职业-7): the covered branches are real ones
// (test/fixtures/branches.json, from character_table), operator records take their branch's damage type and trait, an
// uncovered branch takes the defaults; covered traits play out in the simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step, traits, attrs } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { BRANCHES, coveredBranch, withTrait, skeletonContent, loadTraining, operatorAt } from '../src/index.js';

/** @type {Record<string, { name: string, profession: string, position: string[] }>} */
const ALL = JSON.parse(readFileSync(new URL('fixtures/branches.json', import.meta.url), 'utf8')).branches;

test('[职业-7] the covered branches are 46 of the 72 official ones', () => {
  assert.equal(Object.keys(ALL).length, 72);
  for (const b of Object.keys(BRANCHES)) assert.ok(Object.hasOwn(ALL, b), b);
  assert.equal(Object.keys(BRANCHES).length, 46);
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

/** A real operator of the branch at elite 0, level 1. @param {string} id */
const real = async (id) => operatorAt(await loadTraining(id), { elite: 0, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 });

test('[职业-7] 情报官 and 伏击客 from the real data: 可对空 / all enemies in range, no priority for the blocked, half dodged', async () => {
  const agent = traits.traitOfDef(await real('char_4017_puzzle'));
  assert.deepEqual([agent.antiAir, agent.blockedFirst, agent.targets], [true, false, 1]);
  const stalker = await real('char_215_mantic'), t = traits.traitOfDef(stalker);
  assert.deepEqual([t.filter, t.targets, t.blockedFirst, t.mods], ['ALL', 'all', false, { dodgePhys: 0.5, dodgeArts: 0.5 }]);
  assert.equal(stalker.tauntLevel, -1, '嘲讽等级 -1 is in the operator data, not added by the trait');
});

test('[职业-7] 本源术师 and 巫役 from the real data deal arts damage; the 本源 melee and 执旗手 take the defaults', async () => {
  for (const id of ['char_1040_blaze2', 'char_1042_phatm2']) assert.equal((await real(id)).dmgType, 'arts', id);
  for (const id of ['char_4187_graceb', 'char_2026_yu', 'char_151_myrtle']) {
    const op = await real(id);
    assert.equal(op.dmgType, undefined, id);
    assert.deepEqual(traits.traitOfDef(op), { ...traits.defaultTrait('MELEE'), bb: op.trait?.bb ?? {} }, id);
  }
});

test('[职业-7] [职业-8] 炮手, 扩散术师, 撼地者, 投掷手, 教官 and 领主 from the real data', async () => {
  const t = async (/** @type {string} */ id) => traits.traitOfDef(await real(id));
  assert.deepEqual((await t('char_113_cqbw')).splash, { radius: 1, scale: 1, ground: false });
  const f12 = await real('char_1011_lava2');
  assert.deepEqual([f12.dmgType, traits.traitOfDef(f12).splash], ['arts', { radius: 1.1, scale: 1, ground: false }]);
  assert.deepEqual((await t('char_1051_headb2')).splash, { radius: 1, scale: 0.5, ground: false });
  const greyy = await t('char_1027_greyy2');
  assert.deepEqual([greyy.antiAir, greyy.splash, greyy.aftershock], [false, { radius: 0.9, scale: 1, ground: true }, 0.5]);
  assert.equal((await t('char_130_doberm')).unblockedScale, 1.2);
  const lap = await t('char_140_whitew');
  assert.deepEqual([lap.antiAir, lap.blockedFirst, lap.unblockedScale], [true, true, 0.8]);
});

test('[职业-7] [职业-9] 武者, 收割者 and 不屈者 from the real data: no ally heals them; the first two heal themselves', async () => {
  const t = async (/** @type {string} */ id) => traits.traitOfDef(await real(id));
  const helage = await t('char_188_helage');
  assert.deepEqual([helage.flags, helage.selfHeal, helage.selfHealMax], [{ noAllyHeal: true }, 30, Infinity]);
  const excu2 = await t('char_1032_excu2');
  assert.deepEqual([excu2.flags, excu2.selfHeal, excu2.selfHealMax, excu2.targets], [{ noAllyHeal: true }, 50, 'blockCnt', 'all']);
  assert.deepEqual((await t('char_163_hpsts')).flags, { noAllyHeal: true });
});

test('[职业-7] [职业-10] the upkeep branches from the real data: 行商, 怪杰, 决战者, 推击手, 钩索师, 驭法铁卫', async () => {
  const [merchant, geek, duelist, pusher, hook, arts] = await Promise.all(['char_1033_swire2', 'char_1041_angel2', 'char_416_zumama', 'char_241_panda', 'char_173_slchan', 'char_1044_hsgma2']
    .map(async (id) => traits.traitOfDef(await real(id))));
  assert.deepEqual([merchant.refund, merchant.costDrain], [0, { every: 3, cost: 3 }]);
  assert.equal(geek.hpDrain, 0.01);
  assert.deepEqual([duelist.flags, duelist.immuneBlocking], [{ noSp: true }, ['noSp']]);
  assert.deepEqual([pusher.targets, pusher.rangedTiles, hook.antiAir, hook.rangedTiles, arts.skillArts], ['blockCnt', true, true, true, true]);
});
