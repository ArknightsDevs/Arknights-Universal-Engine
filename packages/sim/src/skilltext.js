// What a skill's description does besides its attacks (docs/spec/skills.md 技能-14): a counter while it runs, a barrier
// gained as it starts, a burst at the end — and at the start, 技能-16: strike.js —, a self-stun at the end, a non-medic healing a
// friendly unit.
// A skill id that already has its own behaviour is left alone (技能-6): doing it again would stack. One that only says when the
// skill starts (a `trigger`) has no effect of its own, so it is not left alone.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { addBuff, count, makeBuff, removeBuff, retune, stamp } from './buffs.js';
import { heal, setShield } from './damage.js';
import { dealEpFrom } from './elements.js';
import { reachKeys } from './reach.js';
import { ownsSkill, statMods, STAT_KEYS } from './skills.js';
import { strikeOn } from './strike.js';
import { inflict } from './status.js';
import { inKeys, rangeKeys, sortHealTargets } from './targeting.js';
import { creditedDamage } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Buff} Buff */
/** @typedef {import('./types.js').SkillDef} SkillDef */
/** @typedef {NonNullable<SkillDef['extra']>} Extra */
/** @typedef {NonNullable<Extra['counter']>} Counter */
/** @typedef {NonNullable<Extra['barrier']>} Barrier */
/** @typedef {NonNullable<Extra['allyHeal']>} AllyHeal */

/** Distance squared of 「周围」 when the description gives no tiles (技能-14): 1.5 × 1.5. */
const NEAR = 1.5 * 1.5;

/** @param {Content} c @param {Unit} op @returns {SkillDef | null} */
const defOf = (c, op) => c.operators[op.key]?.skill ?? null;


/** @param {Content} c */
const gridOf = (c) => ({ rows: c.level.height, cols: c.level.width });

/** The barrier's capacity steps down once a second (技能-14). */
const DECAY_EVERY = secondsToFrames(1);

/**
 * The barrier as the skill starts (技能-14), after the skill's own stat buff so the maximum HP already includes it.
 * A decaying one has a capacity that falls evenly to 0 over its seconds and is worked out once a second (see the
 * `skillBarrierDecay` behaviour below).
 * @param {Unit} op @param {Barrier} b
 */
function giveBarrier(op, b) {
  const max = statsOf(op).maxHp;
  const shield = b.cap !== undefined ? Math.min(max * b.ratio, max * b.cap) : max * b.ratio;
  removeBuff(op, 'skillBarrier');
  const decay = b.decay === true && b.seconds > 0;
  addBuff(op, makeBuff({
    key: 'skillBarrier', src: op.id, shield, shieldType: b.type === 'phys' ? 'phys' : '',
    left: b.seconds > 0 ? secondsToFrames(b.seconds) : -1, ...(b.tied ? { tag: 'tied' } : {}),
    ...(decay ? { act: 'skillBarrierDecay', every: DECAY_EVERY, fixed: true, value: b.seconds } : {}),
  }));
}

/**
 * What is left of a decaying barrier's capacity after `step` seconds of its `seconds` (技能-14): the share of the total.
 * @param {number} seconds @param {number} step
 */
const capacityAt = (seconds, step) => Math.max(0, 1 - step / seconds);

/**
 * One second of a barrier's decay (技能-14): its capacity — the total × `capacityAt` — steps down, and what is left of the
 * barrier changes by the same share, as a barrier that took damage keeps its place in the capacity. `value` is the seconds it
 * decays over, `n` the steps taken.
 * @param {World} _w @param {Unit} u @param {Buff} b
 */
function decayBarrier(_w, u, b) {
  const was = capacityAt(b.value, b.n);
  count(b, 1);
  if (was > 0) setShield(u, b, b.shield * capacityAt(b.value, b.n) / was);
}

/**
 * A skill's bonus that wears off (技能-4): a buff `skillDecay` holds the part of the `decay` keys' modifiers that is gone — minus the
 * skill's own modifier × (1 − what is left of the capacity) — so that, with the skill's buff, they are evenly down to 0 over the
 * seconds, updated once a second.
 * @param {World} _w @param {Unit} u @param {Buff} b @param {Content} [c]
 */
function decayStats(_w, u, b, c) {
  const def = c ? defOf(c, u) : null, d = def?.extra?.decay;
  count(b, 1);
  if (!def || !d) return;
  const own = { ...statMods(def.bb), ...def.extra?.mods }, gone = 1 - capacityAt(d.seconds, b.n), mods = /** @type {Record<string, number>} */ ({});
  for (const k of d.keys) {
    const name = /** @type {Record<string, string>} */ (STAT_KEYS)[k];
    if (name in own) mods[name] = -own[name] * gone;
  }
  retune(u, b, b.value, mods);
}

/** The skill's bonus that wears off gets the buff that takes it away step by step (技能-4). @param {Unit} op */
function startDecay(op) {
  removeBuff(op, 'skillDecay');
  addBuff(op, makeBuff({ key: 'skillDecay', src: op.id, act: 'skillStatDecay', every: DECAY_EVERY, fixed: true }));
}

/** The engine's decays: a barrier's (技能-14) and a skill's bonus's (技能-4). */
export const SKILL_TEXT_BEHAVIORS = Object.freeze({
  skillBarrierDecay: { tick: decayBarrier },
  skillStatDecay: { tick: decayStats },
});

/** Whether the counter is still waiting out `aoe_cd` (技能-14). @param {Unit} op @param {number} frame @param {number} cd */
function cooling(op, frame, cd) {
  const b = op.buffs.find((x) => x.key === 'counterCd');
  return !!b && frame - b.n < secondsToFrames(cd);
}

/** Starts the counter's cooldown at this frame (技能-14), whether or not anyone was there to hit. @param {World} w @param {Unit} op */
function stampCd(w, op) {
  const b = op.buffs.find((x) => x.key === 'counterCd');
  if (b) stamp(b, w.frame);
  else addBuff(op, makeBuff({ key: 'counterCd', src: op.id, n: w.frame }));
}

/** An enemy inside the counter's 周围 (技能-14). @param {Unit} op @param {Unit} u @param {boolean} ground */
function foeNear(op, u, ground) {
  if (u.kind !== KIND.ENEMY || u.hp <= 0) return false;
  if (ground && statsOf(u).flying) return false;
  const dx = u.x - op.x, dy = u.y - op.y;
  return dx * dx + dy * dy <= NEAR;
}

/** One victim of the counter (技能-14): the damage, then the sentence's 元素损伤 and silence. @param {World} w @param {Content} c @param {Unit} op @param {Unit} e @param {Counter} x */
function strike(w, c, op, e, x) {
  if (e.hp <= 0) return;
  creditedDamage(w, c, op, e, { type: x.type, amount: statsOf(op)[x.stat] * x.scale, isAttack: false, isSkill: true, canDodge: false });
  if (x.element && x.epScale) dealEpFrom(w, e, x.element, statsOf(op).atk * x.epScale, { src: op, c });
  if (x.silence && e.hp > 0) inflict(w, e, 'silence', { seconds: x.silence, src: op });
}

/** The counter while this skill is up (技能-14), or null. @param {Content} c @param {Unit} op @returns {Counter | null} */
function readyCounter(c, op) {
  const def = defOf(c, op), x = def?.extra?.counter;
  if (!def || !x || !op.skill?.active || op.hp <= 0 || ownsSkill(c, def.id)) return null;
  return x;
}

/** Who the counter hits (技能-14): everyone 周围, or the attacker. @param {World} w @param {Unit} op @param {Unit} src @param {Counter} x */
function victims(w, op, src, x) {
  if (x.around) return w.units.filter((u) => foeNear(op, u, x.ground === true));
  return src.hp > 0 ? [src] : [];
}

/**
 * The counter (技能-14), from an enemy's attack landing on the operator. Not an attack of the operator's, so it gives
 * the operator no attack SP and does not answer itself.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit | null} src @param {import('./damage.js').Damage} dmg
 */
export function skillCounter(w, c, op, src, dmg) {
  const x = readyCounter(c, op);
  if (!x || !src || src.kind !== KIND.ENEMY || dmg.isAttack !== true) return;
  if (x.cooldown && cooling(op, w.frame, x.cooldown)) return;
  if (x.cooldown) stampCd(w, op);
  for (const e of victims(w, op, src, x)) strike(w, c, op, e, x);
}

/** A friendly unit another operator may heal (技能-14). Itself is allowed; 禁疗-free and 无法治疗 allies are not. @param {Unit} op @param {Unit} u */
function keptFrom(op, u) {
  if (u === op) return false;
  const f = statsOf(u).flags;
  return f.noAllyHeal === true || f.healFree === true;
}

/** Friendly units on the field this operator may heal (技能-14). @param {World} w @param {Unit} op */
function mates(w, op) {
  return w.units.filter((u) => u.kind === KIND.OPERATOR && u.owner === op.owner && u.hp > 0 && !keptFrom(op, u));
}

/** One ally the sentence allows (技能-14): hurt, not itself when it says 其他, under the HP gate when it writes one. @param {Unit} op @param {Unit} u @param {AllyHeal} h */
function canHeal(op, u, h) {
  if (u.hp >= u.maxHp || (h.others && u === op)) return false;
  return !(h.below && u.hp / u.maxHp >= h.below);
}

/** Allies inside the stored cells, else the attack range (技能-14). @param {World} w @param {Content} c @param {Unit} op @param {AllyHeal} h */
function inArea(w, c, op, h) {
  const grid = gridOf(c);
  const keys = h.range ? rangeKeys(grid, op, h.range) : reachKeys(c, op);
  return mates(w, op).filter((u) => inKeys(u, keys, grid));
}

/** Allies within 1.5 of the operator (技能-14), the single-target fallback. @param {World} w @param {Unit} op */
function closeMates(w, op) {
  return mates(w, op).filter((u) => {
    const dx = u.x - op.x, dy = u.y - op.y;
    return dx * dx + dy * dy <= NEAR;
  });
}

/** Who gets the heal (技能-14): every injured ally, or the most injured one. 「所有」 does not fall back to 1.5. @param {World} w @param {Content} c @param {Unit} op @param {AllyHeal} h */
function pickAllies(w, c, op, h) {
  let pool = inArea(w, c, op, h).filter((u) => canHeal(op, u, h));
  if (!h.all && pool.length === 0) pool = closeMates(w, op).filter((u) => canHeal(op, u, h));
  const sorted = sortHealTargets(pool);
  return h.all ? sorted : sorted.slice(0, 1);
}

/** Heals the allies the sentence names (技能-14). A medic does not, even when the sentence was read. @param {World} w @param {Content} c @param {Unit} op @param {AllyHeal} h */
function healAllies(w, c, op, h) {
  if (c.operators[op.key].profession === 'MEDIC') return;
  const amount = statsOf(op).atk * h.scale;
  for (const u of pickAllies(w, c, op, h)) w.events.push({ type: 'heal', id: op.id, target: u.id, amount: heal(w, op, u, amount) });
}

/**
 * Opening effects (技能-14): the barrier, a start burst, a heal that is not waiting for an attack. Returns the seconds an instant
 * skill stays running for because its start burst pulled an enemy (技能-16), else 0.
 * @param {World} w @param {Content} c @param {Unit} op @returns {number}
 */
export function openSkillText(w, c, op) {
  const def = defOf(c, op);
  if (!def || ownsSkill(c, def.id) || op.hp <= 0 || !def.extra) return 0;
  const x = def.extra;
  let held = 0;
  if (x.barrier) giveBarrier(op, x.barrier);
  if (x.decay) startDecay(op);
  for (const b of x.bursts ?? []) if (b.at === 'start') held = Math.max(held, strikeOn(w, c, op, b));
  if (x.allyHeal?.on === 'start') healAllies(w, c, op, x.allyHeal);
  return held;
}

/**
 * The heal that rides on an attack (技能-14). A passive skill's every attack; any other skill, only the attacks the
 * skill makes. The caller checks which.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function healSkillAllies(w, c, op) {
  const def = defOf(c, op), h = def?.extra?.allyHeal;
  if (!def || !h || h.on !== 'attack' || !op.skill?.active || op.hp <= 0 || ownsSkill(c, def.id)) return;
  healAllies(w, c, op, h);
}

/**
 * Closing effects (技能-14), while the skill is still up so the end burst still uses its range. Nothing that hits or
 * stuns once the operator is already down, or when the skill is ending because they leave the field.
 * @param {World} w @param {Content} c @param {Unit} op @param {string} reason
 */
export function closeSkillText(w, c, op, reason) {
  const def = defOf(c, op);
  if (!def || ownsSkill(c, def.id)) return;
  removeBuff(op, 'counterCd');
  removeBuff(op, 'skillDecay');
  if (op.hp <= 0 || reason === 'death' || !def.extra) return;
  const x = def.extra;
  for (const b of x.bursts ?? []) if (b.at === 'end') strikeOn(w, c, op, b);
  if (x.selfStun) inflict(w, op, 'stun', { seconds: x.selfStun.seconds, src: op });
  if (x.barrier?.tied) removeBuff(op, 'skillBarrier');
}
