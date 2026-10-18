// The attack speed an operator gives every unit while on the field (docs/spec/field.md 部署-5: 引星棘刺's 视界): friendly
// units more, enemies less, double on a straight road of passable ground tiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { straightRoads } from '../src/aura.js';

test('[部署-5] 视界: friendly units + ally, enemies + enemy, both again on a straight road of cnt passable ground tiles; gone when it leaves', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  for (const r of [0, 2]) for (const col of [2, 3]) c.level.tiles[r][col] = { ...c.level.tiles[r][col], passable: 'NONE' };
  c.operators.guard.fieldAspd = { ally: 5, enemy: -5, cnt: 6, allyExtra: 5, enemyExtra: -5 };
  assert.deepEqual([...straightRoads(c.level, 6)].sort((a, b) => a - b), [6, 7, 8, 9, 10, 11], 'the road row; the floor rows broken by the high ground');
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = /** @type {any} */ (w.units.find((u) => u.key === 'guard'));
  const sniper = makeOperator(w, c, { key: 'sniper', owner: 1, row: 0, col: 0, dir: 0 });
  const off = makeEnemy(w, c, { key: 'slime', route: 0 }), on = makeEnemy(w, c, { key: 'slime', route: 0 });
  off.x = 1; off.y = 2; on.x = 4; on.y = 1;
  w.units.push(sniper, off, on);
  step(w, c, []);
  assert.deepEqual([statsOf(guard).aspd, statsOf(sniper).aspd, statsOf(off).aspd, statsOf(on).aspd], [110, 105, 95, 90]);
  step(w, c, [[0, { type: 'retreat', unit: guard.id }]]);
  step(w, c, []);
  assert.deepEqual([statsOf(sniper).aspd, statsOf(off).aspd], [100, 100]);
});
