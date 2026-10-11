// Time (spec docs/spec/time.md). The battle runs at a fixed number of frames per second and every duration is a whole
// number of frames: countdowns are integers, so nothing drifts by a float residue (a 1.0 s interval counted down in
// float seconds of 1/30 takes 31 steps, not 30).
import { decimalOf, pow10 } from './decimal.js';

/** Frames per second of the battle simulation. [时间-1] */
export const FPS = 30;

/**
 * A duration in seconds, as the game data writes it, to whole frames: the nearest frame, halves rounded up. [时间-2]
 * Exact: the product with FPS is taken on the decimal the data wrote (decimalOf), in integers, so 0.1 s is 3 frames and
 * 0.05 s (1.5 frames) is 2 on every engine.
 * @param {number} seconds a finite duration ≥ 0
 * @returns {number} frames
 */
export function secondsToFrames(seconds) {
  const { mantissa, exponent } = decimalOf(seconds);
  const scaled = mantissa * BigInt(FPS);
  if (exponent >= 0) return Number(scaled * pow10(exponent));
  const den = pow10(-exponent), q = scaled / den, r = scaled % den;
  return Number(2n * r >= den ? q + 1n : q);
}
