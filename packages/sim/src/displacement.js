// Displacement (docs/spec/displacement.md 位移-1…位移-4): a push gives an enemy a speed at once by its 受力等级 — the
// force's 力度 less its 重量等级 — away from the pusher or along a direction; the enemy is then in 失衡 (UNBALANCE): each
// frame friction takes μg·dt off its speed before it moves, a wall stops it, and the state ends once its speed is at
// most 0.1 and its 0.1 s 失衡硬直 is over. In 失衡 it neither walks, attacks nor is blocked.
import { FPS } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { release } from './blocking.js';
import { tileAt } from './level.js';
import { displace } from './routes.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/**
 * A push's source and kind (位移-2): the pusher's centre, a direction for a directional push, the corrections waived
 * (`fixed` both, `anyAngle` the angle one), towards the pusher, an effect's push.
 * @typedef {{ from: { x: number, y: number }, dir?: { x: number, y: number } | null, fixed?: boolean, anyAngle?: boolean, toward?: boolean, effect?: boolean }} PushOptions
 */

/** A push's speed (tiles/s) by 受力等级 −2…3 (位移-2): ≤ −3 none, ≥ 3 as 3. */
export const PUSH_SPEED = Object.freeze({ '-2': 1, '-1': 2, 0: 4, 1: 4.5, 2: 5.3, 3: 5.8 });

/** Friction's deceleration (位移-3): μ 0.5 × g 9.81, tiles/s². */
export const FRICTION = 0.5 * 9.81;

/** 失衡 ends at or below this speed (tiles/s), its 硬直 over (位移-3). */
export const STOP_SPEED = 0.1;

/** The 失衡硬直 in frames (位移-3: 0.1 s). */
export const HARD_FRAMES = 3;

/** A directional push nearer than this, or more than 45° off its direction, turns radial with 受力等级 −2 (位移-2). */
const DIRECTIONAL_MIN = 0.25;

/** @param {number} x @param {number} y */
const len = (x, y) => Math.sqrt(x * x + y * y);

/**
 * Whether a unit can be displaced (位移-1): an enemy on the field with HP, not disappeared, not in the air, not 失衡免疫
 * (flag `noDisplace`).
 * @param {Unit} u
 */
export function displaceable(u) {
  if (u.kind !== KIND.ENEMY || u.hp <= 0 || u.hidden || u.base.neutral === true) return false;
  const s = statsOf(u);
  return !s.flying && !s.flags.noDisplace;
}

/** A push's 受力等级 on a unit (位移-1): its 力度 less the unit's 重量等级. @param {Unit} u @param {number} force */
export const forceLevel = (u, force) => Math.round(force) - statsOf(u).massLevel;

/**
 * The direction and 受力等级 of a push (位移-2): along `dir` when given — radial with 受力等级 −2 when the target stands
 * nearer than 0.25 tiles or more than 45° off it, unless `fixed` (`anyAngle`: the angle does not count) —, else radial
 * (away from `from`, towards it when `toward`); none when there is no way to go.
 * @param {Unit} t @param {number} level @param {PushOptions} o
 * @returns {{ ux: number, uy: number, level: number } | null}
 */
function aim(t, level, o) {
  const vx = t.x - o.from.x, vy = t.y - o.from.y, d = len(vx, vy), dl = o.dir ? len(o.dir.x, o.dir.y) : 0;
  if (dl > 0 && o.dir) {
    const ux = o.dir.x / dl, uy = o.dir.y / dl;
    if (o.fixed || (d >= DIRECTIONAL_MIN && (o.anyAngle || vx * ux + vy * uy >= d * Math.SQRT1_2))) return { ux, uy, level };
    return d > 0 ? { ux: vx / d, uy: vy / d, level: level - 2 } : null;
  }
  if (!(d > 0)) return null;
  const k = o.toward ? -1 : 1;
  return { ux: (k * vx) / d, uy: (k * vy) / d, level };
}

/**
 * A push (位移-2) of 力度 `force` on `t`: its speed by the 受力等级 (none at −3 or below) in the push's direction, added to
 * what it slides at; it is released from its blocker and its swing cut; a ballistic push (the default) moves it one
 * frame at that speed at once, an effect's (`effect`) from the next frame. Whether it got a speed.
 * @param {World} w @param {Content} c @param {Unit} t @param {number} force @param {PushOptions} o
 */
export function push(w, c, t, force, o) {
  if (!displaceable(t)) return false;
  const a = aim(t, forceLevel(t, force), o);
  if (!a || a.level <= -3) return false;
  const v = PUSH_SPEED[/** @type {keyof typeof PUSH_SPEED} */ (String(Math.min(3, a.level)))];
  const s = t.slide ?? { vx: 0, vy: 0, hard: 0 };
  t.slide = { vx: s.vx + a.ux * v, vy: s.vy + a.uy * v, hard: HARD_FRAMES };
  release(t);
  t.swing = null;
  if (!o.effect) step(c, t, t.slide.vx / FPS, t.slide.vy / FPS);
  w.events.push({ type: 'push', id: t.id });
  return true;
}

/**
 * Moves a sliding unit by (dx, dy) unless that leaves the map or, for a ground unit, enters a tile it cannot walk
 * (位移-3): then it stops where it is.
 * @param {Content} c @param {Unit} t @param {number} dx @param {number} dy
 */
function step(c, t, dx, dy) {
  const nx = t.x + dx, ny = t.y + dy, tile = tileAt(c.level, Math.round(ny), Math.round(nx));
  if (!tile || tile.passable !== 'ALL') {
    if (t.slide) t.slide = { ...t.slide, vx: 0, vy: 0 };
    return;
  }
  displace(t, nx, ny);
}

/**
 * One frame of 失衡 (位移-3): friction first, then the move; the state ends — the slide gone, its way planned afresh —
 * once its speed is at most 0.1 with its 硬直 over, or when it is lifted (浮空). Whether it is still in 失衡.
 * @param {Content} c @param {Unit} t
 */
export function slideStep(c, t) {
  const s = t.slide;
  if (!s) return false;
  const v = len(s.vx, s.vy), nv = Math.max(0, v - FRICTION / FPS), k = v > 0 ? nv / v : 0;
  t.slide = { vx: s.vx * k, vy: s.vy * k, hard: Math.max(0, s.hard - 1) };
  if (statsOf(t).flags.levitate) return settle(t);
  step(c, t, t.slide.vx / FPS, t.slide.vy / FPS);
  return len(t.slide.vx, t.slide.vy) <= STOP_SPEED && t.slide.hard === 0 ? settle(t) : true;
}

/** 失衡 ends: no slide, the way planned afresh from where it stands (路线-5). Always false. @param {Unit} t */
function settle(t) {
  t.slide = undefined;
  displace(t, t.x, t.y);
  return false;
}
