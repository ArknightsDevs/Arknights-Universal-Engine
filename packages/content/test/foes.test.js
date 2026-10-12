// The official enemy abilities (docs/spec/foes.md 敌能-5…敌能-11) on the real enemies of act1multi_01, placed on the
// tiny map: each enemy spawns by a wave, is moved where the test needs it and stands still.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelContent, FOE_EXTRAS } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const real = levelContent('act1multi_01', 'NORMAL');

/**
 * The tiny map with the real enemies and behaviours: `keys` spawn in frame 0 and are put at their (row, col), rooted;
 * then, in frame 1, operators (key, row, col) are deployed with all the cost they need, with a million HP.
 * @param {[string, number, number][]} foes @param {[string, number, number][]} ops
 */
function arena(foes, ops) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...c.enemies, ...real.enemies };
  c.behaviors = real.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, maxHp: 1e6 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  es.forEach((e, i) => { e.x = foes[i][2]; e.y = foes[i][1]; status.applyStatus(e, 'root', {}); });
  const first = step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }])).map((x) => ({ ...x, f: 1 }));
  return { c, w, e: es[0], es, ops: w.units.filter((u) => u.owner >= 0), first };
}
const HP = 1e6;
/** Runs n frames; the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}
/** Physical damage after DEF, at least 5 % (伤害-1). @param {number} atk @param {number} def */
const phys = (atk, def) => Math.max(atk - def, atk * 0.05);

test('[敌能-1] the real enemies carry their abilities, damage types and PRTS extras', () => {
  const e = real.enemies;
  assert.deepEqual(e.enemy_1404_msnip.skills?.[0], { key: 'CrossAttack', cooldown: 8, initCooldown: 2, sp: 0, bb: { atk_scale: 1, stun: 5, duration: 2, bolts: 1, arts: 1, charge: 1.4, hold: 2.5, hide: 1 } });
  assert.deepEqual([e.enemy_1404_msnip.dmgType, e.enemy_1110_uamord.dmgType, e.enemy_1109_uabone.dmgType], ['arts', 'arts', undefined]);
  assert.deepEqual(e.enemy_1067_snslime.talents?.boom, { atk_scale: 2, freeze: 10, radius: 1.65, delay: 1, arts: 0, air: 0, sourced: 0 });
  assert.ok(Object.values(FOE_EXTRAS).every((x) => /^https:\/\/prts\.wiki\/index\.php\?title=.+&oldid=\d+$/.test(x.source)), 'each with its PRTS revision');
});

test('[敌能-5] 冰爆源石虫: knocked down, after 1 s a physical explosion of radius 1.65 with 10 s of cold; silenced, nothing', () => {
  const { c, w, e, ops: [g] } = arena([['enemy_1067_snslime', 1, 3]], [['guard', 1, 2]]);
  e.hp = 0;
  const ev = run(w, c, 32);
  assert.deepEqual(ev.filter((x) => x.type === 'blast').map((x) => x.f), [32], 'knocked down in frame 2, 1 s later');
  assert.equal(HP - g.hp, phys(300 * 2, 100));
  assert.ok(g.buffs.some((b) => b.key === 'cold'));
  const quiet = arena([['enemy_1067_snslime', 1, 3]], [['guard', 1, 2]]);
  quiet.e.buffs.push(/** @type {any} */ ({ ...quiet.e.buffs[0], key: 'silence', flags: { silence: true }, mods: {}, left: -1 }));
  quiet.e.hp = 0;
  assert.equal(run(quiet.w, quiet.c, 40).filter((x) => x.type === 'blast').length, 0);
});

test('[敌能-6] [敌能-5] "喷射罐": 3 arts hits over 4 s, then 3 s of cooldown; knocked down, an arts explosion of radius 1.55', () => {
  const { c, w, e, ops: [g], first } = arena([['enemy_1385_winbom', 1, 3]], [['sniper', 0, 3]]);
  const ev = [...first, ...run(w, c, 300)];
  assert.deepEqual(ev.filter((x) => x.type === 'attack' && x.id === e.id).map((x) => x.f), [1, 211], 'every 4 + 3 s');
  assert.equal(HP - g.hp, 5 * 400, 'arts hits of 400 against res 0 at 41, 81, 121, 251 and 291');
  e.hp = 0;
  const g0 = g.hp, ev2 = run(w, c, 2);
  assert.equal(ev2.filter((x) => x.type === 'blast').length, 1);
  assert.ok(g0 - g.hp > 0 && g.buffs.some((b) => b.key === 'cold' || b.key === 'enemyCold' || b.key === 'enemyFreeze'));
});

test('[敌能-7] "投石机": the first attack reaches 2.5 tiles, arts, on the target and the tiles next to it; then melee only', () => {
  const { c, w, e, ops: [g, s], first } = arena([['enemy_1388_wingnt', 1, 4]], [['guard', 1, 2], ['sniper', 0, 2]]);
  const ev = [...first, ...run(w, c, 200)];
  assert.equal(ev.filter((x) => x.type === 'attack' && x.id === e.id).length, 1, 'one throw; nobody blocks it after');
  assert.deepEqual([HP - g.hp, HP - s.hp], [800 * 1.5, 800 * 1.5], 'arts, res 0, both on the cross');
});

test('[敌能-8] 帝国前锋精锐: below half HP its ATK doubles; unblocked it shoots at 50 %, neutral units first among the most taunting', () => {
  const { c, w, e } = arena([['enemy_1113_empace', 1, 3]], []);
  const atk = attrs.statsOf(e).atk;
  e.hp = e.maxHp * 0.4;
  run(w, c, 1);
  assert.equal(attrs.statsOf(e).atk, atk * 2);
  e.hp = e.maxHp;
  run(w, c, 1);
  assert.equal(attrs.statsOf(e).atk, atk);
  const civ = arena([['enemy_1113_empace', 1, 3], ['enemy_3001_upeopl', 2, 3]], [['sniper', 0, 3]]);
  const [ace, man] = civ.es;
  // both spawned together on the route's start, where the ace already shot the civilian in frame 0: start over
  ace.atkCd = 0; man.hp = man.maxHp;
  const ev = run(civ.w, civ.c, 3);
  assert.deepEqual(ev.filter((x) => x.type === 'attack' && x.id === ace.id).map((x) => x.target), [man.id], 'the civilian first');
  assert.equal(man.maxHp - man.hp, phys(900 * 0.5, real.enemies.enemy_3001_upeopl.def));
});

test('[敌能-9] 速射轻弩手: 2 s in, unblocked, someone in its row — 3 physical bolts; again 5 s later', () => {
  const { c, w, e, ops: [g] } = arena([['enemy_1403_gunsho', 1, 5]], [['guard', 1, 1]]);
  const ev = run(w, c, 230);
  assert.deepEqual(ev.filter((x) => x.type === 'bolt' && x.id === e.id).map((x) => x.f), [60, 60, 60, 210, 210, 210]);
  assert.equal(HP - g.hp, 6 * phys(350, 100));
});

test('[敌能-9] 重弩突袭者: hidden while unblocked; stands 2.5 s, charges 1.4 s, one arts bolt with 5 s of stun', () => {
  const { c, w, e, ops: [g] } = arena([['enemy_1404_msnip', 1, 5]], [['guard', 1, 1]]);
  run(w, c, 30);
  assert.equal(attrs.statsOf(e).flags.stealth, true);
  const ev = run(w, c, 72);
  assert.deepEqual(ev.filter((x) => x.type === 'bolt').map((x) => x.f), [60 + 42], 'ready at 2 s, 1.4 s of charge');
  assert.equal(attrs.statsOf(e).flags.stealth ?? false, false, 'visible during the skill');
  run(w, c, 15);
  assert.equal(HP - g.hp, 400);
  assert.equal(attrs.statsOf(g).flags.stun, true);
});

test('[敌能-10] 无畏掷弹兵: hurt while unblocked — four bombs exploding on the first unit hit; then faster and lighter, once', () => {
  const { c, w, e, ops: [g] } = arena([['enemy_1405_boomer_2', 1, 3]], [['guard', 1, 1]]);
  const speed = attrs.statsOf(e).moveSpeed, mass = attrs.statsOf(e).massLevel;
  e.hp -= 10;
  const ev = run(w, c, 30);
  assert.equal(ev.filter((x) => x.type === 'bolt').length, 4);
  assert.equal(HP - g.hp, phys(550 * 2, 100));
  assert.deepEqual([attrs.statsOf(e).moveSpeed - speed, attrs.statsOf(e).massLevel - mass].map((x) => Math.round(x * 10) / 10), [0.7, -2]);
  e.hp -= 10;
  assert.equal(run(w, c, 5).filter((x) => x.type === 'bolt').length, 0, 'only once');
});

test('[敌能-11] 战线推进者: the first attack after it appears or its block ends is 80 % stronger', () => {
  const { c, w, ops: [g] } = arena([['enemy_1406_chghmr', 1, 1]], [['guard', 1, 1]]);
  const first = HP - g.hp;
  run(w, c, 150);
  const second = HP - g.hp - first;
  assert.equal(first, phys(1350 * 1.8, 100), 'blocked in frame 1, the marked attack lands at once');
  assert.equal(second, phys(1350, 100), '5 s later, plain');
});
