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
  const known = FRAMES.get(seconds);
  if (known !== undefined) return known;
  const { mantissa, exponent } = decimalOf(seconds);
  const scaled = mantissa * BigInt(FPS);
  const frames = exponent >= 0 ? Number(scaled * pow10(exponent)) : nearest(scaled, pow10(-exponent));
  remember(FRAMES, seconds, frames);
  return frames;
}

/**
 * The answers so far, by seconds (and by speed, then seconds): the conversions are exact but slow (a decimal string, big
 * integers), and the same few durations come back every frame. A pure function's answers: kept or dropped, the result
 * is the same. Each holds at most CACHED entries and starts again when full.
 */
const CACHED = 4096;
/** @type {Map<number, number>} */
const FRAMES = new Map();
/** @type {Map<number, Map<number, number>>} */
const AT_SPEED = new Map();

/** @template K, V @param {Map<K, V>} m @param {K} k @param {V} v */
function remember(m, k, v) {
  if (m.size >= CACHED) m.clear();
  m.set(k, v);
}

/**
 * A duration in seconds run at `speed` percent, `seconds / (speed / 100)`, to whole frames the same way: the nearest
 * frame, halves rounded up, exact on the decimals of both numbers. [属性-5]
 * @param {number} seconds a finite duration ≥ 0
 * @param {number} speed a finite speed > 0, in percent
 * @returns {number} frames
 */
export function secondsAtSpeedToFrames(seconds, speed) {
  if (!(speed > 0)) throw new RangeError(`secondsAtSpeedToFrames: expected a speed > 0, got ${speed}`);
  let bySeconds = AT_SPEED.get(speed);
  const known = bySeconds?.get(seconds);
  if (known !== undefined) return known;
  const t = decimalOf(seconds), s = decimalOf(speed), e = t.exponent - s.exponent;
  // seconds × 100 × FPS / speed = (t.m × 10^t.e × 100 × FPS) / (s.m × 10^s.e)
  const num = t.mantissa * BigInt(100 * FPS) * (e > 0 ? pow10(e) : 1n), den = s.mantissa * (e < 0 ? pow10(-e) : 1n);
  const frames = nearest(num, den);
  if (!bySeconds) { bySeconds = new Map(); remember(AT_SPEED, speed, bySeconds); }
  remember(bySeconds, seconds, frames);
  return frames;
}

/** num / den to the nearest integer, halves up (num ≥ 0, den > 0). @param {bigint} num @param {bigint} den */
function nearest(num, den) {
  const q = num / den, r = num % den;
  return Number(2n * r >= den ? q + 1n : q);
}
