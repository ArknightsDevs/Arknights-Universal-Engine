// 替身 (docs/spec/traits.md 职业-15, 职业-16): a 傀儡师 brought to 0 HP in its own form does not fall. A switch — its
// buffs cleared, its HP set to its maximum, undying, invincible, 阻回, 禁疗, 孤立, no attacks, immune to 晕眩, 冻结 and
// 沉睡 — brings out its 替身, which fights for the trait's time holding 阻回 and blocking nothing (and falls at 0 HP) —
// not attacking when its talent says so, its aura's hits each second —; then a switch back brings its own form again.
// The phase is a buff, so snapshots keep it.
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { releaseAll } from './blocking.js';
import { setHp } from './damage.js';
import { endSkill } from './skills.js';
import { traitOf, creditedDamage, DOLL, DOLL_PHASE, dollPhase } from './traits.js';
import { reachKeys } from './reach.js';
import { inKeys, hostile } from './targeting.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

export { DOLL, DOLL_PHASE, dollPhase };

/** What a 傀儡师 holds while it switches (职业-15). */
const SWITCHING = Object.freeze({
  undying: true, invincible: true, noSp: true, healFree: true, isolated: true, noAllyHeal: true, noAttack: true, 'immune:stun': true, 'immune:freeze': true, 'immune:sleep': true,
});

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
 * A phase's modifiers (职业-15, 职业-16): 阻挡数 × 0 but while switching back; the 替身's attack, HP and the damage it takes.
 * @param {import('./types.js').Doll} d @param {number} phase @returns {Record<string, number>}
 */
function phaseMods(d, phase) {
  const mods = /** @type {Record<string, number>} */ (phase === DOLL_PHASE.OUT ? {} : { blockCntMul: 0 });
  if (phase !== DOLL_PHASE.DOLL) return mods;
  if (d.atk) mods.atkPct = d.atk;
  if (d.maxHp) mods.hpPct = d.maxHp;
  if (d.taken !== undefined) { mods.physTakenMul = d.taken; mods.artsTakenMul = d.taken; }
  return mods;
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
    const doll = phase === DOLL_PHASE.DOLL, mods = phaseMods(d, phase);
    const flags = doll ? { noSp: true, ...(d.attack === false ? { noAttack: true } : {}) } : SWITCHING;
    addBuff(u, makeBuff({ key: DOLL, src: u.id, value: phase, left: Math.max(1, secondsToFrames(doll ? d.duration : d.switch)), every: doll && d.aura ? FPS : 0, mods, flags }));
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
 * A 替身's aura hits once (职业-16): `scale` × its attack now as arts damage to every ground enemy in its range, in
 * creation order, as its own damage (a kill is its, 职业-5).
 * @param {World} w @param {Content} c @param {Unit} u
 */
function auraHits(w, c, u) {
  const a = traitOf(c, u).doll?.aura;
  if (!a || dollPhase(u) !== DOLL_PHASE.DOLL) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, u), amount = statsOf(u).atk * a.scale;
  const foes = w.units.filter((e) => hostile(e) && e.hp > 0 && !statsOf(e).flying && inKeys(e, keys, grid));
  for (const e of foes) creditedDamage(w, c, u, e, { type: 'arts', amount });
}

/**
 * The buff behaviour of the phases (职业-15, 职业-16): each one's end starts the next — the 替身 after the switch to it,
 * the switch back after the 替身, its own form after the switch back —; each second of a 替身 with an aura, its hits.
 * @param {Content} c
 */
export const dollBehaviors = (c) => ({
  [DOLL]: {
    expire: (/** @type {World} */ w, /** @type {Unit} */ u, /** @type {import('./types.js').Buff} */ b) => enterPhase(w, c, u, (b.value + 1) % 4),
    tick: (/** @type {World} */ w, /** @type {Unit} */ u) => auraHits(w, c, u),
  },
});
