// Talents on attacks and statuses as @aue/content reads them (docs/spec/operators.md 干员-33): what each description adds
// to the trait, the chance talents and the in-range talents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fightParts } from '../src/talentfight.js';

/** The parts of a talent candidate with this text and blackboard. @param {string} description @param {Record<string, number>} bb */
const f = (description, bb) => fightParts({ description, bb, hidden: false });

test('[干员-33] talents on attacks: the same target, statuses at a chance, beyond the range, attackers, 停顿, energy, one of several, kinds, a strike, a growing chance, spending', () => {
  assert.deepEqual([
    f('攻击相同目标时每次攻击可提高自身攻击力6%（+1%），最多可叠加5层。更换目标会失去之前叠加的效果', { max_stack_cnt: 5, atk: 0.06 }),
    f('攻击时有20%（+2%）的几率使目标束缚4秒，不以束缚状态的敌人为攻击目标', { prob: 0.2, duration: 4 }),
    f('攻击原本攻击范围以外的目标时，有28%（+3%）的几率使其晕眩2秒', { buff_prob: 0.28, stun: 2 }),
    f('敌人攻击泡泡后，攻击力下降8%，持续5秒', { atk: -0.08, duration: 5 }),
    f('稍微延长特性停顿的持续时间', { sluggish: 0.13 }),
    f('储存的攻击能量造成的伤害提升至134%（+4%）', { atk_scale: 1.34 }),
    f('每次攻击时有70%概率触发下列效果之一：攻击变为二连击；目标晕眩1秒；攻击无视目标防御力的80%', { prob: 0.7, stun: 1, def_penetrate: 0.8 }),
    f('上场后每击倒过一种敌人，自身造成的伤害+7%（+1%），最多叠加3次', { damage_scale: 0.07, max_stack_cnt: 3 }),
    f('击倒敌人后，莱欧斯攻击所有同名敌人时无视其40%防御力', { def_penetrate: 0.4 }),
    f('开启技能时，派出裂云兽进行攻击，造成相当于攻击力185%（+5%）的物理伤害和3秒寒冷', { atk_scale: 1.85, cold: 3 }),
    f('攻击时有30%概率使当次攻击力提升至150%，自身在场时，【格拉斯哥帮】干员周围4格内每有一个敌人倒下，攻击力提升额外提升5%（最高提升至240%）',
      { prob: 0.3, atk_scale: 1.5, atk_up_max_value: 2.4, atk_up_each_time: 0.05 }),
    f('通过部署、开启技能、使用装备应变消耗费用后，攻击力+5%（+1%），使攻击范围内的敌人晕眩2秒（攻击力最多提升5次）', { atk: 0.05, max_stack_cnt: 5, stun: 2 }),
  ], [
    { trait: { sameTarget: { max: 5, mods: { atkPct: 0.06 } } } },
    { trait: { onHit: [{ prob: 0.2, status: { key: 'root', seconds: 4 } }], skipStatus: 'root' } },
    { trait: { onHit: [{ when: 'beyondRange', prob: 0.28, status: { key: 'stun', seconds: 2 } }] } },
    { trait: { attackerMods: { seconds: 5, mods: { atkPct: -0.08 } } } },
    { trait: { hitStatusPlus: 0.13 } }, { trait: { energyScale: 1.34 } },
    { crit: [{ prob: 0.7, scale: 1, pick: [{ times: 2 }, { stun: 1 }, { ignoreDef: 0.8 }] }] },
    { trait: { kindStack: { max: 3, mods: { dmgDealtMul: 1.07 } } } },
    { trait: { slainKinds: true, vs: [{ when: 'slainKind', defPct: 0.4 }] } },
    { trait: { skillStrike: { scale: 1.85, cold: 3 } } },
    { crit: [{ prob: 0.3, scale: 1.5, grow: { power: 'glasgow', step: 0.05, max: 2.4 } }] },
    { trait: { spendBoost: { max: 5, mods: { atkPct: 0.05 }, stun: 2 } } },
  ]);
});

test('[干员-33] talents on statuses and stances: steps for 停顿 dealt, 脆弱 by time and status, 隐匿 undone, a run of hits, 重伤, 起飞, full charge', () => {
  assert.deepEqual([
    f('对敌人造成停顿效果时，自身的攻击速度+1，最多叠加18次', { attack_speed: 1, max_stack_cnt: 18 }),
    f('攻击范围内的敌人受到12%（+2%）的脆弱效果，敌人在溯光星源的攻击范围内停留超过7秒后，脆弱效果提升至16%（+2%）',
      { 'halo2_t_1[weak].damage_scale': 1.12, 'halo2_t_1[weak].interval': 7, 'halo2_t_1[weak].damage_scale_add': 0.04, 'halo2_t_1[weak].damage_scale_max': 1.16 }),
    f('攻击范围内被停顿的敌人在下一瞬间起还会受到等长时间的23%（+3%）的脆弱效果', { damage_scale: 1.23, atk: 1 }),
    f('攻击造成1秒寒冷；范围内寒冷的敌人受到27%（+2%）的脆弱，范围内冻结的敌人脆弱效果提升至2倍', { cold: 1, damage_scale_cold: 1.27, damage_scale_freeze: 1.54 }),
    f('攻击范围内敌人的隐匿效果失效', {}),
    f('非技能期间，连续攻击5次后自身获得攻击力+7%（最多3层）', { atk: 0.07, hit_num: 5, 'attack@clear_attackcount_time': 1.5 }),
    f('造成致命伤害时使敌人保留1点生命并使其重伤（击杀者技力+2）；矩不攻击重伤单位', { move_speed: -0.8, sp: 2, interval: 10 }),
    f('在地面时防御力+12%（+2%），起飞后攻击敌人时攻击力提升至112%（+2%）', { atk_scale: 1.12, def: 0.12 }),
    f('特性攻击力提升至最高时，每次攻击额外追加一次43%（+3%）攻击力的攻击', { atk_scale: 0.43 }),
  ], [
    { trait: { stacks: [{ on: 'status', status: 'sluggish', max: 18, mods: { aspd: 1 } }] } },
    { trait: { stayVuln: { base: 1.12, after: 7, max: 1.16 } } },
    { range: [{ side: 'enemy', ranged: false, when: { when: 'sluggish' }, mods: { dmgTakenMul: 1.23 } }] },
    { trait: { onHit: [{ status: { key: 'cold', seconds: 1 } }] }, range: [{ side: 'enemy', ranged: false, when: { when: 'coldOnly' }, mods: { dmgTakenMul: 1.27 } },
      { side: 'enemy', ranged: false, when: { when: 'frozen' }, mods: { dmgTakenMul: 1.54 } }] },
    { range: [{ side: 'enemy', ranged: false, mods: {}, flags: { unstealth: true } }] },
    { trait: { combo: { hits: 5, gap: 1.5, max: 3, mods: { atkPct: 0.07 } } } },
    { trait: { nonLethal: { seconds: 10, sp: 2 } } },
    { trait: { whiles: [{ when: 'grounded', mods: { defPct: 0.12 } }, { when: 'liftoff', mods: { atkScaleMul: 1.12 } }] } },
    { trait: { chargedRider: 0.43 } },
  ]);
  assert.deepEqual([f('攻击相同目标时每次攻击可提高自身攻击力6%，最多可叠加5层。更换目标会失去之前叠加的效果', {}), f('攻击时有30%概率使当次攻击力提升至150%，自身在场时，【近卫】干员周围4格内每有一个敌人倒下，攻击力提升额外提升5%',
    { prob: 0.3, atk_scale: 1.5, atk_up_max_value: 2.4, atk_up_each_time: 0.05 })], [null, null], 'without its key; a profession for a faction');
});
