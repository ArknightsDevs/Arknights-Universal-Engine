// Talents on heals (docs/spec/traits.md 职业-33): on every heal (the `heal` hook, 钩子-3) — more for a low target, what
// it leaves, a 屏障 for a while, the heal beyond the maximum as a 屏障 (the healer's, decaying, or the target's own), a
// share for the healer —; heals for a status taken in range; heals at a skill's end; a regen for those with 抵抗; one
// more heal target at a chance.
import { secondsToFrames, FPS } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, setLeft, stamp } from './buffs.js';
import { heal, setShield } from './damage.js';
import { draw } from './rng.js';
import { on } from './bus.js';
import { reachKeys } from './reach.js';
import { inKeys } from './targeting.js';
import { STATUS } from './status.js';
import { traitOf, traitOfDef } from './traits.js';
import { healGives } from './talentmore.js';
import { statusSteps } from './talentfight.js';
import { statusStep } from './talentfx.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Buff} Buff */

/** The owner of these hooks (钩子-1). */
const OWNER = 'talentHeal';
/** The trait fields a heal hook serves. */
const ON_HEAL = Object.freeze(['healShare', 'lowHeal', 'healGives', 'healBarrier', 'overhealBarrier', 'overflowBarrier']);
/** What each content asks for, once worked out: heal hooks, status hooks. @type {WeakMap<object, { heal: boolean, status: boolean }>} */
const NEEDS = new WeakMap();

/** Whether a content's operators have talents on heals or on statuses taken (职业-33). @param {Content} c */
function needs(c) {
  let n = NEEDS.get(c.operators);
  if (!n) {
    const traits = Object.values(c.operators).map(traitOfDef);
    n = { heal: traits.some((t) => ON_HEAL.some((k) => !!t[/** @type {keyof typeof t} */ (k)])), status: traits.some((t) => !!t.statusHeal || t.stacks.some((s) => s.on === 'status')) };
    NEEDS.set(c.operators, n);
  }
  return n;
}

/** Whether a heal hook is running: the heals it makes do not run it again. */
let busy = false;

/**
 * Sets up the hooks of these talents for a step (职业-33): `heal` and `beforeStatus`, once each, when the content has
 * talents that ask for them.
 * @param {World} w @param {Content} c
 */
export function healHooks(w, c) {
  const n = needs(c), hooks = w.bus?.hooks;
  if (n.heal && !hooks?.get('heal')?.some((h) => h.owner === OWNER)) on(w, 'heal', (ctx) => onHeal(w, c, ctx), { owner: OWNER });
  if (n.status && !hooks?.get('beforeStatus')?.some((h) => h.owner === OWNER)) on(w, 'beforeStatus', (ctx) => onStatus(w, c, ctx), { owner: OWNER });
}

/**
 * A heal about to be applied (职业-33), from an operator: its `lowHeal` value more when the target has less than `below`
 * of its maximum HP; its `healGives` (职业-31) by the HP before; its `healBarrier` 屏障 on an operator; the heal beyond the
 * maximum HP as a 屏障 — the healer's `overhealBarrier`, the target's own `overflowBarrier` —; then, healing another
 * unit, its `healShare` of the heal for itself. Heals made here run no hook of these talents.
 * @param {World} w @param {Content} c @param {{ source: Unit | null, target: Unit, amount: number }} ctx
 */
function onHeal(w, c, ctx) {
  const a = ctx.source, u = ctx.target;
  if (busy || !a || a.kind !== KIND.OPERATOR || !Number.isFinite(ctx.amount)) return;
  busy = true;
  try {
    const t = traitOf(c, a), max = statsOf(u).maxHp, ratio = u.hp / max;
    if (t.lowHeal && ratio < t.lowHeal.below) ctx.amount += t.lowHeal.value;
    healGives(c, a, u, ratio);
    barriers(w, c, a, u, Math.max(0, u.hp + ctx.amount - max));
    if (t.healShare > 0 && u !== a) w.events.push({ type: 'heal', id: a.id, target: a.id, amount: heal(w, a, a, t.healShare * ctx.amount) });
  } finally {
    busy = false;
  }
}

/**
 * The 屏障 of a heal (职业-33): the healer's `healBarrier` on an operator, then the heal beyond the maximum (`over`) as the
 * healer's `overhealBarrier` and the target's own `overflowBarrier`.
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit} u @param {number} over
 */
function barriers(w, c, a, u, over) {
  const t = traitOf(c, a), own = u.kind === KIND.OPERATOR ? traitOf(c, u).overflowBarrier : 0;
  if (t.healBarrier && u.kind === KIND.OPERATOR) barrierFor(w, a, u, t.healBarrier);
  if (over > 0 && t.overhealBarrier) overheal(w, a, u, over, t.overhealBarrier);
  if (over > 0 && own > 0) overflow(u, over, own * statsOf(u).maxHp);
}

/** A heal's 屏障 for some seconds (职业-33: 莎草): `scale` × the healer's attack, set again — not added — by the next. @param {World} w @param {Unit} a @param {Unit} u @param {{ scale: number, seconds: number }} x */
function barrierFor(w, a, u, x) {
  const key = `healBarrier:${a.id}`, b = u.buffs.find((y) => y.key === key), amount = x.scale * statsOf(a).atk, left = secondsToFrames(x.seconds);
  if (!b) { addBuff(u, makeBuff({ key, src: a.id, left, shield: amount })); return; }
  setShield(u, b, amount);
  setLeft(b, left);
}

/**
 * The heal beyond the target's maximum as the healer's decaying 屏障 (职业-33: 医生): added to the buff `overheal:<healer
 * id>`, at most `cap` × the healer's attack; from 1 s after the last addition it loses `decay` / 10 of what it holds
 * every 0.1 s, rounded up.
 * @param {World} w @param {Unit} a @param {Unit} u @param {number} over @param {{ cap: number, decay: number }} x
 */
function overheal(w, a, u, over, x) {
  const key = `overheal:${a.id}`, b = u.buffs.find((y) => y.key === key), cap = x.cap * statsOf(a).atk;
  if (!b) { addBuff(u, makeBuff({ key, src: a.id, shield: Math.min(cap, over), act: 'overhealDecay', every: FPS / 10, value: x.decay / 10, n: w.frame })); return; }
  setShield(u, b, Math.min(cap, b.shield + over));
  stamp(b, w.frame);
}

/** The heal beyond its maximum as a unit's own 屏障 (职业-33: 休谟斯): added to its buff `overflow`, at most `cap`. @param {Unit} u @param {number} over @param {number} cap */
function overflow(u, over, cap) {
  const b = u.buffs.find((y) => y.key === 'overflow');
  if (!b) addBuff(u, makeBuff({ key: 'overflow', src: u.id, shield: Math.min(cap, over) }));
  else setShield(u, b, Math.min(cap, b.shield + over));
}

/** The engine's behaviour of a decaying 屏障 (职业-33): every 0.1 s from 1 s after its last addition, the share of what it holds, rounded up, goes. */
export const HEAL_BEHAVIORS = Object.freeze({
  overhealDecay: { tick: (/** @type {World} */ w, /** @type {Unit} */ u, /** @type {Buff} */ b) => {
    if (w.frame - b.n >= FPS && b.shield > 0) setShield(u, b, b.shield - Math.ceil(b.shield * b.value));
  } },
});

/**
 * A status about to be taken (职业-33: `statusHeal`): when it is a 可抵抗 one on a friendly unit not at full HP, each
 * operator on the field with the talent whose attack range has a tile of it, its wait over, heals it `scale` × its attack
 * and waits `cooldown` seconds (buff `statusHealCd`).
 * Before that, the source's stacks on the status take a step (statusSteps, 职业-34).
 * @param {World} w @param {Content} c @param {{ source: Unit | null, target: Unit, status: string }} ctx
 */
function onStatus(w, c, ctx) {
  const u = ctx.target;
  statusSteps(c, ctx.source, u, ctx.status, statusStep);
  if (u.kind !== KIND.OPERATOR || u.hp <= 0 || u.hp >= statsOf(u).maxHp || !STATUS[/** @type {keyof typeof STATUS} */ (ctx.status)]?.resist) return;
  const grid = { rows: c.level.height, cols: c.level.width };
  for (const op of w.units) {
    const x = op.kind === KIND.OPERATOR && op.hp > 0 ? traitOf(c, op).statusHeal : null;
    if (!x || op.buffs.some((b) => b.key === 'statusHealCd') || !inKeys(u, reachKeys(c, op), grid)) continue;
    w.events.push({ type: 'heal', id: op.id, target: u.id, amount: heal(w, op, u, x.scale * statsOf(op).atk) });
    addBuff(op, makeBuff({ key: 'statusHealCd', src: op.id, left: secondsToFrames(x.cooldown) }));
  }
}

/**
 * Its skill ended (职业-33: `skillEndHeal`): it heals itself and at most `max` friendly units with a tile in its attack
 * range that are not at full HP, the lowest share of HP first, `scale` × its attack each.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function skillEndHeal(w, c, op) {
  const x = traitOf(c, op).skillEndHeal;
  if (!x || op.hp <= 0) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, op), ratio = (/** @type {Unit} */ u) => u.hp / statsOf(u).maxHp;
  const others = w.units.filter((u) => u !== op && u.kind === KIND.OPERATOR && u.hp > 0 && u.hp < statsOf(u).maxHp && inKeys(u, keys, grid))
    .sort((p, q) => ratio(p) - ratio(q) || p.id - q.id).slice(0, x.max);
  for (const u of [op, ...others]) w.events.push({ type: 'heal', id: op.id, target: u.id, amount: heal(w, op, u, x.scale * statsOf(op).atk) });
}

/**
 * A heal's more targets at a chance (职业-33: `healMore`, 安赛尔): one draw (随机-1), under it one more target; none
 * without the talent.
 * @param {World} w @param {Content} c @param {Unit} op @param {import('./skills.js').AttackMods} mods @returns {import('./skills.js').AttackMods}
 */
export function healMore(w, c, op, mods) {
  const p = traitOf(c, op).healMore;
  return p > 0 && draw(w) < p ? { ...mods, more: (mods.more ?? 0) + 1 } : mods;
}
