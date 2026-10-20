// Talents on the operators around, in range and on the field as @aue/content reads them (docs/spec/operators.md 干员-31,
// 干员-9): what each description adds to the trait, the in-range talents and the deck parts, and a deck part by cost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTraining, operatorAt, matchContent } from '../src/index.js';
import { aroundParts } from '../src/talentaround.js';

const E2 = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };
/** The parts of a talent candidate with this text and blackboard. @param {string} description @param {Record<string, number>} bb */
const a = (description, bb) => aroundParts({ description, bb, hidden: false });
const EIGHT = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col }))).filter((t) => t.row !== 0 || t.col !== 0);

test('[干员-31] talents on the operator by those around it, its range and its blocked enemies; auras around, behind and in range', () => {
  assert.deepEqual([
    a('自身或海嗣攻击范围内存在我方干员时，自身攻击力+9%（+3%）；存在【深海猎人】干员时改为攻击力+18%（+3%）', { 'skadi2_t_2[atk][1].atk': 0.09, 'skadi2_t_2[atk][2].atk': 0.18 }),
    a('自身与周围8格友方单位受到的物理伤害减少22%（+2%），且此范围内每个友方单位使维娜攻击力+6%（+1%）', { damage_resistance: 0.22, atk: 0.06 }),
    a('使攻击范围内除自身外当前生命比例小于等于自身的友军获得16%（+2%）的庇护', { damage_resistance: 0.16 }),
    a('攻击力和防御力提升12%（+2%），每再阻挡一个敌人提升5%（+1%）', { atk: 0.12, def: 0.12, atk_add: 0.05, def_add: 0.05 }),
    a('周围四格中有两格以上的高地地形时攻击力和防御力+10%', { cnt: 2, atk: 0.1, def: 0.1 }),
    a('在场时自身防御力+70（+20），自己身后的如果是【先锋】或【近卫】干员也能享受到相同效果', { def: 70 }),
    a('攻击力+6%（+1%），当场地中存在水地形时改为攻击力+24%（+6%）', { 'ceylon_t_1[common].atk': 0.06, 'celyon_t_1[map].atk': 0.18 }),
    a('技能未开启时，周围四格友方单位的防御力+12%（+2%）；技能开启时，自身不容易受到敌人攻击', { def: 0.12, atk: 0, taunt_level: -1 }),
    a('未阻挡敌人时使周围8格内近战干员防御力+14%（+2%），阻挡敌人时自身防御力+14%（+2%）', { 'bryota_t_ally.def': 0.14, 'bryota_t_self.def': 0.14 }),
    a('法术抗性+12，周围8格有友方干员时，法术抗性额外+4', { 'baslin_t[self].magic_resistance': 12, 'baslin_t[ally].magic_resistance': 4 }),
  ], [
    { trait: { whiles: [{ when: 'rangeAllyOnly', power: 'abyssal', mods: { atkPct: 0.09 } }, { when: 'rangeAlly', power: 'abyssal', mods: { atkPct: 0.18 } }] } },
    { trait: { whiles: [{ when: 'always', mods: { physTakenMul: 0.78 } }, { when: 'alliesNear', per: 8, mods: { atkPct: 0.06 } }] },
      range: [{ side: 'ally', ranged: false, area: EIGHT, mods: { physTakenMul: 0.78 } }] },
    { range: [{ side: 'ally', ranged: false, others: true, when: { when: 'hpRatioAtMostSrc' }, mods: { physTakenMul: 0.84, artsTakenMul: 0.84 } }] },
    { trait: { whiles: [{ when: 'always', mods: { atkPct: 0.12, defPct: 0.12 } }, { when: 'blockedExtra', per: 9, mods: { atkPct: 0.05, defPct: 0.05 } }] } },
    { trait: { whiles: [{ when: 'highAround', value: 2, mods: { atkPct: 0.1, defPct: 0.1 } }] } },
    { trait: { whiles: [{ when: 'always', mods: { defFlat: 70 } }] }, range: [{ side: 'ally', ranged: false, area: [{ row: 0, col: -1 }], rotate: true, professions: ['PIONEER', 'WARRIOR'], mods: { defFlat: 70 } }] },
    { trait: { whiles: [{ when: 'waterMap', mods: { atkPct: 0.24 } }, { when: 'noWaterMap', mods: { atkPct: 0.06 } }] } },
    { trait: { whiles: [{ when: 'inSkill', mods: { taunt: -1 } }] }, range: [{ side: 'ally', ranged: false, area: [{ row: 1, col: 0 }, { row: -1, col: 0 }, { row: 0, col: 1 }, { row: 0, col: -1 }], srcWhen: 'notInSkill', mods: { defPct: 0.12 } }] },
    { trait: { whiles: [{ when: 'blocking', mods: { defPct: 0.14 } }] }, range: [{ side: 'ally', ranged: false, melee: true, area: EIGHT, srcWhen: 'notBlocking', mods: { defPct: 0.14 } }] },
    { trait: { whiles: [{ when: 'always', mods: { resFlat: 12 } }, { when: 'alliesNear', value: 1, mods: { resFlat: 4 } }] } },
  ]);
});

test('[干员-31] talents for the field, shares with allies, a deck part by cost, shared kill stacks, ammo by faction and time', () => {
  assert.deepEqual([
    a('在场时阻挡数大于等于3的友方近战单位攻速+8（+2），防御+14%（+2%）', { attack_speed: 8, def: 0.14 }),
    a('在场时，所有三星干员的攻击力+11%（+1%）', { atk: 0.11 }),
    a('场上存在桑葚和另外至少一名【医疗】干员时，所有【医疗】干员的攻击力+11%（+1%）', { atk: 0.11 }),
    a('在场时，携带弹药类技能的干员攻击力+13%（+4%），对【拉特兰】干员的效果翻倍', { atk: 0.13, mult: 2 }),
    a('场上的【米诺斯】或【萨尔贡】干员生命值高于50%时，获得+22（+2）攻速的精力充沛', { attack_speed: 22, hp_ratio: 0.5 }),
    a('在场时，【谢拉格】干员免疫冻结，防御力+80（+20）且每秒回复2%（+0.5%）最大生命值；凛御银灰在场15秒后，防御力和生命回复效果翻倍', { hp_recovery_per_sec_by_max_hp_ratio: 0.02, interval: 15, def: 80 }),
    a('周围8格的干员最大生命值+6%（+1%），若部署方向与万顷相同，改为+10%（+1%）', { 'wanqin_t_1[hp_common].max_hp': 0.06, 'wanqin_t_1[hp_common].wanqin_t_1[hp_extra].max_hp': 0.04 }),
    a('使攻击范围内除自己外2名友军获得12%（+2%）的庇护', { damage_resistance: 0.12 }),
    a('编入队伍时，所有初始费用不超过10的干员受到的治疗效果提升23%（+3%）', { cost: 10, heal_scale: 1.23 }),
  ], [
    { trait: { fieldBuffs: [{ melee: true, minBlock: 3, mods: { aspd: 8, defPct: 0.14 } }] } },
    { trait: { fieldBuffs: [{ rarity: 3, mods: { atkPct: 0.11 } }] } },
    { trait: { fieldBuffs: [{ profession: 'MEDIC', needOther: true, mods: { atkPct: 0.11 } }] } },
    { trait: { fieldBuffs: [{ ammo: true, mods: { atkPct: 0.13 }, double: { power: 'laterano', mul: 2 } }] } },
    { trait: { fieldBuffs: [{ powers: ['minos', 'sargon'], hpAbove: 0.5, mods: { aspd: 22 } }] } },
    { trait: { fieldBuffs: [{ power: 'kjerag', mods: { defFlat: 80, hpRegenRatio: 0.02 }, flags: { 'immune:freeze': true }, after: 15, afterMul: 2 }] } },
    { range: [{ side: 'ally', ranged: false, area: [...EIGHT.slice(0, 4), { row: 0, col: 0 }, ...EIGHT.slice(4)], mods: { hpPct: 0.06 } },
      { side: 'ally', ranged: false, area: [...EIGHT.slice(0, 4), { row: 0, col: 0 }, ...EIGHT.slice(4)], when: { when: 'sameDir' }, mods: { hpPct: 0.04 } }] },
    { trait: { shareGain: { inRange: true, count: 2, mods: { physTakenMul: 0.88, artsTakenMul: 0.88 } } } },
    { deck: [{ when: 'deck', all: true, maxCost: 10, bb: {}, mods: { healingTakenMul: 1.23 } }] },
  ]);
  assert.deepEqual([
    a('每次击倒一名敌人时，自身的生命上限提高120，攻击力提高30，最多叠加10（+1）次，其他【深海猎人】干员获得50%的提高效果',
      { max_stack_cnt: 10, max_hp: 120, atk: 30, 'ulpia_t_1[abyssal].max_hp': 60, 'ulpia_t_1[abyssal].atk': 15, 'ulpia_t_1[abyssal].max_stack_cnt': 10 }),
    a('每有一个【拉特兰】干员在场，自身的弹药类技能弹药上限+1（最多4层）', { add_count: 1, add_count_max_stack: 4 }),
    a('在场停留20秒后，自身弹药类技能弹药上限+3，其他随机一名【拉特兰】干员的弹药类技能弹药上限+1', { self_ammo: 3, duration: 20, ally_ammo: 1 }),
    a('攻击速度+12（+2），置入战场后这个效果会同样赋予给一名随机【卡西米尔】干员', { attack_speed: 12 }),
    a('部署后随机选择一名在场的【术师】干员，自身和其的攻击力+8%', { atk: 0.08 }),
  ], [
    { trait: { stacks: [{ on: 'kill', max: 10, shared: true, mods: { hpFlat: 120, atkFlat: 30 } }], stackShare: { power: 'abyssal', mods: { hpFlat: 60, atkFlat: 15 } } } },
    { trait: { whiles: [{ when: 'powerOnField', power: 'laterano', per: 4, mods: { ammoFlat: 1 } }] } },
    { trait: { whiles: [{ when: 'onFieldFor', value: 20, mods: { ammoFlat: 3 } }], shareGain: { power: 'laterano', ammo: true, count: 1, after: 20, mods: { ammoFlat: 1 } } } },
    { trait: { whiles: [{ when: 'always', mods: { aspd: 12 } }], shareGain: { power: 'kazimierz', count: 1, mods: { aspd: 12 } } } },
    { trait: { shareGain: { profession: 'CASTER', count: 1, self: true, mods: { atkPct: 0.08 } } } },
  ]);
  assert.deepEqual([a('在场时，所有三星干员的攻击力+11%', {}), a('场上的【米诺斯】或【卡兹】干员生命值高于50%时，获得+22攻速的精力充沛', { attack_speed: 22, hp_ratio: 0.5 })],
    [null, null], 'without its key; a name that is not a faction');
});

test('[干员-31] [干员-9] from the real data: 苏苏洛 for the cheap operators of her own deck only; records with their rarity', async () => {
  const E1 = { ...E2, elite: 1 };
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1,
    decks: [[{ id: 'char_298_susuro', build: E2 }, { id: 'char_123_fang', build: E1 }, { id: 'char_202_demkni', build: E2 }], [{ id: 'char_123_fang', build: E1 }]] })).operators);
  const plain = /** @type {any} */ (operatorAt(await loadTraining('char_123_fang'), E1));
  assert.deepEqual([ops['char_123_fang#0'].talentMods?.healingTakenMul, ops['char_123_fang#1'].talentMods?.healingTakenMul, ops['char_202_demkni#0'].talentMods?.healingTakenMul,
    plain.cost, plain.rarity], [1.2, undefined, undefined, 10, 3], '芬 costs 10; 塞雷娅 costs more');
});
