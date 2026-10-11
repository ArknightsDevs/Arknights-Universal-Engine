// Pathfinding (docs/spec/paths.md 寻路-1…寻路-3): distances and smoothed pointers of the flow field equal the official
// pointers the pinned Stronghold oracle computes (its Grid's `official`, not its own blockable-ground preference) on
// random maps, with and without diagonal moves.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadOracle } from '@aue/testkit';
import { flowField, chain, lineOfSight, keyAt, passable } from '../src/paths.js';

const SEED = 20261011, ROWS = 19, COLS = 21;
/** @type {any} */
let G;
before(async () => { G = await loadOracle('server/sim/grid.js'); });

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
const WALL = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };
const HOLE = { key: 'tile_hole', height: 'LOWLAND', buildable: 'NONE', passable: 'NONE', side: 'ALL' };

/** Our map and the oracle's grid from rows of '.' (road) and '#' (wall), bottom row first. @param {string[]} rows */
function maps(rows) {
  const level = /** @type {any} */ ({ width: COLS, height: ROWS, tiles: rows.map((s) => [...s].map((ch) => (ch === '#' ? WALL : ROAD))) });
  const grid = new G.Grid({ id: 't', rows: rows.map((s) => s.replaceAll('.', 'r')) }, { r0: 0, r1: ROWS - 1, c0: 0, c1: COLS - 1 });
  return { level, grid };
}

const wallRows = fc.array(fc.array(fc.boolean(), { minLength: COLS, maxLength: COLS }), { minLength: ROWS, maxLength: ROWS })
  .map((g) => g.map((row) => row.map((w) => (w ? '#' : '.')).join('')));
/** Mostly open maps: a wall where three random draws all say so. */
const sparse = fc.tuple(wallRows, wallRows, wallRows).map(([a, b, c]) => a.map((row, r) => [...row].map((ch, i) => (ch === '#' && b[r][i] === '#' && c[r][i] === '#' ? '#' : '.')).join('')));

test('[寻路-1] [寻路-2] distances and smoothed pointers: the oracle\'s official field on random maps, any destination', () => {
  fc.assert(fc.property(sparse, fc.nat(ROWS - 1), fc.nat(COLS - 1), fc.boolean(), (rows, r, c, diagonal) => {
    const { level, grid } = maps(rows), f = flowField(level, r, c, { diagonal }), g = grid.flowField(r, c, { allowDiagonal: diagonal });
    assert.deepEqual([...f.dist], [...g.dist]);
    assert.deepEqual([...f.next], [...g.official]);
  }), { seed: SEED, numRuns: 150 });
});

test('[寻路-1] the four neighbours in the official order decide the first parent: UP, RIGHT, DOWN, LEFT', () => {
  const rows = Array.from({ length: ROWS }, () => '.'.repeat(COLS));
  const { level } = maps(rows), f = flowField(level, 5, 5, { diagonal: false });
  // (6, 6) is reached first from (6, 5) — its UP neighbour, popped before (5, 6), its RIGHT one
  assert.equal(f.parent[6 * COLS + 6], 6 * COLS + 5);
  assert.equal(f.dist[6 * COLS + 6], 2);
  assert.equal(f.dist[18 * COLS + 20], 13 + 15, 'Manhattan steps on an open map');
});

test('[寻路-1] ground units walk only ALL tiles, flyers anything but NONE; unreachable tiles have no distance', () => {
  assert.ok(passable(ROAD, false) && passable(ROAD, true) && !passable(WALL, false) && passable(WALL, true) && !passable(HOLE, true) && !passable(null, true));
  const rows = Array.from({ length: ROWS }, () => '.'.repeat(COLS));
  rows[5] = '#'.repeat(COLS);
  const { level } = maps(rows);
  assert.equal(flowField(level, 0, 0).dist[10 * COLS], -1, 'the wall row cuts the map for ground units');
  assert.equal(flowField(level, 0, 0, { fly: true }).dist[10 * COLS], 10);
  assert.deepEqual(chain(flowField(level, 0, 0), 10 * COLS), []);
});

test('[寻路-2] line of sight: every tile on the Bresenham line, and both tiles beside a diagonal step', () => {
  const rows = Array.from({ length: ROWS }, () => '.'.repeat(COLS));
  rows[1] = '.#' + '.'.repeat(COLS - 2);
  const { level } = maps(rows);
  const k = (/** @type {number} */ r, /** @type {number} */ c) => r * COLS + c;
  assert.ok(!lineOfSight(level, k(0, 0), k(2, 2), false, true), 'the line (0,0)→(1,1)→(2,2) passes the wall at (1,1)');
  assert.ok(!lineOfSight(level, k(0, 0), k(1, 2), false, true), 'a diagonal step with (1,1) beside it');
  assert.ok(lineOfSight(level, k(0, 0), k(0, 9), false, true));
  assert.ok(!lineOfSight(level, k(0, 0), k(3, 4), false, false), 'no diagonals: only rows and columns');
  assert.ok(lineOfSight(level, k(0, 0), k(1, 1), true, true), 'flyers see over walls');
});

test('[寻路-2] smoothing: on an open map every tile points straight at the destination', () => {
  const rows = Array.from({ length: ROWS }, () => '.'.repeat(COLS));
  const { level } = maps(rows), f = flowField(level, 9, 10);
  for (const k of [0, 5 * COLS + 2, 18 * COLS + 20]) assert.deepEqual(chain(f, k), [9 * COLS + 10]);
  const g = flowField(level, 9, 10);
  assert.equal(g, f, 'cached beside the level');
});

test('[寻路-3] a position\'s tile rounds half to even; off the map there is none', () => {
  const level = /** @type {any} */ ({ width: 4, height: 3, tiles: [] });
  assert.equal(keyAt(level, 1.5, 0.5), 0 * 4 + 2);
  assert.equal(keyAt(level, 2.5, 1.49), 1 * 4 + 2);
  assert.equal(keyAt(level, -0.6, 0), -1);
  assert.equal(keyAt(level, 0, 2.6), -1);
});
