// Co-op rules (docs/spec/coop.md 合作-1…合作-4): whose goal an enemy reaches, 共同敌手, a fallen goal sending its
// enemies on to the mate's, and a player going down — no deploying, their operators out of play — and coming back after
// 30 s in which no enemy enters their goal.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { tileAt } from './level.js';
import { applyStatus } from './status.js';
import { removeBuff } from './buffs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Player} Player @typedef {import('./types.js').Cell} Cell */

/** How long a fallen player's goal must stay free of enemies before they come back (合作-4: 30 s). */
export const REVIVE_FRAMES = secondsToFrames(30);

/**
 * The seats a goal tile belongs to (合作-1): side A to seat 0, side B to seat 1, a shared goal to every seat. A goal
 * without a side: with one player that player's; with two, the left half of the map to seat 0, the right to seat 1.
 * @param {Content} c @param {number} players @param {Cell} end @returns {number[]}
 */
export function goalSeats(c, players, end) {
  const side = tileAt(c.level, end.row, end.col)?.goal ?? '';
  if (players === 1) return [0];
  if (side === 'Shared') return Array.from({ length: players }, (_, i) => i);
  if (side === 'A') return [0];
  if (side === 'B') return [1];
  return [end.col * 2 >= c.level.width ? 1 : 0];
}

/** Whether a player is down (合作-4). @param {Player} p */
export const isDown = (p) => p.revive >= 0;

/**
 * A player loses lives (合作-2…合作-4): their life drops, at least 0; at 0 they go down.
 * @param {World} w @param {number} seat @param {number} n
 */
function loseLife(w, seat, n) {
  const p = w.players[seat];
  if (isDown(p)) return;
  p.life = Math.max(0, p.life - n);
  if (p.life === 0) goDown(w, seat);
}

/**
 * A player goes down (合作-4): their revival countdown starts, their downs are counted, and every operator of theirs
 * on the field is put out of play.
 * @param {World} w @param {number} seat
 */
function goDown(w, seat) {
  const p = w.players[seat];
  p.revive = REVIVE_FRAMES;
  p.downs++;
  for (const u of w.units) if (u.kind === KIND.OPERATOR && u.owner === seat && u.hp > 0) applyStatus(u, 'sidelined');
  w.events.push({ type: 'down', owner: seat });
}

/**
 * An enemy reaches the goal at the end of its route (合作-1…合作-3): a 共同敌手 costs every player a life; otherwise
 * each seat the goal belongs to loses one — but a seat already down passes it to the mate, and its countdown starts
 * over. Returns the seats that lost a life.
 * @param {World} w @param {Content} c @param {Unit} e @returns {number[]}
 */
export function enemyAtGoal(w, c, e) {
  const n = w.players.length, seats = goalSeats(c, n, c.level.routes[e.route].end);
  /** @type {number[]} */
  const hit = [];
  if (e.base.shared) {
    for (let s = 0; s < n; s++) if (!isDown(w.players[s])) hit.push(s);
  } else {
    for (const s of seats) {
      const p = w.players[s];
      if (!isDown(p)) { hit.push(s); continue; }
      p.revive = REVIVE_FRAMES;
      const mate = n > 1 ? 1 - s : -1;
      if (mate >= 0 && !isDown(w.players[mate])) hit.push(mate);
    }
  }
  for (const s of new Set(hit)) loseLife(w, s, 1);
  return [...new Set(hit)];
}

/**
 * One frame of every down player's countdown (合作-4): at 0 they come back with their life full, and their operators
 * return to play.
 * @param {World} w @param {Content} c
 */
export function tickRevival(w, c) {
  w.players.forEach((p, seat) => {
    if (!isDown(p) || --p.revive > 0) return;
    p.revive = -1;
    p.life = c.level.options.maxLifePoint;
    for (const u of w.units) if (u.kind === KIND.OPERATOR && u.owner === seat) removeBuff(u, 'sidelined');
    w.events.push({ type: 'revive', owner: seat });
  });
}
