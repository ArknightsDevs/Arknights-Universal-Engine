// The skeleton's rules on the tiny level (docs/spec: deploy, enemies, combat). Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, rangeCell, deployProblem, damage, status, attrs, buffs } from '../src/index.js';
import { tinyContent } from '@aue/testkit';
import { makeEnemy } from '../src/units.js';

const c = tinyContent();
/** @param {number} [players] */
const fresh = (players = 2) => createWorld(c, { seed: 1, players });
/** @param {Partial<import('@aue/schema').DeployCommand>} o @returns {import('@aue/schema').DeployCommand} */
const deploy = (o) => ({ type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0, ...o });
/** @param {ReturnType<typeof fresh>} w @param {number} n */
const run = (w, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** @param {import('../src/types.js').Unit} u */
const removeAll = (u) => { u.buffs = []; };

test('[费用-1] each player starts with the initial cost and gains 1 per costIncreaseTime, up to maxCost', () => {
  const w = fresh();
  assert.deepEqual(w.players.map((p) => p.cost), [10, 10]);
  run(w, 29);
  assert.equal(w.players[0].cost, 10);
  run(w, 1);
  assert.deepEqual(w.players.map((p) => p.cost), [11, 11]);
  run(w, 300);
  assert.equal(w.players[1].cost, 12);
});

test('[部署-1] melee operators stand on melee tiles, ranged ones on ranged tiles', () => {
  const w = fresh();
  assert.equal(deployProblem(w, c, 0, deploy({})), null);
  assert.equal(deployProblem(w, c, 0, deploy({ row: 0, col: 2 })), 'tile not buildable for this operator');
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'sniper', row: 0, col: 2 })), null);
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'sniper' })), 'tile not buildable for this operator');
  assert.equal(deployProblem(w, c, 0, deploy({ row: 9, col: 9 })), 'tile not buildable for this operator');
});

test('[部署-2] cost, occupied tiles, one copy of each operator, the deploy limit; refused commands change nothing', () => {
  const w = fresh();
  step(w, c, [[0, deploy({})]]);
  assert.equal(w.players[0].cost, 5);
  assert.equal(deployProblem(w, c, 1, deploy({})), 'tile occupied');
  assert.equal(deployProblem(w, c, 0, deploy({ col: 3 })), 'already deployed');
  assert.equal(deployProblem(w, c, 0, deploy({ op: 'nobody' })), 'unknown operator or seat');
  assert.equal(deployProblem(w, c, 5, deploy({})), 'unknown operator or seat');
  const poor = fresh();
  poor.players[0].cost = 4;
  assert.equal(deployProblem(poor, c, 0, deploy({})), 'not enough cost');
  step(w, c, [[0, deploy({ op: 'sniper', row: 0, col: 3 })]]);
  const limited = { ...c, level: { ...c.level, options: { ...c.level.options, characterLimit: 2 } } };
  assert.equal(deployProblem(w, limited, 0, deploy({ op: 'guard', col: 4 })), 'already deployed');
  const before = JSON.stringify(w.units);
  step(w, c, [[1, deploy({ col: 2 })]]);
  assert.equal(JSON.stringify(w.units.map((u) => ({ ...u, atkCd: 0, anim: 0 }))), JSON.stringify(JSON.parse(before).map((/** @type {any} */ u) => ({ ...u, atkCd: 0, anim: 0 }))));
});

test('[部署-2] the deploy limit counts each player separately', () => {
  const tight = { ...c, level: { ...c.level, options: { ...c.level.options, characterLimit: 1 } } };
  const w = createWorld(tight, { seed: 1, players: 2 });
  step(w, tight, [[0, deploy({})], [1, deploy({ op: 'sniper', row: 0, col: 2 })]]);
  assert.equal(deployProblem(w, tight, 0, deploy({ op: 'sniper', row: 0, col: 3 })), 'deploy limit reached');
});

test('[撤退-1] [部署-3] a player retreats only their own operators, which may be deployed again after the 再部署时间', () => {
  const w = fresh();
  step(w, c, [[0, deploy({})]]);
  const id = w.units[0].id;
  step(w, c, [[1, { type: 'retreat', unit: id }]]);
  assert.equal(w.units.length, 1);
  const ev = step(w, c, [[0, { type: 'retreat', unit: id }]]);
  assert.equal(w.units.filter((u) => u.kind === 0).length, 0);
  assert.deepEqual(ev.filter((e) => e.type === 'retreat'), [{ type: 'retreat', id }]);
  assert.equal(deployProblem(w, c, 0, deploy({})), 'redeploying', 'no 再部署时间 given: 60 s');
  w.frame = 2 + 1800;
  w.players[0].cost = 12;
  assert.equal(deployProblem(w, c, 0, deploy({})), null);
});

test('[出怪-1] enemies appear at their spawn time, at the start of their route', () => {
  const w = fresh();
  run(w, 15);
  assert.equal(w.units.length, 0);
  const ev = step(w, c);
  assert.deepEqual(ev, [{ type: 'spawn', id: 1, key: 'slime' }]);
  assert.equal(w.units[0].y + w.units[0].x > 0, true);
  run(w, 44);
  assert.equal(w.units.length, 1);
  run(w, 1);
  assert.equal(w.units.length, 2);
});

test('[移动-1] [路线-1] enemies walk their route at moveSpeed tiles per second and wait where it says', () => {
  const w = fresh();
  run(w, 16);
  const e = w.units[0];
  assert.deepEqual([e.x, e.y], [0, 2 - 1 / 30]);
  run(w, 29);
  assert.ok(Math.abs(e.y - 1) < 1e-12 && e.x < 1e-12, `${e.x},${e.y}`);
  run(w, 90);
  assert.ok(Math.abs(e.y - 1) < 1e-12 && e.x < 1e-12, `the 3 s wait: ${e.x},${e.y}`);
  run(w, 30);
  assert.ok(Math.abs(e.x - 1) < 1e-12 && Math.abs(e.y - 1) < 1e-12, `${e.x},${e.y}`);
});

test('[目标-1] an enemy at the goal costs one life of the player the goal belongs to and leaves without dying', () => {
  const w = fresh();
  /** @type {any[]} */
  const events = [];
  for (let i = 0; i < 360; i++) events.push(...step(w, c));
  assert.deepEqual(w.players.map((p) => p.life), [3, 1]);
  assert.equal(events.filter((e) => e.type === 'goal').length, 2);
  assert.equal(events.filter((e) => e.type === 'death').length, 0);
  assert.equal(w.units.length, 0);
  const solo = fresh(1);
  run(solo, 360);
  assert.deepEqual(solo.players.map((p) => p.life), [1]);
});

test('[伤害-6] [攻击-1] the normal attack of an operator is one hit of its attack, of its damage type', () => {
  const w = fresh();
  step(w, c, [[0, deploy({ row: 1, col: 1, dir: 0 })]]);
  const t = { type: /** @type {const} */ ('phys'), amount: 50 };
  assert.equal(damage.mitigate(t.amount, t.type, { def: 10, res: 0, epDamageResistance: 0 }, damage.penetration(null)), 40);
  /** @type {any[]} */
  const hits = [];
  for (let f = 1; f < 260; f++) for (const e of step(w, c)) if (e.type === 'hit') hits.push(e);
  assert.ok(hits.length > 0 && hits.every((h) => h.damage === 40 && h.id === 1));
  const op = /** @type {any} */ (w.units.find((u) => u.id === 1)), before = hits.length;
  buffs.addBuff(op, buffs.makeBuff({ key: 'scale', mods: { atkScaleMul: 1.5 } }));
  buffs.addBuff(op, buffs.makeBuff({ key: 'scale2', mods: { atkScaleMul: 2 } }));
  for (let f = 0; f < 260; f++) for (const e of step(w, c)) if (e.type === 'hit') hits.push(e);
  assert.ok(hits.length > before && hits.slice(before).every((h) => h.damage === 50 * 3 - 10), 'its 攻击力倍率 × the attacker’s (1.5 × 2)');
});

test('[攻击-1] range offsets turn with the facing; four turns come back', () => {
  const op = /** @type {any} */ ({ x: 3, y: 1, dir: 'RIGHT' }), off = { row: 1, col: 2 };
  const cells = ['RIGHT', 'UP', 'LEFT', 'DOWN'].map((dir) => rangeCell({ ...op, dir }, off));
  assert.deepEqual(cells, [{ row: 2, col: 5 }, { row: 3, col: 2 }, { row: 0, col: 1 }, { row: -1, col: 4 }]);
});

test('[攻击-1] an operator hits the earliest enemy in range once per attack interval', () => {
  const w = fresh();
  step(w, c, [[0, deploy({ row: 1, col: 1, dir: 0 })]]);
  /** @type {any[]} */
  const hits = [];
  for (let f = 1; f < 200; f++) for (const e of step(w, c)) if (e.type === 'hit') hits.push({ f, ...e });
  assert.ok(hits.length >= 2, 'the guard attacks');
  const gaps = hits.slice(1).map((h, i) => h.f - hits[i].f).filter((g) => g < 60);
  assert.ok(gaps.every((g) => g === 30), `attack interval 1 s = 30 frames: ${gaps}`);
  assert.ok(hits.every((h) => h.damage === 40), 'guard 50 atk vs slime 10 def');
});

test('[攻击-1] [状态-5] a stunned operator neither attacks nor counts its cooldown down', () => {
  const w = fresh();
  step(w, c, [[0, deploy({ row: 1, col: 1, dir: 0 })]]);
  const op = w.units[0];
  status.applyStatus(op, 'stun', { frames: 600 });
  /** @type {any[]} */
  const ev = [];
  for (let f = 1; f < 200; f++) ev.push(...step(w, c));
  assert.equal(ev.filter((e) => e.type === 'attack').length, 0);
  assert.equal(op.atkCd, 0);
});

test('[移动-1] [状态-5] an enemy that cannot move stays; 停顿 moves it at a fifth of its speed', () => {
  const w = fresh();
  run(w, 16);
  const e = w.units[0], y = e.y;
  status.applyStatus(e, 'root', { frames: 30 });
  run(w, 10);
  assert.equal(e.y, y);
  removeAll(e);
  status.applyStatus(e, 'sluggish', {});
  run(w, 1);
  assert.ok(Math.abs(y - e.y - 0.2 / 30) < 1e-15, `${y - e.y}`);
});

test('[帧-1] buffs run down after the spawns and before the enemies move: a 1-frame root holds an enemy for the frame it was given in', () => {
  const w = fresh();
  run(w, 16);
  const e = w.units[0], y = e.y;
  status.applyStatus(e, 'root', { frames: 1 });
  run(w, 1);
  assert.equal(e.buffs.length, 0, 'it ran out in the buff phase');
  assert.ok(e.y < y, 'so the enemy moved this frame');
});

test('[属性-1] [属性-3] units take their base attributes from the content; what it leaves out takes the default', () => {
  const cc = tinyContent();
  cc.enemies.slime = { ...cc.enemies.slime, aspd: 120, tauntLevel: 1, massLevel: 4, epDamageResistance: 30, epResistance: 10,
    motion: 'FLY', immune: ['stun'], dmgType: 'arts', baseAttackTime: 2 };
  const w = createWorld(cc, { seed: 1, players: 1 });
  for (let f = 0; f < 16; f++) step(w, cc);
  const e = w.units[0];
  assert.deepEqual(e.base, { maxHp: 100, atk: 0, def: 10, res: 0, aspd: 120, bat: 2, blockCnt: 1, moveSpeed: 1, tauntLevel: 1, massLevel: 4,
    epDamageResistance: 30, epResistance: 10, motion: 'FLY', immune: ['stun'], dmgType: 'arts', rangeRadius: 0, applyWay: 'MELEE', maxEp: 1000, shared: false,
    levelType: 'NORMAL', neutral: false, deathLife: 0, lifeCost: 1 });
  const plain = fresh(1);
  step(plain, c, [[0, deploy({})]]);
  const op = plain.units[0];
  assert.deepEqual([op.base.aspd, op.base.blockCnt, op.base.moveSpeed, op.base.motion, op.base.dmgType, op.base.immune], [100, 2, 1, 'WALK', 'phys', []]);
  assert.deepEqual([op.hp, op.maxHp, op.born, op.bornN, op.blockedBy], [1000, 1000, 0, 1, -1]);
});


test('[部署-4] [属性-4] an operator with always-on talents is deployed with them as one buff without an end, its HP full', () => {
  const cc = tinyContent();
  cc.operators.guard = { ...cc.operators.guard, talentBb: { atk: 0.2, max_hp: 0.2, attack_speed: 6, magic_resistance: 10 } };
  const w = createWorld(cc, { seed: 1, players: 1 });
  step(w, cc, [[0, deploy({})]]);
  const op = w.units[0], s = attrs.statsOf(op);
  assert.deepEqual(op.buffs.map((b) => [b.key, b.left, b.mods]), [['talent', -1, { atkPct: 0.2, hpPct: 0.2, aspd: 6, resFlat: 10 }]]);
  assert.deepEqual([s.atk, s.maxHp, s.aspd, s.res, op.hp, op.maxHp], [60, 1200, 106, 10, 1200, 1200]);
  for (let f = 0; f < 300; f++) step(w, cc);
  assert.equal(op.buffs.length, 1, 'it does not run out');
  const plain = fresh(1);
  step(plain, c, [[0, deploy({})]]);
  assert.deepEqual(plain.units[0].buffs, [], 'none without talents');
});

test('[攻击-4] [随机-1] a chance talent: one draw per attack; under the chance the attack strikes harder, stuns, reaches one more', () => {
  const cc = tinyContent();
  cc.level.waves = [];
  cc.operators.guard = { ...cc.operators.guard, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], critTalents: [{ prob: 1, scale: 2, stun: 1, more: 1 }] };
  const w = createWorld(cc, { seed: 1, players: 1 });
  step(w, cc, [[0, deploy({ row: 1, col: 1 })]]);
  const foes = [2, 3].map((col) => {
    const e = makeEnemy(w, cc, { key: 'slime', route: 0 });
    e.x = col; e.y = 1; e.base = { ...e.base, def: 0, maxHp: 1e6 }; e.hp = e.maxHp = 1e6;
    status.applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  });
  const rng = w.rng;
  const hits = step(w, cc).filter((e) => e.type === 'hit');
  assert.notEqual(w.rng, rng, 'it drew');
  assert.deepEqual(hits.map((e) => e.damage), [100, 100], 'two targets at 200 %');
  assert.ok(foes.every((e) => e.buffs.some((b) => b.key === 'stun')));
  cc.operators.guard.critTalents = [{ prob: 0, scale: 2 }];
  for (let i = 0; i < 31; i++) step(w, cc);
  assert.ok(w.units.slice(1).every((e) => e.hp < 1e6));
});
