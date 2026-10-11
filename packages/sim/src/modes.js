// Attack modes (docs/spec/traits.md 职业-12): attacks only while the skill runs, modifiers while it does not, an attack
// bonus that builds up while it does not, heals instead of attacks while it runs, bullets that are reloaded, attack
// energy stored when there is no target, and heals that also restore element values.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf, intervalFrames } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune, count } from './buffs.js';
import { ELEMENTS, epOf, currentElement } from './elements.js';
import { precisionKey, insertionSort } from './targeting.js';
import { traitOf } from './traits.js';
import { launch } from './swing.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Buff} Buff @typedef {import('./skills.js').AttackMods} AttackMods */

/** A unit's buff of a key, or null. @param {Unit} u @param {string} key @returns {Buff | null} */
const held = (u, key) => u.buffs.find((b) => b.key === key) ?? null;

/** Whether an operator's skill runs. @param {Unit} op */
const inSkill = (op) => !!op.skill && op.skill.active;

/** Whether an operator may make a normal attack now (职业-12): not one that attacks only while its skill runs, while it does not. @param {Content} c @param {Unit} op */
export const mayAttack = (c, op) => !traitOf(c, op).attackInSkill || inSkill(op);

/** Whether an operator's normal attacks heal now (职业-2, 职业-12): a healer's always, a skill healer's while the skill runs. @param {Content} c @param {Unit} op */
export function healsNow(c, op) {
  const t = traitOf(c, op);
  return t.heal || (t.skillHeal > 0 && inSkill(op));
}

/**
 * The buffs an operator's mode starts with at deployment (职业-12): full bullets, no stored energy, the charge, and the
 * modifiers while its skill does not run (it does not at deployment).
 * @param {Unit} op @param {import('./types.js').TraitDef} t
 */
export function modeDeploy(op, t) {
  if (t.bullets) addBuff(op, makeBuff({ key: 'bullets', src: op.id, value: t.bullets.max }));
  if (t.store > 0) addBuff(op, makeBuff({ key: 'energy', src: op.id }));
  if (t.charge) addBuff(op, makeBuff({ key: 'charge', src: op.id, every: secondsToFrames(1), fixed: true }));
  skillIdle(op, t);
}

/**
 * The modifiers while an operator's skill does not run (职业-12): a buff `idle` while it does not, none while it does.
 * At the start of the operator's turn, after its skill's.
 * @param {Unit} op @param {import('./types.js').TraitDef} t
 */
export function skillIdle(op, t) {
  if (Object.keys(t.idleMods).length === 0) return;
  const has = !!held(op, 'idle');
  if (!inSkill(op) && !has) addBuff(op, makeBuff({ key: 'idle', src: op.id, mods: t.idleMods }));
  else if (inSkill(op) && has) removeBuff(op, 'idle');
}

/**
 * The frames an operator's turn is spent on something other than an attack (职业-12), or 0: a reload — one bullet, for
 * its base attack interval — when it has no bullet, or has room for one and no target; a store of attack energy —
 * one, for its attack interval — when it has no target and room for one.
 * @param {Content} c @param {Unit} op @param {boolean} target whether it has a target
 */
export function holdFrames(c, op, target) {
  const t = traitOf(c, op), bullets = held(op, 'bullets'), energy = held(op, 'energy');
  if (t.bullets && bullets && bullets.value < t.bullets.max && (bullets.value === 0 || !target)) {
    retune(op, bullets, bullets.value + 1, {});
    return Math.max(1, secondsToFrames(op.base.bat));
  }
  if (energy && !target && energy.value < t.store) {
    retune(op, energy, energy.value + 1, {});
    const s = statsOf(op);
    return intervalFrames(s.bat, s.aspd);
  }
  return 0;
}

/**
 * An attack's mods as the operator's mode makes them (职业-12): a bullet spent and its 倍率; heals, at the skill
 * healer's 倍率, while a skill healer's skill runs.
 * @param {Content} c @param {Unit} op @param {AttackMods} mods @returns {AttackMods}
 */
export function modeMods(c, op, mods) {
  const t = traitOf(c, op), bullets = held(op, 'bullets');
  let out = mods;
  if (t.bullets && bullets) {
    retune(op, bullets, bullets.value - 1, {});
    out = { ...out, scale: out.scale * t.bullets.scale };
  }
  if (!t.heal && t.skillHeal > 0 && inSkill(op)) out = { ...out, heal: true, scale: out.scale * t.skillHeal };
  return out;
}

/**
 * The stored energy goes with an attack that lands (职业-12): each unit a projectile of the operator's attack as arts
 * damage at the first target; then none is left.
 * @param {World} w @param {Unit} a @param {Unit} t
 */
export function releaseEnergy(w, a, t) {
  const energy = held(a, 'energy');
  if (!energy || energy.value === 0) return;
  const amount = statsOf(a).atk;
  for (let k = 0; k < energy.value; k++) launch(w, a, t, { type: 'arts', amount, times: 1, element: '', ep: 0 });
  retune(a, energy, 0, {});
}

/** Whether a unit has element values below their maximum. @param {Unit} u */
const epDamaged = (u) => ELEMENTS.some((el) => epOf(u, el) < statsOf(u).maxEp);

/**
 * A healer's candidates in order (职业-2, 职业-12): those not at full HP by 生命比例 (at 0.001); one that also restores
 * element values takes those with element damage too, then by the value of their 当前损伤元素.
 * @param {Content} c @param {Unit} op @param {Unit[]} cands @returns {Unit[]}
 */
export function healOrder(c, op, cands) {
  const ep = traitOf(c, op).epHeal > 0;
  const lowest = (/** @type {Unit} */ u) => { const el = currentElement(u); return el ? epOf(u, el) : Infinity; };
  const rows = cands.filter((u) => u.hp < u.maxHp || (ep && epDamaged(u))).map((u) => ({ u, k: precisionKey(u.hp / u.maxHp, 0.001), e: ep ? lowest(u) : 0 }));
  return insertionSort(rows, (a, b) => a.k - b.k || a.e - b.e).map((r) => r.u);
}

/**
 * The charge's behaviour (职业-12): each second its skill does not run it gains a step, up to its trait's steps, each
 * step the share of its attack bonus; while the skill runs it holds; the first second after it ran, it is back at 0.
 * @param {Content} c @returns {import('./buffs.js').Behavior}
 */
export function chargeBehavior(c) {
  return {
    tick: (_w, u, b) => {
      const ch = traitOf(c, u).charge;
      if (!ch || u.kind !== KIND.OPERATOR) return;
      if (inSkill(u)) { if (b.n === 0) count(b, 1); return; }
      if (b.n > 0) { count(b, -b.n); retune(u, b, 0, {}); return; }
      const n = Math.min(b.value + 1, ch.steps);
      retune(u, b, n, { atkPct: (ch.atk * n) / ch.steps });
    },
  };
}
