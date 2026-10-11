// Enemies: spawning on schedule (spec 出怪-1), walking their route (移动-1), reaching the goal (目标-1).
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { makeEnemy } from './units.js';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Route} Route @typedef {import('./types.js').Cell} Cell */

/** @param {Content} c @returns {number[]} the frame of each spawn */
export const spawnFrames = (c) => c.level.spawns.map((s) => secondsToFrames(s.at));

/** Spawns every enemy due this frame, in list order. @param {World} w @param {Content} c */
export function spawnDue(w, c) {
  const list = c.level.spawns;
  while (w.nextSpawn < list.length && w.spawnFrames[w.nextSpawn] <= w.frame) {
    const s = list[w.nextSpawn++], u = makeEnemy(w, c, { key: s.enemy, route: s.route });
    w.units.push(u);
    w.events.push({ type: 'spawn', id: u.id, key: u.key });
  }
}

/** The waypoints of a route: its MOVE checkpoints, then its end (spec 移动-1). @param {Route} r @returns {Cell[]} */
export function waypoints(r) {
  return [...r.checkpoints.filter((p) => p.type === 'MOVE').map((p) => ({ row: p.row, col: p.col })), r.end];
}

/**
 * Moves an enemy `speed` tiles along its waypoints, in straight lines; returns true when it reached the route's end.
 * @param {Unit} u @param {Cell[]} pts @param {number} speed tiles this frame @returns {boolean}
 */
export function walk(u, pts, speed) {
  let left = speed;
  while (u.leg < pts.length) {
    const p = pts[u.leg], dx = p.col - u.x, dy = p.row - u.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > left) { u.x += (dx / d) * left; u.y += (dy / d) * left; return false; }
    u.x = p.col; u.y = p.row; left -= d; u.leg++;
  }
  return true;
}

/**
 * An enemy's speed in tiles per frame (移动-1): its move speed × the level's moveMultiplier / FPS; 0 while it cannot
 * move (状态-5).
 * @param {Content} c @param {Unit} u
 */
export function speedOf(c, u) {
  const s = statsOf(u);
  return s.immobile ? 0 : (s.moveSpeed * c.level.options.moveMultiplier) / FPS;
}

/**
 * An enemy's 路径距离 (索敌-3) until the movement rules of M3: the length of the rest of its route as it walks it —
 * straight to the next waypoint, then from waypoint to waypoint.
 * @param {Content} c @param {Unit} u
 */
export function remainingDistance(c, u) {
  const pts = waypoints(c.level.routes[u.route]);
  let d = 0, x = u.x, y = u.y;
  for (let i = u.leg; i < pts.length; i++) {
    const dx = pts[i].col - x, dy = pts[i].row - y;
    d += Math.sqrt(dx * dx + dy * dy);
    x = pts[i].col; y = pts[i].row;
  }
  return d;
}

/**
 * Moves every enemy; one at the end of its route is removed and costs a life of the player whose objective it reached
 * (spec 目标-1).
 * @param {World} w @param {Content} c
 */
export function moveEnemies(w, c) {
  for (const u of w.units) {
    if (u.kind !== KIND.ENEMY || u.hp <= 0) continue;
    if (!walk(u, waypoints(c.level.routes[u.route]), speedOf(c, u))) continue;
    const owner = goalOwner(c, w.players.length, c.level.routes[u.route].end);
    w.players[owner].life = Math.max(0, w.players[owner].life - 1);
    u.hp = 0;
    w.events.push({ type: 'goal', id: u.id, owner });
  }
}

/** The player an objective tile belongs to: the left half to player 0, the right half to player 1 (目标-1). */
export function goalOwner(/** @type {Content} */ c, /** @type {number} */ players, /** @type {Cell} */ end) {
  return players > 1 && end.col * 2 >= c.level.width ? 1 : 0;
}
