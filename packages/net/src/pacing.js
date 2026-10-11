// How many frames a client plays per frame time (spec 同步-4): one while its backlog of sealed frames fits the jitter
// buffer, more when it falls behind — never more than MAX_PLAY_SPEED.
import { MAX_PLAY_SPEED, JITTER_BUFFER } from './constants.js';

/**
 * @param {number} backlog sealed frames not yet played
 * @returns {number} frames to play now
 */
export function framesThisTick(backlog) {
  if (backlog <= 0) return 0;
  if (backlog <= JITTER_BUFFER) return 1;
  return Math.min(MAX_PLAY_SPEED, backlog - JITTER_BUFFER + 1);
}
