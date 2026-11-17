// What a running skill lifts of its operator's trait (docs/spec/职业-8, 职业-11): the 倍率 a trait lowers for an enemy the
// operator does not block, and the damage a chain loses at each jump. The content reads the skill's description for it
// (docs/spec/skills.md 技能-9) and the skill holds a flag while it runs.
import { statsOf } from './attrs.js';
import { summonHeld } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').TraitDef} TraitDef @typedef {import('./types.js').Chain} Chain */

/**
 * The trait's 倍率 for an enemy the operator does not block, as it is now (职业-8): a skill that says its attacks are not
 * lowered (`noUnblockedScale`) lifts a 倍率 under 1 to 1; one that raises it (教官's 1.2) is left alone.
 * @param {Unit} op @param {TraitDef} tr
 */
export function unblockedScaleOf(op, tr) {
  return tr.unblockedScale < 1 && statsOf(op).flags.noUnblockedScale ? 1 : tr.unblockedScale;
}

/**
 * The trait's chain as it is now (职业-11): a skill that says the attack's damage is not lowered at each jump
 * (`noChainDecay`) keeps the whole damage at every jump.
 * @param {Unit} op @param {TraitDef} tr @returns {Chain | null}
 */
export function chainNow(op, tr) {
  return tr.chain && tr.chain.scale < 1 && statsOf(op).flags.noChainDecay ? { ...tr.chain, scale: 1 } : tr.chain;
}

/**
 * The damage type a running skill gives an attack on one target for the enemies its operator or its summon blocks (技能-9:
 * 「攻击自身与"耀阳"阻挡的单位时伤害类型变为真实」); nothing for another target, when no such skill runs, or for a skill the content
 * runs itself (技能-6: `owns` says so for a skill id).
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} t @param {(c: Content, id: string) => boolean} owns @returns {{ type?: import('./types.js').DamageType }}
 */
export function typeVsBlocked(w, c, op, t, owns) {
  const def = op.skill?.active ? c.operators[op.key]?.skill : undefined, type = def?.extra?.attack?.typeBlocked;
  if (!def || !type || owns(c, def.id)) return {};
  return t.blockedBy === op.id || summonHeld(w, op)(t) ? { type } : {};
}

/**
 * The flags a next-attack skill holds from its start to its attack (技能-9): only what it lifts of the trait — its attack lands
 * while it is armed —; the other flags are for a skill that runs. Null for none. @param {Record<string, boolean>} flags
 * @returns {Record<string, boolean> | null}
 */
export function liftedFlags(flags) {
  const held = Object.fromEntries(Object.entries(flags).filter(([k, v]) => v && (k === 'noUnblockedScale' || k === 'noChainDecay')));
  return Object.keys(held).length ? held : null;
}
