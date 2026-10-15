// Tactical points (docs/spec/summons.md 召唤-11): a summon deployed from its card onto its owner's 战术点 fights in its
// summon form; knocked out or retreated by its player, it turns into its tactical point for its time — invincible,
// undying, making no attacks, blocking nothing, unselectable, immune to 晕眩, 沉默 and 冻结, not to be retreated — and
// then comes back in its summon form at full HP.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { releaseAll } from './blocking.js';
import { setHp } from './damage.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/** The key of the buff that holds a tactical summon's form (召唤-11). */
export const TACTICAL = 'tactical';

/** What a tactical point holds (召唤-11). */
const POINT_FLAGS = Object.freeze({
  invincible: true, undying: true, noAttack: true, untargetable: true, noRetreat: true, 'immune:stun': true, 'immune:silence': true, 'immune:freeze': true,
});

/** A unit's form buff, or undefined for a unit without forms. @param {Unit} u */
const formOf = (u) => u.buffs.find((b) => b.key === TACTICAL);

/** Whether a unit is a tactical summon in its tactical point form — the form with an end (召唤-11). @param {Unit} u */
export function atPoint(u) {
  const f = formOf(u);
  return !!f && f.left >= 0;
}

/**
 * A tactical summon takes its summon form (召唤-11): its block bonus while it lasts, no end.
 * @param {Content} c @param {Unit} u
 */
export function summonForm(c, u) {
  const t = c.operators[u.key]?.summon?.tactical;
  if (!t) return;
  removeBuff(u, TACTICAL);
  addBuff(u, makeBuff({ key: TACTICAL, src: u.id, mods: t.block > 0 ? { blockCnt: t.block } : {} }));
}

/**
 * A tactical summon in its summon form turns into its tactical point (召唤-11): its form buff for its time, nothing
 * blocked, its HP at least 1. Returns whether it did — false for a unit without forms or at its point already.
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function pointForm(w, c, u) {
  const t = c.operators[u.key]?.summon?.tactical;
  if (!t || !formOf(u) || atPoint(u)) return false;
  removeBuff(u, TACTICAL);
  addBuff(u, makeBuff({ key: TACTICAL, src: u.id, left: Math.max(1, secondsToFrames(t.every)), mods: { blockCntMul: 0 }, flags: POINT_FLAGS }));
  releaseAll(w, u.id);
  if (u.hp < 1) setHp(u, 1);
  return true;
}

/**
 * Whether an operator at 0 HP stays (召唤-11, 伤害-9): a tactical summon in its summon form turns into its tactical
 * point instead of leaving.
 * @param {World} w @param {Content} c @param {Unit} u
 */
export const tacticalFatal = (w, c, u) => u.kind === KIND.OPERATOR && pointForm(w, c, u);

/**
 * The buff behaviour of the forms (召唤-11): a tactical point whose time is up comes back in its summon form at full HP.
 * @param {Content} c
 */
export const tacticalBehaviors = (c) => ({
  [TACTICAL]: { expire: (/** @type {World} */ _w, /** @type {Unit} */ u) => { summonForm(c, u); setHp(u, statsOf(u).maxHp); } },
});
