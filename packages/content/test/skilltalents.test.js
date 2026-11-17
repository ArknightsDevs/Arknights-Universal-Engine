// A skill that raises its operator's talents (docs/spec/skills.md 技能-17): the rises read from descriptions, the talent fields
// as they read while the skill runs (`skillTalents`), and what a stepped world gives while it runs and after; a kitted
// operator does not read them.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir } from '@aue/testkit';
import { createWorld, step, attrs, traits, bus, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { loadTraining, operatorAt, matchContent, loadKits } from '../src/index.js';
import { risesOf } from '../src/talentscale.js';
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
});

/** The record of an operator at elite 2, skill level 7 — `build` changes that (a module, a level). @param {string} id @param {number} skill @param {Record<string, number>} [build] */
async function record(id, skill, build = {}) {
  return /** @type {any} */ (operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 6, trust: 0, skill, skillLevel: 7, ...build }));
}
/** The rises of a real skill (level 7). @param {string} id @param {number} skill */
async function risesAt(id, skill) {
  return risesOf(/** @type {any} */ ((await loadTraining(id)).skills[skill]).levels[6]);
}
/** A level description with these blackboard keys. @param {string} description @param {Record<string, number>} bb */
const level = (description, bb) => ({ description, blackboard: Object.entries(bb).map(([key, value]) => ({ key, value })) });

test('[技能-17] the rises a description says: times a key, a chance made that value, 翻倍; the talent named; what the clause is about', async () => {
  assert.deepEqual(await risesAt('char_308_swire', 1), [{ slot: 0, how: 'times', by: 2.7, kind: 'effect' }], '诗怀雅 S2: 第一天赋效果提升至{talent_scale}倍');
  assert.deepEqual(await risesAt('char_308_swire', 0), [{ slot: 0, how: 'times', by: 2, kind: 'effect' }], '诗怀雅 S1: 「效果提升至」 about the talent the clause before names');
  assert.deepEqual(await risesAt('char_358_lisa', 2), [{ slot: 1, how: 'times', by: 1.7, kind: 'effect' }], '铃兰 S3: 第二天赋, scale_delta_to_one');
  assert.deepEqual(await risesAt('char_106_franka', 1), [{ slot: 0, how: 'times', by: 2.5, kind: 'chance' }], '芙兰卡 S2: 天赋无视防御的概率提高至{talent_scale}倍');
  assert.deepEqual(await risesAt('char_253_greyy', 1), [{ slot: 0, how: 'times', by: 1.7, kind: 'time' }], '格雷伊 S2: 停顿的持续时间提升至…倍');
  assert.deepEqual(await risesAt('char_340_shwaz', 2), [{ slot: 0, how: 'to', by: 1, kind: 'chance' }], '黑 S3: 发动概率提高至{talent@prob:0%}');
  assert.deepEqual(await risesAt('char_1020_reed2', 2), [{ slot: 0, how: 'to', by: 1, kind: 'chance' }], '焰影苇草 S3: 第一天赋触发几率提升至100%');
  assert.deepEqual(await risesAt('char_346_aosta', 1), [{ slot: 0, how: 'times', by: 2, kind: 'effect' }], '奥斯塔 S2: 天赋的伤害倍率翻倍');
  assert.deepEqual(await risesAt('char_343_tknogi', 1), [{ slot: 0, how: 'times', by: 2, kind: 'effect' }], '月禾 S2: 触发条件变为…且庇护效果提升至…倍');
  // not a rise of the talents: another unit's, a gain on a kill, before deployment, the damage a talent causes, no skill talent
  for (const [id, skill] of /** @type {[string, number][]} */ ([['char_1031_slent2', 1], ['char_1055_haini', 1], ['char_1037_acspec', 0], ['char_4075_nymph', 1], ['char_308_swire', 2]])) {
    assert.deepEqual(await risesAt(id, skill).catch(() => []), [], `${id} S${skill + 1}`);
  }
  const d = (/** @type {string} */ text, /** @type {Record<string, number>} */ bb) => risesOf(level(text, bb));
  assert.deepEqual(d('第二天赋的触发几率提升至{talent_scale:0.0}倍', { talent_scale: 2 }), [{ slot: 1, how: 'times', by: 2, kind: 'chance' }]);
  assert.deepEqual(d('天赋效果提升至{talent_scale:0%}', { talent_scale: 1.7 }), [{ slot: 0, how: 'times', by: 1.7, kind: 'effect' }], 'a percent is the times too');
  assert.deepEqual(d('部署后第一天赋触发概率提升至{prob:0%}', { prob: 0.5 }), [], 'before deployment');
  assert.deepEqual(d('第一天赋效果提升至{talent_scale}倍', {}), [], 'no such key');
  assert.deepEqual(d('攻击力+{atk:0%}', { atk: 1 }), []);
});

test('[技能-17] the talent fields while a skill runs, on real data: in-range modifiers, chances, a status\'s time, what a talent adds to the trait', async () => {
  const swire = await record('char_308_swire', 1), lisa = await record('char_358_lisa', 2), franka = await record('char_106_franka', 1);
  assert.deepEqual([swire.rangeTalents[0].mods.atkPct, swire.skillTalents.rangeTalents[0].mods.atkPct], [0.12, 0.12 * 2.7], '+12% × 2.7');
  assert.deepEqual([lisa.rangeTalents[0].status.value, lisa.skillTalents.rangeTalents[0].status.value], [1.23 - 1, 1 + (1.23 - 1) * 1.7 - 1], 'a 脆弱 of 1.23: the 0.23 × 1.7');
  assert.equal(lisa.skillTalents.fieldTalents, undefined, 'the first talent is not the one raised');
  assert.deepEqual([franka.critTalents[0].prob, franka.skillTalents.critTalents[0].prob], [0.2, 0.5]);
  assert.equal((await record('char_346_aosta', 1)).skillTalents.talentTrait.onHit[0].dot.scale, 0.4, '0.2 × 2');
  assert.equal((await record('char_253_greyy', 1)).skillTalents.talentTrait.onHit[0].status.seconds, 0.6 * 1.7);
  assert.equal((await record('char_355_ethan', 1)).skillTalents.talentTrait.onHit[0].prob, 0.625, '25% × 2.5');
  assert.equal((await record('char_201_moeshd', 0)).skillTalents.talentTrait.whiles[0].mods.blockPA, 0.23 * 1.7, 'a talent that is only a chance: the chance is its effect');
  assert.equal((await record('char_340_shwaz', 2)).skillTalents.critTalents[0].prob, 1, 'the chance becomes 100%');
  assert.equal((await record('char_1020_reed2', 2)).skillTalents.talentTrait.onHit[0].prob, 1, '灼痕 on every hit, its 30% before');
  // the always-on talents: 攻击速度 + 15, raised to 2.5 times, is 22.5 more while the skill runs
  assert.deepEqual((await record('char_614_acsupo', 2)).skillTalents.talentTrait.whiles, [{ when: 'inSkill', mods: { aspd: 15 * 1.5 } }]);
  // an area the skill gives its talent: 诗怀雅 S1 (the level's range id), with ×2
  const s1 = await record('char_308_swire', 0);
  assert.deepEqual([s1.skillTalents.rangeTalents[0].area, s1.skillTalents.rangeTalents[0].mods.atkPct], [rangeTable.ranges['x-2'], 0.24]);
  assert.deepEqual(s1.rangeTalents[0].area, rangeTable.ranges['x-4'], 'the plain area is the talent\'s');
  // nothing for a skill that raises nothing, or a talent the engine does not read as parts
  assert.equal((await record('char_4137_udflow', 0)).skillTalents, undefined, '深巡 S1 raises nothing');
  assert.equal((await record('char_1031_slent2', 2)).skillTalents, undefined, '淬羽赫默 S3 raises a talent the engine does not read as parts');
});

/**
 * The tiny level with an operator at (row, col) — a ranged one on the high ground — and the tiny level's guard at (row 1, col 2), no enemies.
 * @param {string} id @param {number} skill @param {[number, number]} [at] @param {(c: any) => void} [tweak] a change of the content
 */
async function arena(id, skill, at = [1, 1], tweak = undefined) {
  const c = /** @type {any} */ (tinyContent());
  c.operators.op = { ...(await record(id, skill)), cost: 0 };
  c.operators.guard = { ...c.operators.guard, cost: 0 };
  c.level.waves = [];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 4 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'op', row: at[0], col: at[1], dir: 0 }], [0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  const get = (/** @type {string} */ key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
  const start = () => { const sk = /** @type {NonNullable<Unit['skill']>} */ (get('op').skill); sk.sp = sk.cost; step(w, c, [[0, { type: 'skill', unit: get('op').id }]]); return sk; };
  return { c, w, get, start, run: (/** @type {number} */ n) => { for (let i = 0; i < n; i++) step(w, c); } };
}

test('[技能-17] 诗怀雅 S2: the guard beside her gets +12% × 2.7 attack while the skill runs, +12% before and after', async () => {
  const a = await arena('char_308_swire', 1), guard = a.get('guard'), base = a.c.operators.guard.atk;
  a.run(30);
  assert.equal(attrs.statsOf(guard).atk, base * 1.12);
  const sk = a.start();
  a.run(2);
  assert.ok(sk.active);
  assert.ok(Math.abs(attrs.statsOf(guard).atk - base * (1 + 0.12 * 2.7)) < 1e-9, `${attrs.statsOf(guard).atk}`);
  a.run(30 * 40);
  assert.ok(!sk.active, 'the skill has ended');
  assert.equal(attrs.statsOf(guard).atk, base * 1.12, 'back to the plain talent');
});

test('[技能-17] 杜宾 S2: the 3-star guard gets the field buff +11% × 2.7 while the skill runs, tuned in place, +11% before and after', async () => {
  const a = await arena('char_130_doberm', 1, [1, 1], (c) => { c.operators.guard.rarity = 3; });
  const guard = a.get('guard'), base = a.c.operators.guard.atk;
  a.run(5);
  assert.ok(Math.abs(attrs.statsOf(guard).atk - base * 1.11) < 1e-9);
  const sk = a.start();
  a.run(2);
  assert.ok(sk.active && Math.abs(attrs.statsOf(guard).atk - base * (1 + 0.11 * 2.7)) < 1e-9, `${attrs.statsOf(guard).atk}`);
  a.run(30 * 40);
  assert.ok(!sk.active && Math.abs(attrs.statsOf(guard).atk - base * 1.11) < 1e-9, 'back to the plain talent');
});

test('[技能-17] 伊桑 and Raidian while the skill runs: the chance is the risen one; 攻击速度 of the always-on talent is more, and the buff of its extra entry goes with the skill', async () => {
  const ethan = await arena('char_355_ethan', 1);
  const before = traits.traitOf(ethan.c, ethan.get('op')).onHit[0].prob;
  const sk = ethan.start();
  ethan.run(2);
  assert.deepEqual([before, sk.active, traits.traitOf(ethan.c, ethan.get('op')).onHit[0].prob], [0.25, true, 0.625]);
  ethan.run(30 * 40);
  assert.deepEqual([sk.active, traits.traitOf(ethan.c, ethan.get('op')).onHit[0].prob], [false, 0.25]);
  // 攻击速度 of the always-on talent: more while the skill runs, then the buff of the extra entry is gone
  const a = await arena('char_614_acsupo', 2, [2, 2]), op = a.get('op'), was = attrs.statsOf(op).aspd, n = a.c.operators.op.talentTrait?.whiles?.length ?? 0;
  const s = a.start();
  a.run(5);
  assert.ok(s.active && attrs.statsOf(op).aspd > was, `${was} → ${attrs.statsOf(op).aspd}`);
  assert.ok(op.buffs.some((b) => b.key === `while:${n}`));
  a.run(30 * 40);
  assert.ok(!s.active && attrs.statsOf(op).aspd === was && !op.buffs.some((b) => b.key.startsWith('while:')), 'plain again, the extra buff taken back');
});

test('[技能-17] [兼容-6] an operator that fights by its kit does not read them: the kit applies its talents itself', async () => {
  const build = { elite: 2, level: 80, potential: 6, trust: 0, skill: 2, skillLevel: 7 };
  const root = pathToFileURL(`${oracleDir()}/`).href, { kits } = await loadKits(root, ['char_340_shwaz']);
  const match = { level: 'act1multi_01', difficulty: /** @type {const} */ ('NORMAL'), seed: 7, decks: [[{ id: 'char_340_shwaz', build }]] };
  const plain = /** @type {any} */ ((await matchContent(match)).operators['char_340_shwaz#0']), kitted = /** @type {any} */ ((await matchContent(match, { kits })).operators['char_340_shwaz#0']);
  assert.equal(plain.skillTalents.critTalents[0].prob, 1);
  assert.deepEqual(['skillTalents' in kitted, 'critTalents' in kitted], [false, false]);
});

test('[技能-17] 乌尔比安 S2: the heal she gets as she is hit is the risen one while the skill runs (it has no end), the plain one before it', async () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.op = { ...(await record('char_4145_ulpia', 1)), cost: 0, maxHp: 1e6, def: 0 };
  c.enemies = { slime: { name: 'slime', maxHp: 1e9, atk: 500, def: 0, res: 0, moveSpeed: 1, massLevel: 1, baseAttackTime: 1 } };
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 4 };
  const w = createWorld(c, { seed: 1, players: 1 }), op = () => /** @type {Unit} */ (w.units.find((u) => u.key === 'op'));
  /** @type {Record<string, number>} the heals she gives herself, by when and by how much */
  const heals = {};
  bus.on(w, 'heal', (k) => { if (k.target === op() && k.source === op()) { const when = `${/** @type {NonNullable<Unit['skill']>} */ (op().skill).active ? 'skill' : 'plain'}:${Math.round(k.amount)}`; heals[when] = (heals[when] ?? 0) + 1; } });
  step(w, c, [[0, { type: 'deploy', op: 'op', row: 1, col: 0, dir: 0 }]]);
  for (let i = 0; i < 30 * 12; i++) step(w, c);
  const plainBefore = { ...heals };
  assert.deepEqual(Object.keys(plainBefore), ['plain:100'], 'before the skill: the plain heal');
  const sk = /** @type {NonNullable<Unit['skill']>} */ (op().skill);
  sk.sp = sk.cost;
  step(w, c, [[0, { type: 'skill', unit: op().id }]]);
  for (let i = 0; i < 30 * 12; i++) step(w, c);
  assert.ok(sk.active && traits.traitOf(c, op()).hurt?.heal?.low === 180, 'the trait reads the risen heal');
  assert.deepEqual(Object.keys(heals).sort(), ['plain:100', 'skill:180'], 'while it runs: the risen heal, none of the plain');
});

/**
 * A still dummy (no 防御, a great deal of HP) at (row, col) `dummy` of the tiny level and an operator at (row, col) `at` of it, its
 * skill ready to start (`start`); `during` is the damage of each of its hits while the skill runs. `plain` takes the record's
 * `skillTalents` away, so the same skill runs without raising its talents — the control of the same seed. `tweak` changes the operator,
 * `build` the training (a module, a level).
 * @param {string} id @param {number} skill @param {[number, number]} at @param {[number, number]} dummy @param {{ plain?: boolean, tweak?: (op: any) => any, build?: Record<string, number> }} [o]
 */
async function duel(id, skill, at, dummy, { plain = false, tweak = (op) => op, build = {} } = {}) {
  const c = /** @type {any} */ (tinyContent()), { skillTalents, ...rest } = await record(id, skill, build);
  c.operators.op = tweak({ ...(plain ? rest : { ...rest, skillTalents }), cost: 0 });
  c.enemies = { dummy: { name: 'dummy', maxHp: 1e9, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } };
  c.level.waves = [oneWave([spawnAt(0, 'dummy')])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  const w = createWorld(c, { seed: 5, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === 'dummy'));
  const run = (/** @type {number} */ n) => { for (let i = 0; i < n; i++) { Object.assign(e, { x: dummy[1], y: dummy[0], path: [], pt: 0 }); step(w, c); } };
  run(1);
  step(w, c, [[0, { type: 'deploy', op: 'op', row: at[0], col: at[1], dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'op')), sk = /** @type {NonNullable<Unit['skill']>} */ (op.skill);
  /** @type {number[]} */
  const during = [];
  bus.on(w, 'damaged', (k) => { if (k.source === op && sk.active) during.push(Math.round(k.amount)); });
  run(60);
  return { c, w, op, sk, during, run, start: () => { sk.sp = sk.cost; step(w, c, [[0, { type: 'skill', unit: op.id }]]); run(2); } };
}
/** The distinct values of a list, ascending. @param {number[]} a */
const distinct = (a) => [...new Set(a)].sort((x, y) => x - y);

test('[技能-17] 黑 S3: while the skill runs every hit is the 1.6 × one (the chance is 100%); with the chance left at 20% only some are', async () => {
  const [raised, plain] = [await duel('char_340_shwaz', 2, [0, 2], [0, 4]), await duel('char_340_shwaz', 2, [0, 2], [0, 4], { plain: true })];
  for (const d of [raised, plain]) { d.start(); d.run(30 * 40); assert.ok(!d.sk.active, 'the skill has ended'); }
  assert.ok(raised.during.length > 5 && raised.during.length === plain.during.length, `${raised.during.length} hits`);
  assert.equal(distinct(plain.during).length, 2, `some hits are the stronger ones, not all: ${distinct(plain.during)}`);
  assert.deepEqual(distinct(raised.during), [distinct(plain.during)[1]], 'all of them are');
});

test('[技能-17] 绮良 S2: her always-on 回复 entry is retuned in place while the skill runs and an entry is added; both are as before when it ends', async () => {
  const a = await arena('char_478_kirara', 1, [1, 4]);
  const regen = () => a.get('op').buffs.filter((b) => b.key.startsWith('while:')).map((b) => [b.key, Math.round(/** @type {number} */ (b.mods.hpRegenRatio) * 1e6) / 1e6]);
  a.run(30);
  assert.deepEqual(regen(), [['while:0', 0.02]]);
  const sk = a.start();
  a.run(5);
  assert.ok(sk.active);
  assert.deepEqual(regen(), [['while:0', 0.054], ['while:1', 0.034]]);
  a.run(30 * 60);
  assert.ok(!sk.active);
  assert.deepEqual(regen(), [['while:0', 0.02]]);
});

test('[技能-17] a part of the trait scaled by the enemies in range is retuned in place while the skill runs, and back after it', async () => {
  // no operator has such a talent raised today: one is given to 绮良 here — 10% of attack for each enemy in range (at most 3), 30% in the skill
  const part = (/** @type {number} */ atkPct) => ({ whiles: [{ when: 'enemies', per: 3, mods: { atkPct } }] });
  const d = await duel('char_478_kirara', 1, [1, 1], [1, 2], { tweak: (op) => ({ ...op, talentTrait: part(0.1), skillTalents: { talentTrait: part(0.3) } }) });
  const mods = () => d.op.buffs.find((b) => b.key === 'while:0')?.mods.atkPct;
  assert.equal(mods(), 0.1, 'one enemy in range: 10%');
  d.start();
  assert.ok(d.sk.active);
  assert.ok(Math.abs(/** @type {number} */ (mods()) - 0.3) < 1e-9, `30% while the skill runs (${mods()})`);
  d.run(30 * 60);
  assert.ok(!d.sk.active);
  assert.equal(mods(), 0.1, 'back to 10%');
});

test('[技能-17] [职业-28] 仇白 LOR-X at 问雪 level 10: the later arts damage with both statuses is the risen 48% × the module\'s 1.2, not 1.2 risen too', async () => {
  const t = await loadTraining('char_4082_qiubai'), module = t.modules.findIndex((m) => m.type === 'LOR-X');
  const build = { level: 70, skillLevel: 10, module, moduleLevel: 3 };
  const rec = await record('char_4082_qiubai', 2, build);
  assert.deepEqual([rec.talentTrait.vs[0].arts, rec.talentTrait.vs[0].both, rec.skillTalents.talentTrait.vs[0].arts, rec.skillTalents.talentTrait.vs[0].both], [0.48, 1.2, 0.96, 1.2],
    'the skill doubles the damage (第一天赋的伤害提升至2倍), not the module\'s 提升至原本的1.2倍');
  const d = await duel('char_4082_qiubai', 2, [1, 0], [1, 3], { build });
  const dummy = /** @type {Unit} */ (d.w.units.find((u) => u.key === 'dummy'));
  const hold = () => { for (const s of /** @type {const} */ (['sluggish', 'root'])) if (!dummy.buffs.some((b) => b.key === s)) status.applyStatus(dummy, s, {}); };
  /** @type {Set<number>} the damage of each hit and rider, in the skill and out of it */
  const inSkill = new Set(), outside = new Set();
  bus.on(d.w, 'damaged', (k) => { if (k.source === d.op) (d.sk.active ? inSkill : outside).add(Math.round(k.amount)); });
  hold();
  d.run(30 * 3);
  const plainAtk = attrs.statsOf(d.op).atk;
  assert.ok(outside.has(Math.round(plainAtk * 0.48 * 1.2)), `outside the skill: ${[...outside]}`);
  d.start();
  hold();
  d.run(30 * 5);
  const atk = attrs.statsOf(d.op).atk;
  assert.ok(d.sk.active && atk > plainAtk, 'the skill runs');
  assert.ok(inSkill.has(Math.round(atk * 0.96 * 1.2)), `risen damage × 1.2: ${atk * 0.96 * 1.2} in ${[...inSkill]}`);
  assert.equal(inSkill.has(Math.round(atk * 0.96 * 2.4)), false, 'not × 2.4');
});

test('[技能-17] [部署-6] 铃兰 S3: the 脆弱 she holds on a 停顿 enemy is the risen one while the skill runs, retuned in place, the plain one before and after', async () => {
  const d = await duel('char_358_lisa', 2, [0, 2], [0, 4]);
  const dummy = /** @type {Unit} */ (d.w.units.find((u) => u.key === 'dummy'));
  status.applyStatus(dummy, 'sluggish', {});
  const fragile = () => dummy.buffs.filter((b) => b.key === 'fragile').map((b) => Math.round(b.value * 1e6) / 1e6);
  d.run(3);
  assert.deepEqual(fragile(), [0.23], 'plain: 脆弱 1.23');
  d.start();
  d.run(3);
  assert.ok(d.sk.active);
  assert.deepEqual(fragile(), [1 + 0.23 * 1.7 - 1].map((v) => Math.round(v * 1e6) / 1e6), 'the skill: the share above 1 × 1.7, one status');
  for (let i = 0; i < 30 * 60 && d.sk.active; i++) d.run(1);
  d.run(3);
  assert.deepEqual([d.sk.active, fragile()], [false, [0.23]], 'back to the plain one');
});

test('[技能-17] [干员-19] 焰影苇草 S3: while the skill runs every hit leaves the 法术脆弱 (the chance is 100%), its attack lowered too', async () => {
  const d = await duel('char_1020_reed2', 2, [0, 2], [0, 4]);
  const dummy = /** @type {Unit} */ (d.w.units.find((u) => u.key === 'dummy'));
  const mine = () => [...new Set(dummy.buffs.filter((b) => b.key === 'artsFragile').map((b) => Math.round(b.value * 1e6) / 1e6))];
  d.start();
  d.run(30 * 3);
  assert.ok(d.sk.active);
  assert.deepEqual(mine(), [0.32], 'the 法术脆弱 of the talent, strength 1.32 − 1');
  assert.ok(dummy.buffs.some((b) => (b.mods.atkPct ?? 0) === -0.22), '攻击力 −22%');
});
