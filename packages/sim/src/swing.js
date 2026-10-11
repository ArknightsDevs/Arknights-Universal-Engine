// The attack swing and projectiles (docs/spec/combat.md 攻击-2, 攻击-3): an attack's wind-up from its clip's OnAttack
// time — sped up with the clip when the attacks come quicker than it — and the projectiles a ranged attack launches at
// that moment, which home on their target and hit when they reach it.
import { FPS, secondsToFrames, hypot } from '@aue/math';
import { KIND } from '@aue/schema';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').AttackTiming} AttackTiming @typedef {import('./types.js').Shot} Shot */

/** A projectile's speed in tiles per second, an operator's and an enemy's (攻击-3). */
export const SHOT_SPEED = Object.freeze({ operator: 12, enemy: 10 });

/** 麻痹 cuts an attack this long after it began at the latest (状态-8: 2 s). */
export const PALSY_CUT_FRAMES = secondsToFrames(2);

/** A unit's attack timing from its content record, or null when it has none (攻击-2). @param {Content} c @param {Unit} u @returns {AttackTiming | null} */
export function timingOf(c, u) {
  const d = u.kind === KIND.OPERATOR ? c.operators[u.key] : c.enemies[u.key];
  return d?.attack ?? null;
}

/**
 * The wind-up in frames (攻击-2): the clip's OnAttack time H (in frames, at most the clip's length D); when the attack
 * interval I is shorter than the clip, H × I / D to the nearest frame, halves up. No timing: 0.
 * @param {AttackTiming | null} timing @param {number} interval frames
 */
export function windupFrames(timing, interval) {
  if (!timing) return 0;
  const d = secondsToFrames(timing.duration), h = Math.min(d, secondsToFrames(timing.hit));
  if (interval >= d) return h;
  return Math.floor((2 * h * interval + d) / (2 * d));
}

/** Whether a unit's normal attack launches projectiles (攻击-3). @param {Content} c @param {Unit} u @param {boolean} heals */
export function shoots(c, u, heals) {
  if (heals) return false;
  if (u.kind === KIND.ENEMY) return u.base.applyWay === 'RANGED' && u.base.rangeRadius > 0;
  return c.operators[u.key].position === 'RANGED';
}

/**
 * Launches a projectile from a unit at a target (攻击-3), with what it carries; a `shot` event.
 * @param {World} w @param {Unit} a @param {Unit} t @param {Omit<Shot, 'src' | 'target' | 'sx' | 'sy' | 'speed'>} load
 */
export function launch(w, a, t, load) {
  w.shots.push({ src: a.id, target: t.id, sx: a.x, sy: a.y, speed: a.kind === KIND.OPERATOR ? SHOT_SPEED.operator : SHOT_SPEED.enemy, ...load });
  w.events.push({ type: 'shot', id: a.id, target: t.id });
}

/**
 * One frame of every projectile, in launch order (攻击-3): it moves its speed ÷ 30 tiles toward where its target is
 * now; within that distance it arrives. A target that left the field, fell or disappeared makes it vanish.
 * @param {World} w @param {(s: Shot, target: Unit) => void} arrive
 */
export function flyShots(w, arrive) {
  /** @type {Shot[]} */
  const keep = [];
  for (const s of w.shots) {
    const t = w.units.find((u) => u.id === s.target);
    if (!t || t.hp <= 0 || t.hidden) continue;
    const dx = t.x - s.sx, dy = t.y - s.sy, d = hypot(dx, dy), step = s.speed / FPS;
    if (d <= step) { arrive(s, t); continue; }
    s.sx += (dx / d) * step;
    s.sy += (dy / d) * step;
    keep.push(s);
  }
  w.shots = keep;
}
