// Statuses (docs/spec/status.md 状态-5…状态-7): the official 异常状态 as buff templates, and applying one — who it
// cannot affect, how long it lasts, and how a second cold turns into a freeze.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff */
/** @typedef {import('./attrs.js').Stats} Stats */

/**
 * A status template: its buff's rule, mods (from the status's value when they depend on it), flags, whether it is
 * resistible, whether a heavy unit halves it, and when it does not take hold at all.
 * @typedef {object} Status
 * @property {Buff['rule']} rule
 * @property {(v: number) => Record<string, number>} mods
 * @property {Record<string, boolean>} flags
 * @property {boolean} resist 可抵抗状态
 * @property {boolean} heavy 对重量大于 3 的单位持续时间减半
 * @property {number} maxStacks
 * @property {number | null} value the value when none is given; null when one must be given
 * @property {(s: Stats, u: Unit) => boolean} refuse
 */

/** @param {Partial<Status>} o @returns {Readonly<Status>} */
const status = (o) => Object.freeze({
  rule: 'queue', mods: () => ({}), flags: {}, resist: false, heavy: false, maxStacks: 1, value: 0, refuse: () => false, ...o,
});
/** @param {(v: number) => Record<string, number>} mods @returns {Partial<Status>} 效果取最高, with a value that must be given */
const valued = (mods) => ({ rule: 'max', mods, value: null });

/** The status catalogue (状态-5). Keys follow the Stronghold interface where it has one. */
export const STATUS = Object.freeze({
  stun: status({ flags: { stun: true }, resist: true }),
  cold: status({ mods: () => ({ aspd: -30 }), resist: true }),
  enemyCold: status({ mods: () => ({ aspd: -30 }), resist: true }),
  freeze: status({ flags: { freeze: true }, mods: () => ({ resFlat: -15 }), resist: true }),
  enemyFreeze: status({ flags: { freeze: true }, resist: true }),
  sleep: status({ flags: { sleep: true } }),
  root: status({ flags: { root: true } }),
  sluggish: status({ mods: () => ({ moveMul: 0.2 }) }),
  fragile: status(valued((v) => ({ dmgTakenMul: 1 + v }))),
  artsFragile: status(valued((v) => ({ artsTakenMul: 1 + v }))),
  elemFragile: status(valued((v) => ({ elementalTakenMul: 1 + v }))),
  weaken: status(valued((v) => ({ atkMul: 1 - v }))),
  buffres: status({ rule: 'max', mods: (v) => ({ statusResMul: 1 - v }), value: 0.5 }),
  levitate: status({ flags: { levitate: true }, heavy: true, refuse: (s) => s.flying }),
  groundbind: status({ flags: { groundbind: true }, heavy: true, refuse: (s) => !s.flying }),
  fear: status({ flags: { fear: true }, resist: true, refuse: (_s, u) => u.kind !== KIND.ENEMY }),
  palsy: status({ rule: 'stack', maxStacks: 3, resist: true }),
  invincible: status({ flags: { invincible: true } }),
  healFree: status({ flags: { healFree: true } }),
  silence: status({ flags: { silence: true } }),
});

/** @typedef {keyof typeof STATUS} StatusKey */

/**
 * @typedef {object} StatusOptions
 * @property {Unit | null} [src] the unit that applies it
 * @property {number} [seconds] how long, as the data writes it (no seconds and no frames: no end)
 * @property {number} [frames] how long, in frames
 * @property {number} [value] its strength, for statuses that have one
 * @property {number} [stacks] layers, for statuses that stack
 */

/** Frames from the options: given frames, or seconds converted (时间-2), or −1 for no end. @param {StatusOptions} o */
const framesOf = (o) => o.frames ?? (o.seconds === undefined ? -1 : secondsToFrames(o.seconds));

/** Whether the unit is immune to a flag (状态-7). @param {Unit} u @param {string} flag */
const immuneTo = (u, flag) => (u.base.immune ?? []).includes(flag);

/**
 * The buff a status gives (状态-5): a heavy unit (重量 > 3) halves 浮空 and 缚地 by decaying them twice as fast, its
 * weight taken when the status is applied.
 * @param {StatusKey} key @param {Unit} target @param {StatusOptions} o @returns {Buff}
 */
export function statusBuff(key, target, o = {}) {
  const t = STATUS[key], value = o.value ?? t.value;
  if (value === null) throw new RangeError(`status ${key} needs a value`);
  const heavy = t.heavy && statsOf(target).massLevel > 3;
  return makeBuff({
    key, src: o.src?.id ?? -1, rule: t.rule, value, mods: t.mods(value), flags: t.flags, stacks: o.stacks ?? 1,
    maxStacks: t.maxStacks, left: framesOf(o), resist: t.resist, decay: heavy ? 2 : 1,
  });
}

/**
 * Cold (状态-6). A friendly cold meets a friendly cold already there: the pair becomes a friendly freeze lasting the
 * longer of the two. An enemy cold on a unit with an enemy cold or freeze becomes an enemy freeze. A unit immune to
 * freezing just gets colder.
 * @param {Unit} target @param {Buff} cold @returns {Buff}
 */
function applyCold(target, cold) {
  const enemy = cold.key === 'enemyCold', freezeKey = enemy ? 'enemyFreeze' : 'freeze';
  const there = target.buffs.find((b) => b.key === cold.key || (enemy && b.key === 'enemyFreeze'));
  if (!there || immuneTo(target, 'freeze')) return addBuff(target, cold);
  const left = enemy ? cold.left : (cold.left < 0 || there.left < 0 ? -1 : Math.max(cold.left, there.left));
  if (!enemy) removeBuff(target, there);
  return addBuff(target, statusBuff(freezeKey, target, { frames: left, src: null }));
}

/**
 * Applies a status (状态-5…状态-7). Cold and freeze from an enemy are the enemy kinds. Returns the buff now in the list,
 * or null when the status does not take hold (浮空 on a flying unit, 缚地 on a ground unit, 恐惧 on a character).
 * @param {Unit} target @param {StatusKey} key @param {StatusOptions} [o] @returns {Buff | null}
 */
export function applyStatus(target, key, o = {}) {
  const fromEnemy = o.src?.kind === KIND.ENEMY;
  const k = fromEnemy && key === 'cold' ? 'enemyCold' : fromEnemy && key === 'freeze' ? 'enemyFreeze' : key;
  if (STATUS[k].refuse(statsOf(target), target)) return null;
  const b = statusBuff(k, target, o);
  if (b.left === 0) return null;
  return k === 'cold' || k === 'enemyCold' ? applyCold(target, b) : addBuff(target, b);
}
