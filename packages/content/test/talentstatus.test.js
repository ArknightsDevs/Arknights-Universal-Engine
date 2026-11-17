// Talents that give a status (docs/spec/operators.md 干员-9, 干员-13, 干员-14, 干员-16, 干员-19, 干员-20, 干员-22, 干员-27, 干员-30, 干员-33):
// 抵抗 and 脆弱 as the engine's statuses on real data — team, timed, deployment, stacking, heal, hit and in-range talents — and the
// module wordings that read as the plain text does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, attrs, bus, status } from '@aue/sim';
import { loadTraining, operatorAt } from '../src/index.js';
import { teamTalentsAt } from '../src/operators.js';
import { hitStatuses, selfStatus } from '../src/talentstatus.js';
import { resistOf, fragileOf, teamPart } from '../src/talents.js';

/** @typedef {import('@aue/sim').Unit} Unit */

/**
 * An operator at elite 2, skill level 7, potential 6 — level 1, or 70 with a module (index, level 3) —, its record and deck team talents.
 * @param {string} id @param {{ module?: number, skill?: number }} [o]
 */
async function at(id, o = {}) {
  const t = await loadTraining(id);
  const b = { elite: 2, level: o.module === undefined ? 1 : 70, potential: 6, trust: 0, skill: o.skill ?? 0, skillLevel: 7, ...(o.module === undefined ? {} : { module: o.module, moduleLevel: 3 }) };
  return { rec: /** @type {any} */ (operatorAt(t, b)), team: teamTalentsAt(t, b) };
}
/** @param {string} id @param {number} [module] the record of an operator */
const rec = async (id, module) => (await at(id, { module })).rec;
const RESIST = { key: 'buffres', value: 0.5 };
/** A status 脆弱 of a 倍率: the share above 1. @param {string} key @param {number} scale */
const share = (key, scale) => ({ key, value: scale - 1 });

test('[干员-9] 获得抵抗 of a team talent is the status 抵抗, not a modifier; 「生命上限+N%并获得抵抗」 reads whole', async () => {
  assert.deepEqual((await rec('char_275_breeze')).fieldTalents, [{ professions: ['MEDIC', 'SUPPORT'], bb: {}, status: RESIST, skill: true }], '微风: 技能开启时，所有【医疗】和【辅助】干员获得抵抗');
  assert.deepEqual((await rec('char_206_gnosis')).fieldTalents, [{ power: 'kjerag', bb: {}, status: RESIST, after: 10 }], '灵知: 部署后经过10秒，所有【谢拉格】干员');
  assert.deepEqual((await rec('char_275_breeze', 0)).fieldTalents, [{ professions: ['MEDIC', 'SUPPORT'], bb: { max_hp: 0.15 }, status: RESIST, skill: true }], '微风 RIN-X: 生命上限+15%并获得抵抗');
  assert.equal(JSON.stringify((await rec('char_275_breeze')).talentMods ?? {}).includes('statusRes'), false);
  assert.deepEqual([resistOf({ one_minus_status_resistance: -0.5 }), resistOf({ one_minus_status_resistance: 0.2 }), resistOf({})], [RESIST, null, null], 'a plain 状态抵抗率+X is no 抵抗');
});

test('[干员-13] [干员-14] 抵抗 after some seconds, or held from the deployment (拥有抵抗; the natural environment is left out)', async () => {
  assert.deepEqual((await rec('char_341_sntlla')).timedTalents, [{ kind: 'after', seconds: 20, max: 1, mods: { atkPct: 0.18 }, status: RESIST }], '寒檀: 在战场停留20秒后，攻击力+18%且获得抵抗');
  assert.deepEqual((await rec('char_017_huang')).timedTalents, [{ kind: 'after', seconds: 12, max: 1, mods: {}, status: RESIST }], '煌: 在战场停留12秒后获得抵抗');
  assert.deepEqual([(await rec('char_345_folnic')).deployTalents, (await rec('char_345_folnic', 0)).deployTalents], [[{ status: RESIST }], [{ status: RESIST }]], '亚叶: 拥有抵抗且受到来自自然环境的伤害-50%');
  const t = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => selfStatus({ description: d, bb, hidden: false });
  assert.deepEqual([t('拥有抵抗', { one_minus_status_resistance: -0.5 }), t('拥有抵抗且受到来自自然环境的伤害-40%', { one_minus_status_resistance: -0.5 }), t('拥有抵抗且攻击力+10%', { one_minus_status_resistance: -0.5 }), t('拥有抵抗', {})],
    [RESIST, RESIST, null, null]);
});

test('[干员-20] [干员-30] 抵抗 a run of kills gives, or a heal leaves for some seconds', async () => {
  assert.deepEqual((await rec('char_333_sidero')).talentTrait.stacks, [{ on: 'kill', every: 5, max: 1, mods: { aspd: 15 }, gives: RESIST }], '铸铁: 击杀5个敌人后获得攻击速度+15和抵抗');
  assert.deepEqual((await rec('char_385_finlpp')).talentTrait.healGives, { seconds: 4, mods: {}, status: RESIST }, '清流: 在治疗目标后使其获得4秒抵抗');
  assert.deepEqual((await rec('char_4042_lumen')).talentTrait.healGives, { seconds: 4, mods: {}, status: RESIST, above: 0.75, aboveSeconds: 6 }, '流明: 高于75%则改为6秒');
});

test('[干员-19] the hits that give a 脆弱 or 法术脆弱: 灼痕 also lowers the attack (a plain modifier), a chance, the module\'s 失去特殊能力 beside it', async () => {
  assert.deepEqual((await rec('char_1020_reed2')).talentTrait.onHit, [{ prob: 0.3, status: { key: 'artsFragile', seconds: 6, value: 1.32 - 1 }, debuff: { seconds: 6, mods: { atkPct: -0.22 } } }], '焰影苇草');
  assert.deepEqual((await rec('char_4185_amoris')).talentTrait.onHit, [{ prob: 0.1, status: { key: 'fragile', seconds: 2, value: 1.08 - 1 } }], '祐天寺若麦: 攻击时10%概率使敌人获得8%脆弱，持续2秒');
  assert.deepEqual((await rec('char_140_whitew', 0)).talentTrait.onHit, [{ status: { key: 'silence', seconds: 7 } }, { status: { key: 'fragile', seconds: 7, value: 1.08 - 1 } }], '拉普兰德 module');
  const h = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => hitStatuses({ description: d, bb, hidden: false });
  assert.deepEqual(h('攻击敌人时对目标施加14%的【法术脆弱】，持续5秒', { 'weak[magic][limit]': 5, damage_scale: 1.14 }), [{ status: { key: 'artsFragile', seconds: 5, value: 1.14 - 1 } }]);
  assert.deepEqual([h('攻击敌人时对目标施加14%的【法术脆弱】，持续5秒', { damage_scale: 1.14 }), h('攻击敌人时对目标施加14%的【法术脆弱】，持续5秒', { 'weak[magic][limit]': 5 })], [[], []], 'without the seconds or the 倍率');
});

test('[干员-22] [干员-33] [干员-34] the in-range 脆弱 is the status the aura holds: 铃兰 on 停顿 (module: and a lower attack), 灵知 on 寒冷 and 冻结, 雪绒 on flying, 正义骑士号', async () => {
  assert.deepEqual((await rec('char_358_lisa')).rangeTalents, [{ side: 'enemy', ranged: false, when: { when: 'sluggish' }, mods: {}, status: share('fragile', 1.23) }], '铃兰');
  assert.deepEqual((await rec('char_358_lisa', 1)).rangeTalents, [{ side: 'enemy', ranged: false, when: { when: 'sluggish' }, mods: {}, status: share('fragile', 1.25) },
    { side: 'enemy', ranged: false, when: { when: 'sluggish' }, mods: { atkMul: 0.92 } }], '铃兰 DEC-Y: 25%的脆弱效果和8％虚弱效果 — 攻击力×92%, not the status 虚弱 (PRTS)');
  assert.deepEqual((await rec('char_206_gnosis')).rangeTalents, [{ side: 'enemy', ranged: false, when: { when: 'coldOnly' }, mods: {}, status: share('fragile', 1.27) },
    { side: 'enemy', ranged: false, when: { when: 'frozen' }, mods: {}, status: share('fragile', 1.54) }], '灵知');
  assert.deepEqual((await rec('char_466_qanik')).rangeTalents, [{ side: 'enemy', ranged: false, mods: {}, status: share('artsFragile', 1.22), when: { when: 'flying' } }], '雪绒');
  const jnight = /** @type {any} */ (operatorAt(await loadTraining('char_4000_jnight'), { elite: 0, level: 1, potential: 6, trust: 0, skill: -1, skillLevel: 1 }));
  assert.deepEqual(jnight.rangeTalents.at(-1), { side: 'enemy', ranged: false, when: { when: 'flying' }, during: 20, mods: {}, status: share('fragile', 1.25) }, '正义骑士号');
  assert.deepEqual([fragileOf('脆弱', 1.2), fragileOf('法术脆弱', 1.2), fragileOf('元素脆弱', 1.2), fragileOf('脆弱', 1), fragileOf('庇护', 1.2)],
    [share('fragile', 1.2), share('artsFragile', 1.2), share('elemFragile', 1.2), null, null]);
});

test('[干员-16] 「每秒回复最大生命N%的生命」 and 「如果N秒内没有主动攻击过，每秒恢复最大生命N%的生命」', async () => {
  const ghost = await rec('char_143_ghost');
  assert.deepEqual([ghost.talentMods, ghost.talentBb], [{ hpRegenRatio: 0.025 }, { max_hp: 0.12 }], '幽灵鲨: 生命上限+12%，每秒回复最大生命2.5%的生命');
  assert.deepEqual((await rec('char_293_thorns')).talentTrait.whiles, [{ when: 'idle', value: 2, mods: { hpRegenRatio: 0.04 } }], '棘刺: 如果2秒内没有主动攻击过，每秒恢复最大生命4%的生命');
});

test('[干员-27] [干员-33] the module wordings that add a clause: 仇白 (入隙 more with both statuses), 溯光星源 (叠满 more attack)', async () => {
  assert.deepEqual((await rec('char_4082_qiubai', 0)).talentTrait.vs, [{ when: 'statusAny', statuses: ['sluggish', 'root'], on: 'damage', arts: 0.48, later: true, both: 1.2 }], '仇白 LOR-X level 3: 提升至原本的1.2倍');
  const halo = (await rec('char_1047_halo2', 0)).talentTrait;
  assert.deepEqual(halo.stacks, [{ on: 'status', status: 'sluggish', max: 25, mods: { aspd: 1 }, full: { atkPct: 0.12 } }], '溯光星源: 使自身的攻击速度+1，最多叠加25次；叠满后使自身攻击力+12%');
  assert.deepEqual(halo.stayVuln, { base: 1.12, after: 7, max: 1.16 }, 'its 脆弱 beside it is the same');
});

test('[干员-9] [干员-13] [干员-17] [干员-34] more module wordings: 携带时 is the deck, 自身 for 自己的, 更进一步延长, 受到敌人的…伤害降低, 提升 after a condition', async () => {
  const deck = await at('char_180_amgoat', { module: 0 });
  assert.deepEqual(deck.team.deck, [{ when: 'deck', profession: 'CASTER', bb: { atk: 0.24 } }], '艾雅法拉: 携带时，所有友方【术师】职业干员的攻击力+24%');
  assert.deepEqual((await rec('char_155_tiger', 0)).talentTrait.nextAttack, [{ when: 'dodged', atk: 1.2 }], '因陀罗: 自身下一次攻击攻击力+120%');
  assert.deepEqual((await rec('char_183_skgoat', 0)).talentTrait.hitStatusPlus, 0.33, '地灵: 更进一步延长特性停顿的持续时间');
  assert.deepEqual((await rec('char_474_glady', 0)).fieldTalents, [{ power: 'abyssal', bb: {}, mods: { hpRegenRatio: 0.035, physTakenMul: 0.7, artsTakenMul: 0.7 } }], '歌蕾蒂娅: 受到敌人的物理与法术伤害降低30%');
  assert.deepEqual((await rec('char_344_beewax', 0)).talentTrait.whiles, [{ when: 'notInSkill', mods: { hpPct: 0.15, hpRegenRatio: 0.04 } }], '蜜蜡: 技能未开启时，最大生命值提升15%，每秒恢复4%的最大生命');
});

test('[干员-13] [部署-7] 寒檀 in a stepped world: 抵抗 comes after 20 seconds once, with the status event; a stun then lasts half as long', async () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.op = { ...(await at('char_341_sntlla')).rec, cost: 0 };
  c.level.waves = [];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 4 };
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {[string, number | undefined, number][]} */
  const events = [];
  bus.on(w, 'beforeStatus', (k) => { events.push([k.status, k.strength, k.frames]); });
  step(w, c, [[0, { type: 'deploy', op: 'op', row: 2, col: 2, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'op'));
  for (let i = 0; i < 20 * 30 - 10; i++) step(w, c);
  assert.deepEqual([attrs.statsOf(op).statusRes, events.length], [1, 0], 'not yet');
  for (let i = 0; i < 20; i++) step(w, c);
  assert.deepEqual([attrs.statsOf(op).statusRes, events], [0.5, [['buffres', 0.5, -1]]]);
  status.applyStatus(op, 'stun', { seconds: 4 });
  let lasted = 0;
  while (op.buffs.some((b) => b.key === 'stun') && lasted < 300) { step(w, c); lasted++; }
  assert.ok(lasted >= 59 && lasted <= 61, `${lasted} frames for 4 s`);
});

test('[职业-10] [干员-30] 流明 with WAH-X holds 抵抗 as the status; 清流\'s heal gives it again and the strongest counts (0.5, not 0.25); 絮雨 with WAH-X counts as one who has it', async () => {
  const wah = async (/** @type {string} */ id) => (await loadTraining(id)).modules.findIndex((m) => m.type === 'WAH-X');
  const lumen = (await at('char_4042_lumen', { module: await wah('char_4042_lumen') })).rec;
  assert.deepEqual([lumen.trait.selfStatus, JSON.stringify(lumen.trait.whiles).includes('statusRes')], [RESIST, false], 'the module\'s 自身获得抵抗 is the status, not a modifier');
  const c = /** @type {any} */ (tinyContent());
  c.operators.lumen = { ...lumen, cost: 0 };
  c.operators.fin = { ...(await at('char_385_finlpp')).rec, cost: 0 };
  c.level.waves = [];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 4 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'lumen', row: 2, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'fin', row: 2, col: 1, dir: 0 }]]);
  const lu = /** @type {Unit} */ (w.units.find((u) => u.key === 'lumen'));
  const resist = () => lu.buffs.filter((b) => b.key === 'buffres').map((b) => [b.value, b.left, b.tag]);
  assert.deepEqual([resist(), attrs.statsOf(lu).statusRes], [[[0.5, -1, '']], 0.5], 'from the deployment');
  lu.hp = lu.maxHp * 0.5;
  for (let i = 0; i < 200; i++) step(w, c);
  assert.equal(resist().length, 2, 'the heal of 清流 gave it too');
  assert.deepEqual([attrs.statsOf(lu).statusRes, resist().map(([v]) => v)], [0.5, [0.5, 0.5]], 'two of one name: 0.5');
  // 絮雨 heals those who hold 抵抗 (职业-33); with the module she holds it herself
  const c2 = /** @type {any} */ (tinyContent());
  c2.operators.whispr = { ...(await at('char_436_whispr', { module: await wah('char_436_whispr') })).rec, cost: 0 };
  c2.level.waves = [];
  c2.level.options = { ...c2.level.options, initialCost: 99, maxCost: 99, characterLimit: 4 };
  const w2 = createWorld(c2, { seed: 1, players: 1 });
  step(w2, c2, [[0, { type: 'deploy', op: 'whispr', row: 2, col: 2, dir: 0 }]]);
  step(w2, c2);
  const wh = /** @type {Unit} */ (w2.units.find((u) => u.key === 'whispr'));
  assert.deepEqual([wh.buffs.some((b) => b.key === 'buffres'), wh.buffs.some((b) => b.key === `resistRegen:${wh.id}`)], [true, true]);
});

test('[干员-7] [干员-9] a team talent with an extra clause 「，且…」 is read whole or not at all: the effect it joins is read when it reads, the whole talent is left out when it does not', async () => {
  const wah = async (/** @type {string} */ id, /** @type {string} */ type) => (await loadTraining(id)).modules.findIndex((m) => m.type === type);
  const team = async (/** @type {string} */ id, /** @type {string} */ type) => (await at(id, { module: await wah(id, type) })).team;
  assert.deepEqual((await team('char_206_gnosis', 'UMD-Y')).field, [{ power: 'kjerag', bb: { atk: 0.15 }, status: RESIST, after: 10 }], '灵知: 获得抵抗，且攻击力+15% — both');
  assert.deepEqual((await team('char_1023_ghost2', 'PUM-Y')).deck, [{ when: 'deck', power: 'abyssal', bb: { max_hp: 0.33, sp_recovery_per_sec: 0.5 }, max: true }], '归溟幽灵鲨: 生命值+33%，且技力自然回复速度+0.5/秒');
  assert.deepEqual((await team('char_1038_whitw2', 'FUN-X')).deck, [], '荒芜拉普兰德: 初始技力+6，且首次触发技能后攻击速度+10 — the second is not read, so neither');
  assert.deepEqual((await team('char_420_flamtl', 'SOL-X')).field, [], '焰尾: 获得33%的物理闪避，且部署其他…后获得3点费用 — likewise');
  const t = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => teamPart({ description: d, bb, hidden: false });
  assert.deepEqual(t('编入队伍时，所有【术师】干员的攻击力+10%，且部署费用-1', { atk: 0.1, cost: -1 })?.bb, { atk: 0.1, cost: -1 }, 'a joined clause that reads');
  assert.equal(t('编入队伍时，所有【术师】干员的攻击力+10%，且首次部署后获得3点技力', { atk: 0.1 }), null, 'one that does not');
  assert.equal(t('编入队伍时，所有【术师】干员的攻击力+10%并首次部署后获得3点技力', { atk: 0.1 }), null, '并 in the same clause: the same');
});

test('[干员-7] [干员-17] [干员-24] [干员-28] module wordings that differ from the talent\'s only in a word or a key: 缩短 without 略微, 「自己身后的干员」 without professions, a key with a prefix', async () => {
  assert.deepEqual((await rec('char_4014_lunacu', 0)).talentTrait.whiles, [{ when: 'notInSkill', mods: {}, flags: { camou: true } }, { when: 'inSkill', mods: { batFlat: -0.25 } }], '子月 DEA-Y: 开启技能后攻击间隔缩短');
  const lunacu = await loadTraining('char_4014_lunacu');
  assert.deepEqual(/** @type {any} */ (operatorAt(lunacu, { elite: 2, level: 70, potential: 6, trust: 0, skill: 0, skillLevel: 7, module: 0, moduleLevel: 2 })).talentTrait.whiles.at(-1), { when: 'inSkill', mods: { batFlat: -0.2 } }, '子月 level 2: 小幅度缩短');
  assert.deepEqual((await rec('char_420_flamtl', 0)).talentTrait.nextAttack, [{ when: 'dodged', scale: 1.2, times: 2, blocked: true }], '焰尾 SOL-Y: 攻击力提升至120％并变为二连击 (`attack@atkscale_t1+.atk_scale`)');
  const bison = await rec('char_325_bison', 0);
  assert.deepEqual([bison.talentTrait.whiles, bison.rangeTalents], [[{ when: 'always', mods: { defFlat: 100 } }], [{ side: 'ally', ranged: false, area: [{ row: 0, col: -1 }], rotate: true, mods: { defFlat: 100 } }]], '拜松 PRO-X: 自己身后的干员 — every operator, not only 先锋 and 近卫');
  assert.deepEqual((await rec('char_325_bison')).rangeTalents[0].professions, ['PIONEER', 'WARRIOR'], 'the plain talent keeps them');
});
