// Talents on heals as @aue/content reads them (docs/spec/operators.md 干员-32): what each description adds to the trait
// and the in-range talents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healParts } from '../src/talentheal.js';

/** The parts of a talent candidate with this text and blackboard. @param {string} description @param {Record<string, number>} bb */
const h = (description, bb) => healParts({ description, bb, hidden: false });

test('[干员-32] talents on heals: a share for the healer, one more target, what a heal leaves, heals for statuses, low targets, 屏障, the skill\'s end, 抵抗, the sturdiest', () => {
  assert.deepEqual([
    h('治疗其他友方单位时，焰影苇草同时享受55%（+5%）的治疗量', { scale: 0.55 }),
    h('有18%（+3%）的几率额外治疗一名友方单位', { 'attack@prob': 0.18 }),
    h('治疗友方单位后为其提供持续3秒的25%（+5%）物理闪避', { prob: 0.25, duration: 3 }),
    h('攻击范围内的友方受到异常状态时，立刻治疗目标相当于流明攻击力80%的生命，该效果有10（-2）秒冷却时间', { heal_scale: 0.8, duration: 10 }),
    h('治疗时，若目标生命少于40%则为其额外恢复150（+10）点生命', { hp_ratio: 0.4, value: 150 }),
    h('治疗友方单位生命时，超过目标生命上限的治疗量可转化为不断衰减的屏障', { dec_rate: -0.1, scale: 50 }),
    h('治疗会为目标干员附加相当于自身22%（+2%）攻击力的屏障，持续8秒', { 'attack@scale': 0.22, 'attack@shield_duration': 8 }),
    h('技能结束后，治疗自身和攻击范围内最多3名干员相当于岳羽由加莉攻击力100%的生命值', { max_target: 3, heal_scale: 1 }),
    h('攻击范围内拥有抵抗的友方单位每秒恢复相当于絮雨攻击力7%（+1%）的生命（不受特性影响）', { atk_to_hp_recovery_ratio: 0.07 }),
    h('超出自身生命上限的生命值可转化为屏障；最多不超过自身最大生命值的104%（+4%）', { max_hp_ratio: 1.04, def: 0 }),
    h('攻击范围内生命上限最高的友方角色受到的治疗效果提升18%（+3%）', { heal_scale: 1.18 }),
  ], [
    { trait: { healShare: 0.55 } }, { trait: { healMore: 0.18 } }, { trait: { healGives: { seconds: 3, mods: { dodgePhys: 0.25 } } } },
    { trait: { statusHeal: { scale: 0.8, cooldown: 10 } } }, { trait: { lowHeal: { below: 0.4, value: 150 } } }, { trait: { overhealBarrier: { cap: 50, decay: 0.1 } } },
    { trait: { healBarrier: { scale: 0.22, seconds: 8 } } }, { trait: { skillEndHeal: { scale: 1, max: 3 } } }, { trait: { resistRegen: 0.07 } },
    { trait: { overflowBarrier: 1.04 } }, { range: [{ side: 'ally', ranged: false, when: { when: 'maxHpHighest' }, mods: { healingTakenMul: 1.18 } }] },
  ]);
  assert.deepEqual([h('治疗时，若目标生命少于40%则为其额外恢复150点生命', {}), healParts({ description: '治疗其他友方单位时，焰影苇草同时享受55%的治疗量', bb: { scale: 0.55 }, hidden: true })],
    [null, null], 'without its key; hidden');
});
