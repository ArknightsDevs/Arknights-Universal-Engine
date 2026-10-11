// Traits (docs/spec/traits.md 职业-1…职业-6): what a profession branch changes about its operators, as data — who it
// can target and in which order, how many, whether its attack heals, hits per attack, lasting modifiers, cost on a
// kill, the retreat refund — plus behaviours by branch for the rest, acting through a context (ADR 0055).
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { applyStatus } from './status.js';
import { dealDamage, heal } from './damage.js';
import { dealEp } from './elements.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').TraitDef} TraitDef @typedef {import('./types.js').OperatorDef} OperatorDef */

/**
 * What every trait leaves out, by position (职业-1): a melee operator can and prefers to attack the enemies it blocks
 * (even flying or out of range) and cannot select other flying ones; a ranged one can select flying enemies and does
 * not prefer the ones it blocks.
 * @param {string} position @returns {TraitDef}
 */
export const defaultTrait = (position) => ({
  antiAir: position !== 'MELEE', blockedFirst: position === 'MELEE', filter: 'HATRED_DES', secondary: '', targets: 1,
  heal: false, hits: 1, mods: {}, flags: {}, killCost: 0, refund: 0.5, hitStatus: null, splash: null, aftershock: 0, unblockedScale: 1, selfHeal: 0, selfHealMax: Infinity,
  rangedTiles: false, skillArts: false, immuneBlocking: [], hpDrain: 0, costDrain: null, zone: null, chain: null, healOnHit: 0,
  attackInSkill: false, idleMods: {}, charge: null, skillHeal: 0, bullets: null, store: 0, epHeal: 0, noAttack: false, free: false, regenAura: 0, bb: {},
});

/** An operator record's trait: its own fields over the defaults of its position (职业-1). @param {OperatorDef} d @returns {TraitDef} */
export const traitOfDef = (d) => ({ ...defaultTrait(d.position), ...d.trait });

/** A deployed operator's trait. @param {Content} c @param {Unit} op @returns {TraitDef} */
export const traitOf = (c, op) => traitOfDef(c.operators[op.key]);

/**
 * A normal attack's maximum number of targets (职业-3): a number, the operator's 阻挡数 (at least 1), or every candidate.
 * @param {TraitDef} t @param {Unit} op
 */
export const traitTargets = (t, op) => (t.targets === 'all' ? Infinity : t.targets === 'blockCnt' ? Math.max(1, statsOf(op).blockCnt) : t.targets);

/**
 * The context a trait behaviour acts through (ADR 0055): the same functions as a skill's, with the trait's blackboard.
 * @typedef {object} TraitContext
 * @property {Readonly<Unit>} self
 * @property {Readonly<Record<string, number>>} bb
 * @property {number} frame
 * @property {(u: Unit) => import('./attrs.js').Stats} stats
 * @property {(target: Unit, init: import('./buffs.js').BuffInit) => void} addBuff
 * @property {(target: Unit, key: string) => void} removeBuff
 * @property {(target: Unit, key: import('./status.js').StatusKey, o?: import('./status.js').StatusOptions) => void} applyStatus
 * @property {(target: Unit, dmg: import('./damage.js').Damage) => number} dealDamage
 * @property {(target: Unit, element: import('./elements.js').Element, amount: number) => number} dealEp
 * @property {(target: Unit, amount: number) => number} heal
 * @property {(n: number) => void} gainCost
 */

/**
 * A trait's behaviour, by branch id (ADR 0055): at deployment, after each hit of its attacks, after a kill.
 * @typedef {object} TraitBehavior
 * @property {(ctx: TraitContext) => void} [deploy]
 * @property {(ctx: TraitContext, target: Unit) => void} [hit]
 * @property {(ctx: TraitContext, target: Unit) => void} [kill]
 */

/** Gives the owner cost, up to the level's maximum (费用-1). @param {World} w @param {Content} c @param {number} seat @param {number} n */
export function gainCost(w, c, seat, n) {
  const p = w.players[seat];
  p.cost = Math.min(c.level.options.maxCost, p.cost + n);
}

/**
 * The context a behaviour of an operator acts through (技能-6, 职业-6; api.js CONTEXT_MEMBERS): its damage is the
 * operator's, and a kill by it is credited to the operator (职业-5).
 * @param {World} w @param {Content} c @param {Unit} op @param {Readonly<Record<string, number>>} bb @returns {TraitContext}
 */
export function actorContext(w, c, op, bb) {
  return {
    self: op, bb, frame: w.frame, stats: statsOf,
    addBuff: (t, init) => { addBuff(t, makeBuff({ src: op.id, ...init })); },
    removeBuff: (t, key) => { removeBuff(t, key); },
    applyStatus: (t, key, o) => { applyStatus(t, key, { ...o, src: op }); },
    dealDamage: (t, dmg) => creditedDamage(w, c, op, t, dmg),
    dealEp: (t, el, amount) => dealEp(w, t, el, amount),
    heal: (t, amount) => heal(op, t, amount),
    gainCost: (n) => { gainCost(w, c, op.owner, n); },
  };
}

/** @param {World} w @param {Content} c @param {Unit} op */
const contextOf = (w, c, op) => actorContext(w, c, op, traitOf(c, op).bb);

/** @param {Content} c @param {Unit} op @returns {TraitBehavior | null} */
function behaviorOf(c, op) {
  const branch = c.operators[op.key].branch ?? '', own = c.behaviors?.traits;
  return own && Object.hasOwn(own, branch) ? own[branch] : null;
}

/**
 * A newly deployed operator's trait (职业-4, 职业-10): its lasting modifiers and flags as a buff, its upkeep — the HP
 * drain each second, the cost it consumes — as buffs without an end, then its behaviour's deploy.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function traitDeploy(w, c, op) {
  const t = traitOf(c, op);
  if (Object.keys(t.mods).length > 0 || Object.keys(t.flags).length > 0) addBuff(op, makeBuff({ key: 'trait', src: op.id, mods: t.mods, flags: t.flags }));
  if (t.hpDrain > 0) addBuff(op, makeBuff({ key: 'drain', src: op.id, every: FPS, fixed: true, value: t.hpDrain }));
  if (t.costDrain) addBuff(op, makeBuff({ key: 'upkeep', src: op.id, every: secondsToFrames(t.costDrain.every), fixed: true, value: t.costDrain.cost }));
  behaviorOf(c, op)?.deploy?.(contextOf(w, c, op));
}

/**
 * After each hit of an operator's attack (职业-4): the trait's status on the target, then its behaviour.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function traitHit(w, c, op, target) {
  const t = traitOf(c, op);
  if (t.hitStatus && target.hp > 0) applyStatus(target, t.hitStatus.key, { seconds: t.hitStatus.seconds, src: op });
  behaviorOf(c, op)?.hit?.(contextOf(w, c, op), target);
}

/**
 * An operator's attack or skill killed an enemy (职业-5): the trait's cost, then its behaviour.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function traitKill(w, c, op, target) {
  if (op.kind !== KIND.OPERATOR || target.kind !== KIND.ENEMY) return;
  const t = traitOf(c, op);
  if (t.killCost > 0) gainCost(w, c, op.owner, t.killCost);
  behaviorOf(c, op)?.kill?.(contextOf(w, c, op), target);
}

/**
 * Deals damage as an operator's attack or skill and credits a kill to it (职业-5): the target had HP before and has
 * none after. Returns the HP taken.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target @param {import('./damage.js').Damage} dmg
 */
export function creditedDamage(w, c, op, target, dmg) {
  const alive = target.hp > 0, taken = dealDamage(w, op, target, dmg);
  if (alive && target.hp <= 0) traitKill(w, c, op, target);
  return taken;
}
