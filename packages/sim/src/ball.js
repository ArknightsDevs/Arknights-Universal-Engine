// 足球 (docs/spec/football.md 足球-2…足球-5): a ball takes no damage; what our units deal it adds up — a direction for
// each hit, a fifth of it from a unit not on its tile or the four beside it — until the total reaches the ball's
// threshold, and then it is kicked at its own force along the summed direction (the kick itself is displacement.js's,
// the hook football.js's). It slides like any 失衡 (位移-3) but with its own friction, bounces off walls by its
// restitution, hurts the units of ours it runs into, stops by one of ours that can still block it, and a goal is
// scored when its centre enters a goal tile.
import { KIND, SCORE_GOAL } from '@aue/schema';
import { FRICTION, ALLY_COLLIDER_RADIUS } from './constants.js';
import { statsOf } from './attrs.js';
import { addBuff, makeBuff } from './buffs.js';
import { tileOf } from './body.js';
import { tileAt } from './level.js';
import { passable } from './paths.js';
import { blockLoad, canBlock, releaseAll } from './blocking.js';
import { dealDamage } from './damage.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {NonNullable<Unit['ball']>} Ball */

/** A ball's hit and collision circle, in tiles (足球-2). */
export const BALL_RADIUS = 0.3;

/** One of ours within this distance of a ball's centre that can still block it stops it (足球-4). */
export const BALL_STOP_RADIUS = 0.35;

/** A push's force (力度) as a speed, tiles/s: the list value × 0.01 on a mass of 1 (位移-2, 足球-3). */
export const FORCE_TO_SPEED = 0.01;

/** The share of a hit's direction from a unit that is not on the ball's tile or the four beside it (足球-3). */
export const FAR_SHARE = 0.2;

/** The goal tiles (足球-1): a ball in ours is the other side's goal, in theirs ours. */
export const GOAL_TILES = Object.freeze({ ours: 'tile_allygoal', theirs: 'tile_enemygoal' });

/**
 * A ball's record (足球-2): `physic`'s friction factor, restitution, default force and the damage that kicks it, and
 * the block that stops it (`aura`'s `block_cnt`).
 * @typedef {{ friction: number, restitution: number, force: number, need: number, block: number }} BallParams
 */

/**
 * Makes an enemy a ball (足球-2): its physics, nothing summed, touching nobody; and the buff of what a ball is — it
 * does not attack, cannot be blocked, stays where it is unless kicked (束缚), and 晕眩, 寒冷, 冻结 and 沉睡 do not take.
 * @param {Unit} u @param {BallParams} p
 */
export function makeBall(u, p) {
  u.ball = { f: p.friction, e: p.restitution, force: p.force, need: p.need, block: p.block, sum: 0, ax: 0, ay: 0, touch: [] };
  addBuff(u, makeBuff({ key: 'ball', src: u.id, flags: { noAttack: true, unblockable: true, root: true,
    'immune:stun': true, 'immune:cold': true, 'immune:enemyCold': true, 'immune:freeze': true, 'immune:enemyFreeze': true, 'immune:sleep': true } }));
}

/** @param {number} x @param {number} y */
const len = (x, y) => Math.sqrt(x * x + y * y);

/** Whether a unit is one of ours whose hits move a ball (足球-3): an operator or a device of ours. @param {Unit} u */
const kicker = (u) => u.kind === KIND.OPERATOR || u.kind === KIND.DEVICE;

/**
 * The direction one hit adds (足球-3): from the source to the ball, or (1, 0) when they share a tile; a fifth of it
 * when the source is not on the ball's tile or the four beside it.
 * @param {Unit} b @param {Unit} src @returns {[number, number]}
 */
export function hitDirection(b, src) {
  const [br, bc] = tileOf(b), [sr, sc] = tileOf(src);
  if (br === sr && bc === sc) return [1, 0];
  const dx = b.x - src.x, dy = b.y - src.y, d = len(dx, dy);
  const k = Math.abs(br - sr) + Math.abs(bc - sc) <= 1 ? 1 : FAR_SHARE;
  return d > 0 ? [(dx / d) * k, (dy / d) * k] : [k, 0];
}

/**
 * A hit on a ball (足球-3): from one of ours, while the ball is neither in 失衡 nor hidden, the hit's direction and its
 * damage are added up; once the damage reaches the ball's threshold both start again and the kick's direction — the
 * sum as a unit vector, (1, 0) when the sum is nothing — is returned. Null when the hit kicks nothing.
 * @param {Unit} b @param {Unit | null} src @param {number} amount @returns {[number, number] | null}
 */
export function ballHit(b, src, amount) {
  const s = b.ball;
  if (!s || !src || !kicker(src) || b.slide || b.hidden || !(amount > 0)) return null;
  const [dx, dy] = hitDirection(b, src);
  s.ax += dx;
  s.ay += dy;
  s.sum += amount;
  if (s.sum < s.need) return null;
  const d = len(s.ax, s.ay);
  /** @type {[number, number]} */
  const dir = d > 0 ? [s.ax / d, s.ay / d] : [1, 0];
  s.sum = 0;
  s.ax = 0;
  s.ay = 0;
  return dir;
}

/** A ball's friction (足球-4): 位移-3's μg × its own factor. @param {Content} _c @param {Unit} b */
export const ballFriction = (_c, b) => FRICTION * (b.ball?.f ?? 1);

/**
 * Whether a ball's circle at (x, y) overlaps a tile a ground unit cannot enter, or leaves the map (足球-4).
 * @param {Content} c @param {number} x @param {number} y
 */
export function walled(c, x, y) {
  const r = BALL_RADIUS;
  for (let row = Math.round(y - r); row <= Math.round(y + r); row++) {
    for (let col = Math.round(x - r); col <= Math.round(x + r); col++) {
      if (passable(tileAt(c.level, row, col), false)) continue;
      const nx = Math.min(Math.max(x, col - 0.5), col + 0.5), ny = Math.min(Math.max(y, row - 0.5), row + 0.5);
      if ((x - nx) * (x - nx) + (y - ny) * (y - ny) < r * r) return true;
    }
  }
  return false;
}

/**
 * Where a sliding ball's move by (dx, dy) takes it this frame (足球-4): along x, then along y; a move that would put
 * its circle into a wall does not happen, and that axis bounces.
 * @param {Content} c @param {Unit} b @param {number} dx @param {number} dy
 * @returns {{ x: number, y: number, bx: boolean, by: boolean }}
 */
export function ballMove(c, b, dx, dy) {
  const bx = walled(c, b.x + dx, b.y), x = bx ? b.x : b.x + dx;
  const by = walled(c, x, b.y + dy), y = by ? b.y : b.y + dy;
  return { x, y, bx, by };
}

/** The radius a unit of ours runs into a ball at (足球-4): an operator's or a device's collider. */
const COLLIDER = ALLY_COLLIDER_RADIUS;

/**
 * The units of ours a sliding ball runs into this frame (足球-4): each new one takes true damage of the ball's speed ×
 * its attack; one still touching it from the frame before takes none.
 * @param {World} w @param {Content} c @param {Unit} b @param {number} speed its speed this frame, tiles/s
 */
export function collide(w, c, b, speed) {
  const s = /** @type {Ball} */ (b.ball), reach = BALL_RADIUS + COLLIDER;
  const now = w.units.filter((u) => kicker(u) && u.hp > 0 && !u.hidden && (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) < reach * reach);
  const before = new Set(s.touch);
  s.touch = now.map((u) => u.id);
  const amount = speed * statsOf(b).atk;
  for (const u of now) if (!before.has(u.id) && amount > 0) dealDamage(w, b, u, { type: 'true', amount }, c);
}

/**
 * Whether one of ours near a ball stops it (足球-4): an operator within BALL_STOP_RADIUS of its centre, able to block,
 * with at least the ball's `block` of its block count left.
 * @param {World} w @param {Unit} b
 */
export function stopped(w, b) {
  const s = /** @type {Ball} */ (b.ball), r = BALL_STOP_RADIUS;
  return w.units.some((u) => u.kind === KIND.OPERATOR && u.hp > 0 && !u.hidden && (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) <= r * r
    && canBlock(statsOf(u)) && statsOf(u).blockCnt - blockLoad(w, u) >= s.block);
}

/**
 * The goal a ball's centre is in (足球-5): 'ours' (our goal: the other side scores), 'theirs', or null.
 * @param {Content} c @param {Unit} b @returns {'ours' | 'theirs' | null}
 */
export function goalOf(c, b) {
  const [r, col] = tileOf(b), key = tileAt(c.level, r, col)?.key;
  return key === GOAL_TILES.ours ? 'ours' : key === GOAL_TILES.theirs ? 'theirs' : null;
}

/**
 * A ball goes into a goal (足球-5): the event `score` (its `goal` by SCORE_GOAL), and it leaves the field quietly —
 * no knockdown, no life lost.
 * @param {World} w @param {Unit} b @param {'ours' | 'theirs'} goal
 */
export function scored(w, b, goal) {
  w.events.push({ type: 'score', id: b.id, goal: SCORE_GOAL[goal] });
  w.units.splice(w.units.indexOf(b), 1);
  releaseAll(w, b.id);
}

/**
 * After a sliding ball's move this frame (足球-4, 足球-5): it hurts the units it ran into; then a goal ('goal': it has
 * left the field), or one of ours that stops it ('stop'); null while it slides on.
 * @param {World} w @param {Content} c @param {Unit} b @param {number} speed @returns {'goal' | 'stop' | null}
 */
export function ballMoved(w, c, b, speed) {
  collide(w, c, b, speed);
  const goal = goalOf(c, b);
  if (goal) { scored(w, b, goal); return 'goal'; }
  return stopped(w, b) ? 'stop' : null;
}
