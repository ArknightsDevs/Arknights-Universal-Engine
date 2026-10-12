// Damage and healing (docs/spec/damage.md): the official formulas, then the source's damage multipliers, then the
// target's 伤判 effects one buff at a time in event priority and acquisition order, then the HP; the hook events on the
// way (钩子-3).
import { powi, FPS } from '@aue/math';
import { statsOf, activeBuffs } from './attrs.js';
import { removeBuff } from './buffs.js';
import { draw } from './rng.js';
import { MIN_DAMAGE_RATIO } from './constants.js';
import { hurtSp } from './sp.js';
import { emit, hasHook } from './bus.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').DamageType} DamageType */

/**
 * A hit, with the names of the Stronghold-compatible content interface (ADR 0012). `amount` is the base damage (伤害-6);
 * `mul` multiplies it after the defences and `cancel` stops it — both a `hit` handler's (钩子-3); the four ignore values
 * add to the source's penetration for this hit. Where it comes from: `isAttack` (an attack's hit), `isSkill` (made while
 * the skill runs or by it), `isSplash`, `isProjectile`, `tags`. `hpLoss` makes it 生命流失 (伤害-10). `canDodge` defaults
 * to true for physical and arts damage.
 * @typedef {object} Damage
 * @property {DamageType} type
 * @property {number} amount
 * @property {number} [mul]
 * @property {boolean} [cancel]
 * @property {number} [defIgnorePct] @property {number} [defIgnoreFlat] @property {number} [resIgnorePct] @property {number} [resIgnoreFlat]
 * @property {boolean} [isAttack] @property {boolean} [isSkill] @property {boolean} [isSplash] @property {boolean} [isProjectile]
 * @property {string[]} [tags]
 * @property {boolean} [canDodge]
 * @property {boolean} [hpLoss]
 * @property {boolean} [sourceless] 无来源 though credited to its source: the events see no source, the kill is its source's,
 *   without the source's penetration and multiplier (伤害-7)
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
 * @param {import('./attrs.js').Stats | null} s @param {Partial<Penetration>} [extra] the hit's own (a Damage) @returns {Penetration}
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
 * Sets what a buff's shield holds (content that changes it, 伤害-8): at least 0; a buff that is only a used-up shield goes.
 * @param {Unit} u @param {Buff} b @param {number} amount
 */
export function setShield(u, b, amount) {
  b.shield = Math.max(0, Number(amount) || 0);
  if (b.shield === 0) dropIfSpent(u, b);
}

/**
 * One buff's 伤判 effects on a hit, in a fixed order within the buff: dodge, taken multipliers, shield, barrier
 * (伤害-8). Returns the damage left — 0 ends the step, −1 when the hit is dodged.
 * @param {World} w @param {Unit} u @param {Buff} b @param {number} amount @param {Damage} dmg
 */
function judge(w, u, b, amount, dmg) {
  const p = dmg.type === 'phys' ? b.mods.dodgePhys : dmg.type === 'arts' ? b.mods.dodgeArts : undefined;
  if (p !== undefined && p > 0 && (dmg.canDodge ?? true)) {
    const miss = 1 - powi(1 - clamp01(p), b.stacks);
    if (draw(w) < miss) return -1;
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
 * One that cancels the hit or brings it to 0 ends the step; a dodge is the `dodge` event (钩子-3).
 * @param {World} w @param {Unit} u @param {number} amount @param {Damage} dmg @param {Unit | null} [src]
 */
export function takeDamage(w, u, amount, dmg, src = null) {
  const order = activeBuffs(u.buffs).map((b, i) => ({ b, i })).sort((x, y) => y.b.prio - x.b.prio || x.i - y.i);
  let left = amount;
  for (const { b } of order) {
    left = judge(w, u, b, left, dmg);
    if (left < 0) emit(w, 'dodge', { source: src, target: u, dmg });
    if (!(left > 0)) return 0;
  }
  return left;
}

/** The source a hit's events show (钩子-3): none for a `sourceless` one (伤害-7). @param {Unit | null} src @param {Damage} dmg */
const seenOf = (src, dmg) => (dmg.sourceless ? null : src);

/**
 * Takes HP (伤害-9): at 0 or below the unit is at 0 and leaves the field at the end of the frame (帧-1) — unless a
 * `fatal` handler prevents it (钩子-3): then it keeps 1 HP (its maximum when below 1). Then the `damaged` event. The
 * hit counts as its source's (the kill's), also when the events see none.
 * @param {World} w @param {Unit | null} src @param {Unit} t @param {number} amount @param {Damage} dmg
 */
function loseHp(w, src, t, amount, dmg) {
  const seen = seenOf(src, dmg);
  t.hp -= amount;
  if (t.hp <= 0) {
    t.hp = 0;
    const saved = hasHook(w, 'fatal') && emit(w, 'fatal', { unit: t, source: seen, credit: src, dmg, amount, prevented: false }).prevented;
    if (saved && t.hp < 1) t.hp = Math.min(1, statsOf(t).maxHp);
  }
  w.events.push({ type: 'hit', id: src ? src.id : -1, target: t.id, damage: amount });
  if (hasHook(w, 'damaged')) emit(w, 'damaged', { source: seen, credit: src, target: t, amount, type: dmg.type, dmg });
  return amount;
}

/** A hit's fields the events show, filled in (钩子-3): `mul` 1, no `tags`, not cancelled, no penetration. @param {Damage} dmg */
function settle(dmg) {
  dmg.mul ??= 1;
  dmg.tags ??= [];
  dmg.cancel ??= false;
  dmg.defIgnorePct ??= 0;
  dmg.defIgnoreFlat ??= 0;
  dmg.resIgnorePct ??= 0;
  dmg.resIgnoreFlat ??= 0;
}

/**
 * The `hit` event before the defences (钩子-3): whether the hit goes on — not cancelled, the target still on the field
 * with HP, not made invincible by a handler.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {Damage} dmg
 */
function hitGoesOn(w, src, target, dmg) {
  if (!hasHook(w, 'hit')) return true;
  emit(w, 'hit', { source: seenOf(src, dmg), credit: src, target, dmg });
  return !dmg.cancel && target.hp > 0 && w.units.includes(target) && !statsOf(target).invincible;
}

/**
 * The `hpDamage` event after the 伤判 effects (钩子-3): a handler may lower what reaches the HP, never raise it.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {number} amount @param {Damage} dmg
 */
function hpDamage(w, src, target, amount, dmg) {
  if (!(amount > 0) || !hasHook(w, 'hpDamage')) return amount;
  const k = emit(w, 'hpDamage', { source: seenOf(src, dmg), credit: src, target, amount, dmg });
  return Number.isFinite(k.amount) ? Math.max(0, Math.min(amount, k.amount)) : amount;
}

/**
 * Every unit's 生命回复 this frame (属性-6): one on the field with HP below its maximum regains its 生命回复速度 ÷ 30,
 * up to the maximum. It is not a heal: no event, no healing multipliers, 禁疗 does not stop it.
 * @param {World} w
 */
export function regenAll(w) {
  for (const u of w.units) {
    if (u.hp <= 0) continue;
    const s = statsOf(u);
    if (s.hpRecoveryPerSec > 0 && u.hp < s.maxHp) u.hp = Math.min(s.maxHp, u.hp + s.hpRecoveryPerSec / FPS);
  }
}

/**
 * Deals a hit (伤害-7): nothing to a unit already at 0 HP; 生命流失 goes straight to the HP; nothing to an invincible
 * unit (无敌, 沉睡, disappeared: 路线-4); otherwise the `hit` event, then the hit counts for 受击回复 (技能-2), then the
 * target's defences, `mul`, the source's multiplier, the target's 伤判 effects, the `hpDamage` event, then the HP. A
 * `sourceless` hit takes neither its source's penetration nor its multiplier, and its events see no source (`credit`
 * names it). Returns the HP taken.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {Damage} dmg
 */
export function dealDamage(w, src, target, dmg) {
  if (target.hp <= 0) return 0;
  settle(dmg);
  if (dmg.hpLoss) return loseHp(w, src, target, dmg.amount, dmg);
  if (statsOf(target).invincible || target.hidden || !hitGoesOn(w, src, target, dmg)) return 0;
  hurtSp(target);
  const seen = seenOf(src, dmg), ss = seen ? statsOf(seen) : null;
  let amount = mitigate(dmg.amount, dmg.type, statsOf(target), penetration(ss, dmg)) * /** @type {number} */ (dmg.mul);
  if (ss) amount *= dealtMul(ss, dmg.type);
  amount = hpDamage(w, src, target, takeDamage(w, target, amount, dmg, seen), dmg);
  return amount > 0 ? loseHp(w, src, target, amount, dmg) : 0;
}

/**
 * Heals (伤害-11): the amount times the healer's 治疗倍率 and the target's 受到治疗倍率, nothing under 禁疗, never above
 * the maximum HP; a `heal` handler may change the amount before it is applied (钩子-3). A unit no ally may heal
 * (`noAllyHeal`, 职业-9) takes heals only from itself, and those even under 禁疗. Returns the HP restored.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {number} amount
 */
export function heal(w, src, target, amount) {
  if (target.hp <= 0) return 0;
  const ts = statsOf(target), own = src === target && ts.flags.noAllyHeal === true;
  if ((ts.flags.noAllyHeal && src !== target) || (ts.flags.healFree && !own)) return 0;
  let amt = amount * (src ? statsOf(src).healingDealtMul : 1) * ts.healingTakenMul;
  if (hasHook(w, 'heal')) {
    const k = emit(w, 'heal', { source: src, target, amount: amt });
    amt = Number.isFinite(k.amount) ? Math.max(0, k.amount) : 0;
    if (target.hp <= 0 || !w.units.includes(target)) return 0;
  }
  const actual = Math.max(0, Math.min(amt, ts.maxHp - target.hp));
  target.hp = Math.min(ts.maxHp, target.hp + actual);
  return actual;
}
