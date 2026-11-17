// Which blackboard key is the attack's multiplier, and the attribute keys with a namespace (docs/spec/skills.md 技能-5,
// 技能-9): skill_table levels of real operators at elite 2, skill level 7, read and then run in the tiny level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, skills, attrs } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { attackScaleOf } from '../src/attackscale.js';

/** An operator's skill at elite 2, skill level 7 unless told. @param {string} id @param {number} slot @param {number} [level] @returns {Promise<any>} */
async function skillAt(id, slot, level = 7) {
  const { loadTraining, operatorAt } = await import('../src/index.js');
  return operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill: slot, skillLevel: level }).skill;
}

/** The 倍率 of a skill's attacks as the sim reads the definition. @param {any} s */
const scaleOf = (s) => skills.skillMods(s.bb, s.extra?.hitScale, s.extra?.scaleKey).scale;

/**
 * The tiny level with a guard whose skill is `skill`, started: the world, content and guard.
 * @param {any} skill @param {Record<string, number>} [base] the guard's base attributes over the tiny level's
 */
function started(skill, base = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  Object.assign(c.operators.guard, { baseAttackTime: 2, atk: 100, def: 100, ...base });
  c.operators.guard.skill = { ...skill, type: 'MANUAL', init: skill.cost };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  return { w, c, op };
}

test('[技能-5] a key in a sentence about something else is not the attack\'s multiplier: every second, an end burst, a counter, an extra hit, a landing', async () => {
  const cases = /** @type {[string, number][]} */ ([
    ['char_1011_lava2', 1], // 每秒对各自周围8格的所有敌人造成相当于炎狱炎熔攻击力{atk_scale}
    ['char_1012_skadi2', 2], // 使范围内所有敌人每秒受到{atk_scale}攻击力的真实伤害
    ['char_134_ifrit', 2], // 每秒相当于攻击力{atk_scale}的法术伤害
    ['char_450_necras', 1], // 每{interval}秒对目标造成相当于攻击力{atk_scale}
    ['char_4105_almond', 1], // 每1.5秒对目标造成一次相当于攻击力{atk_scale}
    ['char_4142_laios', 1], // 技能结束时立即对阻挡的敌人造成相当于攻击力{atk_scale}
    ['char_494_vendla', 1], // 该角色受到攻击时刺玫对目标造成攻击力{atk_scale}
    ['char_344_beewax', 1], // 方尖塔在出现时会对附近的敌人造成相当于攻击力{atk_scale}
    ['char_4145_ulpia', 2], // 船锚…撞击到目标或达到最远距离时停止，并对周围所有敌人造成攻击力{atk_scale}
    ['char_1040_blaze2', 2], // 若目标处于灼燃损伤爆发期间则额外造成攻击力{attack@atk_scale}的元素伤害
    ['char_347_jaksel', 1], // 闪避成功后立即对一名敌人进行反击，造成相当于攻击力{attack@atk_scale}
    ['char_4083_chimes', 1], // 技能结束时对前方所有地面敌人造成此时攻击力{attack@atk_scale}
    ['char_4204_mantra', 2], // 在目标及{chain_times}名敌人间跳跃1次{atk_scale}攻击力的元素伤害
    ['char_4230_mcnist', 1], // 屏障被摧毁时对周围敌人造成攻击力{atk_scale}的法术伤害
    ['char_1019_siege2', 0], // 下次攻击对四周所有地面敌人额外造成相当于攻击力{atk_scale}的真实伤害（一次性的下次攻击）
  ]);
  for (const [id, slot] of cases) {
    const s = await skillAt(id, slot);
    assert.equal(s.extra?.scaleKey, '', `${s.id}: no sentence about the attack names it`);
    assert.equal(scaleOf(s), 1, `${s.id}: its attacks keep 倍率 1`);
    assert.ok(Object.values(s.bb).some((v) => v !== 1), s.id);
  }
});

test('[技能-5] the sentence about the attack names the multiplier: 攻击力提升至, 每次攻击造成, 攻击变为…, a run of hits; the attack lands as it arrives', async () => {
  const cases = /** @type {[string, number, number][]} */ ([
    ['char_4055_bgsnow', 0, 1.6], ['char_4055_bgsnow', 2, 1.7], // 攻击时，几率当次攻击的攻击力提升至 / 每次攻击的攻击力提升至
    ['char_459_tachak', 1, 1.7], ['char_422_aurora', 1, 3], // 每次攻击有{prob}的概率攻击力提升至 / 改为使本次攻击的攻击力提高至
    ['char_1050_chen3', 1, 4.3], ['char_4186_tmoris', 0, 0.65], ['char_2027_wang', 2, 3.2], // N次斩击 / N连击，每次造成 / 棋子
    ['char_341_sntlla', 1, 0.75], ['char_379_sesa', 1, 2.1], ['char_166_skfire', 1, 2.1], // 攻击变为…召唤冰凌，落地后…造成 / 榴弹…爆炸后 / 陨石…落地后
    ['char_1015_aglna2', 2, 3.05], // 攻击对…个敌人造成攻击力{attack@atk_scale}的物理伤害且额外攻击1个飞行敌人
  ]);
  for (const [id, slot, scale] of cases) {
    const s = await skillAt(id, slot);
    assert.equal(s.extra?.scaleKey, undefined, s.id);
    assert.equal(scaleOf(s), scale, s.id);
  }
});

test('[技能-5] a multiplier key with the skill\'s slot or a number around it: attack@atk_scale_s3, attack@s2_atk_scale, atk_scale_s1', async () => {
  const cases = /** @type {[string, number, string, number][]} */ ([
    ['char_1046_sbell2', 2, 'attack@atk_scale_s3', 2.1], ['char_1046_sbell2', 1, 'attack@atk_scale_s2', 3.5],
    ['char_1043_leizi2', 2, 'attack@atk_scale_s3', 2.4], ['char_1043_leizi2', 1, 'attack@atk_scale_s2', 1.25],
    ['char_1035_wisdel', 2, 'attack@atk_scale_3', 1.9], ['char_4166_varkis', 1, 'attack@s2_atk_scale', 1.75],
    ['char_4039_horn', 1, 'attack@s2.atk_scale', 1.9], ['char_2012_typhon', 2, 'attack@s3_atk_scale', 1.6],
    ['char_4116_blkkgt', 0, 'atk_scale_s1', 1.9], ['char_291_aglina', 1, 'damage_scale', 0.4], // 每次攻击只能造成相当于攻击力{damage_scale}
  ]);
  for (const [id, slot, key, scale] of cases) {
    const s = await skillAt(id, slot);
    assert.equal(s.extra?.scaleKey, key, s.id);
    assert.equal(scaleOf(s), scale, s.id);
  }
  const [heavy, loop, ghost, puzzle] = await Promise.all([skillAt('char_4185_amoris', 0), skillAt('char_1048_orchd2', 1), skillAt('char_1023_ghost2', 2), skillAt('char_4017_puzzle', 1)]);
  assert.deepEqual([heavy.extra?.scaleKey, loop.extra?.scaleKey, ghost.extra?.scaleKey, puzzle.extra?.scaleKey], [undefined, undefined, undefined, undefined],
    'a heavy and a light hit, a loop and an end, an extra hit and a damage every second are not told apart or taken');
  assert.deepEqual([scaleOf(heavy), scaleOf(loop), scaleOf(ghost), scaleOf(puzzle)], [1, 1, 1, 1]);
});

test('[技能-5] attack@atk_scale before a plain atk_scale: the plain one is the sentence about something else\'s', async () => {
  const [mlynar, mcnist, ayer, mint] = await Promise.all([skillAt('char_4064_mlynar', 2), skillAt('char_4230_mcnist', 2), skillAt('char_294_ayer', 1), skillAt('char_388_mint', 1)]);
  assert.deepEqual([mlynar.bb['attack@atk_scale'], mlynar.bb.atk_scale, scaleOf(mlynar)], [1.5, 0.11, 1.5], '玛恩纳 S3: 额外附带…真实伤害 is the plain 0.11');
  assert.deepEqual([mcnist.bb['attack@atk_scale'], mcnist.bb.atk_scale, scaleOf(mcnist)], [2.4, 3, 2.4], '机械师 S3: the charge of 结构性原理 is the plain 3');
  assert.deepEqual([ayer.bb['attack@atk_scale'], ayer.bb.atk_scale, scaleOf(ayer)], [1, 1.3, 1], '断崖 S2: 额外对周围8格…是 the plain 1.3');
  assert.deepEqual([mint.extra.hitScale, scaleOf(mint)], ['attack', 1.15], '薄绿 S2: 技能-14 claimed the plain one already');
  assert.equal(skills.skillMods({ atk_scale: 0.1, 'attack@atk_scale': 1.25 }).scale, 1.25, 'with one argument too');
  assert.equal(skills.skillMods({ atk_scale: 0.1 }).scale, 0.1, 'a plain key alone is still the multiplier');
});

test('[技能-5] a next-attack skill keeps its multiplier unless its sentence is about a rider; a running skill\'s key is its sentence\'s', async () => {
  const [kept, extra, zone] = await Promise.all([skillAt('char_332_archet', 0), skillAt('char_1019_siege2', 0), skillAt('char_459_tachak', 0)]);
  assert.deepEqual([kept.extra?.scaleKey, scaleOf(kept)], [undefined, 2], '空弦 S1: 下次攻击造成相当于攻击力{atk_scale}');
  assert.deepEqual([extra.extra?.scaleKey, scaleOf(extra)], ['', 1], '维娜·维多利亚 S1: 下次攻击额外造成真实伤害');
  assert.deepEqual([zone.extra?.scaleKey, scaleOf(zone)], ['', 1], '战车 S1: 燃烧区域里每秒受到');
  const [ju, instant] = await Promise.all([skillAt('char_4221_ju', 0), skillAt('char_1034_jesca2', 2)]);
  assert.equal(skills.kindOf(ju), 'instant', 'a skill with none of the attack keys stays instant');
  assert.equal(instant.extra?.scaleKey, undefined, 'a key of another effect');
});

test('[技能-5] a running skill\'s normal attacks take the key of its attack sentence: ×2.1 for 圣聆初雪 S3, ×1 for 炎狱炎熔 S2 (damage every second), ×1.5 for 歌蕾蒂娅 S2', async () => {
  const [sbell, lava, glady] = await Promise.all([skillAt('char_1046_sbell2', 2), skillAt('char_1011_lava2', 1), skillAt('char_474_glady', 1)]);
  for (const [skill, scale] of [[sbell, 2.1], [lava, 1], [glady, 1.5]]) {
    const { w, c, op } = started(skill);
    assert.equal(op.skill.active, true, skill.id);
    assert.equal(skills.attackMods(w, c, op).scale, scale, skill.id);
  }
});

test('[技能-5] base_attack_time as PRTS writes it: seconds added by default, a share with {{*}}, a product with {{**}}; not an interval in 反击 wording', async () => {
  const cases = /** @type {[string, number, Record<string, number> | undefined, number][]} */ ([
    ['char_391_rosmon', 1, { batFlat: 0, batPct: 0.5 }, 3], // 攻击间隔{{*|50%|增大(+50%)}}: 2 × 1.5
    ['char_391_rosmon', 2, { batFlat: 0, batPct: -0.5 }, 1], // {{*|(-50%)|缩短(-50%)}}: 2 × 0.5
    ['char_2013_cerber', 1, { batFlat: 0, batMul: 0.4 }, 0.8], // {{**|0.4|较大幅度缩短}}
    ['char_469_indigo', 0, { batFlat: 0, batMul: 0.2 }, 0.4], // value −0.8 written {{**|0.2|}}: × (1 − 0.8)
    ['char_420_flamtl', 2, { batFlat: 0, batMul: 0.7 }, 1.4], // 缩短(*70%)
    ['char_291_aglina', 1, { batFlat: 0, batMul: 0.15 }, 0.3],
    ['char_133_mm', 1, { batFlat: 0, batPct: 0.5 }, 3],
    ['char_4058_pepe', 2, undefined, 2.2], // 略微增大(+0.2): seconds
    ['char_1019_siege2', 2, undefined, 1.75], // 缩短(-0.25): seconds
    ['char_347_jaksel', 1, { batFlat: 0 }, 2], // 反击频率不小于{base_attack_time}的攻击间隔: no interval at all
    ['char_4194_rmixer', 2, { batFlat: 0 }, 2], // 反击最小间隔为实际攻击间隔的{base_attack_time}
  ]);
  for (const [id, slot, mods, bat] of cases) {
    const s = await skillAt(id, slot);
    assert.deepEqual(Object.fromEntries(Object.entries(s.extra?.mods ?? {}).filter(([k]) => k.startsWith('bat'))), mods ?? {}, s.id);
    const { op } = started(s);
    assert.ok(Math.abs(attrs.statsOf(op).bat - bat) < 1e-9, `${s.id}: ${attrs.statsOf(op).bat} ≠ ${bat}`);
  }
});

test('[技能-5] an attribute key with a namespace: 「攻击力+{…[switch_mode].atk}」 is the operator\'s own, over a bare key of the others', async () => {
  const cases = /** @type {[string, number, Record<string, number>][]} */ ([
    ['char_1020_reed2', 2, { atkPct: 0.4 }], // reed2_skil_3[switch_mode].atk
    ['char_2014_nian', 2, { atkPct: 0.8 }], // nian_s_3[self].atk; the allies' [ally].def and block_cnt are not hers
    ['char_243_waaifu', 0, { atkPct: 0.55 }], // 部署后攻击力+{waaifu_s_1[self].atk}
    ['char_4199_makiri', 1, { atkPct: 0.55 }], // makiri_s_2[passive].atk
    ['char_325_bison', 1, { defPct: 0.8 }], // bison_s_2[self].def; [ally].def is for those around
    ['char_198_blackd', 1, { defPct: 0.5 }], // blackd_s_2[period].def
    ['char_1034_jesca2', 2, { defPct: 0.65 }], // jesca2_s_3[def].def; the 机动盾牌's is not hers
    ['char_180_amgoat', 0, { aspd: 45 }], // amgoat_s_1[a].attack_speed; the second use's [b].atk is not read
    ['char_440_pinecn', 1, { atkPct: 0.4 }], // pinecn_s_2[a].atk
    ['char_4037_demetr', 2, { atkPct: 1.4, aspd: 40 }], // attack@demetr_s3[bonus].atk and .attack_speed
    ['char_614_acsupo', 2, { atkPct: 0.5 }], // acsupo_s_3.atk over the bare atk 0.8, which is the weakness of the enemies
  ]);
  for (const [id, slot, mods] of cases) {
    const s = await skillAt(id, slot);
    for (const [k, v] of Object.entries(mods)) assert.equal(s.extra?.mods?.[k], v, `${s.id} ${k}`);
  }
  const reed = started(await skillAt('char_1020_reed2', 2));
  assert.equal(attrs.statsOf(reed.op).atk, 140, 'the guard\'s 100 ATK × 1.4');
  const acsupo = started(await skillAt('char_614_acsupo', 2));
  assert.equal(attrs.statsOf(acsupo.op).atk, 150, '+50 %, not +80 %');
  const bison = started(await skillAt('char_325_bison', 1));
  assert.equal(attrs.statsOf(bison.op).def, 180);
  const nian = started(await skillAt('char_2014_nian', 2));
  assert.equal(attrs.statsOf(nian.op).def, 100, 'the allies\' defence is not hers');
});

test('[技能-5] a namespaced key that is not her own, always-on attribute is not read: a condition, a state, an equipment, a later sequence, others', async () => {
  for (const [id, slot] of /** @type {[string, number][]} */ ([
    ['char_4142_laios', 0], ['char_491_humus', 1], // 生命值高于…时，获得+{peak_performance.atk}攻击力的精力充沛
    ['char_394_hadiya', 0], // 装备应变：消耗10点部署费用，攻击力+{extra.atk}
    ['char_476_blkngt', 0], // 眠兽受到伤害时醒来，攻击力+{…[rage].atk}
    ['char_1050_chen3', 1], // 接下来攻击力+{chen3_s2[respawn_buff].atk}
    ['char_245_cello', 2], ['char_4147_mitm', 1], // 使攻击范围内其他干员…；樱桃三号…防御力+{[to_token].def}
    ['char_185_frncat', 0], // 使击中目标攻击力-{-…[debuff].atk}
    ['char_4226_veen', 1], ['char_421_crow', 1], // 使自身后续攻击力+ / 该次伤害的攻击力额外+
  ])) {
    const s = await skillAt(id, slot), m = s.extra?.mods ?? {};
    assert.deepEqual([m.atkPct, m.defPct, m.hpPct, m.aspd], [undefined, undefined, undefined, undefined], `${s.id} reads none of its namespaced keys`);
  }
});

test('[技能-9] a push or pull belongs to the attack only when its sentence is about the attack; 较大力度 is a force', async () => {
  const [mint, f12yin, glady3, almond] = await Promise.all([skillAt('char_388_mint', 1), skillAt('char_264_f12yin', 2), skillAt('char_474_glady', 2), skillAt('char_4105_almond', 1)]);
  assert.deepEqual(mint.extra.attack.displace, { pull: true, force: 0 }, '每次攻击把目标小力地拖拽至面前');
  assert.deepEqual(f12yin.extra.attack.displace, { pull: false, force: 1 }, '每次攻击周围最多…个敌人并将其中等力度地推动');
  assert.equal(glady3.extra?.attack?.displace, undefined, '技能结束时把…拖拽至面前: once, at the end');
  assert.equal(almond.extra?.attack?.displace, undefined, '每1.5秒…并将其中等力度地拖拽至面前: the hook\'s, not her attacks');
  const [ash, gvial] = await Promise.all([skillAt('char_456_ash', 2), skillAt('char_1026_gvial2', 1)]);
  assert.deepEqual(ash.extra.attack.displace, { pull: false, force: 2 }, '向后较大力度推动');
  assert.deepEqual(gvial.extra.attack.displace, { pull: true, force: 1 }, '攻击到未被阻挡的敌人时，将其中等力度地拖拽至面前');
});

test('[技能-5] real skills whose key sits in a sentence about another effect keep 倍率 1, at the first and the last skill level', async () => {
  const cases = /** @type {[string, number, string][]} */ ([
    ['char_1024_hbisc2', 1, '使范围内两名敌人每秒造成相当于攻击力{atk_scale}'], // every second
    ['char_1027_greyy2', 1, '雷电球每{interval}秒对周围所有敌人造成一次相当于攻击力{atk_scale}'], // every {interval} seconds
    ['char_1039_thorn2', 2, '每秒受到攻击力{atk_scale}的法术伤害，效果逐渐提升'], // damage every second in the area of the 炼金单元
    ['char_487_bobb', 1, '处于其中的地面敌人每秒受到攻击力{attack@atk_scale}'], // level 7 has the value 1 already; level 10 has 1.4
    ['char_118_yuki', 1, '攻击变为投掷回旋的大飞镖，…并每秒受到相当于攻击力{attack@atk_scale}'], // 每秒 comes before 攻击变为: a damage over time on the target, INF-1415
    ['char_4204_mantra', 2, '在目标及{chain_times}名敌人间跳跃1次{atk_scale}攻击力的元素伤害'], // a jump between enemies
  ]);
  for (const [id, slot] of cases) {
    for (const level of [7, 10]) {
      const s = await skillAt(id, slot, level);
      const bobb7 = id === 'char_487_bobb' && level === 7;
      assert.equal(s.extra?.scaleKey, bobb7 ? undefined : '', `${s.id} level ${level}`);
      assert.equal(scaleOf(s), 1, `${s.id} level ${level}: the attacks keep 倍率 1`);
    }
  }
  assert.ok((await skillAt('char_487_bobb', 1, 10)).bb['attack@atk_scale'] > 1, 'the key is 1.4 at level 10: the reading, not the value, makes it 1');
});

test('[技能-5] 琳琅诗怀雅 S3: the key is only in the part about closing the skill, which is not read, so the attacks keep 倍率 1', async () => {
  for (const level of [7, 10]) {
    const s = await skillAt('char_1033_swire2', 2, level);
    assert.ok(s.bb.atk_scale > 1, 'the blackboard has a multiplier');
    assert.equal(s.extra?.scaleKey, '', `level ${level}: 主动关闭技能时…每消耗一枚金币造成一次相当于攻击力{atk_scale}`);
    assert.equal(scaleOf(s), 1);
  }
  const run = { runs: true, claimed: false };
  const closing = '攻击变为二连击；主动关闭技能时每消耗一枚金币造成一次相当于攻击力{atk_scale}的物理伤害';
  assert.deepEqual(attackScaleOf(closing, { atk_scale: 1.2 }, run), { scaleKey: '' });
  assert.deepEqual(attackScaleOf('攻击变为二连击', { atk_scale: 1.2 }, run), {}, 'a key the description never writes is left alone');
});

test('[技能-5] 额外提升 is a rider: 菲亚梅塔 S3 takes the key of 攻击力提升至, not the one of 额外提升至', async () => {
  for (const [level, scale] of /** @type {[number, number][]} */ ([[7, 1.15], [10, 1.25]])) {
    const s = await skillAt('char_300_phenxi', 2, level);
    assert.equal(s.extra?.scaleKey, 'attack@atk_scale_2', `level ${level}`);
    assert.equal(scaleOf(s), scale, `level ${level}: 攻击力提升至{attack@atk_scale_2}, not 对…敌人攻击力额外提升至{attack@atk_scale}`);
    assert.ok(s.bb['attack@atk_scale'] > scale);
  }
});

test('[技能-9] 较大力度 at skill level 10: 歌蕾蒂娅 S1 pulls and 焰狐龙梓兰 S3 pushes with force 2, one more than at level 7', async () => {
  const [glady7, glady10, orchid7, orchid10] = await Promise.all([
    skillAt('char_474_glady', 0), skillAt('char_474_glady', 0, 10), skillAt('char_1048_orchd2', 2), skillAt('char_1048_orchd2', 2, 10),
  ]);
  assert.deepEqual(glady7.extra.attack.displace, { pull: true, force: 1 }, '下次攻击会将目标中等力度地拖拽至面前');
  assert.deepEqual(glady10.extra.attack.displace, { pull: true, force: 2 }, '下次攻击会将目标较大力度地拖拽至面前');
  assert.deepEqual(orchid7.extra.attack.displace, { pull: false, force: 1 }, '箭矢以中等力度推动每个经过的敌人');
  assert.deepEqual(orchid10.extra.attack.displace, { pull: false, force: 2 }, '箭矢以较大力度推动每个经过的敌人');
});
