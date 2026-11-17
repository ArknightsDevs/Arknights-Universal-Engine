// The status each hit of a skill's attacks gives its target, read from the description (docs/spec/skills.md 技能-9): real
// skills at skill level 7 for the readings, and descriptions made for the shapes and for what is not read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skills } from '@aue/sim';
import { skillDefOf, loadTraining, operatorAt } from '../src/index.js';

/** @type {Record<string, any>} */
const LEVELS = JSON.parse(readFileSync(new URL('fixtures/skill-levels.json', import.meta.url), 'utf8'));

/** A real operator's skill (0-based slot) at elite 2, skill level 7: what its description adds to its attacks. @param {string} id @param {number} slot */
async function attackOf(id, slot) {
  const op = operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill: slot, skillLevel: 7 });
  return /** @type {any} */ (op.skill).extra?.attack ?? null;
}

/**
 * What a description of a skill adds to its attacks: the blackboard from `bb`, the skill a 20 s one (`over` changes the
 * level: a next-attack skill has no duration; a passive one is PASSIVE).
 * @param {string} description @param {Record<string, number>} bb @param {Record<string, unknown>} [over]
 */
function read(description, bb, over = {}) {
  const level = { ...LEVELS['skcom_atk_up[3]'], description, blackboard: Object.entries(bb).map(([key, value]) => ({ key, value })), ...over };
  return skillDefOf('x', level).extra?.attack ?? null;
}
const NEXT = { duration: 0 };
/** The status each hit gives, as a description reads. @param {string} description @param {Record<string, number>} bb @param {Record<string, unknown>} [over] */
const hit = (description, bb, over) => read(description, bb, over)?.hitStatus;

test('[技能-9] the statuses each hit gives, on real skills: after 「攻击」, inside the damage clause, at a chance, on the main target, for a target not asleep', async () => {
  /** @type {[string, number, unknown][]} */
  const rows = [
    ['char_4137_udflow', 1, { key: 'sluggish', seconds: 1 }], // 能穿过{attack@max_target}个目标且造成{attack@sluggish}秒停顿
    ['char_341_sntlla', 1, { key: 'cold', seconds: 1 }], // 冰凌落地后对周围所有敌人造成{attack@cold}秒寒冷和…
    ['char_4026_vulpis', 2, { key: 'stun', seconds: 0.2 }], // 每次攻击晕眩敌人{attack@stun}秒
    ['char_4146_nymph', 1, { key: 'fear', seconds: 5 }], // 造成…伤害、使其恐惧{fear}秒
    ['char_4056_titi', 2, { key: 'sleep', seconds: 5, unless: 'sleep' }], // 攻击非沉睡目标时使其沉睡{attack@sleep}秒
    ['char_4058_pepe', 2, { key: 'stun', seconds: 0.8, main: 1.5 }], // 攻击使命中的目标晕眩…，对主目标提升至…
    ['char_391_rosmon', 1, { key: 'stun', seconds: 1.1, prob: 0.2 }], // 受到攻击和余震的目标有{attack@prob}的几率晕眩…
    ['char_4013_kjera', 1, { key: 'cold', seconds: 2.5, prob: 0.2 }], // 自身与浮游单元攻击有{attack@prob}概率对敌人造成{attack@cold}秒寒冷
    ['char_426_billro', 1, { key: 'sluggish', seconds: 0.3 }], // 每次攻击对目标造成{attack@sluggish}秒停顿
    ['char_415_flint', 0, { key: 'sluggish', seconds: 1 }], // 造成1秒停顿（写死的秒数）
    ['char_415_flint', 1, { key: 'sluggish', seconds: 0.3 }], // 每次攻击对目标造成0.3秒停顿
    ['char_107_liskam', 1, { key: 'stun', seconds: 1, prob: 0.2 }], // 并有{attack@buff_prob}概率使命中目标晕眩{attack@stun}秒（不是技能结束后自己的 stun）
    ['char_485_pallas', 1, { key: 'stun', seconds: 0.2, prob: 0.7 }], // 每次攻击有{attack@buff_prob}几率使目标晕眩{attack@stun}秒
    ['char_4027_heyak', 1, { key: 'levitate', seconds: 1, prob: 0.12 }], // 每发有{attack@prob}的概率使目标浮空{attack@levitate}秒
    ['char_4027_heyak', 2, { key: 'levitate', seconds: 0, main: 2 }], // 使命中的第一个目标浮空{attack@levitate}秒
    ['char_2013_cerber', 0, { key: 'root', seconds: 2.5 }], // 并令目标束缚{duration}秒
    ['char_2013_cerber', 2, { key: 'silence', seconds: 3 }], // 并令其失去特殊能力{attack@silence}秒
    ['char_346_aosta', 1, { key: 'root', seconds: 1.2 }], // 且每次攻击令目标束缚{attack@frozen_duration}秒（「且」后的一段）
    ['char_356_broca', 1, { key: 'sluggish', seconds: 0.9 }], // 普通攻击造成法术伤害并使击中的敌人停顿{attack@sluggish}秒
    ['char_383_snsant', 0, { key: 'sluggish', seconds: 1 }], // 对其造成…伤害并使其停顿{sluggish}秒
    ['char_133_mm', 0, { key: 'sluggish', seconds: 2 }], // 下次攻击…，并使目标停顿{sluggish}秒（「并」后的一段）
    ['char_133_mm', 1, { key: 'stun', seconds: 1, prob: 0.3 }], // 两句，读最后一句（INF-1402）
    ['char_4088_hodrer', 2, { key: 'stun', seconds: 4, prob: 0.25 }], // 每次攻击回复自身…的生命且有{attack@buff_prob}概率使目标晕眩…
    ['char_4138_narant', 1, { key: 'sluggish', seconds: 1 }],
    ['char_4141_marcil', 1, { key: 'sluggish', seconds: 0.5 }], // 攻击使所有命中目标停顿{attack@sluggish}秒（第二次使用时的晕眩主目标不读）
  ];
  for (const [id, slot, hitStatus] of rows) assert.deepEqual((await attackOf(id, slot))?.hitStatus, hitStatus, `${id} S${slot + 1}`);
  const svash = await attackOf('char_1045_svash2', 1);
  assert.deepEqual([svash.hitStatus, svash.hitDebuff], [{ key: 'cold', seconds: 5 }, { seconds: 5, mods: {}, flags: { unstealth: true } }], '使其{cold}秒内寒冷且隐匿失效');
});

test('[技能-9] what is not the skill\'s attacks is not read as a status each hit gives', async () => {
  const none = [
    ['char_4138_narant', 2], // 投射物全部回收时…使其停顿{sluggish}秒: a plain key beside attack@ ones
    ['char_113_cqbw', 1], ['char_113_cqbw', 2], // 地雷、炸弹
    ['char_4083_chimes', 1], // 技能结束时…使其晕眩
    ['char_4121_zuole', 2], // 最后一击…使目标晕眩
    ['char_4165_ctrail', 1], // 击中飞行敌人时使其停顿
    ['char_4131_odda', 1], // 攻击溅射到重量小于等于3的单位会使其浮空
    ['char_411_tomimi', 1], ['char_4203_kichi', 1], // 随机触发、依次循环
    ['char_1034_jesca2', 2], // attack@extrabomb.stun: a key of a group
    ['char_4140_lasher', 1], ['char_242_otter', 1], // 发条羽兽的攻击、引爆机械水獭
    ['char_437_mizuki', 1], // 第一天赋额外攻击1个目标并附加…束缚
    ['char_4026_vulpis', 1], // an instant skill: its 停顿 and the 晕眩 if already 停顿 are its start strike's (技能-16)
    ['char_1038_whitw2', 2], // 追上时使目标恐惧{attack@fear}秒并锁定其攻击: once, when the floating unit catches its target
  ];
  for (const [id, slot] of none) {
    const status = (await attackOf(/** @type {string} */ (id), /** @type {number} */ (slot)))?.hitStatus;
    assert.equal(status, undefined, `${id} S${Number(slot) + 1}`);
  }
});

test('[技能-9] the shapes: the status after the target or before it, with a placeholder or a number, with or without 「attack@」, at a chance under any key ending in prob', () => {
  const dur = { 'attack@sluggish': 0.5, 'attack@stun': 2, 'attack@prob': 0.3, 'attack@cold': 4, 'attack@sleep': 3, 'attack@fear': 1.5, 'attack@root': 2, 'attack@silence': 6, 'attack@buff_prob': 0.6 };
  assert.deepEqual(hit('每次攻击对目标造成{attack@sluggish}秒停顿', dur), { key: 'sluggish', seconds: 0.5 });
  assert.deepEqual(hit('每次攻击对目标造成0.3秒停顿', {}), { key: 'sluggish', seconds: 0.3 }, 'a number written in the text');
  assert.deepEqual(hit('攻击使目标晕眩{attack@stun}秒', dur), { key: 'stun', seconds: 2 });
  assert.deepEqual(hit('每次攻击晕眩敌人{attack@stun}秒', dur), { key: 'stun', seconds: 2 });
  assert.deepEqual(hit('每次攻击令目标束缚{attack@root}秒', dur), { key: 'root', seconds: 2 });
  assert.deepEqual(hit('攻击对目标造成{attack@cold}秒寒冷', dur), { key: 'cold', seconds: 4 });
  assert.deepEqual(hit('下一次攻击使敌人陷入沉睡{attack@sleep}秒', dur), { key: 'sleep', seconds: 3 });
  assert.deepEqual(hit('攻击使命中目标失去特殊能力{attack@silence}秒', dur), { key: 'silence', seconds: 6 });
  assert.deepEqual(hit('每次攻击有{attack@prob}概率使目标恐惧{attack@fear}秒', dur), { key: 'fear', seconds: 1.5, prob: 0.3 });
  assert.deepEqual(hit('另外还有{attack@buff_prob}的几率晕眩{attack@stun}秒', { ...dur, 'attack@prob': 0.3 }), undefined, 'a chance with no attack before it');
  assert.deepEqual(hit('每次攻击有{attack@buff_prob}的几率晕眩{attack@stun}秒', dur), { key: 'stun', seconds: 2, prob: 0.6 }, 'no target after the chance');
  assert.deepEqual(hit('每次攻击有{s2_buff_prob}概率晕眩目标{stun}秒', { s2_buff_prob: 0.4, stun: 1 }), { key: 'stun', seconds: 1, prob: 0.4 }, 'any key ending in prob, no attack@ keys');
  assert.equal(read('每次攻击有{prob}概率晕眩目标{stun}秒', { prob: 0, stun: 1 }), null, 'a chance of 0');
  assert.equal(read('每次攻击有{prob}概率晕眩目标{stun}秒', { prob: 1.5, stun: 1 }), null, 'a chance above 1');
  assert.equal(read('每次攻击令目标晕眩{missing}秒', {}), null, 'a placeholder the blackboard has not');
});

test('[技能-9] which keys are the attacks\': with attack@ keys only those; a key of a group never', () => {
  assert.deepEqual(hit('每次攻击使目标晕眩{attack@stun}秒，技能结束后干员晕眩{stun}秒', { 'attack@stun': 1, stun: 5 }), { key: 'stun', seconds: 1 });
  assert.equal(read('每次攻击使目标晕眩{stun}秒', { 'attack@atk_scale': 2, stun: 5 }), null, 'a plain key beside attack@ ones is the skill\'s own');
  assert.deepEqual(hit('每次攻击使目标晕眩{stun}秒', { stun: 5 }), { key: 'stun', seconds: 5 }, 'no attack@ keys: all are the attacks\'');
  assert.equal(read('每次攻击使目标晕眩{attack@bomb.stun}秒', { 'attack@bomb.stun': 1 }), null);
  assert.equal(read('每次攻击使目标晕眩{x[1].stun}秒', { 'x[1].stun': 1 }), null);
});

test('[技能-9] which sentences are the attacks\': a named attack or hit first; a damage clause for a next-attack skill; passive and instant ones only by name', () => {
  const bb = { atk_scale: 2, stun: 1.5, fear: 4 };
  assert.deepEqual(hit('下次攻击造成相当于攻击力{atk_scale}的法术伤害，并使目标停顿{sluggish}秒', { atk_scale: 2, sluggish: 1 }, NEXT), { key: 'sluggish', seconds: 1 }, 'after 「并」');
  assert.deepEqual(hit('对敌人造成一次相当于攻击力{atk_scale}的法术伤害、使其恐惧{fear}秒', bb, NEXT), { key: 'fear', seconds: 4 }, 'in the damage clause of a next-attack skill');
  assert.deepEqual(hit('向前发射，对其造成相当于攻击力{atk_scale}的真实伤害，并使其晕眩{stun}秒', bb, NEXT), { key: 'stun', seconds: 1.5 }, 'the next clause');
  assert.equal(read('对敌人造成一次相当于攻击力{atk_scale}的法术伤害、使其恐惧{fear}秒', bb), null, 'a duration skill\'s damage clause is its opening, not its attacks');
  assert.equal(read('部署后立即对周围所有敌人造成相当于攻击力{atk_scale}的物理伤害，并使其晕眩{stun}秒', bb, { skillType: 'PASSIVE', duration: -1 }), null, 'a passive skill\'s opening');
  assert.deepEqual(hit('攻击使命中的目标晕眩{stun}秒', bb, { skillType: 'PASSIVE', duration: -1 }), { key: 'stun', seconds: 1.5 }, 'but its attacks named');
  assert.equal(read('下次攻击在地块埋下地雷；地雷会爆炸，爆炸后对周围所有敌人造成相当于攻击力{atk_scale}的物理伤害并令其晕眩{stun}秒', bb, NEXT), null, 'a mine');
  assert.equal(read('攻击后，技能结束后使其晕眩{stun}秒', bb), null, 'the end of the skill');
  assert.equal(read('每次对最多3名敌人造成攻击力{atk_scale}的物理伤害（最后一击系数加倍且使目标晕眩{stun}秒）', bb, NEXT), null, 'the last hit\'s is not every hit\'s');
  assert.equal(read('若目标已经处于停顿状态，则额外使敌人晕眩{stun}秒', bb), null, 'a condition');
  assert.equal(read('每次受到攻击时对目标造成伤害并使其失去特殊能力{stun}秒', bb), null, '受到攻击 is a counter (技能-14)');
});

test('[技能-9] [职业-15] a skill is read as the kind skillDefOf gives it: one that switches to the 替身 at once is instant (结城理 S2), and its damage clause is not its attacks', async () => {
  const t = await loadTraining('char_4217_makoto');
  const skill = /** @type {any} */ (t.skills[1]);
  assert.equal(skills.kindOf(skillDefOf(skill.id, skill.levels[6])), 'instant');
  const bb = { atk_scale: 2, fear: 4 }, clause = '对敌人造成一次相当于攻击力{atk_scale}的法术伤害、使其恐惧{fear}秒';
  assert.deepEqual(hit(clause, bb, NEXT), { key: 'fear', seconds: 4 }, 'a next-attack skill: the damage clause names its attack');
  assert.equal(read(`${clause}\n立即切换为<替身>状态作战`, bb, NEXT), null, 'the same with the switch at once: an instant skill');
});

test('[技能-9] the seconds on the main target: after the status in the same sentence; a first target; 沉睡 for a target not asleep; 隐匿失效 with 寒冷', () => {
  const bb = { 'attack@stun': 0.8, 'attack@stun_main': 1.5, 'attack@sleep': 5, 'attack@cold': 6, 'attack@levitate': 2 };
  assert.deepEqual(hit('攻击使命中的目标晕眩{attack@stun}秒，对主目标提升至{attack@stun_main}秒', bb), { key: 'stun', seconds: 0.8, main: 1.5 });
  assert.equal(read('对主目标提升至{attack@stun_main}秒', bb), null, 'with no status before it, nothing');
  assert.deepEqual(hit('攻击使命中的第一个目标浮空{attack@levitate}秒', bb), { key: 'levitate', seconds: 0, main: 2 });
  assert.deepEqual(hit('攻击非沉睡目标时使其沉睡{attack@sleep}秒', bb), { key: 'sleep', seconds: 5, unless: 'sleep' });
  assert.deepEqual(hit('每次攻击使目标陷入沉睡{attack@sleep}秒', bb), { key: 'sleep', seconds: 5 }, 'no unless without the words');
  // with 凛御银灰二技能's `cost` (another operator's), which keeps 技能-16 from reading the damage as a start strike
  const near = read('对前方6名敌人造成攻击力{atk_scale}的物理伤害，使其{cold}秒内寒冷且隐匿失效', { atk_scale: 2, cold: 4, cost: 11 }, NEXT);
  assert.deepEqual([near?.hitStatus, near?.hitDebuff], [{ key: 'cold', seconds: 4 }, { seconds: 4, mods: {}, flags: { unstealth: true } }]);
});

test('[技能-9] [元素-2] 元素损伤 of a share of the damage a hit did, on real skills and in the shapes; of the attack stays another reading', async () => {
  const [nymph, warmy, kaitou, graceb, christ, bobb] = await Promise.all([attackOf('char_4146_nymph', 1), attackOf('char_4081_warmy', 0), attackOf('char_499_kaitou', 0),
    attackOf('char_4187_graceb', 0), attackOf('char_4198_christ', 0), attackOf('char_487_bobb', 0)]);
  assert.deepEqual([nymph.element, nymph.epRatio], ['DARK', 0.22], '均附带造成法术伤害{ep_damage_ratio}的凋亡损伤 (妮芙, 22 % at skill level 7)');
  assert.deepEqual([warmy, kaitou, graceb, christ].map((a) => [a.element, a.epRatio]), [['FIRE', 0.15], ['DARK', 0.1], ['SANITY', 0.1], ['SANITY', 0.15]]);
  assert.deepEqual([bobb.element, bobb.epScale, bobb.epRatio], ['FIRE', 1, undefined], '并附带{ep_damage_ratio}攻击力的灼燃损伤: of the attack');
  assert.deepEqual(read('每次攻击额外造成相当于物理伤害{attack@ep_damage_ratio}的侵蚀损伤', { 'attack@ep_damage_ratio': 0.2 }), { element: 'WATER', epRatio: 0.2 });
  assert.deepEqual(read('攻击附带伤害{ep_damage_ratio}的神经损伤', { ep_damage_ratio: 0.1 }), { element: 'SANITY', epRatio: 0.1 });
});
