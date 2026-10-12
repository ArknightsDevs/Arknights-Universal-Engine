// Stronghold's skill specs on the engine's skill runtime (docs/spec/compat.md 兼容-5): a skill a kit describes gets the
// engine's skill behaviour (技能-6, ADR 0055) that runs the kit's spec for the operator that has it — its modifiers and
// flags while it runs, its start, tick and end, its attack (倍率, hits, targets, damage type, a status each hit gives),
// its hit and attack callbacks — in place of the engine's generic effects from the blackboard. An operator with the same
// skill but no kit keeps the generic ones. When it starts stays the engine's rule (技能-3): a MANUAL skill by the player.
import { skills, constants, traitScale } from '@aue/sim';
import { modsOf, flagsOf, statusKeyOf } from './mods.js';
import { kitHits } from './field.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').SkillBehavior} SkillBehavior */

/** The battle of each deployed operator that has a kit (kits.js binds it at every deployment). @type {WeakMap<Unit, ShBattle>} */
export const battles = new WeakMap();

/** The kit's spec of an engine unit's running skill with its battle and piece, or null. @param {Unit} u */
function specOf(u) {
  const b = battles.get(u), p = b?.unitOf(u), spec = p?.skill?.spec;
  return b && p && spec ? { b, p, spec } : null;
}

/** A spec callback's context, as Stronghold's. @param {ShBattle} b @param {ShUnit} p @param {Record<string, unknown>} [more] */
const ctxOf = (b, p, more = {}) => ({ battle: b, unit: p, skill: p.skill, bb: p.skill?.bb ?? {}, ...more });

/**
 * Runs a spec callback for the kit (recorded and skipped when it throws).
 * @param {ShBattle} b @param {ShUnit} p @param {((ctx: any) => void) | undefined} fn @param {string} label @param {Record<string, unknown>} [more]
 * @returns {Record<string, any> | null} the context it ran with
 */
function call(b, p, fn, label, more) {
  if (typeof fn !== 'function') return null;
  const ctx = ctxOf(b, p, more);
  b.safe(() => fn(ctx), label, p);
  return ctx;
}

/**
 * Stronghold's spec kinds that give a skill a time, and the engine's kind (技能-1): a toggle runs until it is closed or its
 * duration ends. Its `instant` and `charges` (instant with charges) are a next-attack skill when the spec has an attack
 * of its own; without one they keep the record's kind.
 * @type {Readonly<Record<string, import('@aue/sim').skills.SkillKind>>}
 */
const TIMED = Object.freeze({ duration: 'duration', toggle: 'duration', ammo: 'ammo', passive: 'passive' });

/** The engine's kind of a spec (技能-1), or undefined for the record's. @param {Record<string, any>} spec */
function kindOf(spec) {
  if (Object.hasOwn(TIMED, spec.kind)) return TIMED[spec.kind];
  const instant = spec.kind === 'instant' || spec.kind === 'charges';
  return instant && spec.attack && !spec.attack.noAttack ? /** @type {const} */ ('next') : undefined;
}

/** A spec attack's 倍率 over `scale`: its atkScale, × a numeric dmgMul. @param {Record<string, any>} a @param {number} scale */
const scaleOf = (a, scale) => (Number.isFinite(a.atkScale) ? a.atkScale : scale) * (typeof a.dmgMul === 'number' && Number.isFinite(a.dmgMul) ? a.dmgMul : 1);

/**
 * A spec's attack override as the engine's attack mods (技能-5): 倍率 (× a numeric `dmgMul`, which Stronghold applies to
 * every hit of the attack), hits, targets (every one in range for `allInRange`), damage type or a heal, a status each
 * hit gives.
 * @param {Record<string, any>} spec @param {import('@aue/sim').skills.AttackMods} mods
 */
function attackOf(spec, mods) {
  const a = spec.attack ?? {}, t = spec.targeting ?? {}, out = { ...mods }, n = t.maxTargets ?? a.maxTargets;
  out.scale = scaleOf(a, out.scale);
  if (Number.isFinite(a.hits)) out.times = Math.max(1, Math.floor(a.hits));
  if (Number.isFinite(n)) out.targets = Math.max(1, Math.floor(n));
  if (t.allInRange) out.targets = Infinity;
  if (a.dmgType === 'heal') out.heal = true;
  else if (a.dmgType === 'phys' || a.dmgType === 'arts' || a.dmgType === 'true') out.type = a.dmgType;
  const st = a.onHitStatus;
  if (st && Number(st.duration) > 0) out.hitStatus = { key: /** @type {any} */ (statusKeyOf(st.key)), seconds: Number(st.duration) };
  return out;
}

/**
 * The skill behaviour of every skill a kit describes (兼容-5): its spec for an operator that has one, the engine's
 * generic one otherwise.
 * @type {Readonly<SkillBehavior>}
 */
export const SPEC_BEHAVIOR = Object.freeze({
  /** The spec's kind and time over the record's (技能-6): a duration or a toggle runs its `duration`, else its kind. @param {any} ctx */
  timing(ctx) {
    const spec = specOf(ctx.self)?.spec;
    const kind = spec ? kindOf(spec) : undefined, seconds = Number(spec?.duration);
    return kind ? { kind, ...(Number.isFinite(seconds) && seconds > 0 ? { seconds } : {}) } : null;
  },
  /** @param {any} ctx */
  start(ctx) {
    const r = specOf(ctx.self);
    if (!r) { skills.GENERIC.start?.(ctx); return; }
    const { b, p, spec } = r;
    // Stronghold counts the activation before onStart (a kit compares it later); kits.js counts the others at skillStart
    if (p.skill) { p.skill.activations++; p.skill.counted = true; }
    const flags = { ...spec.flags, ...(spec.attack?.noAttack ? { noAttack: true } : {}) };
    if (spec.mods || Object.keys(flags).length) b.giveBuff(p, { key: 'skill', mods: modsOf(spec.mods), flags: flagsOf(flags) });
    call(b, p, spec.onStart, 'skill.onStart');
  },
  /** @param {any} ctx */
  tick(ctx) {
    const r = specOf(ctx.self);
    if (r) call(r.b, r.p, r.spec.onTick, 'skill.onTick', { dt: constants.TICK });
  },
  /** The spec's onEnd with why the skill ends (Stronghold's reason, the engine's: 技能-6), then its buff goes. @param {any} ctx @param {string} reason */
  end(ctx, reason) {
    const r = specOf(ctx.self);
    if (!r) { skills.GENERIC.end?.(ctx, reason); return; }
    call(r.b, r.p, r.spec.onEnd, 'skill.onEnd', { reason });
    r.b.removeBuff(r.p, 'skill');
  },
  /** @param {any} ctx @param {any} mods */
  /**
   * A spec's attacks (兼容-5): the operator's own attack with the spec's overrides only — the blackboard's attack keys are
   * the spec's to read (令's S3 atk_scale is its pulses', not her attacks').
   * @param {any} ctx @param {any} mods
   */
  attack(ctx, mods) {
    const r = specOf(ctx.self);
    return r ? attackOf(r.spec, { ...mods, scale: 1, times: 1, targets: 1 }) : mods;
  },
});

/**
 * The spec's hit callbacks after an attack's hits on one target (the engine's `attackHit`), while the skill runs or for
 * its own attack landing later (a next-attack skill's projectile): `attack.onEachHit` for every victim — the main
 * target, a splashed or a jumped-to one —; `attack.onHit` and `onHit` for the main target.
 * @param {Record<string, any>} k the engine's context
 */
export function onAttackHit(k) {
  const r = specOf(k.attacker);
  if (!r || !(r.p.skill?.active || k.isSkill)) return;
  const { b, p, spec } = r, target = b.unitOf(k.target), kind = k.kind === 'aftershock' ? 'splash' : k.kind;
  call(b, p, spec.attack?.onEachHit, 'skill.attack.onEachHit', { target, dealt: k.dealt, kind, isSplash: kind === 'splash', isChain: kind === 'chain', isSkill: k.isSkill });
  if (kind !== 'main') return;
  call(b, p, spec.attack?.onHit, 'skill.attack.onHit', { target, dealt: k.dealt, x: target.x, y: target.y });
  call(b, p, spec.onHit, 'skill.onHit', { target, dealt: k.dealt, x: target.x, y: target.y });
}

/** Whether a hit is the engine's attack's on its main target: not a kit's own, no splash, chain or aftershock. @param {Record<string, any>} d */
const mainHit = (d) => !!d.isAttack && !kitHits.has(d) && !d.isSplash && !(d.tags ?? []).some((/** @type {string} */ t) => t === 'chain' || t === 'aftershock');

/**
 * A spec attack's own say on its main target's hit (the engine's `hit`, before the defences and any other handler):
 * `hitsFn` giving 0 — the attack deals nothing itself — cancels it and ends the dispatch (its hit callbacks still run,
 * with nothing dealt, as Stronghold's); a per-target `dmgMul(battle, unit, target)` takes the place of the trait's 倍率
 * for that target (职业-8, 职业-11) — as Stronghold's skill profile replaces its profession's — so the hit's amount × it ÷
 * the trait's.
 * @param {Record<string, any>} k the engine's context
 */
export function onSpecHit(k) {
  const r = k.source ? specOf(k.source) : null, a = r?.spec.attack;
  if (!r || !a || !(r.p.skill?.active || k.dmg.isSkill) || !mainHit(k.dmg)) return;
  if (typeof a.hitsFn === 'function' && Number(r.b.safe(() => a.hitsFn(r.b, r.p, {}), 'skill.attack.hitsFn', r.p)) === 0) {
    k.dmg.cancel = true;
    k.stopPropagation = true;
    return;
  }
  if (typeof a.dmgMul !== 'function') return;
  const m = r.b.safe(() => a.dmgMul(r.b, r.p, r.b.unitOf(k.target)), 'skill.attack.dmgMul', r.p), own = traitScale(r.b.c, k.source, k.target);
  if (Number.isFinite(m)) k.dmg.amount *= /** @type {number} */ (m) / (own > 0 ? own : 1);
}

/**
 * The spec's `onAttack` after an attack landed (the engine's `attack`), while the skill runs: it may make the attack
 * spend no ammo.
 * @param {Record<string, any>} k the engine's context
 */
export function onAttackDone(k) {
  const r = specOf(k.attacker);
  if (!r || !r.p.skill?.active) return;
  const ctx = call(r.b, r.p, r.spec.onAttack, 'skill.onAttack', { targets: k.targets.map((/** @type {Unit} */ t) => r.b.unitOf(t)), noAmmo: false });
  if (ctx?.noAmmo) k.noAmmo = true;
}
