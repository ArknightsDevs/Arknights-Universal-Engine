// Operators at a training (docs/spec/operators.md) on the real training data: the skeleton's operator again, levels in
// between, trust, potentials, skill levels and unlocks, trait candidates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTraining, operatorAt, skeletonContent, ROSTER } from '../src/index.js';
import { traitAt, teamTalentsAt } from '../src/operators.js';
import { talentsAt, alwaysOn, teamPart, rangePart, critPart, timedPart, deployPart } from '../src/talents.js';
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
