// The attack range words of skill descriptions (docs/spec/skills.md 技能-8): 「攻击距离加长」「攻击距离缩短」「攻击范围缩短」「增大」「更加扩大」
// 「改为」「+N」 read like 「扩大」, from the real data; what is not read (a later use, a charge); a stepped world where the range decides who is hit,
// and the kitted 薇薇安娜, whose kit sets the range of her later casts.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createWorld, step, bus, reachKeys } from '@aue/sim';
import { tinyContent, oneWave, spawnAt, oracleDir } from '@aue/testkit';
import { loadTraining, operatorAt, skillDefOf, matchContent, loadKits } from '../src/index.js';
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

/** The pinned Stronghold kits are loaded under the compat hook (兼容-6). */
before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
});

/** The cells of a range id. @param {string} id */
const cells = (id) => /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id];
/** An operator's skill at elite 2, level 1, skill level `lv`. @param {string} id @param {number} skill @param {number} [lv] */
async function skillAt(id, skill, lv = 7) {
  return /** @type {any} */ (operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: lv }).skill);
}

test('[技能-8] 「攻击距离加长」「攻击距离缩短」「攻击范围缩短」「攻击范围增大」「更加扩大」「改为」「与溅射范围一起扩大」 take the level\'s range id, on real skills', async () => {
  const want = /** @type {[string, number, string, number?][]} */ ([
    ['char_4137_udflow', 1, '3-2'], ['char_017_huang', 1, '2-2'], ['char_356_broca', 1, '3-2'], // 加长
    ['char_220_grani', 1, '0-1'], ['char_264_f12yin', 1, '0-1'], ['char_333_sidero', 1, '0-1'], ['char_440_pinecn', 1, '1-3'], // 缩短
    ['char_180_amgoat', 2, 'x-3'], ['char_378_asbest', 1, '3-13', 10], ['char_340_shwaz', 2, '3-2'], ['char_4067_lolxh', 0, 'x-5'], // 增大、更加扩大、改为
    ['char_1043_leizi2', 0, '3-19'], ['char_2015_dusk', 2, '3-15'], ['char_4080_lin', 2, 'x-2'], // 朝前方和两侧扩大、与…范围一起扩大
  ]);
  for (const [id, skill, range, lv] of want) assert.deepEqual((await skillAt(id, skill, lv)).range, cells(range), `${id} S${skill + 1} ${range}`);
  assert.equal((await skillAt('char_378_asbest', 1, 7)).range.length, cells('2-5').length, '石棉 S2 at skill level 7 says 「扩大」 and always did');
  assert.deepEqual((await skillAt('char_440_pinecn', 1)).range.length < 7, true, '松果 S2: 4 cells instead of its 7');
});

/** The skills of every level of the data, with their range (from the words) and attack distance (the blackboard's or a written one). */
function levelsWithRange() {
  const dir = new URL('../data/operators/', import.meta.url);
  const all = readdirSync(dir).flatMap((f) => (JSON.parse(readFileSync(new URL(f, dir), 'utf8')).skills ?? []).flatMap((/** @type {any} */ s) => s.levels.map((/** @type {any} */ level) => skillDefOf(s.id, level))));
  const ranged = all.filter((d) => d.range || d.rangeAll);
  return { seen: ranged.length, both: ranged.filter((d) => Number.isFinite(d.bb.ability_range_forward_extend) || d.extra?.mods?.rangeExtend !== undefined).map((d) => d.id) };
}

test('[技能-8] 「攻击距离+N」 with a range id takes that range, once: no skill has both a range id and the blackboard attack distance', async () => {
  const want = /** @type {[string, number, string][]} */ ([['char_4026_vulpis', 2, '2-2'], ['char_1019_siege2', 1, '2-2'], ['char_613_acmedc', 1, '3-10'], ['char_613_acmedc', 2, '5-2']]);
  for (const [id, skill, range] of want) {
    const sk = await skillAt(id, skill);
    assert.deepEqual([sk.range, sk.extra?.mods?.rangeExtend], [cells(range), undefined], `${id} S${skill + 1}`);
  }
  // 「攻击距离+{ability_range_forward_extend}」 is the blackboard's key: a modifier of the generic effect, no range
  const fuze = await skillAt('char_4126_fuze', 0);
  assert.deepEqual([fuze.range, fuze.bb.ability_range_forward_extend], [undefined, 1]);
  // over every level of every skill: a level that has a range from the words never also has the distance (it would add twice)
  const { seen, both } = levelsWithRange();
  assert.deepEqual(both, []);
  assert.ok(seen > 1000, `${seen} levels with a range`);
});

test('[技能-8] a written 「攻击距离+N」 with no range id and no key adds N; a later use or a charged attack does not; 「攻击范围内」 is no change', async () => {
  const base = { skillType: 'AUTO', durationType: 'NONE', duration: 10, spData: { spType: 'INCREASE_WITH_TIME', spCost: 1, initSp: 0, maxChargeTime: 1 }, blackboard: [{ key: 'atk', value: 0.5 }] };
  const ext = (/** @type {string} */ description, /** @type {Record<string, unknown>} */ more = {}) => skillDefOf('x', { ...base, description, ...more }).extra?.mods?.rangeExtend;
  assert.deepEqual([ext('攻击距离+1，攻击力+{atk:0%}'), ext('自动开启：攻击距离+2'), ext('攻击距离+1', { rangeId: '2-2' }), ext('攻击距离+3', { blackboard: [{ key: 'ability_range_forward_extend', value: 1 }] })],
    [1, 2, undefined, undefined], 'a range id or the key says it already');
  assert.deepEqual([ext('第二次使用时使魔升级，攻击距离+1'), ext('蓄力额外效果：攻击距离+2，改为连续攻击三次'), ext('下次攻击攻击距离+1'), ext('攻击距离+{ability_range_forward_extend}')], [undefined, undefined, undefined, undefined]);
  for (const description of ['立即对攻击范围内的所有敌人造成伤害，使其被停顿', '攻击范围外的敌人被扩大', '攻击范围内的友方单位攻击力+10%，伤害扩大']) {
    assert.equal(skillDefOf('x', { ...base, description, rangeId: '2-2' }).range, undefined, description);
  }
  assert.deepEqual(skillDefOf('x', { ...base, description: '攻击距离加长', rangeId: '2-2' }).range, cells('2-2'));
  assert.equal(skillDefOf('x', { ...base, description: '攻击范围改为前方无限长的直线' }).range, undefined, 'no range id, nothing to read');
  // not changes of the skill itself in the data: a later use (薇薇安娜 S3, 使魔 of 玛露西尔 S2), a charge (薇薇安娜 S1)
  const vvana = await skillAt('char_4098_vvana', 2), vvana1 = await skillAt('char_4098_vvana', 0), marcil = await skillAt('char_4141_marcil', 1);
  assert.deepEqual([vvana.extra?.mods?.rangeExtend, vvana1.extra?.mods?.rangeExtend, marcil.extra?.mods?.rangeExtend, vvana.range, vvana1.range, marcil.range], [undefined, undefined, undefined, undefined, undefined, undefined]);
  // a line is read up to the words of a later use: 「攻击范围扩大，……蓄力额外效果：……」 is the skill's own range (龙舌兰 S2), 「第二次及以后使用时，攻击距离+2」 is not
  assert.deepEqual((await skillAt('char_486_takila', 1)).range, cells('2-3'));
  const later = (/** @type {string} */ description) => skillDefOf('x', { ...base, description, rangeId: '2-2' });
  assert.deepEqual([later('第二次及以后使用时，攻击距离+2').range, later('下次攻击攻击范围扩大').range, later('攻击范围扩大\n第二次使用时攻击距离+2').range, later('攻击范围扩大，蓄力额外效果：攻击范围缩小').range],
    [undefined, undefined, cells('2-2'), cells('2-2')]);
  assert.equal(skillDefOf('x', { ...base, description: '攻击距离+1，第二次使用时攻击距离+2' }).extra?.mods?.rangeExtend, 1);
});

/**
 * An operator on the tiny level's road at (row 1, col 1) facing right, a still dummy at (row 1, col `at`); the skill ready.
 * @param {string} id @param {number} skill @param {number} at
 */
async function arena(id, skill, at) {
  const c = /** @type {any} */ (tinyContent());
  c.operators.op = { ...operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 7 }), cost: 0 };
  c.enemies = { dummy: { name: 'dummy', maxHp: 1e9, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } };
  c.level.waves = [oneWave([spawnAt(0, 'dummy')])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === 'dummy'));
  Object.assign(e, { x: at, y: 1, path: [], pt: 0 });
  step(w, c, [[0, { type: 'deploy', op: 'op', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'op'));
  let hits = 0;
  bus.on(w, 'damaged', (k) => { if (k.source === op && k.target === e) hits++; });
  return { c, w, e, op, hits: () => hits, run: (/** @type {number} */ n) => { for (let i = 0; i < n; i++) { Object.assign(e, { x: at, y: 1 }); step(w, c); } } };
}

test('[技能-8] 忍冬 S3 「攻击距离+1」: the dummy two tiles away is hit only while the skill runs', async () => {
  const a = await arena('char_4026_vulpis', 2, 3);
  const base = reachKeys(a.c, a.op).size;
  a.run(150);
  assert.equal(a.hits(), 0, 'out of its attack range of 2 tiles');
  const sk = /** @type {NonNullable<Unit['skill']>} */ (a.op.skill);
  sk.sp = sk.cost;
  step(a.w, a.c, [[0, { type: 'skill', unit: a.op.id }]]);
  assert.ok(sk.active && reachKeys(a.c, a.op).size === base + 1, 'one tile more');
  a.run(90);
  assert.ok(a.hits() > 0, `hit during the skill (${a.hits()})`);
});

test('[技能-8] 格拉尼 S2 「攻击距离缩短」: the dummy on the next tile is no longer hit while the skill runs', async () => {
  const a = await arena('char_220_grani', 1, 2);
  a.run(90);
  const before = a.hits();
  assert.ok(before > 0, 'in its attack range of 2 tiles');
  const sk = /** @type {NonNullable<Unit['skill']>} */ (a.op.skill);
  sk.sp = sk.cost;
  step(a.w, a.c, [[0, { type: 'skill', unit: a.op.id }]]);
  assert.ok(sk.active && reachKeys(a.c, a.op).size === 1, 'its own tile only');
  a.run(120);
  assert.equal(a.hits(), before, 'none while it runs');
});

test('[技能-8] [兼容-6] 薇薇安娜 S3 with her kit: the kit sets the longer range for the second and later casts, so a still dummy three tiles ahead is hit by casts 2 and 3', async () => {
  const id = 'char_4098_vvana', key = `${id}#0`, build = { elite: 2, level: 60, potential: 6, trust: 0, skill: 2, skillLevel: 7 };
  const { kits } = await loadKits(pathToFileURL(`${oracleDir()}/`).href, [id]);
  const made = /** @type {any} */ (await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 7, decks: [[{ id, build }]] }, { kits }));
  // the match's operator and behaviours on the tiny level, whose dummy waits on the road three tiles from her
  const c = /** @type {any} */ (tinyContent());
  c.operators = { [key]: { ...made.operators[key], cost: 0 }, guard: c.operators.guard };
  c.behaviors = made.behaviors;
  c.decks = [[key]];
  c.enemies = { dummy: { name: 'dummy', maxHp: 1e9, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } };
  c.level.routes = [{ start: { row: 1, col: 3 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: 1, col: 3, time: 1000 }] }];
  c.level.waves = [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'SPAWN', key: 'dummy', route: 0, count: 1, preDelay: 0.5, interval: 0 }] }] }];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 4 };
  const w = createWorld(c, { seed: 7, players: 1 });
  const op = () => /** @type {Unit} */ (w.units.find((u) => u.key === key));
  const per = [0, 0, 0], reach = [];
  let cast = 0;
  bus.on(w, 'damaged', (k) => { if (k.source === op()) per[cast]++; });
  step(w, c, [[0, { type: 'deploy', op: key, row: 1, col: 0, dir: 0 }]]);
  for (let i = 0; i < 60; i++) step(w, c);
  // three casts, each once the one before has ended: the tiles she reaches as it starts, the hits of the cast
  for (; cast < 3; cast++) {
    const sk = /** @type {NonNullable<Unit['skill']>} */ (op().skill);
    sk.sp = sk.cost;
    step(w, c, [[0, { type: 'skill', unit: op().id }]]);
    assert.ok(sk.active, `cast ${cast + 1} has started`);
    reach.push(reachKeys(c, op()).size);
    for (let i = 0; i < 30 * 60 && sk.active; i++) step(w, c);
    assert.ok(!sk.active, `cast ${cast + 1} has ended`);
    for (let i = 0; i < 30; i++) step(w, c);
  }
  assert.equal(per[0], 0, 'the first cast keeps her range: the dummy is out of it');
  assert.ok(per[1] > 0 && per[2] > 0, `the second and third casts reach it (${per})`);
  assert.ok(reach[0] < reach[1] && reach[1] === reach[2], `reach by cast ${reach}`);
});
