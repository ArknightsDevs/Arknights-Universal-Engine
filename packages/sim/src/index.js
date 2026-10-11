// @aue/sim: the battle core. M0.5 skeleton: deploy, cost, spawns, walking, attacks, the goal — the real interfaces
// with the simplest rules (each simplification is a registered inference, replaced in M1–M4).
export { createWorld, step, stateHash } from './world.js';
export { takeSnapshot, restoreSnapshot } from './snapshot.js';
export { toView } from './view.js';
export { deployProblem } from './commands.js';
export { physicalDamage, rangeCell } from './combat.js';
export * as dir from './dir.js';
export * as body from './body.js';
export { nextUint32, seedState } from './rng.js';
export { hashNumbers, HASH_START } from './hash.js';

/** @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('@aue/schema').Command} Command */
