// Enemies: spawning on schedule (spec 出怪-1), walking their route (移动-1), reaching the goal (目标-1).
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { makeEnemy } from './units.js';

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
 * @param {Unit} u @param {Cell[]} pts @returns {boolean}
 */
export function walk(u, pts) {
  let left = u.speed;
  while (u.leg < pts.length) {
    const p = pts[u.leg], dx = p.col - u.x, dy = p.row - u.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > left) { u.x += (dx / d) * left; u.y += (dy / d) * left; return false; }
    u.x = p.col; u.y = p.row; left -= d; u.leg++;
  }
  return true;
}

/**
 * Moves every enemy; one at the end of its route is removed and costs a life of the player whose objective it reached
 * (spec 目标-1).
 * @param {World} w @param {Content} c
 */
export function moveEnemies(w, c) {
  for (const u of w.units) {
    if (u.kind !== KIND.ENEMY || u.hp <= 0) continue;
    if (!walk(u, waypoints(c.level.routes[u.route]))) continue;
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
