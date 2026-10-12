// 地穴 (docs/spec/field.md 地图-4) on the tiny level: ground ways go round a 地穴 when they can and see past none; a
// ground enemy that has to step onto one falls — no goal, no kill —, a flying one passes over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step } from '../src/index.js';
import { routeTiles, flowField, lineOfSight, HOLE_COST } from '../src/paths.js';
import { makeEnemy } from '../src/units.js';
import { push } from '../src/displacement.js';

const HOLE = { key: 'tile_hole', height: 'LOWLAND', buildable: 'NONE', passable: 'ALL', side: 'ALL' };

/** The tiny level with 地穴 on the given tiles and one slime. @param {[number, number][]} holes */
function field(holes) {
  const c = /** @type {any} */ (tinyContent());
  for (const [r, col] of holes) c.level.tiles[r][col] = HOLE;
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  return c;
}

test('[地图-4] [寻路-1] [寻路-2] ground ways go round a 地穴 and see past none; through one only when there is no other way, at its cost', () => {
  const k = (/** @type {number} */ r, /** @type {number} */ col) => r * 6 + col;
  const one = field([[1, 3]]).level;
  assert.ok(!(routeTiles(one, k(1, 0), k(1, 5)) ?? []).includes(k(1, 3)), 'round the 地穴 on (1, 3)');
  assert.ok(!lineOfSight(one, k(1, 0), k(1, 5), false, true) && lineOfSight(one, k(1, 0), k(1, 5), true, true), 'flyers see over it');
  const wall = field([[0, 3], [1, 3], [2, 3]]).level;
  assert.equal(flowField(wall, 1, 5, { diagonal: false }).dist[k(1, 0)], 5 + HOLE_COST - 1, 'four steps of 1 and one out of the 地穴');
  assert.equal(flowField(wall, 1, 5, { fly: true }).dist[k(1, 0)], 5);
});

test('[地图-4] a ground enemy that steps onto a 地穴 falls: no goal, no kill; a flying one passes over and reaches the goal', () => {
  for (const fly of [false, true]) {
    const c = field([[0, 3], [1, 3], [2, 3]]);
    if (fly) { c.level.routes[0].motion = 'FLY'; c.enemies.slime.motion = 'FLY'; }
    const w = createWorld(c, { seed: 1, players: 1 }), events = [];
    for (let f = 0; f < 900 && w.result < 0; f++) events.push(...step(w, c));
    const kinds = events.map((e) => e.type);
    assert.equal(w.units.some((u) => u.kind === KIND.ENEMY), false);
    assert.deepEqual([kinds.includes('death'), kinds.includes('goal'), w.players[0].life], fly ? [false, true, 2] : [true, false, 3], fly ? 'flyer' : 'walker');
  }
});

test('[地图-4] [位移-3] a ground enemy pushed onto a 地穴 falls in that frame', () => {
  const c = field([[1, 3]]);
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 }), e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = 2; e.y = 1;
  w.units.push(e);
  push(w, c, e, 2, { from: { x: 0, y: 1 } });
  let f = 0;
  while (w.units.includes(e) && f < 60) { step(w, c); f++; }
  assert.ok(!w.units.includes(e) && f < 20, `fell after ${f} frames`);
});
