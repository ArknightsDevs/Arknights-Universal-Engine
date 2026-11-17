// What a skill's description hits the enemies around its operator with as it starts (docs/spec/skills.md 技能-16), and the next
// attacks that hit more than once (技能-9): real skill_table levels at skill level 7, the reader's limits on made-up levels,
// real skills run on the tiny level, and the rule for operators that fight by a kit (兼容-5).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, skills, sp, bus, attrs, buffs, KIND } from '@aue/sim';
import { loadKits, loadTraining, matchContent, operatorAt, skillDefOf, skeletonContent, ROSTER } from '../src/index.js';
import { TOKENS, loadToken } from '../src/tokens.js';
import { repeatOf } from '../src/repeats.js';

/** @typedef {import('../src/skills.js').SkillLevel} SkillLevel */

/** An operator's skill at elite 2, skill level 7. @param {string} id @param {number} skill */
async function at(id, skill) {
  return /** @type {any} */ (operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 7 }).skill);
}

/** A skill's strikes without their stored cells, which are counted: the reading is compared as plain data. @param {any} skill */
const strikes = (skill) => (skill.extra?.bursts ?? []).map((/** @type {any} */ { range, ...b }) => ({ ...b, ...(range ? { cells: range.length } : {}) }));

test('[技能-16] [技能-1] 崖心 S2 and 德克萨斯 S2 hit at once: the cells of the skill\'s range, how many, the farthest first for a pull, the status after; an instant skill', async () => {
  const [cliff, texas] = await Promise.all([at('char_173_slchan', 1), at('char_102_texas', 1)]);
  assert.deepEqual(strikes(cliff), [{
    at: 'start', scale: 1.7, type: 'true', where: 'cells', cells: 10, most: 2, order: 'farthest', status: [{ key: 'stun', seconds: 1.5 }], displace: { pull: true, force: 1 }, hold: 5,
  }], '立即将前方大范围内至多{max_target}个目标……拖拽至面前，对其造成相当于自己攻击力{atk_scale}的真实的伤害，并使其晕眩{stun}秒 in 3-14; the skill stays 5 s once it pulled (PRTS)');
  assert.deepEqual(strikes(texas), [{ at: 'start', scale: 1.35, type: 'arts', where: 'cells', cells: 13, times: 2, status: [{ key: 'stun', seconds: 2 }] }], '两次……并令击中目标晕眩');
  for (const s of [cliff, texas]) assert.deepEqual([s.instant, skills.kindOf(s), s.extra.hitScale], [true, 'instant', 'attack'], s.id);
  assert.equal(texas.bb.cost, 11, '立即获得{cost}点费用: an instant skill gives it (技能-5)');
});

test('[技能-16] the sentence shapes on real skills: attack range, a share of the 防御 ignored, the type left out, 飞行 doubled, a push along the facing, 寒冷', async () => {
  const [lionhd, shotst, apionr, cement, cutter, sqrrel, sbell2, gnosis, chen, rope] = await Promise.all([
    at('char_373_lionhd', 1), at('char_126_shotst', 1), at('char_513_apionr', 0), at('char_464_cement', 0), at('char_301_cutter', 1), at('char_277_sqrrel', 1),
    at('char_1046_sbell2', 0), at('char_206_gnosis', 1), at('char_010_chen', 1), at('char_236_rope', 1),
  ]);
  assert.deepEqual(strikes(lionhd), [{ at: 'start', scale: 2, type: 'arts', where: 'attack', debuff: { seconds: 6, mods: { resPct: -0.12 } } }], '莱恩哈特 S2: 法术抗性-12% for 6 s, a share');
  assert.deepEqual(strikes(shotst), [{ at: 'start', scale: 1.7, type: 'phys', where: 'attack', most: 5, debuff: { seconds: 5, mods: { defPct: -0.35 } } }], '流星 S2: 至多5个, written as a number');
  assert.deepEqual(strikes(apionr), [{ at: 'start', scale: 1.7, type: 'phys', where: 'cells', cells: 13, times: 8, ignoreDef: { pct: 0.5 } }], '郁金香 S1: {times}次连续斩击，无视目标{def_penetrate}防御力');
  assert.deepEqual(strikes(cement), [{ at: 'start', scale: 2.4, where: 'attack' }], '洋灰 S1: 「造成相当于{atk_scale}攻击力的伤害」, no type: the operator\'s own');
  assert.deepEqual(strikes(cutter), [{ at: 'start', scale: 3.8, type: 'phys', where: 'cells', cells: 13, most: 6, air: 2 }], '刻刀 S2: 对飞行单位的攻击力系数加倍');
  assert.deepEqual(strikes(sqrrel), [{ at: 'start', scale: 2.4, type: 'phys', where: 'attack', around: 1, displace: { pull: false, force: 2, along: true } }], '阿消 S2: PRTS says a projectile at the nearest ground enemy in the attack range, a splash of radius 1, not the 2 tiles of the text');
  assert.deepEqual(strikes(sbell2), [{ at: 'start', scale: 4.8, type: 'arts', where: 'attack', status: [{ key: 'cold', seconds: 3.5 }], displace: { pull: false, force: 1, along: true } }], '圣聆初雪 S1: 及{cold}秒寒冷并将其中等力度地朝部署方向推动');
  assert.deepEqual(strikes(gnosis), [{ at: 'start', scale: 1.6, type: 'arts', where: 'attack', first: true, status: [{ key: 'cold', seconds: 3 }] }], '灵知 S2: 造成{cold}秒寒冷和相当于……的法术伤害: the cold comes first');
  assert.deepEqual(strikes(chen), [{ at: 'start', scale: 4.1, type: 'arts', then: 'phys', where: 'cells', cells: 8, most: 6 }], '陈 S2: 对前方范围内最多{max_target}名敌人造成…的物理和相当于攻击力{atk_scale}的法术伤害 — two hits, 法术 first (PRTS 备注), flying ones too');
  assert.deepEqual(strikes(rope), [{ at: 'start', scale: 1.8, type: 'phys', where: 'cells', cells: 5, most: 2, order: 'farthest', displace: { pull: true, force: 1 }, hold: 5 }], '暗索 S2: 将远距离内两个敌人…拖拽至面前; held 5 s once it pulled (PRTS)');
  for (const s of [lionhd, shotst, apionr, cement, cutter, sqrrel, sbell2, gnosis, chen, rope]) assert.equal(skills.kindOf(s), 'instant', s.id);
  assert.deepEqual(lionhd.extra.mods, { resFlat: 0 }, 'the 法术抗性 the strike takes is not the operator\'s own');
});

test('[技能-16] a status for an enemy that already holds one: 忍冬 S2 stuns what was 停顿; 至多6名 and the cost it gains', async () => {
  const vulpis = await at('char_4026_vulpis', 1);
  assert.deepEqual(strikes(vulpis), [{
    at: 'start', scale: 2.45, type: 'arts', where: 'cells', cells: 8, most: 6, status: [{ key: 'sluggish', seconds: 4.5 }, { key: 'stun', seconds: 4.5, ifHas: 'sluggish' }],
  }]);
  assert.equal(skills.kindOf(vulpis), 'instant');
});

test('[技能-16] at the start of a skill that keeps running: statuses and debuffs on the burst, not on each attack; 两次; a sentence for some of the enemies only is left', async () => {
  const [texas2s2, texas2s3, red, waaifu, accast, misery, yu, phantom] = await Promise.all([
    at('char_1028_texas2', 1), at('char_1028_texas2', 2), at('char_144_red', 1), at('char_243_waaifu', 1), at('char_612_accast', 2), at('char_615_acspec', 2),
    at('char_2026_yu', 1), at('char_250_phatom', 2),
  ]);
  assert.deepEqual(strikes(texas2s2), [{ at: 'start', scale: 1.8, type: 'arts', where: 'cells', cells: 9, debuff: { seconds: 10, mods: { resPct: -0.2 } } }], '缄默德克萨斯 S2: {debuff_duration}秒内法术抗性-');
  assert.deepEqual(texas2s2.extra.mods, { resFlat: 0 }, '…which is not her own 法术抗性');
  assert.deepEqual(strikes(texas2s3)[0], { at: 'start', scale: 1.3, type: 'arts', where: 'cells', cells: 9, times: 2, status: [{ key: 'stun', seconds: 1.5 }] }, 'S3: 两次……{appear.atk_scale}……{appear.stun}');
  assert.deepEqual(strikes(red), [{ at: 'start', scale: 2, type: 'phys', where: 'cells', cells: 5, ground: true, status: [{ key: 'stun', seconds: 2 }] }], '红 S2: 不可对空 (PRTS)');
  assert.deepEqual(strikes(waaifu), [{ at: 'start', scale: 2.4, type: 'phys', where: 'cells', cells: 9, ground: true, status: [{ key: 'silence', seconds: 7 }] }], '失去特殊能力; 槐琥 S2: 不可对空 (PRTS)');
  assert.equal(red.extra.attack, undefined, 'the stun is not on her attacks');
  assert.equal(waaifu.extra.attack, undefined);
  assert.deepEqual(strikes(accast), [{ at: 'start', scale: 1.4, type: 'arts', where: 'attack' }], 'Pith S3: 开启技能时……{atk_scale_AOE}, the data\'s key in lower case');
  assert.equal(accast.extra.hitScale, undefined, 'and no plain atk_scale to claim');
  assert.deepEqual(strikes(misery), [{ at: 'start', scale: 2.4, type: 'phys', where: 'cells', cells: 9 }], 'Misery S3: 将所有未被阻挡的敌人…拖拽 is for some only: left unread');
  assert.deepEqual(strikes(yu), [{ at: 'start', scale: 1, type: 'arts', where: 'cells', cells: 13 }], '余 S2: 将其中的地面可达目标传送 is not read either');
  assert.equal(yu.extra.attack.type, 'arts', '普通攻击造成法术伤害 stays 技能-9');
  assert.deepEqual(strikes(phantom), [{ at: 'start', scale: 2.4, type: 'phys', where: 'cells', cells: 9, ground: true, displace: { pull: false, force: 0 } }], '傀影 S3: 小力地推开, 不可对空 (PRTS); the random status is not read');
  for (const s of [texas2s2, texas2s3, red, waaifu, accast, misery, yu, phantom]) assert.notEqual(skills.kindOf(s), 'instant', s.id);
});

test('[技能-16] 缄默德克萨斯 S3\'s 剑雨: the first volley 0.67 s after the start (PRTS), then every second, on the first max_target enemies in the attack range', async () => {
  const s3 = await at('char_1028_texas2', 2);
  assert.deepEqual(strikes(s3)[1], { at: 'every', scale: 1, type: 'arts', where: 'attack', most: 3, fly: true, every: { seconds: 1, first: 0.67 }, status: [{ key: 'stun', seconds: 0.2 }] });
  assert.equal(s3.extra.hitScale, 'attack');
  assert.equal(s3.extra.attack, undefined, 'the volleys are not what her attacks do');
});

test('[技能-16] what is not a hit at the start stays as it was: next attacks, thrown things, picks of one target, other keys, tokens', async () => {
  const [cliffS1, otter, iris, meteo, svash, pine, cutterS1, snow, chen, chenS3, cqbw] = await Promise.all([
    at('char_173_slchan', 0), at('char_242_otter', 1), at('char_338_iris', 1), at('char_219_meteo', 1), at('char_1045_svash2', 1), at('char_440_pinecn', 0),
    at('char_301_cutter', 0), at('char_383_snsant', 1), at('char_010_chen', 0), at('char_010_chen', 2), at('char_113_cqbw', 0),
  ]);
  for (const [name, s] of Object.entries({ cliffS1, otter, iris, meteo, svash, pine, cutterS1, snow, chen, chenS3, cqbw })) {
    assert.deepEqual([name, s.extra?.bursts, s.instant, skills.kindOf(s)], [name, undefined, undefined, 'next']);
  }
  assert.equal(cliffS1.extra.attack.displace.pull, true, '崖心 S1: 下次攻击 pulls');
  assert.equal(svash.bb.cost, 11, '凛御银灰 S2: {cost} cuts another operator\'s cost; it is not read as a hit that gains it');
});

/**
 * A made-up skill level (no real skill shows these limits): a manual skill with no duration unless `o` says otherwise.
 * @param {string} description @param {Record<string, number>} bb @param {Partial<SkillLevel>} [o] @returns {SkillLevel}
 */
const made = (description, bb, o = {}) => ({
  skillType: 'MANUAL', durationType: 'NONE', duration: 0, spData: { spType: 'INCREASE_WITH_TIME', spCost: 10, initSp: 0, maxChargeTime: 1 },
  blackboard: Object.entries(bb).map(([key, value]) => ({ key, value })), description, rangeId: null, ...o,
});

test('[技能-16] the reader\'s limits, on made-up levels', () => {
  const def = (/** @type {SkillLevel} */ l) => /** @type {any} */ (skillDefOf('made', l));
  const hit = '对周围所有敌人造成相当于攻击力{atk_scale:0%}的法术伤害';
  assert.deepEqual(strikes(def(made(hit, { atk_scale: 2 }))), [{ at: 'start', scale: 2, type: 'arts', where: 'attack' }], 'no rangeId: the attack range');
  assert.equal(def(made(hit, { atk_scale: 2 })).instant, true);
  assert.deepEqual(strikes(def(made(hit, { atk_scale: 2 }, { rangeId: 'x-4' }))), [{ at: 'start', scale: 2, type: 'arts', where: 'cells', cells: 9 }]);
  // its atk_scale is in a sentence not about attacks, so 技能-5 gives the attack none (scaleKey ''); no strike
  assert.deepEqual(def(made(hit, { atk_scale: 2 }, { duration: 10 })).extra, { scaleKey: '' }, 'a skill that runs: only what says 立即 is at its start');
  assert.deepEqual(strikes(def(made(`立即${hit}`, { atk_scale: 2 }, { duration: 10 }))).length, 1);
  assert.equal(def(made(`立即${hit}`, { atk_scale: 2 }, { duration: 10 })).instant, undefined, 'it has a duration');
  assert.equal(def(made(hit, { atk_scale: 2 }, { skillType: 'PASSIVE' })).extra, undefined);
  assert.equal(def(made(`部署后立即${hit}`, { atk_scale: 2 }, { skillType: 'PASSIVE' })).instant, undefined);
  assert.equal(strikes(def(made(`部署后立即${hit}`, { atk_scale: 2 }, { skillType: 'PASSIVE' }))).length, 1);
  // what comes after, or on a condition, is another effect
  assert.deepEqual(strikes(def(made(`${hit}，之后每秒造成攻击力{atk_scale:0%}的法术伤害`, { atk_scale: 2 }))).length, 1);
  assert.equal(def(made(`下次攻击${hit}`, { atk_scale: 2 })).extra, undefined, 'a next attack');
  assert.equal(def(made(`${hit}，攻击使目标晕眩{stun}秒`, { atk_scale: 2, stun: 1 })).extra.bursts, undefined, 'a sentence about attacks is no strike');
  assert.equal(def(made('切换为作战时，立即对周围所有敌人造成相当于攻击力{atk_scale}的物理伤害', { atk_scale: 2 })).extra, undefined, 'on a condition');
  assert.equal(def(made('对目标造成相当于攻击力{atk_scale}的物理伤害', { atk_scale: 2 })).extra, undefined, 'no area words');
  assert.equal(def(made(hit, { atk_scale: 0 })).extra, undefined, 'no scale');
  // the cost key is a cost gained or it is not a strike
  assert.equal(def(made(`立即获得{cost}点费用；${hit}`, { cost: 8, atk_scale: 2 })).instant, true);
  assert.equal(def(made(`待部署区的干员费用-{cost}；${hit}`, { cost: 8, atk_scale: 2 })).extra, undefined);
  // 地面, 其中, the number of enemies
  assert.equal(strikes(def(made('对周围至多{max_target}名地面敌人造成相当于攻击力{atk_scale}的物理伤害', { atk_scale: 2, max_target: 3 })))[0].ground, true);
  assert.equal(strikes(def(made('对周围两个敌人造成相当于攻击力{atk_scale}的物理伤害', { atk_scale: 2 })))[0].most, 2);
  assert.equal(strikes(def(made('对周围3名敌人造成相当于攻击力{atk_scale}的物理伤害', { atk_scale: 2 })))[0].most, 3);
  assert.equal(strikes(def(made(`${hit}并使其中重量较轻的目标晕眩{stun}秒`, { atk_scale: 2, stun: 1 })))[0].status, undefined, '其中: for some only');
  // 防御 or 法术抗性 lowered: a share when written with a percent, a number without; for a number the operator\'s own 防御 is left alone
  const lower = (/** @type {string} */ fmt) => strikes(def(made(`${hit}，并使命中目标在{duration}秒内防御力-{-def${fmt}}`, { atk_scale: 2, duration: 5, def: -0.3 })))[0].debuff;
  assert.deepEqual([lower(':0%'), lower('')], [{ seconds: 5, mods: { defPct: -0.3 } }, { seconds: 5, mods: { defFlat: -0.3 } }]);
  const own = (/** @type {string} */ fmt) => def(made(`${hit}，并使命中目标在{duration}秒内防御力-{-def${fmt}}`, { atk_scale: 2, duration: 5, def: -0.3 })).extra?.mods;
  assert.deepEqual([own(':0%'), own('')], [{ defPct: 0 }, { defPct: 0, defFlat: 0 }], 'the operator keeps no 防御 change of its own: a share, or a number');
});

test('[技能-9] a next attack that hits more than once: 额外攻击一次, 连续攻击两次/三次, 变为二连击/三连击, 造成两次…; a blackboard times wins', async () => {
  const [bagpipe, gnosis, malist, etlchi, varkis, fang, mixer, demetri, crow] = await Promise.all([
    at('char_222_bpipe', 1), at('char_206_gnosis', 0), at('char_4054_malist', 1), at('char_4010_etlchi', 0), at('char_4166_varkis', 0), at('char_1036_fang2', 0),
    at('char_4194_rmixer', 0), at('char_4037_demetr', 0), at('char_421_crow', 0),
  ]);
  const kt = await loadTraining('char_124_kroos');
  const kroos = /** @type {any} */ (operatorAt(kt, { elite: kt.phases.length - 1, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 7 }).skill);
  const times = [bagpipe, gnosis, malist, etlchi, varkis, fang, mixer, demetri, crow].map((s) => s.extra.attack.times);
  assert.deepEqual(times, [2, 2, 2, 2, 3, 2, 3, 2, 2], '风笛 S2 且额外攻击一次; 灵知 S1; 至简 S2; 隐德来希 S1; 摆渡人 S1 三次; 历阵锐枪芬 S1; 信仰搅拌机 S1; 贝洛内 S1; 羽毛笔 S1');
  for (const s of [bagpipe, gnosis, crow]) assert.equal(skills.kindOf(s), 'next', s.id);
  assert.equal(skills.skillMods(kroos.bb, kroos.extra?.hitScale).times, 2, '克洛丝 S1: the blackboard\'s own times');
  assert.deepEqual([repeatOf('且额外攻击一次'), repeatOf('并连续攻击两次'), repeatOf('下次攻击变为三连击'), repeatOf('下一次攻击变为攻击力{atk_scale}的二连击'), repeatOf('额外攻击一个目标'),
    repeatOf('自身生命低于{hp_ratio_double}时额外攻击1次'), repeatOf('下次攻击对目标造成两次相当于攻击力{atk_scale}的物理伤害'), repeatOf('下次攻击对周围最多{max_target}名地面敌人造成两次相当于攻击力{atk_scale_s1}的物理伤害')],
  [2, 2, 3, 2, 0, 0, 2, 0], 'another key than atk_scale, a condition, a number of targets: not read');
  const zuole = await at('char_4121_zuole', 0), blkkgt = await at('char_4116_blkkgt', 0);
  assert.deepEqual([zuole.extra?.attack?.times, blkkgt.extra?.attack?.times], [undefined, undefined], '左乐 S1 on his HP, 锏 S1 under atk_scale_s1');
});

/**
 * The tiny level with a real operator at (row 1, col 1) facing right, the slime made sturdy and still, `n` of them appearing at once;
 * once they are in, they stand at the given x on row 1.
 * @param {any} operator @param {[number, number][]} at where they stand, as [x, y] @param {{ row: number, col: number }} [tile] where the operator is deployed
 */
function stage(operator, at, tile = { row: 1, col: 1 }) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime = { ...c.enemies.slime, maxHp: 1e9, def: 0, res: 0 };
  c.level.waves = [oneWave(at.map(() => spawnAt(0, 'slime')))];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1e6, characterLimit: 4 };
  c.operators = { x: operator };
  c.behaviors = skeletonContent.behaviors;
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'x', ...tile, dir: 0 }]]);
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'x'));
  const foes = w.units.filter((u) => u.kind === KIND.ENEMY);
  foes.forEach((e, i) => {
    [e.x, e.y] = at[i];
    e.hp = 1e9; e.maxHp = 1e9;
    buffs.addBuff(e, buffs.makeBuff({ key: 'still', flags: { root: true } })); // they stay where they stand, but for a push or a pull
  });
  op.atkCd = 1e6;
  return { w, c, op, foes };
}

test('[技能-16] 崖心 S2 on the tiny level: the two farthest enemies in 3-14 are pulled in and stunned, the near one and the one beyond are not; the skill stays 5 s with no SP, as it pulled', async () => {
  const t = await loadTraining('char_173_slchan');
  const { w, c, op, foes } = stage(operatorAt(t, { elite: 2, level: 1, potential: 1, trust: 0, skill: 1, skillLevel: 7 }), [[2, 1], [3, 1], [4, 1], [5.4, 1]]);
  const x0 = foes.map((e) => e.x);
  sp.forceSp(op.skill, 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  const hit = foes.map((e) => 1e9 - e.hp > 0), stunned = foes.map((e) => e.buffs.some((/** @type {any} */ b) => b.key === 'stun'));
  assert.deepEqual(hit, [false, true, true, false], 'most 2: the farthest in the cells; 5.4 is a tile too far');
  assert.deepEqual(stunned, hit);
  assert.ok(Math.abs(1e9 - foes[1].hp - attrs.statsOf(op).atk * 1.7) < 1e-3, 'the attack × atk_scale, true damage');
  assert.equal(op.skill.active, true, 'PRTS 备注: the skill is held while the pulling projectile lasts');
  const at = op.skill.at, sp0 = op.skill.sp, ended = /** @type {[number, string][]} */ ([]);
  bus.on(w, 'skillEnd', (k) => { ended.push([w.frame - at, k.reason]); });
  for (let i = 0; i < 60; i++) step(w, c, []);
  assert.deepEqual(foes.map((e, i) => e.x < x0[i]), [false, true, true, false], 'pulled toward her');
  assert.deepEqual([op.skill.active, op.skill.sp, ended.length], [true, sp0, 0], 'two seconds on: still running, no SP back');
  for (let i = 0; i < 100; i++) step(w, c, []);
  assert.deepEqual(ended, [[150, 'duration']], 'it ends 5 s after it started, by its time');
  assert.equal(op.skill.active, false);
});

test('[技能-16] 崖心 S2 and 暗索 S2 that pull nobody are over in their frame; 暗索 S2 that pulls is held 5 s too', async () => {
  const build = { elite: 2, level: 1, potential: 1, trust: 0, skill: 1, skillLevel: 7 };
  const cliff = stage(operatorAt(await loadTraining('char_173_slchan'), build), [[5.4, 1]]);
  sp.forceSp(cliff.op.skill, 99);
  step(cliff.w, cliff.c, [[0, { type: 'skill', unit: cliff.op.id }]]);
  assert.deepEqual([cliff.op.skill.active, cliff.foes[0].hp], [false, 1e9], 'nobody in the cells: nothing was pulled, nothing holds it');
  const rope = stage(operatorAt(await loadTraining('char_236_rope'), build), [[3, 1], [4.9, 1]]);
  sp.forceSp(rope.op.skill, 99);
  step(rope.w, rope.c, [[0, { type: 'skill', unit: rope.op.id }]]);
  assert.deepEqual(rope.foes.map((e) => 1e9 - e.hp > 0), [true, true], '将远距离内两个敌人…拖拽至面前');
  assert.equal(rope.op.skill.active, true);
  for (let i = 0; i < 149; i++) step(rope.w, rope.c, []);
  assert.equal(rope.op.skill.active, true, '149 frames on');
  step(rope.w, rope.c, []);
  assert.equal(rope.op.skill.active, false, 'the 150th frame ends it');
});

test('[技能-16] 阿消 S2 on the tiny level: a projectile at the nearest ground enemy in the attack range, and a splash of radius 1 around it — flying ones too, in or out of the range', async () => {
  const t = await loadTraining('char_277_sqrrel');
  // her attack range is her tile and the next; the nearest ground enemy is at 1.8, and a flying one is nearer to her
  const { w, c, op, foes } = stage(operatorAt(t, { elite: 2, level: 1, potential: 1, trust: 0, skill: 1, skillLevel: 7 }), [[1.8, 1], [2.6, 1], [3.6, 1], [1.1, 1.3], [1.8, 2.2]]);
  foes[3].base = { ...foes[3].base, motion: 'FLY' };
  sp.forceSp(op.skill, 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  assert.deepEqual(foes.map((e) => 1e9 - e.hp > 0), [true, true, false, true, false], 'the centre; 0.8 from it, a tile out of her range; too far; flying, 0.76 from it; 1.2 from it');
  assert.ok(Math.abs(1e9 - foes[0].hp - attrs.statsOf(op).atk * 2.4) < 1e-3);
  assert.equal(op.skill.active, false, 'nothing is pulled: over in its frame');
  const lone = stage(operatorAt(t, { elite: 2, level: 1, potential: 1, trust: 0, skill: 1, skillLevel: 7 }), [[1.4, 1]]);
  lone.foes[0].base = { ...lone.foes[0].base, motion: 'FLY' };
  sp.forceSp(lone.op.skill, 99);
  step(lone.w, lone.c, [[0, { type: 'skill', unit: lone.op.id }]]);
  assert.equal(lone.foes[0].hp, 1e9, 'a flying enemy alone is no target: the projectile goes at a ground one');
});

test('[技能-16] 陈 S2 on the tiny level: each of the first six enemies in 3-12, flying ones too, takes a 法术 hit and then a 物理 one', async () => {
  const t = await loadTraining('char_010_chen');
  const { w, c, op, foes } = stage(operatorAt(t, { elite: 2, level: 1, potential: 1, trust: 0, skill: 1, skillLevel: 7 }), [[2, 1], [3, 1], [2.5, 1]]);
  foes[2].base = { ...foes[2].base, motion: 'FLY' };
  /** @type {string[]} */
  const seen = [];
  bus.on(w, 'damaged', (k) => { if (k.dmg.isSkill && !k.dmg.isAttack) seen.push(`${foes.indexOf(k.target)}:${k.dmg.type}`); });
  sp.forceSp(op.skill, 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  assert.deepEqual(seen.filter((x) => x.startsWith('0')), ['0:arts', '0:phys']);
  assert.deepEqual(foes.map((e) => Math.round((1e9 - e.hp) / attrs.statsOf(op).atk * 10) / 10), [8.2, 8.2, 8.2], 'atk_scale 4.1 of each type');
  assert.equal(op.skill.active, false);
});

test('[技能-16] 莱恩哈特 S2 on the tiny level: the enemies in the range it widens, once, with the 法术抗性 they lose for 6 s', async () => {
  const t = await loadTraining('char_373_lionhd');
  const { w, c, op, foes } = stage(operatorAt(t, { elite: 2, level: 1, potential: 1, trust: 0, skill: 1, skillLevel: 7 }), [[3, 1], [0.5, 1]], { row: 2, col: 2 });
  const atk = attrs.statsOf(op).atk;
  sp.forceSp(op.skill, 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  const lowered = (/** @type {any} */ e) => e.buffs.find((/** @type {any} */ b) => b.key === `hitDebuff:${op.id}`);
  assert.ok(Math.abs(1e9 - foes[0].hp - atk * 2) < 1e-3, 'the attack as it was when the skill started × atk_scale');
  assert.deepEqual(lowered(foes[0])?.mods, { resPct: -0.12 });
  assert.equal(foes[1].hp, 1e9, 'out of the range');
  assert.equal(lowered(foes[1]), undefined);
  assert.equal(op.skill.active, false);
});

test('[技能-16] 缄默德克萨斯 S3 on the tiny level: two hits and a stun as she is deployed, then a volley 0.67 s later and each second until the skill ends', async () => {
  const t = await loadTraining('char_1028_texas2');
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime = { ...c.enemies.slime, maxHp: 1e9, def: 0, res: 0 };
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1e6 };
  c.operators = { x: operatorAt(t, { elite: 2, level: 1, potential: 1, trust: 0, skill: 2, skillLevel: 7 }) };
  c.behaviors = skeletonContent.behaviors;
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, []);
  const e = /** @type {any} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  e.x = 2; e.y = 1; e.hp = 1e9; e.maxHp = 1e9;
  /** @type {{ frame: number, skill: boolean }[]} */
  const log = [];
  bus.on(w, 'damaged', (k) => { if (k.target === e && k.dmg.isSkill && !k.dmg.isAttack) log.push({ frame: w.frame, skill: true }); });
  step(w, c, [[0, { type: 'deploy', op: 'x', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'x'));
  op.atkCd = 1e6;
  for (let i = 0; i < 400; i++) step(w, c, []);
  const frames = log.map((l) => l.frame - log[0].frame);
  assert.equal(frames.slice(0, 2).join(), '0,0', 'two hits as she is deployed');
  assert.deepEqual(frames.slice(2, 5), [20, 50, 80], 'the first volley 0.67 s later, then each second');
  assert.equal(frames.length, 2 + 7, 'skill level 7 lasts 7 s: seven volleys, the last one at 6.67 s');
  assert.equal(op.skill.active, false);
});

/**
 * Every skill level of every operator and summon, read: the ids that are instant, that strike at their start (instant or not), and what the
 * strikes carry that the description does not say. A data update that adds one shows here.
 */
test('[技能-16] the skills read as instant, with a start strike, ground only, a splash or a hold: the whole data, pinned', async () => {
  /** @type {Record<string, Set<string>>} */
  const got = { instant: new Set(), starts: new Set(), runningStarts: new Set(), ground: new Set(), around: new Set(), hold: new Set(), then: new Set() };
  const seen = new Set();
  /** What one skill level is read as: the sets it belongs to. @param {string} id @param {any} d */
  const note = (id, d) => {
    const starts = (d.extra?.bursts ?? []).filter((/** @type {any} */ b) => b.at === 'start');
    if (d.instant) got.instant.add(id);
    if (starts.length) { got.starts.add(id); if (!d.instant) got.runningStarts.add(id); }
    for (const key of ['ground', 'around', 'hold', 'then']) if (starts.some((/** @type {any} */ b) => b[key])) got[key].add(id);
  };
  /** @param {{ skills: ({ id: string, levels: SkillLevel[] } | null)[] }} t */
  const scan = (t) => {
    for (const s of t.skills) {
      if (!s || seen.has(s.id)) continue;
      seen.add(s.id);
      for (const l of s.levels) note(s.id, skillDefOf(s.id, l));
    }
  };
  for (const id of Object.keys(ROSTER)) scan(await loadTraining(id));
  for (const id of Object.keys(TOKENS)) scan(await loadToken(id));
  const list = (/** @type {Set<string>} */ x) => [...x].sort();
  assert.deepEqual(list(got.instant), ['skchr_acpion_1', 'skchr_acpion_3', 'skchr_apionr_1', 'skchr_bgsnow_2', 'skchr_bibeak_2', 'skchr_cement_1', 'skchr_chen_2', 'skchr_chiave_2', 'skchr_chyue_2',
    'skchr_cutter_2', 'skchr_flamtl_2', 'skchr_gnosis_2', 'skchr_graceb_2', 'skchr_irene_2', 'skchr_irene_3', 'skchr_lionhd_2', 'skchr_moeshd_2', 'skchr_rope_2', 'skchr_saga_2', 'skchr_savage_2',
    'skchr_sbell2_1', 'skchr_shotst_2', 'skchr_slchan_2', 'skchr_sqrrel_2', 'skchr_texas_2', 'skchr_vulpis_2'], 'instant: 26 skills');
  assert.deepEqual(list(got.runningStarts), ['skchr_accast_3', 'skchr_acspec_3', 'skchr_phatom_3', 'skchr_red_2', 'skchr_texas2_2', 'skchr_texas2_3', 'skchr_waaifu_2', 'skchr_yu_2', 'sktok_phatom_3'],
    'a strike at the start of a passive or running skill: 8 of operators, the 傀影 twin\'s skill (its push moved from every attack to the start)');
  assert.equal(got.starts.size, 26 + 9, 'every start strike belongs to one of the two lists');
  assert.deepEqual(list(got.ground), ['skchr_graceb_2', 'skchr_irene_2', 'skchr_irene_3', 'skchr_phatom_3', 'skchr_red_2', 'skchr_saga_2', 'skchr_waaifu_2', 'sktok_phatom_3'],
    'ground only: 聆音二, 艾丽妮二、三, 嵯峨二 say 地面 in their text; 红二, 槐琥二, 傀影三 and its twin by PRTS 不可对空');
  assert.deepEqual([list(got.around), list(got.hold), list(got.then)], [['skchr_sqrrel_2'], ['skchr_rope_2', 'skchr_slchan_2'], ['skchr_chen_2']]);
  const twin = /** @type {any} */ (skillDefOf('sktok_phatom_3', /** @type {NonNullable<Awaited<ReturnType<typeof loadToken>>['skills'][number]>} */ ((await loadToken('token_10007_phatom_twin')).skills[2]).levels[6]));
  assert.deepEqual(strikes(twin), [{ at: 'start', scale: 2.4, type: 'phys', where: 'cells', cells: 9, ground: true, displace: { pull: false, force: 0 } }], 'the twin: the push is the start strike\'s, not each attack\'s');
  assert.equal(twin.extra.attack, undefined);
});

/** The pinned commit's root as a URL, for the kits. */
let root = '';

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  root = pathToFileURL(`${oracleDir()}/`).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
});

test('[技能-16] [兼容-5] an operator that fights by a kit keeps its record\'s kind: 艾丽妮 S2 is instant by her description, a next attack under her kit; nothing is struck twice', async () => {
  const build = { elite: 2, level: 90, potential: 6, trust: 100, skill: 1, skillLevel: 7 };
  const key = 'char_4009_irene#0', match = { level: 'act1multi_01', difficulty: /** @type {const} */ ('NORMAL'), seed: 7, decks: [[{ id: 'char_4009_irene', build }]] };
  const native = /** @type {any} */ (await matchContent(match));
  const { kits } = await loadKits(root, ['char_4009_irene']);
  const kitted = /** @type {any} */ (await matchContent(match, { kits }));
  assert.deepEqual([native.operators[key].skill.instant, skills.kindOf(native.operators[key].skill)], [true, 'instant']);
  assert.deepEqual([kitted.operators[key].skill.instant, skills.kindOf(kitted.operators[key].skill)], [undefined, 'next'], 'the kit\'s own skill: its kind is the record\'s as before');
  assert.equal(kitted.operators[key].skill.extra.bursts.length, 1, 'the reading is there, and the skill\'s id has a behaviour of the kit\'s: the sim does not run it (技能-6)');
  assert.ok(Object.hasOwn(kitted.behaviors.skills, native.operators[key].skill.id));
});
