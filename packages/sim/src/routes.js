// Routes (spec 移动-1, 索敌-3): the waypoints of an enemy's route, walking them, and how far the enemy still has to go.
// Until the pathfinding of M3b the legs between waypoints are straight lines (INF-0004).
import { FPS } from '@aue/math';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Route} Route @typedef {import('./types.js').Cell} Cell */

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
 * An enemy's 路径距离 (索敌-3) until the movement rules of M3b: the length of the rest of its route as it walks it —
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

/** The player an objective tile belongs to: the left half to player 0, the right half to player 1 (目标-1). */
export function goalOwner(/** @type {Content} */ c, /** @type {number} */ players, /** @type {Cell} */ end) {
  return players > 1 && end.col * 2 >= c.level.width ? 1 : 0;
}
