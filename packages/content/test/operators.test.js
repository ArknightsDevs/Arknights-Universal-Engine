// Operators at a training (docs/spec/operators.md) on the real training data: the skeleton's operator again, levels in
// between, trust, potentials, skill levels and unlocks, trait candidates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTraining, operatorAt, skeletonContent, ROSTER } from '../src/index.js';
import { traitAt, teamTalentsAt, upgradedTalentsAt, moduleOwnAt } from '../src/operators.js';
import { talentsAt, alwaysOn, alwaysMods, teamPart, rangePart, critPart, timedPart, deployPart, forSkill } from '../src/talents.js';
import { whileParts, targetPart, hitPart, attackPart } from '../src/talentparts.js';
import { matchContent } from '../src/index.js';

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

test('[干员-6] each talent\'s last candidate unlocked; the always-on part reads as the operator\'s own attributes only', async () => {
  const angel = await loadTraining('char_103_angel');
  assert.deepEqual(talentsAt(angel, build()), [null, null], 'none unlocked at elite 0');
  assert.deepEqual(talentsAt(angel, build({ elite: 2, potential: 3 })).map((c) => c?.bb.attack_speed ?? c?.bb.atk), [15, 0.06]);
  assert.deepEqual(operatorAt(angel, build({ elite: 2, potential: 6 })).talentBb, { attack_speed: 15, atk: 0.08, max_hp: 0.13 }, '天使的祝福: its first sentence is hers');
  const winter = await loadTraining('char_115_headbr'), e0 = operatorAt(winter, build());
  assert.deepEqual([operatorAt(winter, build({ elite: 1 })).cost, e0.cost, e0.talentBb], [winter.phases[1].frames[0].stats.cost - 1, winter.phases[0].frames[0].stats.cost, undefined],
    '自身部署费用-1 (elite 1) folds into the cost');
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb, hidden = false) => alwaysOn({ description, bb, hidden });
  assert.deepEqual([
    c('生命上限和防御力各+12%', { max_hp: 0.12, def: 0.12 }), c('攻击力+8%<@ba.talpu>（+2%）</>，攻击速度+8', { atk: 0.08, attack_speed: 8 }),
    c('自身再部署时间-15秒', { respawn_time: -15, cost: 0 }), c('自身的技力自然回复速度+0.3/秒。', { sp_recovery_per_sec: 0.3 }), c('防御力-10%，但攻击速度+20', { def: -0.1, attack_speed: 20 }),
  ], [{ max_hp: 0.12, def: 0.12 }, { atk: 0.08, attack_speed: 8 }, { respawn_time: -15 }, { sp_recovery_per_sec: 0.3 }, { def: -0.1, attack_speed: 20 }]);
  assert.deepEqual([
    c('攻击力+8%，攻击变为弱点伤害', { atk: 0.08 }), c('攻击速度+15，装备技能2时获得+25%攻击力', { attack_speed: 15, atk: 0.25 }),
    c('攻击速度+12；连续造成伤害时逐渐无视敌人防御力', { attack_speed: 12, def_penetrate_fixed: 6 }),
  ], [{ atk: 0.08 }, { attack_speed: 15 }, { attack_speed: 12 }], 'the leading clauses; what follows is not always on');
  assert.deepEqual([
    c('攻击力+8%', { atk: 0.08, prob: 0.1 }), c('攻击速度+6', { atk: 0.06 }), c('攻击力+8%', { atk: 0.08 }, true),
    c('在场时，所有友方【医疗】职业干员攻速+6', { attack_speed: 6 }), c('攻击速度+10，自身受到伤害后失去该效果', { attack_speed: 10 }),
    c('部署后随机永久获得下列一项增益：攻击力+7%；攻击速度+7', { atk: 0.07, attack_speed: 7 }),
  ], [null, null, null, null, null, null]);
});

test('[干员-7] a module adds its level\'s attributes and upgrades talents; only once unlocked', async () => {
  const angel = await loadTraining('char_103_angel'), e2 = build({ elite: 2, level: 90, potential: 6, skill: -1 });
  const none = operatorAt(angel, e2), x3 = operatorAt(angel, { ...e2, module: 0, moduleLevel: 3 }), x1 = operatorAt(angel, { ...e2, module: 0, moduleLevel: 1 });
  const stats = angel.modules[0].levels.map((l) => l.stats);
  assert.deepEqual([x3.atk - none.atk, x3.maxHp - none.maxHp, x1.atk - none.atk], [stats[2].atk, stats[2].maxHp, stats[0].atk]);
  assert.deepEqual([x1.talentBb, x3.talentBb], [none.talentBb, { attack_speed: 15, atk: 0.1, max_hp: 0.17 }], 'level 1 has no talent part; level 3 upgrades 天使的祝福');
  assert.deepEqual(operatorAt(angel, { ...e2, module: 0, moduleLevel: 9 }), x3, 'capped at its last level');
  assert.deepEqual(operatorAt(angel, { ...e2, module: -1 }), none);
  assert.throws(() => operatorAt(angel, { ...e2, level: 59, module: 0 }), /module 0 is not unlocked at elite 2 level 59/);
  assert.throws(() => operatorAt(angel, { ...e2, module: 2 }), /module 2 is not unlocked/);
  const y2 = operatorAt(angel, { ...e2, module: 1, moduleLevel: 2 });
  assert.equal(y2.talentBb?.attack_speed, 15, '快速弹匣\'s upgrade keeps its leading clause');
});

/** A training at elite 2, max level, potential 6, with a module at a level: its talents and its module's own data. */
const moduled = async (/** @type {string} */ id, /** @type {number} */ module, /** @type {number} */ moduleLevel) => {
  const t = await loadTraining(id), b = build({ elite: 2, level: t.phases[2].maxLevel, potential: 6, skill: -1 }), m = { ...b, module, moduleLevel };
  return { base: upgradedTalentsAt(t, b), mod: upgradedTalentsAt(t, m), own: moduleOwnAt(t, m) };
};

test('[干员-7] a module\'s talent candidate upgrades the talent it is (prefabKey); a hidden one of none is the module\'s own data', async () => {
  const [poca1, helage1, helage2, aigis] = await Promise.all([moduled('char_197_poca', 0, 1), moduled('char_188_helage', 0, 1), moduled('char_188_helage', 0, 2), moduled('char_4218_aigis', 0, 1)]);
  assert.deepEqual([poca1.mod, poca1.own], [poca1.base, { atk_scale: 1.15, value: 3 }], '早露 SIE-X 1: 深入骨髓 stays; the 115 % against heavy enemies is the module\'s');
  assert.deepEqual([helage1.mod, helage1.own], [helage1.base, { hp_ratio: 0.5, damage_resistance: 0.25 }], '赫拉格 SBL-X 1: 月盈星亏 stays; the 庇护 is the module\'s');
  assert.deepEqual([helage2.mod[0].bb, helage2.mod[0].description?.includes('+120')], [{ min_hp_ratio: 0.4, min_attack_speed: 120 }, true], 'SBL-X 2 upgrades 月盈星亏 itself');
  assert.deepEqual([aigis.mod[0].hidden, aigis.mod[0].bb, aigis.own], [true, { atk_scale: 1.1 }, { atk_scale: 1.1 }], '埃癸斯 BRK-X: her hidden talent, and the module\'s data');
});

test('[干员-7] a shown candidate of none of the talents adds to the one at its index: its text, its new keys, the talent\'s own values kept', async () => {
  const [poca, siege, necras, shan] = await Promise.all([moduled('char_197_poca', 0, 2), moduled('char_112_siege', 0, 2), moduled('char_450_necras', 0, 2), moduled('char_264_f12yin', 1, 2)]);
  assert.deepEqual([poca.mod[0].bb, poca.mod[0].description?.endsWith('并额外造成40%攻击力的物理伤害')], [{ extra_atk_scale: 0.4, value: 3, def_penetrate: 0.6 }, true], '早露 SIE-X 2');
  assert.deepEqual(siege.mod[0].bb, { atk: 0.1, def: 0.1 }, '推进之王 SOL-X: the 先锋\'s +10 % kept, not the +6 % of its own');
  assert.equal(necras.mod[0].bb.max_token_cnt, 3, '死芒 SOC-X 2: a part that only changes the text keeps 复燃\'s data');
  assert.deepEqual([shan.mod[1].bb, shan.mod[1].description?.includes('战栗')], [{ prob: 0.2, def: 0.14 }, true], '山 FGT-X 2: 强壮肉体\'s data by its prefabKey (index 2), its text by index 1');
});

test('[干员-7] a module\'s trait parts put their values over the trait\'s blackboard; a part that only shows text changes none', async () => {
  const ascln = await loadTraining('char_4132_ascln'), e2 = build({ elite: 2, level: 60, potential: 6, skill: -1 });
  const prob = (/** @type {Partial<Build>} */ b) => [traitAt(ascln, { ...e2, ...b }).prob, /** @type {any} */ (operatorAt(ascln, { ...e2, ...b }).trait).mods.dodgePhys];
  assert.deepEqual([prob({}), prob({ module: 0, moduleLevel: 3 }), prob({ module: 1, moduleLevel: 1 }), prob({ module: 1, moduleLevel: 3 })],
    [[0.5, 0.5], [0.5, 0.5], [0.65, 0.65], [0.65, 0.65]], '伏击客\'s 65 % dodge with her second module');
  assert.deepEqual(traitAt(ascln, { ...e2, module: 1 }, null), { prob: 0.5 }, 'no module level given: the trait\'s own');
});

test('[干员-9] team parts: 编入队伍时 for the deck, 在场时 on the field, by profession; deck ones apply within one seat\'s deck', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => teamPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('编入队伍时，所有【重装】职业干员的生命上限+20%', { max_hp: 0.2 }), c('在场时所有友方【重装】职业干员的防御力提升8%，自身防御力额外提升4%', { def: 0.08 }),
    c('在场时，所有【先锋】干员每秒回复28点生命', { hp_recovery_per_sec: 28 }), c('编入队伍时所有【先锋】干员的初始技力+8', { sp: 8 }),
  ], [
    { when: 'deck', profession: 'TANK', bb: { max_hp: 0.2 } }, { when: 'field', profession: 'TANK', bb: { def: 0.08 } },
    { when: 'field', profession: 'PIONEER', bb: { hp_recovery_per_sec: 28 } }, { when: 'deck', profession: 'PIONEER', bb: { sp: 8 } },
  ]);
  assert.deepEqual([c('在场时，所有【狙击】干员的部署费用-2', { value: -2, cost: -2 }), c('在场时，所有【支援机械】干员的攻击速度+14', { attack_speed: 14 }),
    c('攻击力+8%', { atk: 0.08 })], [null, null, null], 'cost on the field, a tag that is no faction, not a team talent');
  assert.deepEqual(operatorAt(await loadTraining('char_180_amgoat'), E2).fieldTalents, [{ profession: 'CASTER', bb: { atk: 0.14 } }], '艾雅法拉 at elite 2, potential 1');
});

const E2 = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };

test('[干员-9] deck team parts apply to the operators of their profession in the same seat\'s deck, the holder too', async () => {
  const deck = (/** @type {string[]} */ ids) => ids.map((id) => ({ id, build: E2 }));
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1,
    decks: [deck(['char_2014_nian', 'char_202_demkni', 'char_222_bpipe']), deck(['char_202_demkni', 'char_222_bpipe'])] })).operators);
  const hp = (/** @type {string} */ k) => (ops[k].talentBb ? ops[k].talentBb.max_hp : 0);
  const [nian, bpipe] = await Promise.all(['char_2014_nian', 'char_222_bpipe'].map(async (id) => teamTalentsAt(await loadTraining(id), E2).deck[0].bb));
  assert.ok(Math.abs(hp('char_202_demkni#0') - hp('char_202_demkni#1') - nian.max_hp) < 1e-12, '年 raises the 重装 of her own deck only');
  const plain = /** @type {any} */ (operatorAt(await loadTraining('char_222_bpipe'), E2));
  assert.deepEqual([ops['char_222_bpipe#0'].skill.init, ops['char_222_bpipe#1'].skill.init], [plain.skill.init + bpipe.sp, plain.skill.init + bpipe.sp], '风笛 raises herself in each deck');
});

test('[干员-9] [干员-10] a faction deck talent: 斯卡蒂 raises every 【深海猎人】 of her deck, herself too', async () => {
  const skadi = await loadTraining('char_263_skadi');
  assert.deepEqual([skadi.powers, teamTalentsAt(skadi, E2).deck.map((p) => /** @type {any} */ (p).power)], [['egir', 'abyssal'], ['abyssal']]);
  const deck = (/** @type {string[]} */ ids) => ids.map((id) => ({ id, build: E2 }));
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [deck(['char_263_skadi', 'char_202_demkni'])] })).operators);
  const plain = /** @type {any} */ (operatorAt(skadi, E2));
  assert.equal(ops['char_263_skadi#0'].talentBb.atk - (plain.talentBb ? plain.talentBb.atk ?? 0 : 0), teamTalentsAt(skadi, E2).deck[0].bb.atk);
  assert.equal(ops['char_202_demkni#0'].talentBb && ops['char_202_demkni#0'].talentBb.atk, undefined, 'not a 深海猎人');
});

test('[干员-11] in-range parts: whom, and the modifier by the % of the text; 伊芙利特 from the real data', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => rangePart({ description, bb, hidden: false });
  assert.deepEqual([
    c('攻击范围内的敌军法术抗性-44%', { magic_resistance: -0.44 }), c('攻击范围内的友方单位防御力+65', { def: 65 }),
    c('攻击范围内的远程干员最大生命值+12%（+2%）', { max_hp: 0.12 }), c('攻击范围内的敌人移动速度-25%，攻击范围外的敌人移动速度-10%', { move_speed: -0.25 }),
  ], [
    { side: 'enemy', ranged: false, mods: { resPct: -0.44 } }, { side: 'ally', ranged: false, mods: { defFlat: 65 } },
    { side: 'ally', ranged: true, mods: { hpPct: 0.12 } }, { side: 'enemy', ranged: false, mods: { movePct: -0.25 } },
  ]);
  assert.deepEqual([c('攻击范围内的友方单位攻击速度+8%', { attack_speed: 8 }), c('攻击范围内存在生命值低于一半的敌人时，攻击力+12%', { atk: 0.12 }),
    c('攻击范围内的敌人生命少于40%时，令其获得33%的脆弱效果', { hp_ratio: 0.4 })], [null, null, null]);
  assert.deepEqual(operatorAt(await loadTraining('char_134_ifrit'), E2).rangeTalents, [{ side: 'enemy', ranged: false, mods: { resPct: -0.4 } }]);
  assert.equal(alwaysOn({ description: '防御力+70', bb: { def: 70 }, hidden: false }), null, 'a share written without %: not read as one');
});

test('[干员-12] chance parts: 攻击时 N% 几率 攻击力提升至 M%, with a stun or one more target after it', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => critPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('攻击时，20%几率当次攻击的攻击力提升至160%', { prob: 0.2, atk_scale: 1.6 }),
    c('攻击时，18%<@ba.talpu>（+3%）</>几率当次攻击的攻击力提升至200%，并晕眩敌人1秒', { prob: 0.18, atk_scale: 2, stun: 1 }),
    c('攻击速度+8，攻击时有20%的概率攻击力提升至150%', { attack_speed: 8, prob: 0.2, atk_scale: 1.5 }),
    c('每次攻击有25%的概率攻击力提升至130%，且额外攻击一个目标', { prob: 0.25, atk_scale: 1.3 }),
  ], [{ prob: 0.2, scale: 1.6 }, { prob: 0.18, scale: 2, stun: 1 }, { prob: 0.2, scale: 1.5 }, { prob: 0.25, scale: 1.3, more: 1 }]);
  assert.deepEqual([c('攻击时，20%几率当次攻击的攻击力提升至160%', { atk_scale: 1.6 }), c('攻击力+8%', { prob: 0.1, atk_scale: 1 })], [null, null]);
  const bpipe = operatorAt(await loadTraining('char_222_bpipe'), E2);
  assert.deepEqual(bpipe.critTalents?.map((k) => k.more), [1], '风笛 精密填弹');
});

test('[干员-13] timed parts: 每在场上停留 … 最多叠加, 在战场停留 … 后 (抵抗 too), 部署后 … 秒内', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => timedPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('每在场上停留20秒，攻击力+5%，防御力+4%，最多叠加5层', { max_stack_cnt: 5, interval: 20, atk: 0.05, def: 0.04 }),
    c('在战场停留15秒后，攻击力+18%且获得抵抗', { atk: 0.18, interval: 15, one_minus_status_resistance: -0.5 }),
    c('部署后60秒内技力自然回复速度+0.5/秒', { sp_recovery_per_sec: 0.5, duration: 60 }),
  ], [
    { kind: 'stack', seconds: 20, max: 5, mods: { atkPct: 0.05, defPct: 0.04 } }, { kind: 'after', seconds: 15, max: 1, mods: { atkPct: 0.18, statusResFlat: -0.5 } },
    { kind: 'during', seconds: 60, max: 1, mods: { spRecoveryFlat: 0.5 } },
  ]);
  assert.deepEqual([c('每在场上停留20秒，攻击力+5%', { interval: 20, atk: 0.05 }), c('在战场停留15秒后，仅一次使场上所有重装干员攻击力+8%', { interval: 15, atk: 0.08 })], [null, null]);
  assert.equal(operatorAt(await loadTraining('char_202_demkni'), E2).timedTalents?.[0]?.kind, 'stack', '塞雷娅');
});

test('[干员-14] deployment parts: SP, random SP, heals of everyone, shield layers', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => deployPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('部署后立即获得35点技力', { sp: 35 }), c('部署后立即随机获得7~15点技力', { sp_min: 7, sp_max: 16 }),
    c('部署后立即恢复全场友方单位500点生命', { value: 500 }), c('部署后立刻恢复全体友方单位的生命值，恢复量为末药攻击力的160%', { heal_scale: 1.6 }),
    c('部署后立即获得3层护盾', { times: 3 }), c('部署后立即获得一层护盾，护盾破裂后获得9点技力', { sp: 9 }),
  ], [{ sp: [35, 36] }, { sp: [7, 16] }, { heal: { value: 500 } }, { heal: { scale: 1.6 } }, { shield: 3 }, { shield: 1 }]);
  assert.deepEqual([c('部署后立即对攻击范围内一个敌人投掷闪光弹', { stun: 4 }), c('首次部署后立即获得35点技力', { sp: 35 })], [null, null]);
  assert.deepEqual(operatorAt(await loadTraining('char_180_amgoat'), E2).deployTalents, [{ sp: [7, 16] }], '艾雅法拉');
});

test('[部署-5] 引星棘刺\'s 视界 from the real data: the attack speed for every unit while she is on the field, from elite 2', async () => {
  const { loadTraining: load, operatorAt: at } = await import('../src/index.js');
  const t = await load('char_1039_thorn2'), b = (/** @type {number} */ elite) => ({ elite, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 });
  assert.deepEqual([at(t, b(1)).fieldAspd, at(t, b(2)).fieldAspd], [undefined, { ally: 5, enemy: -5, cnt: 6, allyExtra: 5, enemyExtra: -5 }]);
});

/** A talent of a description and blackboard, not hidden. @param {string} description @param {Record<string, number>} bb */
const talent = (description, bb) => ({ description, bb, hidden: false });
/** An operator's record at elite 2, level 1, potential 1, its first skill (or the slot given). @param {string} id @param {number} [skill] */
const atE2 = async (id, skill = 0) => /** @type {any} */ (operatorAt(await loadTraining(id), { ...E2, skill }));

test('[干员-16] always-on effects that are not attributes: 无视防御 and 法术抗性, 闪避, 攻击距离, 物理伤害 dealt and taken, 减伤, regen by maximum HP', async () => {
  const m = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => alwaysMods(talent(d, bb));
  assert.deepEqual([
    m('攻击时无视目标175（+15）的防御力', { def_penetrate_fixed: 175 }), m('攻击无视敌人23%的防御力', { def_penetrate: 0.23 }), m('无视攻击目标22法术抗性', { magic_resist_penetrate_fixed: 22 }),
    m('获得50%的物理闪避', { prob: 0.5 }), m('获得50%的法术闪避', { prob: 0.5 }), m('获得45%的物理和法术闪避', { prob: 0.45 }),
    m('造成的物理伤害+12%，受到的物理伤害-12%', { damage_scale: 1.12, damage_resistance: 0.12 }), m('自身获得15%的物理减伤', { damage_resistance: 0.15 }),
    m('受到的元素损伤-12%，受到凋亡损伤时回复2点技力', { damage_resistance: 0.12, sp: 2 }), m('每秒回复4%生命值', { hp_recovery_per_sec_by_max_hp_ratio: 0.04 }),
  ], [
    { defIgnoreFlat: 175 }, { defIgnorePct: 0.23 }, { resIgnoreFlat: 22 }, { dodgePhys: 0.5 }, { dodgeArts: 0.5 }, { dodgePhys: 0.45, dodgeArts: 0.45 },
    { physDealtMul: 1.12, physTakenMul: 0.88 }, { physTakenMul: 0.85 }, { epTakenMul: 0.88 }, { hpRegenRatio: 0.04 },
  ]);
  assert.deepEqual([m('获得50%的物理闪避', { atk: 0.1 }), m('自身获得15%的物理减伤；在战场停留35秒后效果翻倍', { damage_resistance: 0.15, interval: 35 }),
    m('获得33%的物理闪避，闪避后此效果失效', { prob: 0.33 })], [null, null, null], 'a key missing, an effect doubled later, one that changes it');
  const tachak = await atE2('char_459_tachak');
  assert.deepEqual([tachak.talentMods, tachak.talentBb], [{ rangeExtend: 2 }, { def: 0.1 }], '战车: 攻击距离+2，防御力+10%，再部署时间+20秒');
  assert.equal(tachak.respawnTime - (await loadTraining('char_459_tachak')).phases[2].frames[0].stats.respawnTime, 20, 'its 再部署时间 folds in as before');
  assert.deepEqual([(await atE2('char_279_excu')).talentMods, (await atE2('char_4218_aigis')).talentMods], [{ defIgnoreFlat: 160 }, { physDealtMul: 1.1, physTakenMul: 0.9 }], '送葬人, 埃癸斯');
});

test('[干员-6] [干员-16] a talent in parts by the skill brought: 夜魔 dodges with her first skill, has the attack with her second; 海蒂 in range', async () => {
  const yoru = talent('装备技能1时获得45%（+5%）的物理和法术闪避，装备技能2时获得+18%（+3%）攻击力', { prob: 0.45, atk: 0.18 });
  assert.deepEqual([forSkill(yoru, 0), forSkill(yoru, 1), forSkill(yoru, 2)].map((c) => [c.description, c.bb]), [
    ['获得45%的物理和法术闪避', { prob: 0.45 }], ['获得+18%攻击力', { atk: 0.18 }], [yoru.description, yoru.bb],
  ]);
  const [s1, s2] = await Promise.all([atE2('char_164_nightm', 0), atE2('char_164_nightm', 1)]);
  assert.deepEqual([s1.talentMods, s1.talentBb, s2.talentMods, s2.talentBb], [{ dodgePhys: 0.4, dodgeArts: 0.4 }, undefined, undefined, { atk: 0.15 }]);
  const [h1, h2] = await Promise.all([atE2('char_4045_heidi', 0), atE2('char_4045_heidi', 1)]);
  assert.deepEqual([h1.rangeTalents, h2.rangeTalents], [[{ side: 'ally', ranged: false, mods: { atkPct: 0.05 } }], [{ side: 'ally', ranged: false, mods: { defPct: 0.05 } }]]);
});

test('[干员-17] conditional parts: the conditions on the operator, each clause after one its own modifiers; 「改为」 adds what it is more', async () => {
  const w = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => whileParts(talent(d, bb));
  assert.deepEqual([
    w('未阻挡敌人时，攻击力和防御力各+14%', { atk: 0.14, def: 0.14 }), w('未阻挡敌人时攻击速度+14，阻挡敌人时攻击力+14%', { attack_speed: 14, atk: 0.14 }),
    w('阻挡两个以上的敌人时，攻击力和防御力+14%', { atk: 0.14, def: 0.14, cnt: 2 }), w('攻击范围内存在2名及以上敌人时，攻击速度+12', { cnt: 2, attack_speed: 12 }),
    w('攻击范围内至少有1名其他友方干员时，攻击力+17%', { atk: 0.17 }), w('攻击范围内存在生命值低于一半的敌人时，攻击力+12%', { hp_ratio: 0.5, atk: 0.12 }),
    w('攻击范围内存在处于凋亡损伤爆发期间的敌方单位时，攻击力+21%', { atk: 0.21 }), w('当周围4格没有敌人时，攻击力+10%', { atk: 0.1 }),
    w('周围四格内仅存在一名敌人时，攻击力+10%', { atk: 0.1, cnt: 1 }), w('当周围四格内没有其他友方单位时，攻击力和防御力各+13%', { atk: 0.13, def: 0.13 }),
    w('技能未开启时，每秒恢复4%的最大生命', { hp_recovery_per_sec_by_max_hp_ratio: 0.04 }),
  ], [
    [{ when: 'notBlocking', mods: { atkPct: 0.14, defPct: 0.14 } }], [{ when: 'notBlocking', mods: { aspd: 14 } }, { when: 'blocking', mods: { atkPct: 0.14 } }],
    [{ when: 'blockingAtLeast', value: 2, mods: { atkPct: 0.14, defPct: 0.14 } }], [{ when: 'enemies', value: 2, mods: { aspd: 12 } }],
    [{ when: 'allies', value: 1, mods: { atkPct: 0.17 } }], [{ when: 'lowHpEnemies', value: 0.5, mods: { atkPct: 0.12 } }],
    [{ when: 'burstEnemies', el: 'DARK', mods: { atkPct: 0.21 } }], [{ when: 'noEnemies4', mods: { atkPct: 0.1 } }],
    [{ when: 'soleEnemy4', mods: { atkPct: 0.1 } }], [{ when: 'aloneUnits4', mods: { atkPct: 0.13, defPct: 0.13 } }],
    [{ when: 'notInSkill', mods: { hpRegenRatio: 0.04 } }],
  ]);
  const kirara = talent('每秒回复2%生命值，周围8格没有友方干员时，改为每秒回复4%（+0.5%）生命值', { hp_recovery_per_sec_by_max_hp_ratio: 0.02, 'kirara_t_2.hp_recovery_per_sec_by_max_hp_ratio': 0.04 });
  assert.deepEqual([alwaysMods(kirara), whileParts(kirara)], [{ hpRegenRatio: 0.02 }, [{ when: 'alone8', mods: { hpRegenRatio: 0.02 } }]], '绮良: 2% always, 2% more alone');
  assert.deepEqual([w('攻击力+8%', { atk: 0.08 }), w('未阻挡敌人时，攻击敌人造成伤害', { atk: 0.1 }), w('阻挡敌人时攻击力+10%。此效果在技能期间翻倍', { atk: 0.1 }),
    w('攻击范围内存在2格以上的地面地形时，攻击力+19%', { atk: 0.19 })], [[], [], [], []], 'no condition, a clause it cannot read, a later 效果, a condition it does not know');
  const [fire, broca] = await Promise.all([atE2('char_493_firwhl'), atE2('char_356_broca')]);
  assert.deepEqual([fire.talentTrait.whiles, broca.talentTrait.whiles], [
    [{ when: 'notBlocking', mods: { atkPct: 0.12 } }, { when: 'blocking', mods: { defPct: 0.12 } }], [{ when: 'blockingAtLeast', value: 2, mods: { atkPct: 0.12, defPct: 0.12 } }],
  ], '火哨, 布洛卡 at elite 2');
});

test('[干员-18] target parts: the target the talent names and what it gets against it', async () => {
  const v = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => targetPart(talent(d, bb));
  assert.deepEqual([
    v('攻击使用远程武器的敌人时，攻击力提升至145%', { atk_scale: 1.45 }), v('攻击被阻挡的敌人造成伤害提升20%', { atk_scale: 1.2 }),
    v('攻击未被阻挡的敌人时攻击力提升至123%', { atk_scale: 1.23 }), v('攻击【萨卡兹】敌人时，攻击力提升至150%', { atk_scale: 1.5 }),
    v('攻击【感染生物】时，攻击力提升至150%', { atk_scale: 1.5 }), v('攻击空中目标时，攻击力提升至140%', { atk_scale: 1.4 }),
    v('攻击飞行目标时，攻击力+50%', { atk_scale: 1.5 }), v('攻击生命值低于40%的敌人伤害提高30%', { hp_ratio: 0.4, damage_scale: 1.3 }),
    v('攻击生命值高于80%的敌人时造成的伤害提高20%', { hp_ratio: 0.8, damage_scale: 1.2 }), v('攻击未被自身阻挡的敌人时，自身造成的伤害+25%', { damage_scale: 1.25 }),
    v('对未被自身阻挡的敌人造成的伤害提升45%', { damage_scale: 1.45 }), v('攻击重量小于等于3的敌人时攻击力提升至136%', { value: 3, atk_scale: 1.36 }),
    v('攻击重量大于等于3的敌人时无视目标200的防御力', { value: 3, def_penetrate_fixed: 200 }), v('攻击被战栗的目标时，无视目标30%的防御力', { def_penetrate: 0.3 }),
  ], [
    { when: 'rangedFoe', atk: 1.45 }, { when: 'blocked', atk: 1.2 }, { when: 'unblocked', atk: 1.23 }, { when: 'tag', tag: 'sarkaz', atk: 1.5 },
    { when: 'tag', tag: 'infection', atk: 1.5 }, { when: 'flying', atk: 1.4 }, { when: 'flying', atk: 1.5 }, { when: 'hpBelow', value: 0.4, dmg: 1.3 },
    { when: 'hpAbove', value: 0.8, dmg: 1.2 }, { when: 'notOwnBlocked', dmg: 1.25 }, { when: 'notOwnBlocked', dmg: 1.45 },
    { when: 'light', value: 3, atk: 1.36 }, { when: 'heavy', value: 3, defFlat: 200 }, { when: 'status', status: 'disarmedCombat', defPct: 0.3 },
  ]);
  assert.deepEqual([v('优先攻击【无人机】单位，且攻击【无人机】时攻击力提升至155%', { atk_scale: 1.55 }), v('攻击【海嗣】敌人时，攻击力提升至150%', { atk_scale: 1.5 }),
    v('攻击被阻挡的敌人时攻击力提升至115%，并回复1点技力', { atk_scale: 1.15, sp: 1 })], [null, null, null], 'a priority, a tag it does not know, more after it');
  assert.deepEqual((await atE2('char_363_toddi')).talentTrait.vs, [{ when: 'tag', tag: 'sarkaz', atk: 1.45 }], '熔泉');
});

test('[干员-19] hit parts: a status at a chance or on every hit, the first hit on each enemy, 法术脆弱, lower 法术抗性, 灼痕; arts damage on each hit, two targets', async () => {
  const h = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => hitPart(talent(d, bb));
  assert.deepEqual([
    h('攻击时有23%的几率使目标束缚1.5秒', { prob: 0.23, duration: 1.5 }), h('攻击时有40%的几率对攻击目标造成2秒的停顿', { 'attack@prob': 0.4, 'attack@sluggish': 2 }),
    h('攻击时对攻击目标造成0.6秒的停顿', { sluggish: 0.6 }), h('攻击使目标的特殊能力失效，持续6秒', { duration: 6 }),
    h('对每个敌人首次造成伤害时，使其战栗5秒', { not_combat: 5 }), h('对每个敌人首次造成伤害后，使目标的特殊能力失效，持续7秒', { silence: 7 }),
    h('攻击敌人时对目标施加14%的【法术脆弱】，持续5秒', { 'weak[magic][limit]': 5, damage_scale: 1.14 }), h('攻击使目标法术抗性-23%，持续1秒', { duration: 1, magic_resistance: -0.23 }),
    h('攻击时有25%的几率使目标法术抗性-25%，持续3秒', { prob: 0.25, magic_resistance: -0.25, duration: 3 }),
    h('造成伤害时有30%概率对敌人施加灼痕效果：攻击力-22%、32%的【法术脆弱】，不可叠加持续6秒', { prob: 0.3, atk: -0.22, damage_scale: 1.32, duration: 6 }),
  ], [
    { status: { key: 'root', seconds: 1.5 }, prob: 0.23 }, { status: { key: 'sluggish', seconds: 2 }, prob: 0.4 }, { status: { key: 'sluggish', seconds: 0.6 } },
    { status: { key: 'silence', seconds: 6 } }, { status: { key: 'disarmedCombat', seconds: 5 }, first: true }, { status: { key: 'silence', seconds: 7 }, first: true },
    { status: { key: 'artsFragile', seconds: 5, value: 0.14 } }, { debuff: { seconds: 1, mods: { resPct: -0.23 } } },
    { debuff: { seconds: 3, mods: { resPct: -0.25 } }, prob: 0.25 }, { prob: 0.3, debuff: { seconds: 6, mods: { atkPct: -0.22, artsTakenMul: 1.32 } } },
  ]);
  assert.deepEqual([h('攻击时有20%的几率使目标束缚4秒，不以束缚状态的敌人为攻击目标', { prob: 0.2, duration: 4 }), h('攻击时有20%的几率使目标束缚4秒', { duration: 4 })], [null, null]);
  assert.deepEqual([attackPart(talent('攻击额外造成攻击力20%的法术伤害', { 'attack@atk_scale_1': 0.2 })), attackPart(talent('攻击时同时攻击两个目标', { 'attack@max_target': 2 }))],
    [{ extraArts: 0.2 }, { targets: 2 }]);
  const [siege, yato, bell] = await Promise.all([atE2('char_1019_siege2'), atE2('char_1029_yato2'), atE2('char_174_slbell')]);
  assert.deepEqual([siege.talentTrait.onHit, yato.talentTrait.extraArts, bell.talentTrait.targets], [[{ status: { key: 'disarmedCombat', seconds: 4 }, first: true }], 0.2, 2],
    '维娜·维多利亚, 麒麟R夜刀, 初雪');
});

test('[干员-12] more chance parts: more attack for that attack, 防御 ignored, two hits, a hit at a 倍率', async () => {
  const c = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => critPart(talent(d, bb));
  assert.deepEqual([
    c('普通攻击和技能释放时，30%几率当次攻击的攻击力+60%', { prob: 0.3, atk: 0.6 }), c('攻击时有20%的几率无视目标的防御', { prob: 0.2 }),
    c('攻击时有23%的几率连续攻击两次', { prob: 0.23 }), c('攻击时有10%概率造成二连击', { 'attack@prob': 0.1, 'attack@normal_prob': 0.9 }),
    c('攻击有30%几率造成相当于攻击力160%的物理伤害，对受到雷鸣地雷效果影响的目标必定触发', { prob: 0.3, atk_scale: 1.6 }),
  ], [{ prob: 0.3, scale: 1, atk: 0.6 }, { prob: 0.2, scale: 1, ignoreDef: 1 }, { prob: 0.23, scale: 1, times: 2 }, { prob: 0.1, scale: 1, times: 2 }, { prob: 0.3, scale: 1.6 }]);
  assert.deepEqual((await atE2('char_106_franka')).critTalents, [{ prob: 0.2, scale: 1, ignoreDef: 1 }], '芙兰卡');
});

test('[干员-9] team parts for every friendly unit, with effects, and 同类效果取最高', async () => {
  const c = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => teamPart(talent(d, bb));
  assert.deepEqual([
    c('全场友方单位攻速+8（+1）', { attack_speed: 8 }), c('在场时所有友方单位的技力自然回复速度+0.3/秒（同类效果取最高）', { sp_recovery_per_sec: 0.3 }),
    c('在场时，全地图的友方单位医疗效果提高12%', { heal_scale: 1.12 }), c('在场时，所有【先锋】职业干员获得25%的物理闪避', { prob: 0.25 }),
  ], [
    { when: 'field', all: true, bb: { attack_speed: 8 } }, { when: 'field', all: true, bb: { sp_recovery_per_sec: 0.3 }, max: true },
    { when: 'field', all: true, bb: {}, mods: { healingDealtMul: 1.12 } }, { when: 'field', profession: 'PIONEER', bb: {}, mods: { dodgePhys: 0.25 } },
  ]);
  assert.deepEqual([c('编入队伍时，所有【先锋】职业干员获得25%的物理闪避', { prob: 0.25 }), c('技能未开启时，全场友方单位每秒回复25点生命', { hp_recovery_per_sec: 25 })], [null, null],
    'no effect for the deck; a condition first');
  const [mostma, plosis] = await Promise.all([atE2('char_213_mostma'), atE2('char_128_plosis')]);
  assert.deepEqual([mostma.fieldTalents, plosis.fieldTalents], [[{ profession: 'CASTER', bb: { sp_recovery_per_sec: 0.4 }, max: true }], [{ all: true, bb: { sp_recovery_per_sec: 0.3 }, max: true }]]);
});

test('[干员-16] [干员-17] [干员-19] a kitted operator leaves its talents to its kit: no talent effects or trait additions in the match', async () => {
  const kitted = 'char_1013_chen2';
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [[{ id: 'char_279_excu', build: E2 }, { id: kitted, build: E2 }]] },
    undefined, { [kitted]: /** @type {any} */ (() => ({})) })).operators);
  assert.deepEqual([ops['char_279_excu#0'].talentMods, ops[`${kitted}#0`].talentMods, ops[`${kitted}#0`].talentTrait], [{ defIgnoreFlat: 160 }, undefined, undefined]);
});
