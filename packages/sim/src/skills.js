// Skills (docs/spec/skills.md 技能-1…技能-6): the state a skill runs with, when it starts — by command, on its own, at
// deployment — how long it lasts, what it does to the operator's attacks, and the native behaviour interface content
// writes against (ADR 0055): data first, a behaviour by skill id, and a context that is the only way it acts.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { timeSp, gainSp, spendSp } from './sp.js';
import { actorContext } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').SkillDef} SkillDef @typedef {import('./types.js').SkillState} SkillState */
/** @typedef {'passive' | 'ammo' | 'duration' | 'next' | 'instant'} SkillKind */

/**
 * What a skill's attacks change (技能-5): the 攻击力倍率, hits per target, the number of targets; `skill` marks an attack
 * the skill makes (it gives no attack SP); `element` and `ep`, 元素损伤 each hit carries (元素-2).
 * An attack's modifiers: 倍率, hits, targets, whether a skill makes it, its 元素损伤; and for enemy abilities (敌能-6…敌能-11)
 * a damage type in place of the attacker's, a cross-shaped splash, an attack bonus for this attack only, and a channel
 * (`hits` hits spread over `duration` seconds, the k-th at k × duration ÷ hits, then `after` seconds of cooldown).
 * @typedef {{ scale: number, times: number, targets: number, skill: boolean, element?: import('./elements.js').Element, ep?: number,
 *   type?: import('./types.js').DamageType, cross?: boolean, atkPct?: number, channel?: { hits: number, duration: number, after: number } }} AttackMods
 */

/**
 * The context a skill behaviour acts through (ADR 0055, 技能-6): the common one (traits.js TraitContext, api.js) with
 * the skill's blackboard, and the skill's kind. It reads the operator, its blackboard and its stats, and changes the
 * battle only through its functions.
 * @typedef {import('./traits.js').TraitContext & { kind: SkillKind }} SkillContext
 */

/**
 * A skill's behaviour (ADR 0055). `trigger` says when an AUTO skill starts: as soon as it is ready, or when the
 * operator is about to attack. `attack` may change the mods of the attacks the skill makes.
 * @typedef {object} SkillBehavior
 * @property {'ready' | 'attack'} [trigger]
 * @property {(ctx: SkillContext) => void} [start]
 * @property {(ctx: SkillContext) => void} [tick]
 * @property {(ctx: SkillContext) => void} [end]
 * @property {(ctx: SkillContext, mods: AttackMods) => AttackMods} [attack]
 */

/** Blackboard keys of the operator's own attributes and the mod each becomes during the skill (技能-5). */
export const STAT_KEYS = Object.freeze({
  atk: 'atkPct', def: 'defPct', max_hp: 'hpPct', attack_speed: 'aspd', magic_resistance: 'resFlat', block_cnt: 'blockCnt',
  move_speed: 'movePct', sp_recovery_per_sec: 'spRecoveryFlat', base_attack_time: 'batFlat', ability_range_forward_extend: 'rangeExtend',
  taunt_level: 'taunt', def_penetrate: 'defIgnorePct', def_penetrate_fixed: 'defIgnoreFlat', magic_resist_penetrate: 'resIgnorePct',
  magic_resist_penetrate_fixed: 'resIgnoreFlat', hp_recovery_per_sec: 'hpRegen',
});

/** Blackboard keys of the attacks a skill makes (技能-5). */
const ATTACK_KEYS = Object.freeze(['atk_scale', 'attack@atk_scale', 'times', 'attack@times', 'max_target', 'attack@max_target']);

/**
 * A skill's kind (技能-1): passive; ammo; with a duration; a next-attack skill (no duration, attack keys); instant.
 * @param {SkillDef} def @returns {SkillKind}
 */
export function kindOf(def) {
  if (def.type === 'PASSIVE') return 'passive';
  if (def.ammo) return 'ammo';
  if (def.duration > 0) return 'duration';
  return ATTACK_KEYS.some((k) => k in def.bb) ? 'next' : 'instant';
}

/** A skill's state when its operator is deployed: the initial SP (技能-2). @param {SkillDef} def @returns {SkillState} */
export function makeSkillState(def) {
  const cap = def.cost * Math.max(1, def.charges);
  return { id: def.id, spType: def.sp, cost: def.cost, cap, sp: Math.min(def.init, cap), slot: 0, active: false, armed: false, dur: -1, ammo: 0, at: -1 };
}

/** The mods of the blackboard's attribute keys (技能-5). @param {Readonly<Record<string, number>>} bb */
export function statMods(bb) {
  /** @type {Record<string, number>} */
  const mods = {};
  for (const [k, mod] of Object.entries(STAT_KEYS)) if (Number.isFinite(bb[k])) mods[mod] = bb[k];
  return mods;
}

/**
 * The generic behaviour (技能-5): while a skill with a duration, ammo or a passive one runs, its attribute keys are a
 * buff on the operator; an instant or duration skill's `cost` gives the owner that much cost when it starts.
 * @type {Required<Pick<SkillBehavior, 'start' | 'end'>>}
 */
export const GENERIC = Object.freeze({
  start(ctx) {
    if ((ctx.kind === 'instant' || ctx.kind === 'duration') && ctx.bb.cost > 0) ctx.gainCost(ctx.bb.cost);
    if (ctx.kind === 'instant' || ctx.kind === 'next') return;
    const mods = statMods(ctx.bb);
    if (Object.keys(mods).length > 0) ctx.addBuff(ctx.self, { key: 'skill', mods });
  },
  end(ctx) { ctx.removeBuff(ctx.self, 'skill'); },
});

/** @param {Content} c @param {Unit} op @returns {SkillDef} */
const defOf = (c, op) => /** @type {SkillDef} */ (c.operators[op.key].skill);
/** @param {Content} c @param {string} id @returns {SkillBehavior} */
const behaviorOf = (c, id) => (c.behaviors?.skills && Object.hasOwn(c.behaviors.skills, id) ? c.behaviors.skills[id] : GENERIC);

/** @param {World} w @param {Content} c @param {Unit} op @returns {SkillContext} */
function contextOf(w, c, op) {
  const def = defOf(c, op);
  return { ...actorContext(w, c, op, def.bb), kind: kindOf(def) };
}

/** Ends a skill (技能-4): its behaviour's end, then the state at rest. @param {World} w @param {Content} c @param {Unit} op */
export function endSkill(w, c, op) {
  const st = /** @type {SkillState} */ (op.skill);
  behaviorOf(c, st.id).end?.(contextOf(w, c, op));
  st.active = false; st.armed = false; st.dur = -1; st.ammo = 0;
  w.events.push({ type: 'skill', id: op.id, active: 0 });
}

/**
 * Starts a skill (技能-3, 技能-4): it takes its cost; by kind it lasts its duration, holds its ammo, waits for the next
 * attack, or acts at once and ends.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function activate(w, c, op) {
  const st = /** @type {SkillState} */ (op.skill), def = defOf(c, op), kind = kindOf(def);
  spendSp(st);
  st.active = true; st.at = w.frame;
  st.armed = kind === 'next';
  st.dur = (kind === 'duration' || kind === 'passive' || kind === 'ammo') && def.duration > 0 ? secondsToFrames(def.duration) : -1;
  st.ammo = kind === 'ammo' ? Math.max(1, def.bb['attack@trigger_time'] ?? def.bb.cnt ?? 1) : 0;
  w.events.push({ type: 'skill', id: op.id, active: 1 });
  behaviorOf(c, st.id).start?.(contextOf(w, c, op));
  if (kind === 'instant') endSkill(w, c, op);
}

/** Whether an operator may trigger its skill (技能-3, 技能-7): it can act and is not silenced (沉默, 静默). @param {Unit} op */
function mayTrigger(op) {
  const s = statsOf(op);
  return !s.disabled && !s.flags.silence && !s.flags.mute;
}

/**
 * Whether a skill may start now (技能-3): it is not running, it holds its cost, its operator may trigger it, and its
 * type is the one asked for.
 * @param {Content} c @param {Unit} op @param {'AUTO' | 'MANUAL'} type
 */
export function canStart(c, op, type) {
  const st = op.skill;
  if (!st || st.active || st.sp < st.cost || defOf(c, op).type !== type) return false;
  return mayTrigger(op);
}

/**
 * Whether the player may close a skill now (技能-7): it is running, it can be closed, and its operator may trigger it —
 * closing is a second trigger.
 * @param {Content} c @param {Unit} op
 */
export function canClose(c, op) {
  const st = op.skill;
  return !!st && st.active && defOf(c, op).stoppable === true && mayTrigger(op);
}

/** When an AUTO skill starts (技能-3). @param {Content} c @param {Unit} op @returns {'ready' | 'attack'} */
const triggerOf = (c, op) => behaviorOf(c, defOf(c, op).id).trigger ?? (kindOf(defOf(c, op)) === 'instant' ? 'ready' : 'attack');

/**
 * One frame of an operator's skill, at the start of its turn (技能-2…技能-4): the duration runs down (not in the frame
 * it started), the running skill ticks, SP recovers over time, and an AUTO skill that starts when ready starts.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function tickSkill(w, c, op) {
  const st = op.skill;
  if (!st) return;
  if (st.active && st.dur > 0 && st.at < w.frame && --st.dur === 0) endSkill(w, c, op);
  if (st.active) behaviorOf(c, st.id).tick?.(contextOf(w, c, op));
  if (!statsOf(op).flags.noSp) timeSp(st, statsOf(op).spRecovery);
  if (triggerOf(c, op) === 'ready' && canStart(c, op, 'AUTO')) activate(w, c, op);
}

/**
 * Before an operator attacks (技能-3, 技能-4): an ammo skill out of ammo ends; an AUTO skill that starts on attack
 * starts. Returns the mods of this attack (技能-5).
 * @param {World} w @param {Content} c @param {Unit} op @returns {AttackMods}
 */
export function beforeAttack(w, c, op) {
  const st = op.skill, plain = { scale: 1, times: 1, targets: 1, skill: false };
  if (!st) return plain;
  if (st.active && kindOf(defOf(c, op)) === 'ammo' && st.ammo <= 0) endSkill(w, c, op);
  if (triggerOf(c, op) === 'attack' && canStart(c, op, 'AUTO')) activate(w, c, op);
  const kind = kindOf(defOf(c, op));
  if (!st.active || kind === 'instant' || kind === 'passive') return plain;
  const mods = skillMods(defOf(c, op).bb), beh = behaviorOf(c, st.id);
  return beh.attack ? beh.attack(contextOf(w, c, op), mods) : mods;
}

/** The attack keys of a blackboard as mods (技能-5). @param {Readonly<Record<string, number>>} bb @returns {AttackMods} */
export function skillMods(bb) {
  return {
    scale: bb.atk_scale ?? bb['attack@atk_scale'] ?? 1, times: Math.max(1, bb.times ?? bb['attack@times'] ?? 1),
    targets: Math.max(1, bb.max_target ?? bb['attack@max_target'] ?? 1), skill: true,
  };
}

/**
 * After an operator attacked (技能-2, 技能-4): a next-attack skill ends; an ammo skill spends a shot; an attack the skill
 * did not make gives one SP to a skill that recovers by attacking.
 * @param {World} w @param {Content} c @param {Unit} op @param {AttackMods} mods
 */
export function afterAttack(w, c, op, mods) {
  const st = op.skill;
  if (!st) return;
  if (mods.skill && st.armed) endSkill(w, c, op);
  else if (mods.skill && st.ammo > 0) st.ammo--;
  else if (!mods.skill && st.spType === 'attack' && !statsOf(op).flags.noSp) gainSp(st, 1);
}

/** A newly deployed operator's passive skill starts (技能-3). @param {World} w @param {Content} c @param {Unit} op */
export function onDeploy(w, c, op) {
  if (op.skill && defOf(c, op).type === 'PASSIVE') activate(w, c, op);
}

/**
 * The skill command (技能-3, 技能-7): the seat's own operator on the field closes its running skill if it may, or else
 * starts its MANUAL skill if it may; otherwise nothing happens.
 * @param {World} w @param {Content} c @param {number} seat @param {number} unit
 */
export function commandSkill(w, c, seat, unit) {
  const op = w.units.find((u) => u.id === unit && u.kind === KIND.OPERATOR && u.owner === seat && u.hp > 0);
  if (op && canClose(c, op)) endSkill(w, c, op);
  else if (op && canStart(c, op, 'MANUAL')) activate(w, c, op);
}
