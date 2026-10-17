// 堡垒守御 (docs/spec/fortress.md 守御-1…守御-6) on the tiny level: three waves of a slime, each a defence with a time
// limit, rests between them; a facility on the floor at (0, 1) that builders raise from the road above it or the high
// ground beside it; the builders' cards of each seat; the facilities' effects; the rubble pile's guards and its builder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { KIND, FORTRESS_PHASE } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { statsOf } from '../src/attrs.js';
import { dealDamage } from '../src/damage.js';
import { deployLimit, cardOf } from '../src/deck.js';
import { fieldContent, setLevel, facilityOf } from '../src/facilities.js';
import { fortressStamps } from '../src/fortress.js';

/** A world of 堡垒守御 (its progress there). @typedef {import('../src/types.js').World & { fortress: import('../src/types.js').FortressState }} FWorld */

const device = (/** @type {object} */ o) => ({ name: 'd', maxHp: 1000, atk: 0, def: 0, res: 0, blockCnt: 3, baseAttackTime: 1, aspd: 100, tauntLevel: -1, massLevel: 0, talentBb: {}, ...o });
const mode = (/** @type {number} */ cost, more = {}) => ({ sp: 1, sp2: 3, cost, ...more });
/** A builder card's record (守御-4). @param {'sp' | 'sp2'} sp @param {number} hits @param {number} life @param {number} cost */
const builder = (sp, hits, life, cost) => ({ name: 'worker', position: 'ALL', cost, blockCnt: 0, baseAttackTime: 1, maxHp: 100, atk: 100, def: 0, res: 0, range: [], profession: 'TRAP',
  trait: { free: true, noAttack: true }, respawnTime: 0, builder: { sp, hits, life } });

/**
 * The tiny level as 堡垒守御: rests of 10 s, defences of 20 s (the last 30 s), 1 life a rest, three waves of a slime; a
 * facility of `kind` at (0, 1) whose levels cost 3, 4 and 5 progress, `more[k]` the effects of level k; two plain
 * builders a seat, no advanced one.
 * @param {string} [kind] @param {Record<number, object>} [more] @param {number} [players]
 */
function fortress(kind = 'workshop', more = {}, players = 2) {
  const c = /** @type {any} */ (tinyContent());
  c.level.fortress = { rest: 10, wave: 20, waveLast: 30, life: 1, restAdd: 0 };
  c.level.waves = [0, 1, 2].map(() => oneWave([spawnAt(0.5, 'slime')]));
  c.level.cards = { operators: [], tokens: [{ key: 'worker', alias: 'worker', count: 2, hidden: false }, { key: 'worker2', alias: 'worker2', count: 0, hidden: false }] };
  c.level.predefines = [{ alias: 'fac#1', key: 'fac', hidden: false, row: 0, col: 1, dir: 'UP' }];
  c.devices = { fac: device({ facility: { kind, modes: [mode(3), mode(4, more[1]), mode(5, more[2]), { ...more[3] }], boom: 20000 } }),
    worker: device({ builder: { sp: 'sp', hits: 5, life: 6 } }), worker2: device({ builder: { sp: 'sp2', hits: 18, life: 20 } }) };
  for (const seat of [0, 1]) { c.operators[`worker#${seat}`] = builder('sp', 5, 6, 0); c.operators[`worker2#${seat}`] = builder('sp2', 18, 20, 5); }
  return { c, w: /** @type {FWorld} */ (createWorld(c, { seed: 1, players })) };
}

/** Steps n frames, the commands in the first; the events with their frames. @param {any} w @param {any} c @param {number} n @param {any[]} [cmds] @returns {any[]} */
function run(w, c, n, cmds = []) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) { const at = w.frame; out.push(...step(w, c, i === 0 ? cmds : []).map((e) => ({ ...e, at }))); }
  return out;
}

/** Steps until the first rest begins. @param {any} w @param {any} c */
function toRest(w, c) {
  for (let i = 0; i < 3000 && w.fortress.phase !== 'rest'; i++) step(w, c);
  assert.equal(w.fortress.phase, 'rest');
}

const facility = (/** @type {FWorld} */ w) => /** @type {any} */ (w.units.find((u) => u.kind === KIND.DEVICE && u.fac));
/** A builder above the facility on the road, facing down at it; one beside it on the high ground facing left. @param {number} seat */
const above = (/** @type {number} */ seat, op = `worker#${seat}`) => [seat, { type: 'deploy', op, row: 1, col: 1, dir: 3 }];
const beside = (/** @type {number} */ seat, op = `worker#${seat}`) => [seat, { type: 'deploy', op, row: 0, col: 2, dir: 2 }];
const phases = (/** @type {any[]} */ ev) => ev.filter((e) => e.type === 'fortress').map((e) => [e.wave, e.phase, e.at]);

test('[守御-1] the first wave defends at once; after its enemies a rest, then the next wave; the last defence over wins, its waves defended', () => {
  const { c, w } = fortress('workshop', {}, 1);
  const ev = run(w, c, 4000);
  const [first, rest, second] = phases(ev);
  assert.deepEqual(first, [0, FORTRESS_PHASE.defend, 0], 'the battle starts in the first defence');
  assert.equal(rest[0], 1);
  assert.equal(rest[1], FORTRESS_PHASE.rest);
  assert.deepEqual(second, [1, FORTRESS_PHASE.defend, rest[2] + 300], 'a rest of rest_time, then the next wave begins');
  assert.deepEqual(phases(ev).map((p) => p.slice(0, 2)), [[0, 0], [1, 1], [1, 0], [2, 1], [2, 0], [2, 2]]);
  assert.equal(w.result, 1);
  assert.equal(w.fortress.defended, 3);
  assert.deepEqual([w.fortress.total, w.fortress.out], [1, 1], 'the one slime of the last wave, gone');
  assert.deepEqual(ev.filter((e) => e.type === 'end').map((e) => e.result), [1]);
});

test('[守御-2] a rest gives life_point back, up to the maximum', () => {
  const { c, w } = fortress('workshop', {}, 1);
  w.players[0].life = 2;
  toRest(w, c);
  assert.equal(w.players[0].life, 2, 'the slime got through: 1, then +1');
  const full = fortress('workshop', {}, 1);
  full.c.level.fortress.life = 5;
  toRest(full.w, full.c);
  assert.equal(full.w.players[0].life, 3, '3 − 1 + 5, not above 3');
});

test('[守御-1] at the time limit the wave stops; its enemies on the field leave without costing life or counting as killed', () => {
  const { c, w } = fortress('workshop', {}, 1);
  c.enemies.slime = { ...c.enemies.slime, moveSpeed: 0.05, maxHp: 1e6 };
  c.level.waves = [oneWave([spawnAt(0.5, 'slime'), spawnAt(25, 'slime')]), oneWave([spawnAt(0.5, 'slime')])];
  const ev = run(w, c, 601);
  assert.deepEqual(phases(ev).map((p) => p.slice(1)), [[FORTRESS_PHASE.defend, 0], [FORTRESS_PHASE.rest, 600]]);
  assert.equal(w.units.some((u) => u.kind === KIND.ENEMY), false);
  assert.deepEqual(ev.filter((e) => ['death', 'goal'].includes(e.type)), []);
  assert.equal(w.players[0].life, 3);
  assert.equal(w.fortress.defended, 1);
  const rest = run(w, c, 2400);
  assert.equal(rest.filter((e) => e.type === 'spawn').length, 1, 'the cut wave\'s second slime never came; the last wave\'s did');
  assert.deepEqual(phases(rest).map((p) => p.slice(1)), [[FORTRESS_PHASE.defend, 900], [FORTRESS_PHASE.over, 1800]], 'the last defence lasts wave_time_last');
  assert.equal(w.result, 1);
});

test('[守御-1] a defence in which a player went down is not defended; stamps at 3, 5 and 7 waves', () => {
  const { c, w } = fortress();
  run(w, c, 30);
  w.players[1].revive = 30;
  toRest(w, c);
  assert.equal(w.fortress.defended, 0);
  assert.deepEqual([0, 2, 3, 4, 5, 6, 7, 9].map(fortressStamps), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('[守御-2] 「休整完毕」 from every seat ends the rest at once; from one, or outside a rest, it does nothing', () => {
  const { c, w } = fortress();
  run(w, c, 10, [[0, { type: 'rest' }]]);
  toRest(w, c);
  assert.deepEqual(w.fortress.ready, [false, false], 'a 休整完毕 in a defence is not kept');
  run(w, c, 5, [[0, { type: 'rest' }]]);
  assert.equal(w.fortress.phase, 'rest');
  const ev = run(w, c, 1, [[1, { type: 'rest' }]]);
  assert.deepEqual(phases(ev).map((p) => p.slice(0, 2)), [[1, FORTRESS_PHASE.defend]], 'the next wave begins in the same frame');
});

test('[守御-2] an operator retreated in a rest may come back at once; in a defence after its 再部署时间', () => {
  const { c, w } = fortress('workshop', {}, 1);
  run(w, c, 1, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  const guard = () => /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  run(w, c, 1, [[0, { type: 'retreat', unit: guard().id }]]);
  assert.equal(cardOf(w.players[0], 'guard').ready, w.frame - 1 + 60 * 30);
  w.players[0].cards = {};
  toRest(w, c);
  run(w, c, 1, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  run(w, c, 1, [[0, { type: 'retreat', unit: guard().id }]]);
  assert.equal(cardOf(w.players[0], 'guard').ready, w.frame - 1);
});

test('[守御-3] a facility starts as a box: invincible, unselectable, not blocking; at its cost it goes up a level with full HP', () => {
  const { c, w } = fortress('workshop', { 1: { max_hp: 2 } });
  const f = facility(w), s = statsOf(f);
  assert.deepEqual([f.fac.level, s.flags.invincible, s.flags.untargetable, s.blockCnt], [0, true, true, 0]);
  toRest(w, c);
  const ev = run(w, c, 1 + 3 * 30, [above(0)]);
  assert.deepEqual(ev.filter((e) => e.type === 'facility').map((e) => [e.level, e.at - ev[0].at]), [[1, 90]], 'the third hit, at 3 s');
  assert.deepEqual([f.fac.level, f.fac.pts, statsOf(f).blockCnt, statsOf(f).flags.untargetable ?? false], [1, 0, 3, false]);
  assert.equal(f.hp, 3000, 'max_hp 2: +200%, and full');
});

test('[守御-3] a lethal hit takes the facility back to the box, its progress cleared; the next rest brings back its highest level', () => {
  const { c, w } = fortress();
  const f = facility(w);
  setLevel(w, c, f, /** @type {any} */ (facilityOf(c, f)), 2);
  f.fac.pts = 2;
  dealDamage(w, null, f, { type: 'true', amount: 1e6 }, c);
  run(w, c, 1);
  assert.equal(w.units.includes(f), true, 'it stays on the field');
  assert.deepEqual([f.fac.level, f.fac.top, f.fac.pts, f.hp], [0, 2, 0, 1000]);
  toRest(w, c);
  assert.equal(f.fac.level, 2);
});

test('[守御-3] what goes over the cost is dropped; a rebuilt box goes back to its highest level; at level 3 no more building', () => {
  const { c, w } = fortress();
  w.fortress.pools[0]['worker2#0'] = 1;
  const f = facility(w);
  setLevel(w, c, f, /** @type {any} */ (facilityOf(c, f)), 1);
  toRest(w, c);
  w.players[0].cost = 10;
  run(w, c, 1 + 2 * 30, [above(0, 'worker2#0')]);
  assert.deepEqual([f.fac.level, f.fac.pts], [2, 0], '3 + 3 against a cost of 4: up, the 2 over dropped');
  setLevel(w, c, f, /** @type {any} */ (facilityOf(c, f)), 0);
  run(w, c, 30);
  assert.deepEqual([f.fac.level, f.fac.top], [2, 2], 'the box rebuilt at its cost of 3: back to 2');
  setLevel(w, c, f, /** @type {any} */ (facilityOf(c, f)), 3);
  run(w, c, 300);
  assert.deepEqual([f.fac.level, f.fac.pts], [3, 0]);
});

test('[守御-4] builders: only in a rest, next to a facility below level 3, one card each; a hit a second; gone after their hits', () => {
  const { c, w } = fortress();
  assert.equal(run(w, c, 1, [above(0)]).some((e) => e.type === 'deploy'), false, 'not in a defence');
  toRest(w, c);
  assert.equal(run(w, c, 1, [[0, { type: 'deploy', op: 'worker#0', row: 1, col: 3, dir: 3 }]]).some((e) => e.type === 'deploy'), false, 'not next to a facility');
  const ev = run(w, c, 31 + 5 * 30, [above(0), beside(1)]);
  assert.equal(ev.filter((e) => e.type === 'deploy').length, 2);
  assert.deepEqual(w.fortress.pools.map((p) => p[`worker#${w.fortress.pools.indexOf(p)}`]), [1, 1]);
  const f = facility(w);
  assert.deepEqual([f.fac.level, f.fac.pts], [2, 3], '10 hits: 3 to level 1, 4 to level 2, 3 more');
  assert.equal(ev.filter((e) => e.type === 'retreat').length, 2, 'both gone after 5 hits');
  assert.deepEqual(w.players.map((p) => p.deployed), [[], []], 'no place in the deck');
});

test('[守御-4] a builder that never hit gives its card back when its time is up; builders are unselectable and take no deploy place', () => {
  const { c, w } = fortress();
  toRest(w, c);
  run(w, c, 1, [[0, { type: 'deploy', op: 'worker#0', row: 1, col: 1, dir: 0 }]]);
  const b = /** @type {any} */ (w.units.find((u) => u.key === 'worker#0'));
  assert.equal(statsOf(b).flags.untargetable, true);
  assert.equal(w.fortress.pools[0]['worker#0'], 1);
  run(w, c, 6 * 30);
  assert.equal(w.units.includes(b), false, 'gone after its 6 s');
  assert.equal(w.fortress.pools[0]['worker#0'], 2, 'facing away, it never hit: its card back');
  assert.equal(deployLimit(c, 0, w), 2);
});

test('[守御-5] a 建筑工具间 gives every seat builders at each rest: cnt of its level', () => {
  const { c, w } = fortress('workshop', { 1: { cnt: 1 }, 2: { cnt: 2 } });
  setLevel(w, c, facility(w), /** @type {any} */ (facilityOf(c, facility(w))), 2);
  toRest(w, c);
  assert.deepEqual(w.fortress.pools, [{ 'worker#0': 4, 'worker2#0': 0 }, { 'worker#1': 4, 'worker2#1': 0 }]);
});

test('[守御-5] a 临时休息舱 adds value_char deploy places; at level 3 redeployment is 20% shorter', () => {
  const { c, w } = fortress('lounge', { 1: { value_char: 1 }, 3: { value_char: 3 } });
  const f = facility(w);
  setLevel(w, c, f, /** @type {any} */ (facilityOf(c, f)), 1);
  assert.equal(deployLimit(c, 0, w), 3);
  setLevel(w, c, f, /** @type {any} */ (facilityOf(c, f)), 3);
  assert.equal(deployLimit(c, 1, w), 5);
  run(w, c, 1, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  run(w, c, 1, [[0, { type: 'retreat', unit: /** @type {any} */ (w.units.find((u) => u.key === 'guard')).id }]]);
  assert.equal(cardOf(w.players[0], 'guard').ready, w.frame - 1 + 48 * 30);
});

test('[守御-5] a 便携健身架 raises every operator\'s HP and attack, the facilities\' sums', () => {
  const { c, w } = fortress('gym', { 1: { max_hp: 0.25, atk: 0.1 } });
  run(w, c, 1, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  const g = /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  setLevel(w, c, facility(w), /** @type {any} */ (facilityOf(c, facility(w))), 1);
  run(w, c, 1);
  assert.equal(statsOf(g).maxHp, 1250);
  assert.ok(Math.abs(statsOf(g).atk - 55) < 1e-9);
});

test('[守御-5] a built 液压式高台 is high ground for ranged operators and a 类障碍物地块; back at the box it strikes them down', () => {
  const { c, w } = fortress('platform');
  c.level.predefines[0] = { ...c.level.predefines[0], row: 1, col: 4 };
  const { w: w2 } = { w: /** @type {FWorld} */ (createWorld(c, { seed: 1, players: 2 })) };
  const f = facility(w2);
  assert.equal(run(w2, c, 1, [[0, { type: 'deploy', op: 'sniper', row: 1, col: 4, dir: 0 }]]).some((e) => e.type === 'deploy'), false);
  setLevel(w2, c, f, /** @type {any} */ (facilityOf(c, f)), 1);
  const tile = fieldContent(w2, c).level.tiles[1][4];
  assert.deepEqual([tile.height, tile.buildable, tile.obstacle], ['HIGHLAND', 'RANGED', true]);
  run(w2, c, 1, [[0, { type: 'deploy', op: 'sniper', row: 1, col: 4, dir: 0 }]]);
  const s = /** @type {any} */ (w2.units.find((u) => u.key === 'sniper'));
  assert.equal(s.z, 1);
  setLevel(w2, c, f, /** @type {any} */ (facilityOf(c, f)), 0);
  run(w2, c, 1);
  assert.equal(w2.units.includes(s), false);
  void w;
});

test('[守御-5] a 混凝土路障 at level 3 blasts the ground enemies within 1 tile when it falls', () => {
  const { c, w } = fortress('roadblock');
  c.level.predefines[0] = { ...c.level.predefines[0], row: 1, col: 3 };
  c.enemies.slime = { ...c.enemies.slime, maxHp: 30000 };
  const w2 = /** @type {FWorld} */ (createWorld(c, { seed: 1, players: 2 })), f = facility(w2);
  setLevel(w2, c, f, /** @type {any} */ (facilityOf(c, f)), 3);
  for (let i = 0; i < 600 && !w2.units.some((u) => u.kind === KIND.ENEMY && u.blockedBy === f.id); i++) step(w2, c);
  const e = /** @type {any} */ (w2.units.find((u) => u.kind === KIND.ENEMY));
  dealDamage(w2, null, f, { type: 'true', amount: 1e7 }, c);
  assert.equal(e.hp, 30000 - Math.max(20000 - 10, 20000 * 0.05));
  assert.equal(f.fac.level, 0);
  void w;
});

test('[守御-6] the rubble pile\'s guards come at each defence; from 5 s, every 2 s, with none in its range every seat gets an advanced builder, once', () => {
  const c = /** @type {any} */ (fortress().c);
  c.level.waves = [0, 1].map(() => oneWave([spawnAt(19, 'slime')]));
  c.level.branches = { guards: [{ preDelay: 0, actions: [spawnAt(0, 'slime')] }, { preDelay: 0, actions: [spawnAt(0, 'slime', { count: 2, interval: 0.5 })] }] };
  c.level.predefines.push({ alias: 'pile#1', key: 'pile', hidden: false, row: 1, col: 1, dir: 'UP' });
  const cross = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: -1 }, { row: 1, col: 0 }, { row: -1, col: 0 }];
  c.devices.pile = device({ blockCnt: 0, rubble: { range: 'x', cells: cross, branch: 'guards', first: 5, every: 2 } });
  const w = /** @type {FWorld} */ (createWorld(c, { seed: 1, players: 2 })), pile = /** @type {any} */ (w.units.find((u) => u.key === 'pile'));
  assert.equal(statsOf(pile).flags.untargetable, true);
  const ev = run(w, c, 45);
  assert.deepEqual(ev.filter((e) => e.type === 'spawn').map((e) => e.at), [0], 'the first batch, one guard, at the defence\'s start');
  const guard = /** @type {any} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  assert.equal(statsOf(guard).taunt, -1, 'in its range (on the road beside it): taunt level 1 lower');
  let at = -1;
  for (let i = 0; i < 600 && at < 0; i++) { step(w, c); if (w.fortress.pools[0]['worker2#0'] > 0) at = w.frame - 1; }
  assert.ok(at > 150 && (at - 150) % 60 === 0, `freed at a check after the guard left its range: ${at}`);
  run(w, c, 300);
  assert.deepEqual(w.fortress.pools.map((p, seat) => p[`worker2#${seat}`]), [1, 1], 'one each, once a defence');
  for (let i = 0; i < 2000 && w.fortress.round < 1; i++) step(w, c, w.fortress.phase === 'rest' ? [[0, { type: 'rest' }], [1, { type: 'rest' }]] : []);
  const second = w.units.filter((u) => u.kind === KIND.ENEMY && u.wave < 0 && u.born >= w.fortress.start).length;
  assert.equal(w.fortress.guards.length + second, 2, 'the second defence: the second batch, two guards');
});

test('[守御-1] [守御-3] snapshots: the progress is state; a restored world gets its hooks back and goes on alike', () => {
  const { c, w } = fortress();
  toRest(w, c);
  run(w, c, 40, [above(0), beside(1)]);
  const snap = takeSnapshot(w), copy = /** @type {FWorld} */ (restoreSnapshot(snap));
  assert.equal(stateHash(copy), stateHash(w));
  for (const x of [w, copy]) {
    const f = facility(x);
    setLevel(x, c, f, /** @type {any} */ (facilityOf(c, f)), 1);
    run(x, c, 1);
    dealDamage(x, null, facility(x), { type: 'true', amount: 1e6 }, c);
    run(x, c, 200);
  }
  assert.equal(facility(copy).fac.level, facility(w).fac.level);
  assert.equal(w.units.includes(facility(w)), true);
  assert.equal(stateHash(copy), stateHash(w));
});
