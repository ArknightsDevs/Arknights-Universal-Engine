// An operator's upkeep on the field (docs/spec/traits.md 职业-10): the HP its trait drains each second, the cost it
// consumes — a retreat when there is not enough — and the flags it is immune to while it blocks.
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { dealDamage } from './damage.js';
import { withdraw } from './deck.js';
import { emit } from './bus.js';
import { paidStack } from './riders.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./buffs.js').Behavior} Behavior */

/**
 * The upkeep buffs' behaviours (职业-10): `drain` takes its value × the maximum HP as 生命流失 (伤害-10), never the last
 * point; `upkeep` takes its value of the owner's cost — after the `merchantPay` event, whose handlers may change it or
 * cancel the payment (钩子-3) —, or withdraws the operator when there is less (撤退-1).
 * @param {Content} c @returns {Record<string, Behavior>}
 */
export function upkeepBehaviors(c) {
  return {
    drain: { tick: (w, u, b) => {
      const n = Math.min(b.value * statsOf(u).maxHp, u.hp - 1);
      if (n > 0) dealDamage(w, u, u, { type: 'true', amount: n, hpLoss: true });
    } },
    upkeep: { tick: (w, u, b) => {
      const k = emit(w, 'merchantPay', { unit: u, cost: b.value, cancel: false });
      if (k.cancel || u.hp <= 0 || !w.units.includes(u)) return;
      const p = w.players[u.owner], cost = Number.isFinite(k.cost) ? Math.max(0, k.cost) : b.value;
      if (p.cost >= cost) { p.cost -= cost; paidStack(c, u); } else withdraw(w, c, u);
    } },
  };
}

/** The most timed talents an operator has (部署-7). */
export const MAX_TIMED = 4;

/**
 * The timed talents' steps (部署-7): each `seconds`, an 'after' talent's buff takes its modifiers once; a 'stack' one's
 * goes up a step to its `max`, the modifiers × the steps.
 * @param {Content} c @returns {Record<string, Behavior>}
 */
export function timedBehaviors(c) {
  /** @type {Behavior} */
  const step = { tick: (_w, u, b) => {
    const t = c.operators[u.key]?.timedTalents?.[Number(b.key.slice(6))];
    if (!t || b.value >= t.max) return;
    const n = b.value + 1;
    retune(u, b, n, Object.fromEntries(Object.entries(t.mods).map(([k, v]) => [k, v * n])));
  } };
  return Object.fromEntries(Array.from({ length: MAX_TIMED }, (_, i) => [`timed:${i}`, step]));
}

/**
 * At the start of an operator's turn (职业-10): while it blocks an enemy, a buff `blocking` makes it immune (状态-7) to
 * the flags its trait names; when it blocks none, the buff goes.
 * @param {World} w @param {Unit} op @param {readonly string[]} flags
 */
export function blockingImmunity(w, op, flags) {
  if (flags.length === 0) return;
  const blocks = w.units.some((e) => e.blockedBy === op.id && e.hp > 0), has = op.buffs.some((b) => b.key === 'blocking');
  if (blocks && !has) addBuff(op, makeBuff({ key: 'blocking', src: op.id, flags: Object.fromEntries(flags.map((k) => [`immune:${k}`, true])) }));
  else if (!blocks && has) removeBuff(op, 'blocking');
}
