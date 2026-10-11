// The deck (待部署区, docs/spec/field.md 部署-3, 撤退-1): each operator's card holds its 再部署惩罚 and when it may be
// deployed again; the deploy cost the penalty raises; what leaving the field does — the refund of a retreat, a
// penalty layer and the 再部署时间 for a retreat or a fall alike.
import { secondsToFrames } from '@aue/math';
import { traitOfDef, gainCost } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Player} Player @typedef {import('./types.js').Card} Card */

/** The most 再部署惩罚 layers a card holds (部署-3). */
export const MAX_PENALTY = 2;
/** The 再部署时间 of an operator whose record gives none, in seconds (部署-3). */
export const DEFAULT_RESPAWN = 60;

/** A player's card for an operator: the one recorded, or a fresh one (no penalty, deployable at once). @param {Player} p @param {string} key @returns {Card} */
export const cardOf = (p, key) => (Object.hasOwn(p.cards, key) ? p.cards[key] : { penalty: 0, ready: 0 });

/**
 * The cost to deploy an operator now (部署-3): its initial cost × (1 + 0.5 × 再部署惩罚), rounded down.
 * @param {Content} c @param {Player} p @param {string} key
 */
export const deployCost = (c, p, key) => Math.floor(c.operators[key].cost * (1 + 0.5 * cardOf(p, key).penalty));

/**
 * An operator leaves the field (部署-3, 撤退-1): a retreat returns ⌊min(paid × 返还倍率, initial cost)⌋ cost; either way
 * its card gains a penalty layer (at most 2) and it may be deployed again after its 再部署时间.
 * @param {World} w @param {Content} c @param {Unit} u @param {boolean} retreated
 */
export function leaveField(w, c, u, retreated) {
  const p = w.players[u.owner], d = c.operators[u.key], card = cardOf(p, u.key);
  if (retreated) gainCost(w, c, u.owner, Math.floor(Math.min(u.paid * traitOfDef(d).refund, d.cost)));
  p.cards[u.key] = { penalty: Math.min(MAX_PENALTY, card.penalty + 1), ready: w.frame + secondsToFrames(d.respawnTime ?? DEFAULT_RESPAWN) };
  p.deployed = p.deployed.filter((k) => k !== u.key);
}
