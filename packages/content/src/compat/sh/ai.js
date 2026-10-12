// Stands in for Stronghold's server/sim/ai.js (兼容-2): the names its operator kits import — a unit's attack profile now
// (its trait's, compat/unit.js; a running skill's attack override is the engine's, 兼容-5); the rest still gaps.
import { gap } from './gap.js';

export const acquireTargets = gap('ai.acquireTargets');
export const chainHealNext = gap('ai.chainHealNext');
/** A unit's attack profile now. @param {{ profile: Record<string, any> }} u */
export const effectiveProfile = (u) => u.profile;
export const performAttack = gap('ai.performAttack');
