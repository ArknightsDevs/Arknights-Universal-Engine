// Operators at a training (docs/spec/operators.md) on the real training data: the skeleton's operator again, levels in
// between, trust, potentials, skill levels and unlocks, trait candidates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTraining, operatorAt, skeletonContent, ROSTER } from '../src/index.js';
import { traitAt } from '../src/operators.js';
import { talentsAt, alwaysOn } from '../src/talents.js';

/** @typedef {import('../src/operators.js').Build} Build */
const build = (/** @type {Partial<Build>} */ b = {}) => ({ elite: 0, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1, ...b });

test('[干员-1] [干员-2] 米格鲁 at elite 0, max level, skill level 4 is the skeleton\'s operator', async () => {
  const t = await loadTraining('char_122_beagle');
  const op = /** @type {Record<string, unknown>} */ (operatorAt(t, build({ level: 40, skillLevel: 4 }))), sk = /** @type {Record<string, unknown>} */ (skeletonContent.operators.char_122_beagle);
  for (const k of ['name', 'position', 'maxHp', 'atk', 'def', 'res', 'cost', 'blockCnt', 'baseAttackTime', 'respawnTime', 'range', 'skill', 'trait', 'branch', 'profession']) assert.deepEqual(op[k], sk[k], k);
  assert.deepEqual([op.aspd, op.tauntLevel, op.massLevel], [100, 0, 0]);
  assert.equal(ROSTER.char_122_beagle.name, '米格鲁');
});

test('[干员-1] levels in between are linear and not rounded; trust adds up to 100 %; potentials add their modifiers', async () => {
  const t = await loadTraining('char_122_beagle');
  const [lo, hi] = t.phases[0].frames;
  const mid = operatorAt(t, build({ level: 20 }));
  assert.equal(mid.maxHp, lo.stats.maxHp + (hi.stats.maxHp - lo.stats.maxHp) * (19 / 39));
  const fav = /** @type {NonNullable<typeof t.favor>} */ (t.favor);
  assert.equal(operatorAt(t, build({ trust: 50 })).def - operatorAt(t, build()).def, fav.stats.def * 0.5);
  assert.equal(operatorAt(t, build({ trust: 200 })).def, operatorAt(t, build({ trust: 100 })).def, 'capped at 100 %');
  assert.equal(operatorAt(t, build({ level: 99 })).maxHp, hi.stats.maxHp, 'the level is capped at the phase\'s maximum');
  const p6 = operatorAt(t, build({ potential: 6 })), p1 = operatorAt(t, build());
  const sum = (/** @type {string} */ k) => t.potentials.reduce((n, p) => n + (p[k] ?? 0), 0);
  assert.deepEqual([p6.cost - p1.cost, p6.atk - p1.atk, (p6.respawnTime ?? 0) - (p1.respawnTime ?? 0)], [sum('cost'), sum('atk'), sum('respawnTime')]);
});

test('[干员-2] a skill at its level, 专精 as 8–10, capped at its last; locked skills and missing phases refused; no skill', async () => {
  const t = await loadTraining('char_002_amiya');
  const s3 = operatorAt(t, build({ elite: 2, level: 1, skill: 2, skillLevel: 10 })).skill, s7 = operatorAt(t, build({ elite: 2, level: 1, skill: 2, skillLevel: 7 })).skill;
  assert.ok(s3 && s7 && s3.id === s7.id && s3.cost <= s7.cost, 'mastery 3 costs no more than level 7');
  assert.deepEqual(operatorAt(t, build({ elite: 2, skill: 2, skillLevel: 99 })).skill, s3);
  assert.throws(() => operatorAt(t, build({ skill: 2 })), /not unlocked at elite 0/);
  assert.throws(() => operatorAt(t, build({ elite: 3 })), /no elite phase 3/);
  assert.equal(operatorAt(t, build({ skill: -1 })).skill, undefined);
  await assert.rejects(loadTraining('char_nope'), /no operator char_nope/);
});

test('[干员-3] the trait blackboard of the last candidate unlocked by elite, level and potential', async () => {
  const t = await loadTraining('char_1030_noirc2');
  assert.deepEqual([0, 1, 2].map((elite) => traitAt(t, build({ elite })).value), [30, 50, 70]);
  const made = { ...t, traits: [{ phase: 0, level: 1, potential: 0, bb: { v: 1 } }, { phase: 0, level: 30, potential: 0, bb: { v: 2 } }, { phase: 0, level: 1, potential: 3, bb: { v: 3 } }] };
  assert.deepEqual([traitAt(made, build({ level: 29 })).v, traitAt(made, build({ level: 30 })).v, traitAt(made, build({ level: 30, potential: 4 })).v], [1, 2, 3]);
  assert.deepEqual(traitAt({ ...t, traits: [] }, build({})), {});
  assert.deepEqual(traitAt(made, build({ elite: 1, level: 1 })).v, 2, 'a lower phase is unlocked whatever its level');
});

test('[干员-6] each talent\'s last candidate unlocked; an always-on one reads as the operator\'s own attributes only', async () => {
  const angel = await loadTraining('char_103_angel');
  assert.deepEqual(talentsAt(angel, build()).length, 0, 'none unlocked at elite 0');
  assert.deepEqual(talentsAt(angel, build({ elite: 2, potential: 3 })).map((c) => c.bb.attack_speed ?? c.bb.atk), [15, 0.06]);
  assert.deepEqual(operatorAt(angel, build({ elite: 2, potential: 6 })).talentBb, { attack_speed: 15 }, '天使的祝福 also blesses another unit: not always on');
  const winter = await loadTraining('char_115_headbr'), e0 = operatorAt(winter, build());
  assert.deepEqual([operatorAt(winter, build({ elite: 1 })).cost, e0.cost, e0.talentBb], [winter.phases[1].frames[0].stats.cost - 1, winter.phases[0].frames[0].stats.cost, undefined],
    '自身部署费用-1 (elite 1) folds into the cost');
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb, hidden = false) => alwaysOn({ phase: 0, level: 1, potential: 0, name: 'x', description, rangeId: null, bb, hidden, token: null });
  assert.deepEqual([
    c('生命上限和防御力各+12%', { max_hp: 0.12, def: 0.12 }), c('攻击力+8%<@ba.talpu>（+2%）</>，攻击速度+8', { atk: 0.08, attack_speed: 8 }),
    c('自身再部署时间-15秒', { respawn_time: -15, cost: 0 }), c('自身的技力自然回复速度+0.3/秒', { sp_recovery_per_sec: 0.3 }),
  ], [true, true, true, true]);
  assert.deepEqual([
    c('攻击力+8%', { atk: 0.08, prob: 0.1 }), c('攻击力+8%，攻击变为弱点伤害', { atk: 0.08 }), c('攻击速度+6', { atk: 0.06 }),
    c('攻击力+8%', { atk: 0.08 }, true), c('在场时，所有友方【医疗】职业干员攻速+6', { attack_speed: 6 }),
  ], [false, false, false, false, false]);
});
