// The deck (待部署区, docs/spec/field.md 部署-3, 撤退-1): each operator's card holds its 再部署惩罚 and when it may be
// deployed again; the deploy cost the penalty raises; what leaving the field does — the refund of a retreat, a
// penalty layer and the 再部署时间 for a retreat or a fall alike.
import { secondsToFrames } from '@aue/math';
import { traitOfDef, gainCost } from './traits.js';
import { releaseAll } from './blocking.js';
import { emit } from './bus.js';
import { summonLeft, dismissSummons } from './summons.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Player} Player @typedef {import('./types.js').Card} Card */

/** The most 再部署惩罚 layers a card holds (部署-3). */
export const MAX_PENALTY = 2;
/** The 再部署时间 of an operator whose record gives none, in seconds (部署-3). */
export const DEFAULT_RESPAWN = 60;

/** A player's card for an operator: the one recorded, or a fresh one (no penalty, deployable at once). @param {Player} p @param {string} key @returns {Card} */
export const cardOf = (p, key) => (Object.hasOwn(p.cards, key) ? p.cards[key] : { penalty: 0, ready: 0 });

/**
 * Whether a deck card is held back (波次-9): its unit is one of the level's token cards hidden at first (关卡-7) and that
 * card's alias has not come into effect (波次-6). @param {World} w @param {Content} c @param {string} key the card (unit id#seat)
 */
export function cardHidden(w, c, key) {
  const id = key.split('#')[0], t = c.level.cards?.tokens.find((x) => x.key === id && x.hidden);
  return t !== undefined && !w.predefined.includes(t.alias);
}

/** A seat's deploy limit (部署-2): the level's, changed by the seat's runes (符文-2), not below 0. @param {Content} c @param {number} seat */
export const deployLimit = (c, seat) => Math.max(0, c.level.options.characterLimit + (c.level.options.characterLimitAdd?.[seat] ?? 0));

/**
 * The cost to deploy an operator now (部署-3): its initial cost × (1 + 0.5 × 再部署惩罚), rounded down.
 * @param {Content} c @param {Player} p @param {string} key
 */
export const deployCost = (c, p, key) => Math.floor(c.operators[key].cost * (1 + 0.5 * cardOf(p, key).penalty));

/**
 * An operator leaves the field (部署-3, 撤退-1): a retreat returns ⌊min(paid × 返还倍率, initial cost)⌋ cost; either way
 * its card gains a penalty layer (at most 2) and it may be deployed again after its 再部署时间. A summon has its own
 * card (召唤-4).
 * @param {World} w @param {Content} c @param {Unit} u @param {boolean} retreated
 */
export function leaveField(w, c, u, retreated) {
  if (c.operators[u.key].summon) {
    summonLeft(w, c, u);
    return;
  }
  const p = w.players[u.owner], d = c.operators[u.key], card = cardOf(p, u.key);
  if (retreated) gainCost(w, c, u.owner, Math.floor(Math.min(u.paid * traitOfDef(d).refund, d.cost)));
  p.cards[u.key] = { penalty: Math.min(MAX_PENALTY, card.penalty + 1), ready: w.frame + secondsToFrames(d.respawnTime ?? DEFAULT_RESPAWN) };
  p.deployed = p.deployed.filter((k) => k !== u.key);
}

/**
 * An operator on the field retreats (撤退-1): it leaves at once, lets go of what it blocks, takes its refund, penalty and
 * 再部署时间, and the event `retreat` tells it; its summons leave with it (召唤-5).
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function withdraw(w, c, u) {
  w.units.splice(w.units.indexOf(u), 1);
  releaseAll(w, u.id);
  leaveField(w, c, u, true);
  w.events.push({ type: 'retreat', id: u.id });
  if (u.skill?.active) emit(w, 'skillEnd', { unit: u, reason: 'death' });
  emit(w, 'death', { unit: u, reason: 'retreat', killer: null });
  dismissSummons(w, c, [u.id]);
}
