// @aue/net: lockstep — the server's clock, sealing and arbiter (LockstepHost), the client that plays sealed frames
// (LockstepClient), the catch-up pacing. Transport-agnostic: the platform carries the messages (WebSocket).
export { LockstepHost } from './host.js';
export { LockstepClient } from './client.js';
export { framesThisTick } from './pacing.js';
export { MAX_OPERATOR_DELAY, INPUT_DELAY, MAX_PLAY_SPEED, JITTER_BUFFER, HASH_EVERY, MAX_AHEAD, HASH_HISTORY, framesAt, RESUME_MS, PAUSE_ASK_MS, SIGNAL_RATE } from './constants.js';
