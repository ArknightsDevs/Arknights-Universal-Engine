// Enemies: spawning on schedule (spec 出怪-1) and each enemy's turn (帧-1): blocking (阻挡-1, 阻挡-3), its attack
// (敌人攻击-1), walking its route (移动-1) and reaching the goal (目标-1).
import { secondsToFrames } from '@aue/math';
import { KIND, ANIM } from '@aue/schema';
import { makeEnemy } from './units.js';
import { followRoute, speedOf, goalOwner } from './routes.js';
import { tryBlock, keepOrRelease } from './blocking.js';
import { enemyAttack } from './combat.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */

/** @param {Content} c @returns {number[]} the frame of each spawn */
export const spawnFrames = (c) => c.level.spawns.map((s) => secondsToFrames(s.at));

/** Spawns every enemy due this frame, in list order. @param {World} w @param {Content} c */
export function spawnDue(w, c) {
  const list = c.level.spawns;
  while (w.nextSpawn < list.length && w.spawnFrames[w.nextSpawn] <= w.frame) {
    const s = list[w.nextSpawn++];
    const u = makeEnemy(w, c, { key: s.enemy, route: s.route, frag: secondsToFrames(s.fragment ?? s.at) });
    w.units.push(u);
    w.events.push({ type: 'spawn', id: u.id, key: u.key });
  }
}

/**
 * An enemy at the end of its route leaves and costs a life of the player whose objective it reached (目标-1).
 * @param {World} w @param {Content} c @param {Unit} e
 */
function reachGoal(w, c, e) {
  const owner = goalOwner(c, w.players.length, c.level.routes[e.route].end);
  w.players[owner].life = Math.max(0, w.players[owner].life - 1);
  e.hp = 0;
  w.events.push({ type: 'goal', id: e.id, owner });
}

/**
 * One enemy's turn (帧-1): it is released if its blocker is gone or cannot block; it may be blocked; it attacks; an
 * enemy that is not blocked and did not attack walks, and may be blocked where it arrives.
 * @param {World} w @param {Content} c @param {Unit} e
 */
function enemyTurn(w, c, e) {
  keepOrRelease(w, e);
  tryBlock(w, c, e);
  const attacked = enemyAttack(w, c, e);
  if (e.blockedBy >= 0) {
    if (!attacked) e.anim = ANIM.IDLE;
    return;
  }
  if (attacked) return;
  const speed = speedOf(c, e);
  if (speed === 0) { e.anim = ANIM.IDLE; return; }
  const x = e.x, y = e.y;
  if (followRoute(w, c, e, speed)) { reachGoal(w, c, e); return; }
  e.anim = e.x !== x || e.y !== y ? ANIM.MOVE : ANIM.IDLE;
  tryBlock(w, c, e);
}

/** Every enemy's turn, in creation order (帧-1). @param {World} w @param {Content} c */
export function enemiesAct(w, c) {
  for (const e of w.units) if (e.kind === KIND.ENEMY && e.hp > 0) enemyTurn(w, c, e);
}
