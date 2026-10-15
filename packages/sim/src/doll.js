// 替身 (docs/spec/traits.md 职业-15): a 傀儡师 brought to 0 HP in its own form does not fall. A switch — its buffs
// cleared, its HP set to its maximum, undying, invincible, 阻回, 禁疗, 孤立, no attacks, immune to 晕眩, 冻结 and 沉睡 —
// brings out its 替身, which fights for the trait's time holding 阻回 and blocking nothing (and falls at 0 HP); then a
// switch back brings its own form again. The phase is a buff, so snapshots keep it.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { releaseAll } from './blocking.js';
import { setHp } from './damage.js';
import { endSkill } from './skills.js';
import { traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/** The key of the buff that holds a 傀儡师's phase (职业-15). */
export const DOLL = 'doll';
/** The phases, as the buff's value (职业-15): switching to the 替身, the 替身, switching back. Its own form has no buff. */
export const DOLL_PHASE = Object.freeze({ IN: 1, DOLL: 2, OUT: 3 });

/** What a 傀儡师 holds while it switches (职业-15). */
const SWITCHING = Object.freeze({
  undying: true, invincible: true, noSp: true, healFree: true, isolated: true, noAllyHeal: true, noAttack: true, 'immune:stun': true, 'immune:freeze': true, 'immune:sleep': true,
});

/** A 傀儡师's phase: 0 in its own form (职业-15). @param {Unit} u */
export const dollPhase = (u) => u.buffs.find((b) => b.key === DOLL)?.value ?? 0;

/**
 * A switch clears a 傀儡师's buffs (职业-15): its running skill ends, and every buff goes but its phase and its own
 * lasting ones (its trait's, its talents' and passive skill's, which have no end).
 * @param {World} w @param {Content} c @param {Unit} u
 */
function clearBuffs(w, c, u) {
  if (u.skill?.active) endSkill(w, c, u, 'switch');
  for (const b of [...u.buffs]) if (b.key !== DOLL && !(b.src === u.id && b.left < 0)) removeBuff(u, b);
}

/**
 * A 傀儡师 enters a phase (职业-15): its buffs cleared, the phase's buff — a switch's flags for the trait's switch time, or
 * the 替身's 阻回, attack and HP for its time; nothing blocked from the switch to the 替身 until the switch back — and its
 * HP at its maximum. Back in its own form after the switch back, without a phase buff.
 * @param {World} w @param {Content} c @param {Unit} u @param {number} phase 0 for its own form
 */
function enterPhase(w, c, u, phase) {
  const d = traitOf(c, u).doll;
  if (!d) return;
  removeBuff(u, DOLL);
  clearBuffs(w, c, u);
  if (phase !== 0) {
    const doll = phase === DOLL_PHASE.DOLL, mods = /** @type {Record<string, number>} */ (phase === DOLL_PHASE.OUT ? {} : { blockCntMul: 0 });
    if (doll && d.atk) mods.atkPct = d.atk;
    if (doll && d.maxHp) mods.hpPct = d.maxHp;
    addBuff(u, makeBuff({ key: DOLL, src: u.id, value: phase, left: Math.max(1, secondsToFrames(doll ? d.duration : d.switch)), mods, flags: doll ? { noSp: true } : SWITCHING }));
  }
  if (phase !== DOLL_PHASE.OUT) releaseAll(w, u.id);
  setHp(u, statsOf(u).maxHp);
}

/**
 * Whether an operator at 0 HP stays (职业-15, 伤害-9): a 傀儡师 in its own form starts its switch to the 替身.
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function dollFatal(w, c, u) {
  if (u.kind !== KIND.OPERATOR || !traitOf(c, u).doll || dollPhase(u) !== 0) return false;
  enterPhase(w, c, u, DOLL_PHASE.IN);
  return true;
}

/**
 * The buff behaviour of the phases (职业-15): each one's end starts the next — the 替身 after the switch to it, the switch
 * back after the 替身, its own form after the switch back.
 * @param {Content} c
 */
export const dollBehaviors = (c) => ({
  [DOLL]: { expire: (/** @type {World} */ w, /** @type {Unit} */ u, /** @type {import('./types.js').Buff} */ b) => enterPhase(w, c, u, (b.value + 1) % 4) },
});
