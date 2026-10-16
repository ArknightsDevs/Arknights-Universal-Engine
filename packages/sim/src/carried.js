// Carried units (docs/spec/devices.md 装置-6, docs/spec/runes.md 符文-6): what a carried unit's deployment does — for
// every operator on the field then, modifiers or a barrier for a time; damage to every enemy; every redeploying
// operator card ready at once; and a spray that gives SP to operators at random, a shot every interval.
import { KIND } from '@aue/schema';
import { secondsToFrames } from '@aue/math';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { dealDamage } from './damage.js';
import { gainSp } from './sp.js';
import { draw } from './rng.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/** The operators a carried unit's effect reaches: those on the field, not carried units or other devices (装置-6). @param {World} w @param {Content} c */
const reached = (w, c) => w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && c.operators[u.key]?.profession !== 'TRAP');

/** Every player's redeploying operator cards ready now (混乱烟花箱, 装置-6); summon cards as they are. @param {World} w @param {Content} c */
function readyCards(w, c) {
  for (const p of w.players) {
    for (const [key, card] of Object.entries(p.cards)) if (!c.operators[key]?.summon && card.ready > w.frame) p.cards[key] = { ...card, ready: w.frame };
  }
}

/**
 * A carried unit's deployment (装置-6), after its deployment talents: its buff `carried:<key>` on each operator on the
 * field, its damage to each enemy but the neutral ones, the cards made ready, its spray started (a buff `spray` on it
 * with the shots left).
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function carriedDeploy(w, c, u) {
  const e = c.operators[u.key]?.carried;
  if (!e) return;
  const left = e.seconds !== undefined ? secondsToFrames(e.seconds) : undefined;
  if (e.allyMods || e.barrier) for (const op of reached(w, c)) addBuff(op, makeBuff({ key: `carried:${u.key}`, src: u.id, left, mods: e.allyMods ?? {}, shield: e.barrier ?? 0 }));
  if (e.enemyDamage) {
    const enemies = w.units.filter((x) => x.kind === KIND.ENEMY && x.hp > 0 && x.base.neutral !== true);
    for (const t of enemies) dealDamage(w, u, t, { type: e.enemyDamage.type, amount: e.enemyDamage.amount }, c);
  }
  if (e.readyCards) readyCards(w, c);
  if (e.spray) addBuff(u, makeBuff({ key: 'spray', src: u.id, every: Math.max(1, secondsToFrames(e.spray.every)), fixed: true, value: e.spray.shots }));
}

/**
 * The spray's shots (装置-6): each one picks up to its targets among the operators on the field, at random and none
 * twice, and gives each its SP; after the last shot the buff goes.
 * @param {Content} c @returns {Record<string, import('./buffs.js').Behavior>}
 */
export function carriedBehaviors(c) {
  return {
    spray: { tick: (w, u, b) => {
      const s = c.operators[u.key]?.carried?.spray;
      if (!s || b.value <= 0) { removeBuff(u, b); return; }
      const pool = reached(w, c);
      for (let i = 0; i < s.targets && pool.length > 0; i++) {
        const t = pool.splice(Math.floor(draw(w) * pool.length), 1)[0];
        if (t.skill) gainSp(t.skill, s.sp);
      }
      if (b.value <= 1) removeBuff(u, b);
      else retune(u, b, b.value - 1, b.mods);
    } },
  };
}
