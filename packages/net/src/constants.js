// The lockstep constants (spec 同步-3, 同步-4, 同步-5, 同步-8, 同步-13).
import { secondsToFrames } from '@aue/math';

/** Seconds from a command to the frame it acts in: activity_table MULTIPLAY_V3.<act>.constData.maxOperatorDelay. */
export const MAX_OPERATOR_DELAY = 0.3;
/** The input delay in frames (0.3 s = 9 frames). */
export const INPUT_DELAY = secondsToFrames(MAX_OPERATOR_DELAY);
/** The fastest a client catches up, in frames per frame time: constData.maxPlaySpeed. */
export const MAX_PLAY_SPEED = 5;
/** Sealed frames a client keeps unplayed to absorb network jitter. */
export const JITTER_BUFFER = 2;
/** A client sends its state hash every this many frames. */
export const HASH_EVERY = 30;
/** How far beyond the last sealed frame a command may be stamped (3 s). */
export const MAX_AHEAD = 90;
/** How many frames of the arbiter's hashes the server keeps. */
export const HASH_HISTORY = 900;
/** Milliseconds per frame, as the integer ratio frames = ⌊ms × 3 / 100⌋. */
export const framesAt = (/** @type {number} */ ms) => Math.floor((ms * 3) / 100);
/** Milliseconds from a resume to the clock running again (同步-8: about 1 s). */
export const RESUME_MS = 1000;
/** Milliseconds a pause request waits for the mate's answer before it lapses as ignored (同步-8). */
export const PAUSE_ASK_MS = 15000;
/** Signals a seat may send a second, and at once (同步-13). */
export const SIGNAL_RATE = 4;
