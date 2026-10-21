// Talents on the deck, the cost and deployments as @aue/content reads them (docs/spec/operators.md 干员-29, 干员-21,
// 干员-9): what each description adds to the trait and the team parts, from the text and from the real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTraining, operatorAt, matchContent } from '../src/index.js';
import { spParts } from '../src/talentparts.js';
import { deckParts } from '../src/talentdeck.js';

/** @typedef {import('../src/operators.js').Build} Build */
const E2 = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };
/** A talent candidate with this text and blackboard. @param {string} description @param {Record<string, number>} bb */
const talent = (description, bb) => ({ description, bb, hidden: false });
/** An operator at E2 level 1. @param {string} id */
const atE2 = async (id) => /** @type {any} */ (operatorAt(await loadTraining(id), E2));

test('[干员-29] [干员-21] [干员-9] talents on the deck, the cost and deployments: a starting cost, first deployments, cuts, cost recovery, SP on deployments, skills and attacks', async () => {
  const d = (/** @type {string} */ text, /** @type {Record<string, number>} */ bb) => deckParts(talent(text, bb));
  assert.deepEqual([
    d('编入队伍后，额外获得2点初始部署费用', { cost: 2 }),
    d('首次部署时，攻击力+15%（+2%），费用-3', { runtime_cost: -3, atk: 0.15 }),
    d('首次部署时部署费用-3，部署后立即获得20（+3）技力', { runtime_cost: -3, sp: 20 }),
    d('自身初次部署费用-3；撤退后使下一名干员部署费用-1', { runtime_cost: -3, value: -1 }),
    d('部署后，所有未部署的【近卫】干员的部署费用-1（每个干员每次被部署前，最多可被减少5费）', { flag: 1, value: -1, max_stack_cnt: 5 }),
    d('携带时【莱茵生命】干员部署费用-2，首名【莱茵生命】干员部署费用额外-2（+1）', { cost: -2, runtime_cost: -2 }),
    d('在场时，所有【狙击】干员的部署费用-2，且技能开启时所有【狙击】干员的攻击速度+23（+3）', { value: -2, attack_speed: 23 }),
  ], [
    { trait: { startCost: 2 } },
    { trait: { firstCost: -3, whiles: [{ when: 'firstDeploy', mods: { atkPct: 0.15 } }] } },
    { trait: { firstCost: -3, deploySp: [{ who: 'self', first: true, sp: 20 }] } },
    { trait: { firstCost: -3, retreatCut: -1 } },
    { trait: { deployCut: { profession: 'WARRIOR', value: -1, max: 5 } } },
    { trait: { costCuts: [{ power: 'rhine', value: -2, first: true }] }, deck: [{ when: 'deck', power: 'rhine', bb: { cost: -2 } }] },
    { trait: { costCuts: [{ profession: 'SNIPER', value: -2, field: true }] }, field: [{ profession: 'SNIPER', bb: { attack_speed: 23 }, skill: true }] },
  ]);
  assert.deepEqual([
    d('在场时，部署费用的自然回复速度+10%，若4秒内自身未受到伤害，则每秒恢复5%（+1%）的最大生命值',
      { delta_cost_increase_time: 1.1, interval: 4, 'vulpis_t_2[heal][interval].hp_recovery_per_sec_by_max_hp_ratio': 0.05 }),
    d('首次部署后立即获得35（+5）点技力，每次部署时使在场术师干员技力+5（+1），在场时其余友方术师干员初始技力+5（+1）', { 'lava2_t_1[ally].sp': 5, 'lava2_t_1[self].sp': 35 }),
    d('攻击范围内的干员开启技能时自身回复1点技力，且攻击速度+16，持续10（+2）秒', { attack_speed: 16, duration: 10, max_stack_cnt: 1, prob: 1, sp: 1 }),
    d('在场时所有【狙击】干员的攻击回复技能每2.5秒回复1点技力', { sp: 1, interval: 2.5 }),
    d('在场时所有受击回复的技能在干员攻击时也回复1点技力', { sp: 1 }),
    d('部署时，若周围4格没有其他干员，获得3（+1）点部署费用', { cost: 3 }),
  ], [
    { trait: { costRate: 1.1, whiles: [{ when: 'unhurt', value: 4, fresh: true, mods: { hpRegenRatio: 0.05 } }] } },
    { trait: { deploySp: [{ who: 'self', first: true, sp: 35 }, { who: 'field', profession: 'CASTER', sp: 5 }, { who: 'arriving', profession: 'CASTER', sp: 5 }] } },
    { trait: { allySkill: { sp: 1, seconds: 10, mods: { aspd: 16 } } } },
    { trait: { spPulse: { profession: 'SNIPER', every: 2.5, sp: 1 } } },
    { trait: { hurtAttackSp: 1 } },
    { trait: { aloneCost: 3 } },
  ]);
  assert.deepEqual(spParts(talent('每场战斗中首次释放技能结束后立即回复10（+2）点技力', { sp: 10 })), [{ on: 'firstSkillEnd', sp: 10 }], '杏仁');
  assert.deepEqual([d('编入队伍后，额外获得2点初始部署费用', {}), d('部署后，所有未部署的【龙门】干员的部署费用-1', { value: -1, max_stack_cnt: 5 }),
    d('携带时【莱茵生命】干员部署费用-2，首名【深海猎人】干员部署费用额外-2', { cost: -2, runtime_cost: -2 }), deckParts({ ...talent('编入队伍后，额外获得2点初始部署费用', { cost: 2 }), hidden: true })],
  [null, null, null, null], 'without its key; a faction for a profession; two names; hidden');
  const [texas, elysm] = [await atE2('char_102_texas'), await atE2('char_401_elysm')];
  assert.deepEqual([texas.talentTrait.startCost, elysm.talentTrait.costCuts, elysm.fieldTalents], [2, [{ profession: 'SNIPER', value: -2, field: true }], [{ profession: 'SNIPER', bb: { attack_speed: 20 }, skill: true }]],
    '德克萨斯, 极境 from the real data');
  const deck = (/** @type {string[]} */ ids) => ids.map((id) => ({ id, build: E2 }));
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [deck(['char_249_mlyss', 'char_202_demkni']), deck(['char_202_demkni'])] })).operators);
  const plain = /** @type {any} */ (operatorAt(await loadTraining('char_202_demkni'), E2));
  assert.deepEqual([ops['char_202_demkni#0'].cost, ops['char_202_demkni#1'].cost, ops['char_249_mlyss#0'].talentTrait.costCuts[0].first], [plain.cost - 2, plain.cost, true],
    '缪尔赛思 takes 2 off the 莱茵生命 of her own deck, the first one more');
});
