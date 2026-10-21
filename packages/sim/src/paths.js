// Pathfinding (docs/spec/paths.md 寻路-1…寻路-3): for each destination tile a flow field — a FIFO SPFA from the
// destination over the four neighbours UP (row + 1), RIGHT, DOWN, LEFT, each step costing 1 (out of a 地穴 1,000,000 for
// ground units, 地图-4), keeping the first parent that reaches a tile and never crossing a closed edge (地图-2); then, row by row and in place, each tile's parent is moved up its chain to
// the farthest ancestor in line of sight. Fields and edges depend on the level only, so they are cached beside it, never
// in the state. Tile keys are row × width + col.
import { roundHalfEven } from '@aue/math';

/** @typedef {import('./level.js').LevelMap} LevelMap @typedef {import('./level.js').Tile} Tile */
/** @typedef {{ dest: number, dist: Int32Array, parent: Int32Array, next: Int32Array }} Field */

/** The four neighbours in the official order: UP (row + 1), RIGHT, DOWN, LEFT (寻路-1). */
const FOUR = Object.freeze([[1, 0], [0, 1], [-1, 0], [0, -1]]);

/** @type {WeakMap<LevelMap, Map<string, Field>>} */
const CACHE = new WeakMap();
/** @type {WeakMap<LevelMap, { walk: Uint8Array, fly: Uint8Array }>} */
const EDGES = new WeakMap();

/** An edge's direction by name, as its index in FOUR (地图-2). @type {Readonly<Record<string, number>>} */
const DIR = Object.freeze({ UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 });
/** The bit of the edge toward a neighbour one step away (dr, dc). @param {number} dr @param {number} dc */
const bitOf = (dr, dc) => 1 << (dr === 1 ? 0 : dc === 1 ? 1 : dr === -1 ? 2 : 3);

/**
 * Per tile, a bit for each of its four edges (FOUR's order) closed to units of this motion (地图-2): a WALK_ONLY edge to
 * ground units, a FLY_ONLY one to flyers, an ALL one to both; an edge closes both its tiles' sides. Cached per level.
 * @param {LevelMap} m @param {boolean} fly
 */
function edgesOf(m, fly) {
  let e = EDGES.get(m);
  if (!e) {
    const walk = new Uint8Array(m.width * m.height), air = new Uint8Array(m.width * m.height);
    const at = (/** @type {number} */ r, /** @type {number} */ c) => (r >= 0 && r < m.height && c >= 0 && c < m.width ? r * m.width + c : -1);
    for (const x of m.blockEdges ?? []) {
      const d = DIR[x.dir], a = at(x.row, x.col), b = at(x.row + FOUR[d][0], x.col + FOUR[d][1]);
      for (const bits of [x.mask === 'WALK_ONLY' || x.mask === 'ALL' ? walk : null, x.mask === 'FLY_ONLY' || x.mask === 'ALL' ? air : null]) {
        if (!bits) continue;
        if (a >= 0) bits[a] |= 1 << d;
        if (b >= 0) bits[b] |= 1 << ((d + 2) % 4);
      }
    }
    e = { walk, fly: air };
    EDGES.set(m, e);
  }
  return fly ? e.fly : e.walk;
}

/**
 * Whether a unit of this motion may step from tile a to tile b beside it or corner to corner (地图-2): side by side, the
 * edge between them is open; corner to corner, all four edges meeting at the corner are.
 * @param {LevelMap} m @param {number} a @param {number} b @param {boolean} fly
 */
export function crossable(m, a, b, fly) {
  const e = edgesOf(m, fly), r0 = Math.floor(a / m.width), c0 = a % m.width, dr = Math.floor(b / m.width) - r0, dc = b % m.width - c0;
  if (dr === 0 || dc === 0) return (e[a] & bitOf(dr, dc)) === 0;
  return (e[a] & (bitOf(dr, 0) | bitOf(0, dc))) === 0 && (e[b] & (bitOf(-dr, 0) | bitOf(0, -dc))) === 0;
}

/** Whether a unit of this motion may stand on a tile (寻路-1): ground units on ALL tiles, flying ones on any but NONE. @param {Tile | null} t @param {boolean} fly */
export const passable = (t, fly) => !!t && (fly ? t.passable !== 'NONE' : t.passable === 'ALL');

/** @param {LevelMap} m @param {number} k @param {boolean} fly */
const open = (m, k, fly) => passable(m.tiles[Math.floor(k / m.width)][k % m.width], fly);

/** The ground pathing cost of a step out of a 地穴 (地图-4); any other step costs 1. */
export const HOLE_COST = 1_000_000;
/** Whether a tile is a 地穴 (地图-4). @param {Tile | null} t */
export const isHole = (t) => !!t && t.key === 'tile_hole';
/** The ground pathing cost of a step out of a 类障碍物地块 (寻路-1: a built 液压式高台, 守御-5). */
export const OBSTACLE_COST = 1000;
/** The cost of a step out of tile k (寻路-1, 地图-4, 守御-5). @param {LevelMap} m @param {number} k @param {boolean} fly */
function costOut(m, k, fly) {
  if (fly) return 1;
  const t = m.tiles[Math.floor(k / m.width)][k % m.width];
  return isHole(t) ? HOLE_COST : t.obstacle ? OBSTACLE_COST : 1;
}
/** Whether a line of sight may pass a tile (寻路-2): passable, and for ground units no 地穴 (地图-4). @param {LevelMap} m @param {number} k @param {boolean} fly */
const seeThrough = (m, k, fly) => open(m, k, fly) && (fly || !isHole(m.tiles[Math.floor(k / m.width)][k % m.width]));

/** The tile key of a position, rounded half to even (体积-1), or −1 off the map. @param {LevelMap} m @param {number} x @param {number} y */
export function keyAt(m, x, y) {
  const r = roundHalfEven(y), c = roundHalfEven(x);
  return r >= 0 && r < m.height && c >= 0 && c < m.width ? r * m.width + c : -1;
}

/**
 * Distances and first parents toward `dest` (寻路-1): a FIFO SPFA, each step costing 1 — out of a 地穴 HOLE_COST for
 * ground units (地图-4) —, a tile relaxed only by a strictly shorter distance. −1 where the destination cannot be reached.
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
      if (nr < 0 || nr >= m.height || nc < 0 || nc >= m.width || !open(m, nb, fly) || !crossable(m, cur, nb, fly)) continue;
      const d = dist[cur] + costOut(m, nb, fly);
      if (dist[nb] >= 0 && d >= dist[nb]) continue;
      dist[nb] = d;
      parent[nb] = cur;
      if (!queued[nb]) { queue.push(nb); queued[nb] = 1; }
    }
  }
  return { dist, parent };
}

/**
 * Bresenham line of sight from tile a to tile b (寻路-2): every tile on the line passable — for ground units no 地穴
 * (地图-4) —, a diagonal step only with both tiles beside it so, and no step across a closed edge (地图-2). Without diagonal moves only a straight row or
 * column counts.
 * @param {LevelMap} m @param {number} a @param {number} b @param {boolean} fly @param {boolean} diagonal
 */
export function lineOfSight(m, a, b, fly, diagonal) {
  const r = Math.floor(a / m.width), c = a % m.width, r1 = Math.floor(b / m.width), c1 = b % m.width;
  if (!diagonal && r !== r1 && c !== c1) return false;
  const ok = (/** @type {number} */ rr, /** @type {number} */ cc) => seeThrough(m, rr * m.width + cc, fly);
  return ok(r, c) && bresenham(r, c, r1, c1, (r0, c0, rr, cc) =>
    ok(rr, cc) && (r0 === rr || c0 === cc || (ok(rr, c0) && ok(r0, cc))) && crossable(m, r0 * m.width + c0, rr * m.width + cc, fly));
}

/**
 * Walks the Bresenham line from (r, c) to (r1, c1): every step from a tile to the next `ok`.
 * @param {number} r @param {number} c @param {number} r1 @param {number} c1 @param {(r: number, c: number, nr: number, nc: number) => boolean} ok
 */
function bresenham(r, c, r1, c1, ok) {
  const dr = Math.abs(r1 - r), dc = Math.abs(c1 - c), sr = r1 > r ? 1 : -1, sc = c1 > c ? 1 : -1;
  let err = dc - dr;
  while (r !== r1 || c !== c1) {
    const e2 = 2 * err;
    let nr = r, nc = c;
    if (e2 > -dr) { err -= dr; nc += sc; }
    if (e2 < dc) { err += dc; nr += sr; }
    if (!ok(r, c, nr, nc)) return false;
    r = nr; c = nc;
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

/**
 * The tiles of the Bresenham line from (r, c) to (r1, c1), both included, in order (寻路-2's line).
 * @param {number} r @param {number} c @param {number} r1 @param {number} c1 @returns {[number, number][]}
 */
function lineTiles(r, c, r1, c1) {
  const dr = Math.abs(r1 - r), dc = Math.abs(c1 - c), sr = r1 > r ? 1 : -1, sc = c1 > c ? 1 : -1, out = /** @type {[number, number][]} */ ([[r, c]]);
  let err = dc - dr;
  while (r !== r1 || c !== c1) {
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 < dc) { err += dc; r += sr; }
    out.push([r, c]);
  }
  return out;
}

/**
 * The tiles an enemy's way from tile `a` to tile `b` crosses (寻路-2): the smoothed pointers of the field toward b, each
 * step joined by its Bresenham line, a and b included; null when b cannot be reached from a.
 * @param {LevelMap} m @param {number} a @param {number} b @param {{ fly?: boolean, diagonal?: boolean }} [o] @returns {number[] | null}
 */
export function routeTiles(m, a, b, o = {}) {
  const f = flowField(m, Math.floor(b / m.width), b % m.width, o), out = [a];
  if (f.dist[a] < 0) return null;
  for (let k = a; k !== b;) {
    const n = f.next[k];
    for (const [r, c] of lineTiles(Math.floor(k / m.width), k % m.width, Math.floor(n / m.width), n % m.width).slice(1)) out.push(r * m.width + c);
    k = n;
  }
  return out;
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
