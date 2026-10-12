// “复仇者” of IG-S-2 爬高上低 (docs/spec/foes.md 敌能-8, 敌能-18, 敌能-19) on the tiny map: 攻击力 +180 % at half its HP or
// less; revived once at half its HP, reviving 5 s and then 20 s 无敌; 冲锋 at the nearest of our units on its way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, damage, targeting, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';
import hard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const KEY = 'enemy_1539_reid';

/** The tiny map with the boss spawning at once on its route; operators deployed in frame 1 (key, row, col). @param {[string, number, number][]} ops */
function arena(ops = []) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: withFoeExtras(KEY, /** @type {any} */ (hard02).enemies[KEY]) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e7 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const boss = /** @type {Unit} */ (w.units.find((u) => u.key === KEY));
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, boss };
}

/** Steps n frames. @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** Whether a unit has a buff of a key. @param {Unit} u @param {string} key */
const has = (u, key) => u.buffs.some((b) => b.key === key);

test('[敌能-8] “复仇者”: 攻击力 +180 % (AtkUp) once its HP is at most half its maximum (atkup hp_ratio)', () => {
  const { c, w, boss } = arena();
  const atk = attrs.statsOf(boss).atk, max = attrs.statsOf(boss).maxHp;
  damage.setHp(boss, max * 0.5 + 1);
  run(w, c, 2);
  assert.equal(attrs.statsOf(boss).atk, atk);
  damage.setHp(boss, max * 0.5);
  run(w, c, 2);
  assert.equal(attrs.statsOf(boss).atk, atk * 2.8);
});

test('[敌能-18] 重生: the first lethal hit leaves it at half its HP, reviving 5 s — 无敌, unselectable, unblockable, idle —, then 20 s 无敌; the second kills it', () => {
  const { c, w, boss } = arena();
  const max = attrs.statsOf(boss).maxHp;
  boss.ab['Rush.cd'] = 99;
  damage.dealDamage(w, null, boss, { type: 'true', amount: 1e9 });
  run(w, c, 1);
  assert.ok(w.units.includes(boss), 'kept on the field');
  assert.equal(boss.hp, max * 0.5);
  const s = attrs.statsOf(boss);
  assert.deepEqual([s.invincible, s.disabled, s.immobile, targeting.selectable(boss), has(boss, 'reborn')], [true, true, true, false, true]);
  assert.equal(damage.dealDamage(w, null, boss, { type: 'true', amount: 100 }), 0, 'no damage while reviving');
  run(w, c, 150);
  assert.deepEqual([has(boss, 'reborn'), has(boss, 'reborn:invincible'), boss.ab['Rush.cd']], [false, true, 0], 'revived: 无敌, its skill ready again');
  assert.ok(!attrs.statsOf(boss).disabled && !targeting.selectable(boss));
  status.applyStatus(boss, 'root', {});
  run(w, c, 605);
  assert.ok(!has(boss, 'reborn:invincible') && targeting.selectable(boss));
  damage.dealDamage(w, null, boss, { type: 'true', amount: 1e9 });
  run(w, c, 1);
  assert.ok(!w.units.includes(boss), 'only once');
});

test('[敌能-19] 冲锋: unblocked with one of our units on its way within its radius, it heads for that unit\'s tile 3× as fast; not without one', () => {
  const alone = arena();
  run(alone.w, alone.c, 200);
  assert.equal(has(alone.boss, 'rush'), false, 'no one on its way');
  const { c, w, boss } = arena([['guard', 1, 3]]);
  const speed = attrs.statsOf(boss).moveSpeed;
  let at = -1;
  for (let f = 0; f < 600 && at < 0; f++) { step(w, c); if (has(boss, 'rush')) at = boss.x; }
  assert.ok(at >= 1.5 - 1e-9 && at < 3, `rushed at x ${at}, within 1.5 of the guard on (1, 3)`);
  assert.equal(attrs.statsOf(boss).moveSpeed, speed * 3);
  assert.deepEqual([boss.path[boss.pt * 2], boss.path[boss.pt * 2 + 1]], [3, 1], 'next point: the guard\'s tile centre');
});
