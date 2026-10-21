// More talents in time and on the field as @aue/content reads them (docs/spec/operators.md 干员-34): what each description
// adds to the trait, the chance talents and the in-range talents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastParts } from '../src/talentlast.js';

/** The parts of a talent candidate with this text and blackboard. @param {string} description @param {Record<string, number>} bb */
const l = (description, bb) => lastParts({ description, bb, hidden: false });

test('[干员-34] talents in time and on the field: a faction\'s 倍率, ammo, the first skill, seconds after the deployment, a blast, the first block, weakened 法抗, 元素损伤', () => {
  assert.deepEqual([
    l('在场时，所有【米诺斯】干员攻击生命比例不高于自身的敌人时攻击力提升至112%（+2%）', { talent_atk_scale: 1.12 }),
    l('攻击时有23%（+3%）几率额外攻击一次，技能期间每消耗1颗弹药这个几率提升5%，技能结束时重置', { prob: 0.23, prob_add: 0.05 }),
    l('部署后首次开启技能时，接下来50次攻击的攻击力提升至120%（+5%）', { power_attack_count: 50, power_attack_scale: 1.2 }),
    l('部署后20秒内所有友方【近战位】单位的攻击力和防御力+20%', { duration: 20, atk: 0.2, def: 0.2 }),
    l('部署后20秒内攻击范围内所有友方远程位单位更不容易被攻击且敌方空中单位获得25%的脆弱效果', { duration: 20, damage_scale: 1.25, 'jnight_t.taunt_level': -1 }),
    l('部署经过3秒后，对周围8格内的所有敌人造成相当于攻击力400%的物理伤害，并令其获得8秒30%的脆弱效果，之后自身强制退出战场', { interval: 3, damage_by_atk_scale: 4, 'weak[limit]': 8, damage_scale: 1.3 }),
    l('首次阻挡敌人时立即获得4点部署费用，并使该敌人沉睡8秒', { cost: 4, cnt: 1, sleep: 8 }),
    l('部署后20秒内，攻击使敌人法术抗性-25%（持续10秒），且优先攻击未获得此效果的敌人', { duration: 20, buff_duration: 10, magic_resistance: -0.25 }),
    l('部署后40秒内攻击附带60点凋亡损伤，并使攻击范围内的所有敌人受到10%的【法术脆弱】和【元素脆弱】', { duration: 40, 'attack@dark_damage_value': 60, damage_scale: 1.1 }),
  ], [
    { trait: { fieldVs: { power: 'minos', vs: [{ when: 'hpRatioAtMostOwn', atk: 1.12 }] } } },
    { crit: [{ prob: 0.23, scale: 1, times: 2, ammoProb: 0.05, sp: 1 }] },
    { trait: { powerAttacks: { count: 50, scale: 1.2 } } },
    { trait: { fieldBuffs: [{ melee: true, during: 20, mods: { atkPct: 0.2, defPct: 0.2 } }] } },
    { range: [{ side: 'ally', ranged: true, during: 20, mods: { taunt: -1 } }, { side: 'enemy', ranged: false, when: { when: 'flying' }, during: 20, mods: { dmgTakenMul: 1.25 } }] },
    { trait: { timedBlast: { after: 3, scale: 4, fragile: { value: 0.3, seconds: 8 } } } },
    { trait: { firstBlock: { cost: 4, sleep: 8 } } },
    { trait: { onHit: [{ during: 20, debuff: { seconds: 10, mods: { resMul: 0.75 } } }], prefer: [{ lacksHit: true, during: 20 }] } },
    { trait: { onHit: [{ during: 40, ep: { el: 'DARK', amount: 60 } }] }, range: [{ side: 'enemy', ranged: false, during: 40, mods: { artsTakenMul: 1.1, elementalTakenMul: 1.1 } }] },
  ]);
  assert.deepEqual([l('首次阻挡敌人时立即获得4点部署费用，并使该敌人沉睡8秒', {}), l('在场时，所有【先锋】干员攻击生命比例不高于自身的敌人时攻击力提升至112%', { talent_atk_scale: 1.12 })],
    [null, null], 'without its key; a profession for a faction');
});
