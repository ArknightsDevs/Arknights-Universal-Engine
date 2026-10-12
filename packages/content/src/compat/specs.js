// Stronghold's skill specs on the engine's skill runtime (docs/spec/compat.md 兼容-5): a skill a kit describes gets the
// engine's skill behaviour (技能-6, ADR 0055) that runs the kit's spec for the operator that has it — its modifiers and
// flags while it runs, its start, tick and end, its attack (倍率, hits, targets, damage type, a status each hit gives),
// its hit and attack callbacks — in place of the engine's generic effects from the blackboard. An operator with the same
// skill but no kit keeps the generic ones. When it starts stays the engine's rule (技能-3): a MANUAL skill by the player.
import { skills, constants } from '@aue/sim';
import { modsOf, flagsOf, statusKeyOf } from './mods.js';

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
 * A spec's attack override as the engine's attack mods (技能-5): 倍率, hits, targets (every one in range for
 * `allInRange`), damage type or a heal, a status each hit gives.
 * @param {Record<string, any>} spec @param {import('@aue/sim').skills.AttackMods} mods
 */
function attackOf(spec, mods) {
  const a = spec.attack ?? {}, t = spec.targeting ?? {}, out = { ...mods }, n = t.maxTargets ?? a.maxTargets;
  if (Number.isFinite(a.atkScale)) out.scale = a.atkScale;
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
  /** @param {any} ctx */
  start(ctx) {
    const r = specOf(ctx.self);
    if (!r) { skills.GENERIC.start?.(ctx); return; }
    const { b, p, spec } = r;
    if (spec.mods || spec.flags) b.giveBuff(p, { key: 'skill', mods: modsOf(spec.mods), flags: flagsOf(spec.flags) });
    call(b, p, spec.onStart, 'skill.onStart');
  },
  /** @param {any} ctx */
  tick(ctx) {
    const r = specOf(ctx.self);
    if (r) call(r.b, r.p, r.spec.onTick, 'skill.onTick', { dt: constants.TICK });
  },
  /** @param {any} ctx */
  end(ctx) {
    const r = specOf(ctx.self);
    if (!r) { skills.GENERIC.end?.(ctx); return; }
    call(r.b, r.p, r.spec.onEnd, 'skill.onEnd');
    r.b.removeBuff(r.p, 'skill');
  },
  /** @param {any} ctx @param {any} mods */
  attack(ctx, mods) {
    const r = specOf(ctx.self);
    return r ? attackOf(r.spec, mods) : mods;
  },
});

/**
 * The spec's hit callbacks after an attack's hits on one target (the engine's `attackHit`): `attack.onEachHit` for every
 * victim — the main target, a splashed or a jumped-to one —; `attack.onHit` and `onHit` for the main target.
 * @param {Record<string, any>} k the engine's context
 */
export function onAttackHit(k) {
  const r = specOf(k.attacker);
  if (!r || !r.p.skill?.active) return;
  const { b, p, spec } = r, target = b.unitOf(k.target), kind = k.kind === 'aftershock' ? 'splash' : k.kind;
  call(b, p, spec.attack?.onEachHit, 'skill.attack.onEachHit', { target, dealt: k.dealt, kind, isSplash: kind === 'splash', isChain: kind === 'chain', isSkill: k.isSkill });
  if (kind !== 'main') return;
  call(b, p, spec.attack?.onHit, 'skill.attack.onHit', { target, dealt: k.dealt, x: target.x, y: target.y });
  call(b, p, spec.onHit, 'skill.onHit', { target, dealt: k.dealt, x: target.x, y: target.y });
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
