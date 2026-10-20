// More talents as @aue/content reads them (docs/spec/operators.md 干员-30, 干员-12, 干员-21, 干员-27): what each
// description adds to the trait, a talent's attack range, from the text and from the real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTraining, operatorAt } from '../src/index.js';
import { critPart } from '../src/talents.js';
import { spParts, specialParts } from '../src/talentparts.js';
import { moreParts } from '../src/talentmore.js';
import rangeTable from '../data/ranges.json' with { type: 'json' };

const E2 = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };
/** A talent candidate with this text and blackboard. @param {string} description @param {Record<string, number>} bb @param {string} [rangeId] */
const talent = (description, bb, rangeId) => ({ description, bb, hidden: false, ...(rangeId ? { rangeId } : {}) });
/** An operator at E2 level 1. @param {string} id */
const atE2 = async (id) => /** @type {any} */ (operatorAt(await loadTraining(id), E2));

test('[干员-30] talents on the operator itself: slower attacks, until hurt, a random gain, around its skill, at low SP, enemies around, by HP', () => {
  const m = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb, /** @type {string[]} */ [r] = []) => moreParts(talent(d, bb, r));
  assert.deepEqual([
    m('攻击速度+12（+2），自身受到伤害后失去该效果', { attack_speed: 12 }),
    m('部署后随机永久获得下列一项增益：攻击力+15%（+2%）；攻击速度+15（+2）；生命上限+22%（+2%）', { attack_speed: 15, atk: 0.15, max_hp: 0.22 }),
    m('攻击间隔略微增大，但攻击力+20%', { base_attack_time: 0.2, atk: 0.2 }),
    m('攻击范围扩大，但攻击间隔略微增大', { base_attack_time: 0.15 }, ['3-1']),
    m('自身与浮游单元的攻击速度+12', { attack_speed: 12 }),
    m('技能期间及技能结束后的10秒内攻击力+16%（+3%）', { atk: 0.16, duration: 10 }),
    m('未开启技能且技力小于或等于最大值一半时，停止攻击并每秒恢复3.5%（+0.5%）最大生命值', { hp_recovery_per_sec_by_max_hp_ratio: 0.035, sp_ratio: 0.5 }),
    m('攻击敌人时攻击力提升至113%（+3%）。周围存在3名及以上敌人时攻击力提升至118%（+3%）且受到的伤害减少15%', { atk_scale_base: 1.13, cnt: 3, atk_scale_up: 1.18, damage_resistance: 0.15 }),
    m('受到的治疗效果提升25%（+5%），生命值低于一半时提升至45%（+5%）', { heal_scale_1: 1.25, heal_scale_2: 1.45, hp_ratio: 0.5 }),
  ], [
    { whiles: [{ when: 'neverHurt', mods: { aspd: 12 } }] },
    { deployPick: [{ atkPct: 0.15 }, { aspd: 15 }, { hpPct: 0.22 }] },
    { whiles: [{ when: 'always', mods: { batFlat: 0.2, atkPct: 0.2 } }] },
    { whiles: [{ when: 'always', mods: { batFlat: 0.15 } }] },
    { whiles: [{ when: 'always', mods: { aspd: 12 } }] },
    { whiles: [{ when: 'skillOrAfter', value: 10, mods: { atkPct: 0.16 } }] },
    { whiles: [{ when: 'lowSp', value: 0.5, mods: { hpRegenRatio: 0.035 }, flags: { noAttack: true } }] },
    { whiles: [{ when: 'enemiesNear', value: 3, mods: { atkScaleMul: 1.18, dmgTakenMul: 0.85 } }, { when: 'fewEnemiesNear', value: 3, mods: { atkScaleMul: 1.13 } }] },
    { whiles: [{ when: 'hpBelow', value: 0.5, mods: { healingTakenMul: 1.45 } }, { when: 'hpNotBelow', value: 0.5, mods: { healingTakenMul: 1.25 } }] },
  ]);
  assert.deepEqual([m('攻击范围扩大，但攻击间隔略微增大', { base_attack_time: 0.15 }), m('攻击速度+12，自身受到伤害后失去该效果', {}), moreParts({ ...talent('自身与浮游单元的攻击速度+12', { attack_speed: 12 }), hidden: true })],
    [null, null, null], 'without its range id; without its key; hidden');
});

test('[干员-30] talents on kills near it, its deployment, its heals, 隐匿 enemies and its damage\'s floor', () => {
  const m = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => moreParts(talent(d, bb));
  assert.deepEqual([
    m('周围8格内有敌人倒下时，恢复自身最大生命值14%（+2%）的生命', { hp_ratio: 0.14 }),
    m('自身阻挡的敌方单位被击杀时，回复自身18%（+2%）的生命', { hp_ratio: 0.18 }),
    m('部署后全体友方【医疗】职业干员攻击力+12%（+2%），防御力+120（+20），持续17（+2）秒', { atk: 0.12, def: 120, duration: 17 }),
    m('在战场时全体友方单位每秒恢复相当于调香师攻击力5.5%（+0.5%）的生命', { atk_to_hp_recovery_ratio: 0.055 }),
    m('在治疗目标后使其获得4秒抵抗', { 'status_resistance[limit]': 4, one_minus_status_resistance: -0.5 }),
    m('治疗的目标获得4秒抵抗，若目标生命值高于75%则改为6秒抵抗', { 'status_resistance[limit]': 4, 'lumen_t_1[special].status_resistance[limit]': 6, one_minus_status_resistance: -0.5,
      'lumen_t_1[special].one_minus_status_resistance': -0.5, hp_ratio: 0.75 }),
    m('治疗地面单位，元素损伤回复量提高23%（+3%）', { ep_heal_scale: 1.23 }),
    m('可以攻击隐匿敌人，并且攻击范围内存在隐匿敌人时，攻击力+20%（+3%）', { atk: 0.2 }),
    m('每次攻击至少造成33%（+3%）攻击力的伤害', { atk_scale: 0.33 }),
    m('每次攻击至少造成25%攻击力的伤害（当敌人在正前方两格时提升至40%）', { atk_scale: 0.25, atk_scale_2: 0.4 }),
    m('部署后立即对攻击范围内一个敌人投掷闪光弹，使其和周围敌人晕眩4秒', { stun: 4 }),
    m('部署时对周围四格敌人造成80%攻击力的真实伤害并晕眩3秒，上一名部署干员势力为【卡西米尔】时额外造成一次伤害', { atk_scale: 0.8, stun: 3 }),
  ], [
    { downHeal: [{ where: 'around', share: 0.14 }] }, { downHeal: [{ where: 'blocked', share: 0.18 }] },
    { deployBuff: { profession: 'MEDIC', seconds: 17, mods: { atkPct: 0.12, defFlat: 120 } } }, { fieldRegen: 0.055 },
    { healGives: { seconds: 4, mods: { statusResFlat: -0.5 } } }, { healGives: { seconds: 4, mods: { statusResFlat: -0.5 }, above: 0.75, aboveSeconds: 6 } },
    { groundEpHeal: 1.23 }, { seeStealth: true, whiles: [{ when: 'stealthEnemies', mods: { atkPct: 0.2 } }] },
    { minDamage: { scale: 0.33 } }, { minDamage: { scale: 0.25, front: 0.4 } }, { deployStun: { seconds: 4, radius: 1 } },
    { deployBlast: { scale: 0.8, stun: 3, again: 'kazimierz' } },
  ]);
});

test('[干员-12] [干员-21] [干员-27] a chance raised while the skill runs, SP at a chance for damage, a preferred tag with +N%', () => {
  assert.deepEqual(critPart(talent('攻击时，10%几率当次攻击的攻击力+110%（+10%）。技能中这个几率提高到30%', { atk: 1.1, prob1: 0.1, prob2: 0.3 })),
    { prob: 0.1, scale: 1, atk: 1.1, skillProb: 0.3 });
  assert.deepEqual(spParts(talent('造成伤害时有23%（+3%）的几率额外回复1点技力', { sp: 1, prob: 0.23 })), [{ on: 'dealt', prob: 0.23, sp: 1 }]);
  assert.deepEqual(specialParts(talent('优先攻击【无人机】单位，且攻击【无人机】时攻击力+43%（+3%）', { atk_scale: 1.43 })).trait,
    { prefer: [{ tag: 'drone' }], vs: [{ when: 'tag', tag: 'drone', atk: 1.43 }] });
});

test('[干员-30] from the real data: 霜叶\'s range from its talent, 红豆\'s chance, 酸糖\'s floor', async () => {
  const [frost, vigna, acid] = [await atE2('char_193_frostl'), await atE2('char_290_vigna'), await atE2('char_366_acdrop')];
  assert.deepEqual(frost.range, rangeTable.ranges['3-1']);
  assert.equal(vigna.critTalents[0].skillProb, 0.3);
  assert.deepEqual(acid.talentTrait.minDamage, { scale: 0.25, front: 0.4 });
});
