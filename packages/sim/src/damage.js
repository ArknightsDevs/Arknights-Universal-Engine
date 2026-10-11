// Damage and healing (docs/spec/damage.md): the official formulas, then the source's damage multipliers, then the
// target's 伤判 effects one buff at a time in event priority and acquisition order, then the HP.
import { powi } from '@aue/math';
import { statsOf, activeBuffs } from './attrs.js';
import { removeBuff } from './buffs.js';
import { draw } from './rng.js';
import { MIN_DAMAGE_RATIO } from './constants.js';
import { hurtSp } from './sp.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').DamageType} DamageType */

/**
 * A hit. `amount` is the base damage (伤害-6). `pen` adds to the source's penetration for this hit. `hpLoss` makes it
 * 生命流失 (伤害-10). `canDodge` defaults to true for physical and arts damage.
 * @typedef {object} Damage
 * @property {DamageType} type
 * @property {number} amount
 * @property {{ defIgnorePct?: number, defIgnoreFlat?: number, resIgnorePct?: number, resIgnoreFlat?: number }} [pen]
 * @property {boolean} [canDodge]
 * @property {boolean} [hpLoss]
 */

/** @typedef {{ defIgnorePct: number, defIgnoreFlat: number, resIgnorePct: number, resIgnoreFlat: number }} Penetration */
/** @typedef {{ def: number, res: number, epDamageResistance: number }} Defences */

/** @param {number} x */
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Damage after the target's defences (伤害-1…伤害-5): physical max(0.05A, A − (1 − I_p)·max(0, D − I_v)); arts
 * max(0.05A, A·(1 − R′/100)) with R′ = (1 − I_p)·max(0, R − I_v); elemental max(0.05A, A·(1 − E/100)); true A.
 * @param {number} amount A @param {DamageType} type @param {Defences} t @param {Penetration} pen
 */
export function mitigate(amount, type, t, pen) {
  if (type === 'phys') {
    const eff = (1 - pen.defIgnorePct) * Math.max(0, t.def - pen.defIgnoreFlat);
    return Math.max(amount - eff, MIN_DAMAGE_RATIO * amount);
  }
  if (type === 'arts') {
    const eff = (1 - pen.resIgnorePct) * Math.max(0, t.res - pen.resIgnoreFlat);
    return Math.max(amount * (1 - eff / 100), MIN_DAMAGE_RATIO * amount);
  }
  if (type === 'elemental') return Math.max(amount * (1 - t.epDamageResistance / 100), MIN_DAMAGE_RATIO * amount);
  return amount;
}

/**
 * The penetration of a hit: the source's plus the hit's own, the ratios held to [0, 1] and the fixed values to ≥ 0
 * (属性-3).
 * @param {import('./attrs.js').Stats | null} s @param {Damage['pen']} [extra] @returns {Penetration}
 */
export function penetration(s, extra = {}) {
  /** @param {'defIgnorePct' | 'defIgnoreFlat' | 'resIgnorePct' | 'resIgnoreFlat'} k */
  const sum = (k) => (s ? s[k] : 0) + (extra[k] ?? 0);
  return {
    defIgnorePct: clamp01(sum('defIgnorePct')), defIgnoreFlat: Math.max(0, sum('defIgnoreFlat')),
    resIgnorePct: clamp01(sum('resIgnorePct')), resIgnoreFlat: Math.max(0, sum('resIgnoreFlat')),
  };
}

/** The source's damage multiplier (伤害-7 step 3). @param {import('./attrs.js').Stats} s @param {DamageType} type */
export const dealtMul = (s, type) => s.dmgDealtMul * (type === 'phys' ? s.physDealtMul : type === 'arts' ? s.artsDealtMul : 1);

/** A buff's taken multiplier for a type (伤害-8): 脆弱 covers physical, arts and true damage. @param {Buff} b @param {DamageType} type */
export function takenMul(b, type) {
  const m = b.mods, own = type === 'phys' ? m.physTakenMul : type === 'arts' ? m.artsTakenMul : type === 'true' ? m.trueTakenMul : m.elementalTakenMul;
  const all = type === 'elemental' ? undefined : m.dmgTakenMul, f = (all ?? 1) * (own ?? 1);
  return b.stacks === 1 ? f : powi(f, b.stacks);
}

/** Whether a shield or barrier of the buff absorbs this type. @param {Buff} b @param {DamageType} type */
const absorbs = (b, type) => b.shieldType === '' || b.shieldType === type;

/** A buff that is only a shield goes once it is used up. @param {Unit} u @param {Buff} b */
function dropIfSpent(u, b) {
  const empty = b.shield <= 0 && b.shieldHits <= 0 && Object.keys(b.mods).length === 0 && Object.keys(b.flags).length === 0;
  if (empty) removeBuff(u, b);
}

/**
 * One buff's 伤判 effects on a hit, in a fixed order within the buff: dodge, taken multipliers, shield, barrier
 * (伤害-8). Returns the damage left; 0 ends the step.
 * @param {World} w @param {Unit} u @param {Buff} b @param {number} amount @param {Damage} dmg
 */
function judge(w, u, b, amount, dmg) {
  const p = dmg.type === 'phys' ? b.mods.dodgePhys : dmg.type === 'arts' ? b.mods.dodgeArts : undefined;
  if (p !== undefined && p > 0 && (dmg.canDodge ?? true)) {
    const miss = 1 - powi(1 - clamp01(p), b.stacks);
    if (draw(w) < miss) return 0;
  }
  let left = amount * takenMul(b, dmg.type);
  if (b.shieldHits > 0 && absorbs(b, dmg.type)) {
    b.shieldHits--;
    dropIfSpent(u, b);
    return 0;
  }
  if (b.shield > 0 && absorbs(b, dmg.type)) {
    const take = Math.min(b.shield, left);
    b.shield -= take;
    left -= take;
    dropIfSpent(u, b);
  }
  return left;
}

/**
 * The target's 伤判 effects in turn (伤害-8): its active buffs by event priority, highest first, then acquisition order.
 * One that cancels the hit or brings it to 0 ends the step.
 * @param {World} w @param {Unit} u @param {number} amount @param {Damage} dmg
 */
export function takeDamage(w, u, amount, dmg) {
  const order = activeBuffs(u.buffs).map((b, i) => ({ b, i })).sort((x, y) => y.b.prio - x.b.prio || x.i - y.i);
  let left = amount;
  for (const { b } of order) {
    left = judge(w, u, b, left, dmg);
    if (!(left > 0)) return 0;
  }
  return left;
}

/**
 * Takes HP (伤害-9): at 0 or below the unit is at 0 and leaves the field at the end of the frame (帧-1).
 * @param {World} w @param {Unit | null} src @param {Unit} t @param {number} amount
 */
function loseHpNow(w, src, t, amount) {
  t.hp -= amount;
  if (t.hp <= 0) t.hp = 0;
  w.events.push({ type: 'hit', id: src ? src.id : -1, target: t.id, damage: amount });
  return amount;
}

/**
 * Deals a hit (伤害-7): nothing to a unit already at 0 HP; 生命流失 goes straight to the HP; nothing to an invincible
 * unit (无敌, 沉睡, disappeared: 路线-4); otherwise the hit counts for 受击回复 (技能-2), then the target's defences, the
 * source's multiplier, the target's 伤判 effects, then the HP.
 * Returns the HP taken.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {Damage} dmg
 */
export function dealDamage(w, src, target, dmg) {
  if (target.hp <= 0) return 0;
  if (dmg.hpLoss) return loseHpNow(w, src, target, dmg.amount);
  const ts = statsOf(target);
  if (ts.invincible || target.hidden) return 0;
  hurtSp(target);
  const ss = src ? statsOf(src) : null;
  let amount = mitigate(dmg.amount, dmg.type, ts, penetration(ss, dmg.pen));
  if (ss) amount *= dealtMul(ss, dmg.type);
  amount = takeDamage(w, target, amount, dmg);
  return amount > 0 ? loseHpNow(w, src, target, amount) : 0;
}

/**
 * Heals (伤害-11): the amount times the healer's 治疗倍率 and the target's 受到治疗倍率, nothing under 禁疗, never above
 * the maximum HP. Returns the HP restored.
 * @param {Unit | null} src @param {Unit} target @param {number} amount
 */
export function heal(src, target, amount) {
  if (target.hp <= 0) return 0;
  const ts = statsOf(target);
  if (ts.flags.healFree) return 0;
  const amt = amount * (src ? statsOf(src).healingDealtMul : 1) * ts.healingTakenMul;
  const actual = Math.max(0, Math.min(amt, ts.maxHp - target.hp));
  target.hp = Math.min(ts.maxHp, target.hp + actual);
  return actual;
}
