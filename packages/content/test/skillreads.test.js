// What a skill's description says of its attacks and of the skill itself (docs/spec/skills.md 技能-4, 技能-9), on real skills at skill
// level 7 and on descriptions made for the shapes: boomerangs thrown, the damage type, a trait's reduction lifted, a passive skill's
// seconds, a bonus that wears off, the 蓄力 part.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillDefOf, loadTraining, operatorAt } from '../src/index.js';

/** @type {Record<string, any>} */
const LEVELS = JSON.parse(readFileSync(new URL('fixtures/skill-levels.json', import.meta.url), 'utf8'));

/** A real operator's skill (0-based slot) at its highest elite, skill level 7. @param {string} id @param {number} slot @returns {Promise<any>} */
async function defOf(id, slot) {
  const t = await loadTraining(id), op = operatorAt(t, { elite: t.phases.length - 1, level: 1, potential: 1, trust: 0, skill: slot, skillLevel: 7 });
  return /** @type {any} */ (op.skill);
}

/**
 * What a description made for a shape reads as: the blackboard from `bb`, a 20 s MANUAL skill (`over` changes the level).
 * @param {string} description @param {Record<string, number>} bb @param {Record<string, unknown>} [over]
 */
function read(description, bb, over = {}) {
  const level = { ...LEVELS['skcom_atk_up[3]'], description, blackboard: Object.entries(bb).map(([key, value]) => ({ key, value })), ...over };
  return skillDefOf('x', level);
}

test('[技能-9] hits for the boomerangs an attack throws: `cnt` is the number in all, 「额外发射1个」 included', async () => {
  for (const [id, slot] of [['char_4100_caper', 1], ['char_4138_narant', 2]]) {
    const def = await defOf(/** @type {string} */ (id), /** @type {number} */ (slot));
    assert.equal(def.extra.attack.times, def.bb.cnt, `${id} S${/** @type {number} */ (slot) + 1}`);
    assert.ok(def.bb.cnt >= 2);
  }
  assert.equal(read('每次攻击额外发射<@ba.vup>1</>个回旋投射物', { cnt: 2 }).extra?.attack?.times, 2, 'the 1 written is one more than the attack');
  assert.equal(read('每次攻击额外发射两个回旋投射物', {}).extra?.attack?.times, 3, 'with no `cnt`: the attack and the two');
  assert.equal(read('每次攻击发射{cnt}个回旋投射物（每个造成相当于攻击力{attack@atk_scale:0%}的物理伤害）', { cnt: 3, 'attack@atk_scale': 1 }).extra?.attack?.times, 3);
  assert.equal(read('回旋投射物命中后会继续附着目标，并额外斩击目标4次', { cnt: 3 }).extra?.attack?.times, undefined, 'a clause of another shape');
});

test('[技能-9] the damage type of the skill\'s attacks: 法术 or 真实 or 物理, for a passive skill too; for the enemies it blocks', async () => {
  /** @type {[string, number, string | undefined, string | undefined][]} */
  const rows = [
    ['char_002_amiya', 2, 'true', undefined], // 伤害类型变为真实
    ['char_1019_siege2', 2, 'true', undefined], // 攻击时伤害类型变为真实
    ['char_4179_monstr', 2, 'true', undefined], // …，伤害类型变为真实
    ['char_283_midn', 0, 'arts', undefined], // 普通攻击的伤害类型变为法术
    ['char_294_ayer', 1, 'arts', undefined], // 伤害类型变为法术；…
    ['char_337_utage', 1, 'arts', undefined], // 被动：伤害类型变为法术
    ['char_2013_cerber', 2, 'phys', undefined], // 伤害类型变为物理
    ['char_2023_ling', 1, undefined, undefined], // 被动：召唤物可部署在远程位，攻击造成法术伤害: the summons' attack, not hers
    ['char_2023_ling', 0, undefined, undefined], // 召唤物伤害类型变为法术
    ['char_1014_nearl2', 2, undefined, 'true'], // 攻击自身与"耀阳"阻挡的单位时伤害类型变为真实
    ['char_003_kalts', 2, undefined, undefined], // Mon3tr 的伤害类型，不是这名干员的攻击
  ];
  for (const [id, slot, type, typeBlocked] of rows) {
    const a = (await defOf(id, slot)).extra?.attack;
    assert.deepEqual([a?.type, a?.typeBlocked], [type, typeBlocked], `${id} S${slot + 1}`);
  }
});

test('[技能-9] the damage type of a description made for the shape: a sentence about another unit is not the operator\'s', () => {
  /** @type {[string, Record<string, number>, string | undefined, string][]} */
  const rows = [
    ['普通攻击造成真实伤害', {}, 'true', 'the shape'],
    ['每次造成相当于攻击力{atk_scale}的物理伤害', { atk_scale: 2 }, undefined, 'a sentence about the damage, not a change of the type'],
    ['被动：召唤物可部署在远程位，攻击造成法术伤害', {}, undefined, 'the subject is the summon'],
    ['Mon3tr的防御力+{def}，伤害类型变为真实', { def: 1 }, undefined, 'the subject is Mon3tr'],
    ['自身与召唤物攻击力+{atk}，普通攻击造成法术伤害', { atk: 1 }, 'arts', 'the operator is the subject: 自身与召唤物 starts with it'],
    ['召唤物攻击力+{atk}。普通攻击造成法术伤害', { atk: 1 }, 'arts', 'the next sentence has a subject of its own'],
  ];
  for (const [text, bb, type, why] of rows) assert.equal(read(text, bb).extra?.attack?.type, type, why);
});

test('[职业-8] [技能-9] a skill that says its attacks are not lowered lifts the trait\'s reduction; 断崖’s 一技能 by its PRTS remark; 惊蛰 the chain\'s', async () => {
  const lifted = ['char_140_whitew:1', 'char_194_leto:1', 'char_271_spikes:1', 'char_293_thorns:2', 'char_4067_lolxh:1', 'char_4082_qiubai:2', 'char_617_sharp2:0', 'char_294_ayer:0'];
  for (const r of lifted) {
    const [id, slot] = r.split(':');
    assert.equal((await defOf(id, +slot)).extra.flags?.noUnblockedScale, true, r);
  }
  assert.equal((await defOf('char_306_leizi', 1)).extra.flags?.noChainDecay, true);
  assert.equal((await defOf('char_306_leizi', 1)).extra.flags?.noUnblockedScale, undefined, 'the jump is not the trait\'s 倍率');
  assert.equal((await defOf('char_294_ayer', 1)).extra?.flags?.noUnblockedScale, undefined, 'only the skill with the remark: 浮游刃启动 has none');
  assert.equal(read('攻击力+{atk:0%}，远程攻击不再降低攻击力', { atk: 0.5 }).extra?.flags?.noUnblockedScale, true);
});

test('[技能-4] a passive skill whose description gives its seconds runs that long; one that gives them to the targets or to a barrier does not', async () => {
  /** @type {[string, number][]} */
  const timed = [['char_337_utage', 1], ['char_263_skadi', 1], ['char_237_gravel', 0], ['char_214_kafka', 0], ['char_214_kafka', 1], ['char_1502_crosly', 1], ['char_250_phatom', 0]];
  for (const [id, slot] of timed) {
    const def = await defOf(id, slot);
    assert.equal(def.type, 'PASSIVE');
    assert.equal(def.duration, def.bb.duration, `${id} S${slot + 1}`);
    assert.ok(def.duration > 0);
  }
  for (const r of ['char_215_mantic:0', 'char_237_gravel:1', 'char_355_ethan:0']) assert.ok(!((await defOf(r.split(':')[0], +r.split(':')[1])).duration > 0), r);
  assert.equal(read('部署后{duration}秒内攻击力+{atk:0%}', { duration: 12, atk: 1 }, { skillType: 'PASSIVE', duration: -1 }).duration, 12);
  assert.equal(read('部署后{duration}秒内攻击力+{atk:0%}', { duration: 12, atk: 1 }, { skillType: 'MANUAL', duration: -1 }).duration, -1, 'only a passive skill');
  assert.equal(read('攻击力+{atk:0%}', { duration: 12, atk: 1 }, { skillType: 'PASSIVE', duration: -1 }).duration, -1, 'the description gives no seconds');
});

test('[技能-4] a bonus that wears off over the skill\'s seconds: 砾\'s 影袭 decays its 防御, a skill that only says 「持续衰减」 of a barrier does not', async () => {
  const gravel = await defOf('char_237_gravel', 0);
  assert.deepEqual(gravel.extra.decay, { seconds: gravel.bb.duration, keys: ['def'] });
  assert.equal((await defOf('char_237_gravel', 1)).extra.decay, undefined, '鼠群 is a barrier (技能-14)');
  assert.equal(read('部署后{atk:0%}攻击力，在{duration}秒内持续衰减', { atk: 1 }).extra?.decay, undefined, 'no `duration` in the blackboard');
  assert.deepEqual(read('部署后防御力+{def:0%}，在{duration}秒内持续衰减', { def: 1, duration: 6 }).extra?.decay, { seconds: 6, keys: ['def'] });
  assert.equal(read('部署后防御力+{def}，在{duration}秒内持续衰减', { def: 40, duration: 6 }).extra?.decay, undefined, 'a number with no percent is a flat bonus, not the share that decays');
});

test('[技能-4] the 蓄力 part: the keys only it uses, and what a charged start adds', async () => {
  const roots = await defOf('char_426_billro', 1);
  assert.deepEqual(roots.charged.keys, ['atk', 'attack@root'], '沙缚镣锁: 攻击力+ and 束缚 only charged');
  assert.deepEqual(roots.charged.attack.hitStatus, { key: 'root', seconds: roots.bb['attack@root'] });
  assert.equal(roots.extra.attack.hitStatus.key, 'sluggish', 'the plain skill\'s 停顿 stays');
  assert.deepEqual((await defOf('char_426_billro', 0)).charged.keys, [], 'a part with no key of its own');
  const long = await defOf('char_486_takila', 1);
  assert.deepEqual([long.charged.seconds, long.charged.keys], [long.bb.enhance_duration, ['enhance_duration']], '持续时间延长为{enhance_duration}秒');
  assert.equal((await defOf('char_4081_warmy', 1)).charged.seconds, 30);
  const vvana = await defOf('char_4098_vvana', 0);
  assert.deepEqual([vvana.charged.attack.times, vvana.charged.mods], [3, { rangeExtend: 2 }], '改为连续攻击三次，攻击距离+2');
  const judge = await defOf('char_4065_judge', 0);
  assert.deepEqual([judge.charged.attack.scale, judge.charged.attack.hitStatus], [judge.bb['judge_s_1_enhance_checker.atk_scale'], { key: 'stun', seconds: judge.bb.stun }]);
  assert.equal((await defOf('char_1013_chen2', 1)).charged.ammo, 'attack@another_trigger_time', '改为{…}发弹药');
  assert.equal((await defOf('char_426_billro', 1)).bb.atk, roots.bb.atk, 'the record keeps its blackboard whole');
  assert.equal((await defOf('char_4100_caper', 1)).charged, undefined, 'a skill without the tag has no 蓄力 part');
});
