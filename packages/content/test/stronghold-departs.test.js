// What the engine does where the pinned Stronghold's kits depart from the official game (docs/registry/known-differences.json,
// DIF-0074…DIF-0083): each talent and the trauma of a pull, read from the real data and stepped in a world — an operator alone,
// or with one ally, against a still dummy with no defence. The tests pin our side; the registry says what the other side does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, bus, buffs, attrs, KIND } from '@aue/sim';
import { oneWave, spawnAt } from '@aue/testkit';
import { loadTraining, matchContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** An open lane: three rows of road, the dummy spawns `dx` tiles to the right of the operator's tile. @param {number} dx */
function level(dx) {
  const tile = { key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' };
  const tiles = Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => ({ ...tile })));
  return {
    id: 'departs-arena', width: 8, height: 3, tiles, waves: [oneWave([spawnAt(0, 'dummy')])],
    options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 },
    routes: [{ start: { row: 0, col: 0 }, end: { row: 2, col: 7 }, motion: 'WALK', checkpoints: [], spawnOffset: { x: 3 + dx, y: 1 } }],
  };
}

/**
 * The operator at elite 2, its highest level, its skill `skill` and last module when `module`, deployed on the tile (1, 3) of
 * the lane, and an optional ally on (1, 4), against a dummy that cannot move by itself. With `cast` its skill starts full and
 * `a.cast()` starts it. The log keeps the damage the
 * operator did to the dummy as [frame, amount, type] and the statuses it gave.
 * @param {{ id: string, skill?: number, module?: boolean, ally?: string, dx?: number, cast?: boolean }} o
 */
async function arena(o) {
  const t = await loadTraining(o.id);
  const build = { elite: 2, level: t.phases[2].maxLevel, potential: 1, trust: 0, skill: o.skill ?? 0, skillLevel: 7, ...(o.module ? { module: t.modules.length - 1, moduleLevel: 3 } : {}) };
  const decks = [{ id: o.id, build }];
  if (o.ally) decks.push({ id: o.ally, build: { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 } });
  const c = /** @type {any} */ (await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [decks] }, {}));
  c.level = level(o.dx ?? 1);
  c.enemies = { dummy: { name: 'dummy', maxHp: 1e7, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } };
  const sk = c.operators[`${o.id}#0`].skill;
  if (o.cast && sk) c.operators[`${o.id}#0`] = { ...c.operators[`${o.id}#0`], skill: { ...sk, init: sk.cost * Math.max(1, sk.charges) } };
  const w = createWorld(c, { seed: 7, players: 1 });
  const key = `${o.id}#0`, op = () => /** @type {Unit} */ (w.units.find((u) => u.key === key));
  const foe = () => /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  /** @type {{ hits: [number, number, string][], statuses: string[] }} */
  const log = { hits: [], statuses: [] };
  bus.on(w, 'damaged', (/** @type {any} */ k) => { if (k.source === op() && k.target === foe()) log.hits.push([w.frame, k.amount, k.type]); }, { priority: -1e9 });
  bus.on(w, 'beforeStatus', (/** @type {any} */ k) => { if (k.source === op()) log.statuses.push(k.status); }, { priority: -1e9 });
  bus.on(w, 'enemySpawn', (/** @type {any} */ k) => { buffs.addBuff(k.enemy, buffs.makeBuff({ key: 'still', flags: { root: true } })); }, { priority: 1e9 });
  /** @type {[number, any][]} */
  const deploys = [[0, { type: 'deploy', op: key, row: 1, col: 3, dir: 0 }]];
  if (o.ally) deploys.push([0, { type: 'deploy', op: `${o.ally}#0`, row: 1, col: 4, dir: 0 }]);
  step(w, c, deploys);
  return { w, c, op, foe, log, cast: () => step(w, c, [[0, { type: 'skill', unit: op().id }]]), run: (/** @type {number} */ n) => { for (let i = 0; i < n; i++) step(w, c); }, ally: () => /** @type {Unit} */ (w.units.find((u) => u.key === `${o.ally}#0`)) };
}

/** The first buff of a unit whose key starts with the prefix. @param {Unit} u @param {string} prefix */
const buffOf = (u, prefix) => u.buffs.find((b) => b.key.startsWith(prefix));
const close = (/** @type {number} */ a, /** @type {number} */ b, /** @type {string} */ what) => assert.ok(Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 1e-6), `${what}: ${a} is not ${b}`);

test('[职业-23] 移动创伤 (DIF-0074): a pull with 钩索师 HOK-X is several hits, one every 2 frames, adding up to 800 a tile it moved the target', async () => {
  const a = await arena({ id: 'char_173_slchan', skill: 1, module: true, dx: 3, cast: true });
  let from = { x: a.foe().x, y: a.foe().y }, moved = 0, start = -1;
  for (let i = 0; i < 60; i++) {
    if (i === 3) a.cast(); else a.run(1);
    if (start < 0 && a.op().skill?.active) start = a.w.frame;
    if (start >= 0) { moved += Math.hypot(a.foe().x - from.x, a.foe().y - from.y); }
    from = { x: a.foe().x, y: a.foe().y };
  }
  assert.ok(start > 0, 'the pull skill started');
  const trauma = a.log.hits.filter(([f, , type]) => f >= start && f < start + 40 && type === 'arts');
  assert.ok(trauma.length >= 5, `${trauma.length} hits`);
  assert.deepEqual([...new Set(trauma.slice(0, -1).map(([f], i) => trauma[i + 1][0] - f))], [2]);
  close(trauma.reduce((sum, h) => sum + h[1], 0), 800 * moved, 'the sum of the hits');
  const plain = await arena({ id: 'char_173_slchan', skill: 1, dx: 3, cast: true });
  for (let i = 0; i < 60; i++) { if (i === 3) plain.cast(); else plain.run(1); }
  assert.ok(plain.log.hits.length > 0, 'the skill hit the dummy');
  assert.equal(plain.log.hits.filter(([, , type]) => type === 'arts').length, 0, 'without the module there is no trauma');
});

test('[部署-5] 佩佩的弥漫莲香 (DIF-0075): the attack of the deploy frame already has +16 %', async () => {
  const a = await arena({ id: 'char_4058_pepe', skill: 2 });
  a.run(1);
  const field = buffOf(a.op(), 'field:');
  assert.ok(field);
  close(/** @type {any} */ (field).mods.atkPct, 0.16, 'the talent');
  a.run(70);
  assert.ok(a.log.hits.length >= 2);
  assert.ok(a.log.hits[0][0] <= 2, `the first hit is on frame ${a.log.hits[0][0]}`);
  close(a.log.hits[0][1], a.op().base.atk * 1.16, 'the first hit');
  close(a.log.hits[1][1], a.log.hits[0][1], 'the second hit');
});

test('[职业-32] 新约能天使的铳弹协约 (DIF-0076): she carries it from the first frame; so does 百炼嘉维尔 (DIF-0080) her 战地巨斧', async () => {
  const a = await arena({ id: 'char_1041_angel2' });
  a.run(1);
  close(/** @type {any} */ (buffOf(a.op(), 'fieldBuff:')).mods.atkPct, 0.18, '+9 % doubled for a 拉特兰 operator');
  const g = await arena({ id: 'char_1026_gvial2' });
  g.run(1);
  const own = /** @type {any} */ (g.op().buffs.find((b) => b.key.startsWith('while:') && b.mods.atkPct === 0.1));
  assert.ok(own, 'atk +10 % without a blocked enemy');
  close(own.mods.defPct, 0.1, 'def');
  g.run(2);
  close(g.log.hits[0][1], g.op().base.atk * 1.1, 'the first hit');
});

test('[部署-6] 海霓的测绘器材的奇用 (DIF-0077): a normal enemy in range has the 脆弱 for her first attack', async () => {
  const a = await arena({ id: 'char_4079_haini' });
  a.run(1);
  close(/** @type {any} */ (buffOf(a.foe(), 'fragile')).mods.dmgTakenMul, 1.16, 'the 脆弱, a status the range talent holds');
  a.run(70);
  close(a.log.hits[0][1], a.op().base.atk * 1.16, 'the first hit');
});

test('[职业-25] 莱恩哈特的破片杀伤 (DIF-0078): +4 % for the one enemy in range, on the first attack', async () => {
  const a = await arena({ id: 'char_373_lionhd' });
  a.run(1);
  close(/** @type {any} */ (buffOf(a.op(), 'while:')).mods.atkPct, 0.04, 'the talent');
  a.run(100);
  assert.ok(a.log.hits[0][0] <= 3, `the first hit is on frame ${a.log.hits[0][0]}`);
  close(a.log.hits[0][1], a.op().base.atk * 1.04, 'the first hit');
});

test('[职业-26] 远牙的凝神 (DIF-0079): holds from the deploy frame, so the first attack has +15 %', async () => {
  const a = await arena({ id: 'char_430_fartth' });
  a.run(1);
  close(/** @type {any} */ (a.op().buffs.find((b) => b.key.startsWith('while:'))).mods.atkPct, 0.15, 'the talent');
  a.run(100);
  assert.ok(a.log.hits[0][0] <= 3, `the first hit is on frame ${a.log.hits[0][0]}`);
  close(a.log.hits[0][1], a.op().base.atk * 1.15, 'the first hit');
});

test('[职业-25] 宴的认真模式 (DIF-0081): the 坚忍 follows the HP the breach took, from the deploy frame: the second attack comes before frame 24', async () => {
  const a = await arena({ id: 'char_337_utage', skill: 1 });
  a.run(1);
  const grit = /** @type {any} */ (buffOf(a.op(), 'grit'));
  assert.ok(grit.mods.aspd > 50, `the 坚忍 gives ${grit.mods.aspd} attack speed on the first frame`);
  assert.ok(a.op().hp < attrs.maxHpOf(a.op()) * 0.6, 'the breach took half of the HP');
  a.run(60);
  assert.ok(a.log.hits.length >= 2);
  assert.ok(a.log.hits[1][0] - a.log.hits[0][0] < 24, `the second hit comes ${a.log.hits[1][0] - a.log.hits[0][0]} frames after the first`);
});

test('[干员-31] 薄绿的地质学者 (DIF-0082): the ally on the next tile gets the DEF, 薄绿 herself does not', async () => {
  const a = await arena({ id: 'char_388_mint', ally: 'char_002_amiya' });
  a.run(1);
  close(/** @type {any} */ (buffOf(a.ally(), 'range:')).mods.defPct, 0.1, 'the ally');
  assert.equal(buffOf(a.op(), 'range:'), undefined);
});

test('[职业-34] 溯光星源的能源解析 (DIF-0083): the 脆弱 is a status on the enemy from the first frame', async () => {
  const a = await arena({ id: 'char_1047_halo2' });
  a.run(1);
  close(/** @type {any} */ (buffOf(a.foe(), 'fragile')).mods.dmgTakenMul, 1.1, 'the 脆弱');
  a.run(80);
  close(a.log.hits[0][1], a.op().base.atk * 1.1, 'the first hit');
  assert.ok(a.log.statuses.includes('fragile'), 'given as the status, same name highest (干员-9)');
});
