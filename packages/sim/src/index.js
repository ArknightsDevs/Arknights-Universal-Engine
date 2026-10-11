// @aue/sim: the battle core. M0.5 skeleton plus M1 (pure modules) and M2 (attributes, buffs and statuses, damage,
// targeting); each simplification left is a registered inference, replaced in M3–M4.
export { createWorld, step, stateHash } from './world.js';
export { takeSnapshot, restoreSnapshot } from './snapshot.js';
export { toView } from './view.js';
export { deployProblem } from './commands.js';
export { rangeCell, pickTarget, targetsOf } from './combat.js';
export * as dir from './dir.js';
export * as body from './body.js';
export * as constants from './constants.js';
export * as attrs from './attrs.js';
export * as buffs from './buffs.js';
export * as status from './status.js';
export * as damage from './damage.js';
export * as targeting from './targeting.js';
export * as blocking from './blocking.js';
export * as routes from './routes.js';
export * as paths from './paths.js';
export * as skills from './skills.js';
export * as sp from './sp.js';
export * as elements from './elements.js';
export * as traits from './traits.js';
export * as deck from './deck.js';
export { nextUint32, seedState } from './rng.js';
export { BEHAVIOR_API_VERSION, CONTEXT_MEMBERS, SKILL_CONTEXT_MEMBERS } from './api.js';
export { hashNumbers, HASH_START } from './hash.js';

/** @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Buff} Buff */
/** @typedef {import('./types.js').SkillDef} SkillDef */
/** @typedef {import('./skills.js').SkillBehavior} SkillBehavior */
/** @typedef {import('./types.js').TraitDef} TraitDef */
/** @typedef {import('./types.js').OperatorDef} OperatorDef */
/** @typedef {import('./traits.js').TraitBehavior} TraitBehavior */
/** @typedef {import('@aue/schema').Command} Command */
