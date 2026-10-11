// Pathfinding (docs/spec/paths.md 寻路-1…寻路-3): for each destination tile a flow field — a FIFO SPFA from the
// destination over the four neighbours UP (row + 1), RIGHT, DOWN, LEFT, keeping the first parent that reaches a tile;
// then, row by row and in place, each tile's parent is moved up its chain to the farthest ancestor in line of sight.
// Fields depend on the level only, so they are cached beside it, never in the state. Tile keys are row × width + col.
import { roundHalfEven } from '@aue/math';

/** @typedef {import('./level.js').LevelMap} LevelMap @typedef {import('./level.js').Tile} Tile */
/** @typedef {{ dest: number, dist: Int32Array, parent: Int32Array, next: Int32Array }} Field */

/** The four neighbours in the official order: UP (row + 1), RIGHT, DOWN, LEFT (寻路-1). */
const FOUR = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);

/** @type {WeakMap<LevelMap, Map<string, Field>>} */
const CACHE = new WeakMap();

/** Whether a unit of this motion may stand on a tile (寻路-1): ground units on ALL tiles, flying ones on any but NONE. @param {Tile | null} t @param {boolean} fly */
export const passable = (t, fly) => !!t && (fly ? t.passable !== 'NONE' : t.passable === 'ALL');

/** @param {LevelMap} m @param {number} k @param {boolean} fly */
const open = (m, k, fly) => passable(m.tiles[Math.floor(k / m.width)][k % m.width], fly);

/** The tile key of a position, rounded half to even (体积-1), or −1 off the map. @param {LevelMap} m @param {number} x @param {number} y */
export function keyAt(m, x, y) {
  const r = roundHalfEven(y), c = roundHalfEven(x);
  return r >= 0 && r < m.height && c >= 0 && c < m.width ? r * m.width + c : -1;
}

/**
 * Distances and first parents toward `dest` (寻路-1): a FIFO SPFA, each step costing 1, a tile relaxed only by a strictly
 * shorter distance. −1 where the destination cannot be reached.
 * @param {LevelMap} m @param {number} dest @param {boolean} fly
 */
function spfa(m, dest, fly) {
  const n = m.width * m.height, dist = new Int32Array(n).fill(-1), parent = new Int32Array(n).fill(-1);
  const queue = [dest], queued = new Uint8Array(n);
  dist[dest] = 0;
  queued[dest] = 1;
  for (let h = 0; h < queue.length; h++) {
    const cur = queue[h], r = Math.floor(cur / m.width), c = cur % m.width;
    queued[cur] = 0;
    for (const [dr, dc] of FOUR) {
      const nr = r + dr, nc = c + dc, nb = nr * m.width + nc;
      if (nr < 0 || nr >= m.height || nc < 0 || nc >= m.width || !open(m, nb, fly)) continue;
      if (dist[nb] >= 0 && dist[cur] + 1 >= dist[nb]) continue;
      dist[nb] = dist[cur] + 1;
      parent[nb] = cur;
      if (!queued[nb]) { queue.push(nb); queued[nb] = 1; }
    }
  }
  return { dist, parent };
}

/**
 * Bresenham line of sight from tile a to tile b (寻路-2): every tile on the line passable, and a diagonal step only
 * with both tiles beside it passable. Without diagonal moves only a straight row or column counts.
 * @param {LevelMap} m @param {number} a @param {number} b @param {boolean} fly @param {boolean} diagonal
 */
export function lineOfSight(m, a, b, fly, diagonal) {
  const r = Math.floor(a / m.width), c = a % m.width, r1 = Math.floor(b / m.width), c1 = b % m.width;
  if (!diagonal && r !== r1 && c !== c1) return false;
  return bresenham(r, c, r1, c1, (rr, cc) => open(m, rr * m.width + cc, fly));
}

/**
 * Walks the Bresenham line from (r, c) to (r1, c1): every tile `ok`, and a diagonal step only with both tiles beside it
 * `ok`.
 * @param {number} r @param {number} c @param {number} r1 @param {number} c1 @param {(r: number, c: number) => boolean} ok
 */
function bresenham(r, c, r1, c1, ok) {
  const dr = Math.abs(r1 - r), dc = Math.abs(c1 - c), sr = r1 > r ? 1 : -1, sc = c1 > c ? 1 : -1;
  let err = dc - dr;
  if (!ok(r, c)) return false;
  while (r !== r1 || c !== c1) {
    const e2 = 2 * err;
    let nr = r, nc = c;
    if (e2 > -dr) { err -= dr; nc += sc; }
    if (e2 < dc) { err += dc; nr += sr; }
    if (nr !== r && nc !== c && !(ok(nr, c) && ok(r, nc))) return false;
    r = nr; c = nc;
    if (!ok(r, c)) return false;
  }
  return true;
}

/**
 * The smoothed pointers (寻路-2): tiles in key order (row by row from row 0); each tile's pointer, starting at its parent,
 * moves along the pointers — already smoothed for the tiles before it — as long as the next one is in line of sight.
 * @param {LevelMap} m @param {{ dist: Int32Array, parent: Int32Array }} f @param {boolean} fly @param {boolean} diagonal
 */
function smooth(m, f, fly, diagonal) {
  const next = Int32Array.from(f.parent);
  for (let k = 0; k < next.length; k++) {
    if (f.dist[k] < 0 || next[k] < 0) continue;
    let b = next[k];
    while (next[b] >= 0 && lineOfSight(m, k, next[b], fly, diagonal)) b = next[b];
    next[k] = b;
  }
  return next;
}

/**
 * The flow field toward a tile (寻路-1, 寻路-2), cached per level.
 * @param {LevelMap} m @param {number} row @param {number} col @param {{ fly?: boolean, diagonal?: boolean }} [o] @returns {Field}
 */
export function flowField(m, row, col, o = {}) {
  const fly = !!o.fly, diagonal = o.diagonal ?? true, id = `${row},${col},${fly ? 1 : 0},${diagonal ? 1 : 0}`;
  let byLevel = CACHE.get(m);
  if (!byLevel) { byLevel = new Map(); CACHE.set(m, byLevel); }
  const hit = byLevel.get(id);
  if (hit) return hit;
  const dest = row * m.width + col, base = spfa(m, dest, fly);
  const f = { dest, dist: base.dist, parent: base.parent, next: smooth(m, base, fly, diagonal) };
  byLevel.set(id, f);
  return f;
}

/** The tiles from `k` (excluded) along the field's pointers to its destination (included); empty if unreachable. @param {Field} f @param {number} k */
export function chain(f, k) {
  /** @type {number[]} */
  const out = [];
  if (k < 0 || f.dist[k] < 0) return out;
  for (let x = k; x !== f.dest;) {
    x = f.next[x];
    out.push(x);
  }
  return out;
}
