// Displacement (docs/spec/displacement.md 位移-1…位移-3): pushes by 受力等级, 失衡's friction slide against PRTS 推与拉's
// ideal distances and 游戏数据基础's 位移时间, the direction rules, walls, who cannot be moved, and what 失衡 holds back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/index.js';
import { push, slideStep, displaceable, forceLevel } from '../src/displacement.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { makeBuff } from '../src/buffs.js';

/** @typedef {import('../src/types.js').Unit} Unit */

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
const WALL = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };

/** A level of rows ('.' road, '#' wall; row 0 first) with one walking route along row 1, an enemy of weight `mass`. @param {string[]} rows @param {number} [mass] */
function field(rows, mass = 0) {
  const c = /** @type {any} */ ({
    level: { id: 't', width: rows[0].length, height: rows.length, tiles: rows.map((r) => [...r].map((ch) => (ch === '#' ? WALL : ROAD))),
      options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 },
      routes: [{ start: { row: 1, col: 0 }, end: { row: 1, col: rows[0].length - 1 }, motion: 'WALK', checkpoints: [] }], waves: [] },
    enemies: { e: { name: 'e', maxHp: 1e6, atk: 100, def: 0, res: 0, moveSpeed: 1, massLevel: mass, baseAttackTime: 1, applyWay: 'MELEE' } },
    operators: { op: { name: 'op', position: 'MELEE', maxHp: 1000, atk: 50, def: 0, res: 0, cost: 1, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, range: [{ row: 0, col: 0 }] } },
  });
  const w = createWorld(c, { seed: 1, players: 1 }), e = makeEnemy(w, c, { key: 'e', route: 0 });
  e.x = 1; e.y = 1;
  w.units.push(e);
  return { w, c, e };
}

/** Slides `e` to rest: the frames it took. @param {any} c @param {Unit} e */
function rest(c, e) {
  let n = 0;
  while (e.slide && n < 200) { slideStep(c, e); n++; }
  return n;
}

const BALLISTIC = [0.11825, 0.4403, 1.6958, 2.13705, 2.95013, 3.52392], EFFECT = [0.08492, 0.37363, 1.56247, 1.98705, 2.77347, 3.33058];

test('[位移-1] [位移-2] [位移-3] a push by 受力等级 −2…3: PRTS 推与拉\'s ideal distances within 0.003, 游戏数据基础\'s 位移时间 in frames', () => {
  for (const [i, level] of [-2, -1, 0, 1, 2, 3].entries()) {
    for (const effect of [false, true]) {
      const { w, c, e } = field(['.......', '.......', '.......'], 2);
      assert.equal(forceLevel(e, level + 2), level);
      assert.equal(push(w, c, e, level + 2, { from: { x: 0, y: 1 }, effect }), true);
      const n = rest(c, e), want = (effect ? EFFECT : BALLISTIC)[i];
      assert.ok(Math.abs(e.x - 1 - want) <= 0.003 && e.y === 1, `level ${level}${effect ? ' effect' : ''}: ${e.x - 1} vs ${want}`);
      assert.equal(n, [6, 12, 24, 27, 32, 35][i], `level ${level}: the frames of its 位移时间`);
    }
  }
});

test('[位移-1] no force at −3 or below; operators, flyers and 失衡免疫 are not moved', () => {
  const { w, c, e } = field(['.......', '.......', '.......'], 3);
  assert.equal(push(w, c, e, 0, { from: { x: 0, y: 1 } }), false, '受力等级 −3');
  const op = makeOperator(w, c, { key: 'op', owner: 0, row: 1, col: 4, dir: 0 });
  assert.equal(displaceable(op), false);
  const fly = field(['.......', '.......', '.......']);
  fly.e.buffs.push(makeBuff({ key: 'up', flags: { levitate: true } }));
  assert.equal(push(fly.w, fly.c, fly.e, 5, { from: { x: 0, y: 1 } }), false, 'in the air');
  const im = field(['.......', '.......', '.......']);
  im.e.buffs.push(makeBuff({ key: 'im', flags: { noDisplace: true } }));
  assert.equal(push(im.w, im.c, im.e, 5, { from: { x: 0, y: 1 } }), false);
});

test('[位移-2] direction: along it, but radial with 受力等级 −2 when more than 45° off or nearer than 0.25 — unless fixed; radial ones away or towards', () => {
  const along = field(['.......', '.......', '.......']);
  push(along.w, along.c, along.e, 0, { from: { x: 0, y: 1 }, dir: { x: 1, y: 0 } });
  rest(along.c, along.e);
  assert.ok(Math.abs(along.e.x - 1 - BALLISTIC[2]) <= 0.003 && along.e.y === 1, 'along its direction at 受力等级 0');
  const off = field(['.......', '.......', '.......']);
  push(off.w, off.c, off.e, 0, { from: { x: 1, y: 0 }, dir: { x: 1, y: 0 } });
  rest(off.c, off.e);
  assert.ok(Math.abs(off.e.y - 1 - BALLISTIC[0]) <= 0.003 && off.e.x === 1, `90° off: radial (up) at −2: ${off.e.x},${off.e.y}`);
  const fixed = field(['.......', '.......', '.......']);
  push(fixed.w, fixed.c, fixed.e, 0, { from: { x: 1, y: 0 }, dir: { x: 1, y: 0 }, fixed: true });
  rest(fixed.c, fixed.e);
  assert.ok(Math.abs(fixed.e.x - 1 - BALLISTIC[2]) <= 0.003 && fixed.e.y === 1, 'fixed: along its direction at 0');
  const pull = field(['.......', '.......', '.......']);
  pull.e.x = 4;
  push(pull.w, pull.c, pull.e, 0, { from: { x: 6, y: 1 }, toward: true });
  rest(pull.c, pull.e);
  assert.ok(Math.abs(4 + BALLISTIC[2] - pull.e.x) <= 0.003, 'towards the pusher');
});

test('[位移-3] [地图-2] a wall or a closed edge stops the slide; 失衡 holds its walking, attacking and blocking; afterwards it walks its way again', () => {
  const walled = field(['.......', '...#...', '.......']);
  push(walled.w, walled.c, walled.e, 5, { from: { x: 0, y: 1 } });
  rest(walled.c, walled.e);
  assert.ok(walled.e.x < 2.5 && walled.e.x > 1, `stopped before the wall: ${walled.e.x}`);
  const edged = field(['.......', '.......', '.......']);
  edged.c.level.blockEdges = [{ row: 1, col: 2, dir: 'RIGHT', mask: 'WALK_ONLY' }];
  push(edged.w, edged.c, edged.e, 5, { from: { x: 0, y: 1 } });
  rest(edged.c, edged.e);
  assert.ok(edged.e.x < 2.5 && edged.e.x > 2, `a closed edge stops it as a wall does (地图-2): ${edged.e.x}`);
  const { w, c, e } = field(['.......', '.......', '.......']);
  step(w, c, [[0, { type: 'deploy', op: 'op', row: 1, col: 1, dir: 0 }]]);
  assert.ok(e.blockedBy >= 0, 'blocked');
  push(w, c, e, 1, { from: { x: 0, y: 1 } });
  assert.deepEqual([e.blockedBy, e.swing], [-1, null], 'let go, its swing cut');
  const x0 = e.x;
  for (let f = 0; f < 10; f++) step(w, c);
  assert.ok(e.slide && e.x > x0 && e.blockedBy === -1, 'sliding, not blocked');
  while (e.slide) step(w, c);
  const xs = e.x;
  for (let f = 0; f < 30; f++) step(w, c);
  assert.ok(e.x > xs, 'walks on after 失衡');
});
