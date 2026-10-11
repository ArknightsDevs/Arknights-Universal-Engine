// Attributes (docs/spec/attributes.md): a unit's base values, the modifiers of its active buffs, the official formula
// and bounds. statsOf is a pure function of the unit's base and buffs (ADR 0054); nothing it computes is kept in the
// state.
import { powi, secondsAtSpeedToFrames } from '@aue/math';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff @typedef {import('./types.js').Base} Base */

/**
 * One attribute: the base field it starts from, the mod keys of the four modifier kinds (直接加算, 直接乘算, 最终加算,
 * 最终乘算), the value when the base has none, and its bounds (属性-1, 属性-3).
 * @typedef {{ base: string, keys: readonly [string, string, string, string], def: number, lo: number, hi: number }} Attr
 */

/** @param {string} base @param {[string, string, string, string]} keys @param {number} def @param {number} lo @param {number} [hi] @returns {Attr} */
const attr = (base, keys, def, lo, hi = Infinity) => Object.freeze({ base, keys: Object.freeze(keys), def, lo, hi });
/** The four keys <p>Flat, <p>Pct, <p>Final, <p>Mul. @param {string} p @returns {[string, string, string, string]} */
const kinds = (p) => [`${p}Flat`, `${p}Pct`, `${p}Final`, `${p}Mul`];
/** The same where the 直接加算 key is the bare name, as in the Stronghold interface (aspd, blockCnt …). @param {string} p @returns {[string, string, string, string]} */
const bare = (p) => [p, `${p}Pct`, `${p}Final`, `${p}Mul`];

/** Every attribute, by its name in the stats (属性-1, 属性-3; names and keys follow the Stronghold content interface). */
export const ATTRS = Object.freeze({
  maxHp: attr('maxHp', ['hpFlat', 'hpPct', 'hpFinal', 'hpMul'], 1, 1),
  atk: attr('atk', kinds('atk'), 0, 0),
  def: attr('def', kinds('def'), 0, 0),
  res: attr('res', kinds('res'), 0, 0, 100),
  aspd: attr('aspd', bare('aspd'), 100, 20),
  bat: attr('bat', kinds('bat'), 1, 0),
  blockCnt: attr('blockCnt', bare('blockCnt'), 0, 0),
  moveSpeed: attr('moveSpeed', kinds('move'), 1, 0.1),
  taunt: attr('tauntLevel', bare('taunt'), 0, -2, 2),
  massLevel: attr('massLevel', kinds('mass'), 0, -Infinity),
  spRecovery: attr('spRecovery', kinds('spRecovery'), 1, 0),
  hpRecoveryPerSec: attr('hpRecoveryPerSec', bare('hpRegen'), 0, 0),
  rangeExtend: attr('rangeExtend', bare('rangeExtend'), 0, -Infinity),
  defIgnorePct: attr('defIgnorePct', bare('defIgnorePct'), 0, 0, 1),
  defIgnoreFlat: attr('defIgnoreFlat', bare('defIgnoreFlat'), 0, 0),
  resIgnorePct: attr('resIgnorePct', bare('resIgnorePct'), 0, 0, 1),
  resIgnoreFlat: attr('resIgnoreFlat', bare('resIgnoreFlat'), 0, 0),
  statusRes: attr('statusRes', kinds('statusRes'), 1, 0.001, 1000),
  epDamageResistance: attr('epDamageResistance', kinds('epDmgRes'), 0, 0, 100),
  epResistance: attr('epResistance', kinds('epRes'), 0, 0, 100),
  maxEp: attr('maxEp', kinds('maxEp'), 1000, 0),
});

/**
 * Mod keys the damage step reads from each buff in turn (伤害-8), so they are not summed into the stats: the taken
 * multipliers of 脆弱 and the like, and dodging.
 */
export const JUDGE_KEYS = Object.freeze(['dmgTakenMul', 'physTakenMul', 'artsTakenMul', 'trueTakenMul', 'elementalTakenMul', 'dodgePhys', 'dodgeArts']);

/** Multipliers kept as products besides the attributes' own (属性-2): the source's and the healer's (伤害-7, 伤害-11). */
const CHANNELS = Object.freeze(['dmgDealtMul', 'physDealtMul', 'artsDealtMul', 'healingDealtMul', 'healingTakenMul', 'epTakenMul']);

/** Each attribute key's kind: 0 直接加算, 1 直接乘算, 2 最终加算, 3 最终乘算. */
const KIND_OF = new Map(Object.values(ATTRS).flatMap((a) => a.keys.map((k, i) => /** @type {[string, number]} */ ([k, i]))));
const JUDGE = new Set(JUDGE_KEYS);

/** A product key: an attribute's 最终乘算, or any other key ending in "Mul" (属性-2). @param {string} k */
const isProduct = (k) => (KIND_OF.has(k) ? KIND_OF.get(k) === 3 : k.endsWith('Mul'));

/** The strength of a buff under 效果取最高 (状态-2). @param {Buff} b */
const strength = (b) => Math.abs(b.value);

/**
 * The buffs that take effect (状态-2): of the buffs sharing a key, the earliest (rule "queue") or the strongest, the
 * earliest of equals (rule "max"); every "independent" one.
 * @param {readonly Buff[]} buffs in acquisition order @returns {Buff[]} in acquisition order
 */
export function activeBuffs(buffs) {
  /** @type {Map<string, Buff>} */
  const pick = new Map();
  for (const b of buffs) {
    if (b.rule === 'independent') continue;
    const cur = pick.get(b.key);
    if (!cur || (b.rule === 'max' && strength(b) > strength(cur))) pick.set(b.key, b);
  }
  return buffs.filter((b) => b.rule === 'independent' || pick.get(b.key) === b);
}

/**
 * The sums, products and flags of the given buffs' modifiers (属性-2): buffs in order, each buff's mods in the order they
 * were written; n stacks add n × v and multiply by vⁿ. The damage step's own keys are left out.
 * @param {readonly Buff[]} buffs
 * @returns {{ sum: Record<string, number>, prod: Record<string, number>, flags: Record<string, boolean> }}
 */
export function aggregate(buffs) {
  /** @type {Record<string, number>} */
  const sum = {};
  /** @type {Record<string, number>} */
  const prod = {};
  /** @type {Record<string, boolean>} */
  const flags = {};
  for (const b of buffs) {
    const st = b.stacks;
    for (const [k, v] of Object.entries(b.mods)) {
      if (JUDGE.has(k) || !Number.isFinite(v)) continue;
      if (isProduct(k)) prod[k] = (prod[k] ?? 1) * (st === 1 ? v : powi(v, st));
      else sum[k] = (sum[k] ?? 0) + v * st;
    }
    for (const [k, on] of Object.entries(b.flags)) if (on) flags[k] = true;
  }
  return { sum, prod, flags };
}

/**
 * One attribute's value: clamp(F_t × [(A + D_p) × max(0, 1 + D_t) + F_p], lo, hi) (属性-1, 属性-3).
 * @param {Attr} a @param {Partial<Base>} base @param {Record<string, number>} sum @param {Record<string, number>} prod
 */
export function attrValue(a, base, sum, prod) {
  const [kp, kt, kf, km] = a.keys, b = /** @type {Record<string, unknown>} */ (base)[a.base];
  const A = typeof b === 'number' ? b : a.def;
  const inner = (A + (sum[kp] ?? 0)) * Math.max(0, 1 + (sum[kt] ?? 0)) + (sum[kf] ?? 0);
  return Math.min(a.hi, Math.max(a.lo, inner * (prod[km] ?? 1)));
}

/**
 * The attack interval in seconds, T₀ / (clamp(S, 10, 600) / 100) (属性-5), written as T₀ × 100 / clamp(S, 10, 600).
 * @param {number} bat @param {number} aspd
 */
export const intervalSeconds = (bat, aspd) => (bat * 100) / Math.min(600, Math.max(10, aspd));

/** The attack interval in whole frames, exact on the decimals of T₀ and S (属性-5). @param {number} bat @param {number} aspd */
export const intervalFrames = (bat, aspd) => secondsAtSpeedToFrames(bat, Math.min(600, Math.max(10, aspd)));

/**
 * @typedef {Record<keyof typeof ATTRS, number> & {
 *   interval: number,
 *   dmgDealtMul: number, physDealtMul: number, artsDealtMul: number, healingDealtMul: number, healingTakenMul: number, epTakenMul: number,
 *   flags: Record<string, boolean>, flying: boolean, invincible: boolean, disabled: boolean, immobile: boolean,
 *   sum: Record<string, number>, prod: Record<string, number>
 * }} Stats
 */

/**
 * The flags of the active buffs a unit is not immune to, and what they add up to (状态-5, 状态-7): flying (浮空 lifts,
 * 缚地 grounds), invincible (无敌, 沉睡), disabled (cannot attack or use skills) and immobile.
 * @param {Partial<Base>} base @param {Record<string, boolean>} raw
 */
function flagsOf(base, raw) {
  const immune = new Set(base.immune ?? []);
  /** @type {Record<string, boolean>} */
  const flags = {};
  for (const k of Object.keys(raw)) if (!immune.has(k)) flags[k] = true;
  const flying = flags.levitate ? true : flags.groundbind ? false : base.motion === 'FLY';
  const disabled = !!(flags.stun || flags.freeze || flags.sleep || flags.levitate || flags.palsyShake);
  return { flags, flying, invincible: !!(flags.invincible || flags.sleep), disabled, immobile: disabled || !!(flags.root || flags.groundbind) };
}

/**
 * A unit's stats: every attribute, the attack interval, the damage and healing multipliers, the flags (ADR 0054).
 * @param {Pick<Unit, 'base' | 'buffs'>} u @returns {Stats}
 */
export function statsOf(u) {
  const { sum, prod, flags } = aggregate(activeBuffs(u.buffs));
  /** @type {Record<string, number>} */
  const v = {};
  for (const [name, a] of Object.entries(ATTRS)) v[name] = attrValue(a, u.base, sum, prod);
  /** @type {Record<string, number>} */
  const ch = {};
  for (const k of CHANNELS) ch[k] = prod[k] ?? 1;
  const s = /** @type {Stats} */ ({ ...v, ...ch, ...flagsOf(u.base, flags), sum, prod });
  s.interval = intervalSeconds(s.bat, s.aspd);
  return s;
}
