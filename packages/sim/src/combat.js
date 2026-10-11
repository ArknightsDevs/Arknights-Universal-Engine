// Attacks (spec 攻击-1…攻击-3, 敌人攻击-1, 索敌-1…索敌-5, 伤害-7, 职业-1…职业-5): when the cooldown is out, the first
// candidates in the official order are locked and a swing starts; at the end of its wind-up they take hits of the
// attacker's attack — a healer's heals, a ranged attacker's projectiles — and the attacker waits out its interval.
import { FPS, secondsToFrames } from '@aue/math';
import { KIND, ANIM } from '@aue/schema';
import { offsetTile } from './dir.js';
import { statsOf, intervalFrames } from './attrs.js';
import { rangeKeys, inKeys, selectable, sortEnemies, sortAllies, sortHealTargets, firstN } from './targeting.js';
import { dealDamage, heal } from './damage.js';
import { pathDistance } from './routes.js';
import { enforceCapacity } from './blocking.js';
import { ALLY_COLLIDER_RADIUS } from './constants.js';
import { foeTargets, foeAttack, isFoeOf } from './foes.js';
import { makeBuff } from './buffs.js';
import { tileOf } from './body.js';
import { tickSkill, beforeAttack, afterAttack } from './skills.js';
import { palsyInterrupts } from './status.js';
import { dealEp, rampageAttack } from './elements.js';
import { traitOf, traitOfDef, traitTargets, traitHit, traitKill } from './traits.js';
import { timingOf, windupFrames, shoots, launch, flyShots, PALSY_CUT_FRAMES } from './swing.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Cell} Cell @typedef {import('./attrs.js').Stats} Stats */

/**
 * The tile an operator's range offset lands on: offsets are written facing right and turn with the facing (spec 攻击-1,
 * 方向-2).
 * @param {Unit} op @param {Cell} off @returns {Cell}
 */
export function rangeCell(op, off) {
  const [row, col] = offsetTile(op.y, op.x, off.row, off.col, op.dir);
  return { row, col };
}

/**
 * What an operator's normal attack can target, in the official order (索敌-1…索敌-3, 职业-1, 职业-2). A healer: the
 * operators in range that are not at full HP and not under 禁疗, by 生命比例升序. Otherwise the selectable enemies with a
 * tile in range (flying ones only with 可对空) and, when the trait prefers them, the enemies it blocks wherever they
 * stand, flying or not (阻挡-4) — ordered by the trait's filters.
 * @param {World} w @param {Content} c @param {Unit} op @returns {Unit[]}
 */
export function targetsOf(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, d = c.operators[op.key], t = traitOfDef(d);
  const keys = rangeKeys(grid, op, d.range, statsOf(op).rangeExtend);
  if (t.heal) return sortHealTargets(w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && !statsOf(u).flags.healFree && inKeys(u, keys, grid)));
  const held = (/** @type {Unit} */ u) => t.blockedFirst && u.blockedBy === op.id;
  const cands = w.units.filter((u) => u.kind === KIND.ENEMY && u.base.neutral !== true
    && ((held(u) && selectable(u, { canHitFly: true })) || (selectable(u, { canHitFly: t.antiAir }) && inKeys(u, keys, grid))));
  return sortEnemies(op, cands, { blockedFirst: t.blockedFirst, pathDist: (e) => pathDistance(c, e), filter: t.filter, secondary: t.secondary });
}

/** The enemy an operator attacks first (索敌-3). @param {World} w @param {Content} c @param {Unit} op @returns {Unit | null} */
export const pickTarget = (w, c, op) => targetsOf(w, c, op)[0] ?? null;

/** @typedef {import('./skills.js').AttackMods} AttackMods @typedef {import('./types.js').Swing} Swing */
/**
 * What an attack carries to one target: its damage type and amount, hits, 元素损伤, and an operator's splash and
 * aftershock (职业-8).
 * @typedef {{ type: import('./types.js').DamageType, amount: number, times: number, element: string, ep: number, splash?: import('./types.js').Splash | null,
 *   aftershock?: number }} Load
 */

/**
 * One target's hits of an attack that lands (伤害-6, 伤害-7, 元素-2, 职业-4, 职业-5): `times` hits of the amount, each
 * followed by the attack's 元素损伤 if it carries one; an operator's hit that kills is credited to it, then its trait
 * acts on the hit. The source may be gone (a projectile whose shooter left): then the hit has no source.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t @param {Load} load
 */
function hitTarget(w, c, src, t, load) {
  const el = /** @type {import('./elements.js').Element | ''} */ (load.element), op = src && src.kind === KIND.OPERATOR ? src : null;
  for (let k = 0; k < load.times; k++) {
    const alive = t.hp > 0;
    dealDamage(w, src, t, { type: load.type, amount: load.amount });
    if (op && alive && t.hp <= 0) traitKill(w, c, op, t);
    if (el && load.ep > 0) dealEp(w, t, el, load.ep);
    if (op && alive) traitHit(w, c, op, t);
  }
}

/** The attack of an attacker, with an attack bonus for this attack only (敌能-11). @param {Unit} a @param {number} [pct] */
const atkOf = (a, pct) => (pct ? statsOf({ ...a, buffs: [...a.buffs, makeBuff({ key: 'attackBonus', mods: { atkPct: pct } })] }).atk : statsOf(a).atk);

/** What an attack carries to each target (攻击-2): its type, the attack × 倍率, hits, 元素损伤. @param {Unit} a @param {AttackMods} mods @returns {Load} */
const loadOf = (a, mods) => ({ type: mods.type ?? a.base.dmgType, amount: atkOf(a, mods.atkPct) * mods.scale, times: mods.times, element: mods.element ?? '', ep: mods.ep ?? 0 });

/**
 * The units a cross-shaped splash reaches (敌能-7): those an enemy may attack on the target's tile and the four tiles
 * next to it.
 * @param {World} w @param {Unit} a @param {Unit} t @returns {Unit[]}
 */
function crossOf(w, a, t) {
  const [r, col] = tileOf(t);
  return w.units.filter((u) => {
    if (u.hp <= 0 || u.hidden || !isFoeOf(u, a)) return false;
    const [ur, uc] = tileOf(u);
    return Math.abs(ur - r) + Math.abs(uc - col) <= 1;
  });
}

/**
 * An operator's attack against one target (职业-8): its amount × the trait's 倍率 for enemies it does not block, and
 * the trait's splash and aftershock; an enemy's as it is.
 * @param {Content} c @param {Unit} a @param {Unit} t @param {Load} load @returns {Load}
 */
function loadFor(c, a, t, load) {
  if (a.kind !== KIND.OPERATOR) return load;
  const tr = traitOf(c, a), k = t.blockedBy !== a.id ? tr.unblockedScale : 1;
  return { ...load, amount: load.amount * k, splash: tr.splash, aftershock: tr.aftershock };
}

/**
 * The enemies a splash around a target reaches (职业-8): every other enemy on the field within the radius of it —
 * hidden ones not, flying ones only when the splash is not ground-only.
 * @param {World} w @param {Unit} t @param {import('./types.js').Splash} s @returns {Unit[]}
 */
function splashOf(w, t, s) {
  return w.units.filter((u) => u !== t && u.kind === KIND.ENEMY && u.base.neutral !== true && u.hp > 0 && !u.hidden
    && !(s.ground && statsOf(u).flying) && (u.x - t.x) * (u.x - t.x) + (u.y - t.y) * (u.y - t.y) <= s.radius * s.radius);
}

/**
 * An attack reaching its target (攻击-2, 攻击-3, 职业-8): the target takes the hits; with a splash every other enemy
 * around it takes them at the splash's share; an aftershock repeats both at its share of the amount.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t @param {Load} load
 */
export function impact(w, c, src, t, load) {
  const s = load.splash, around = s ? splashOf(w, t, s) : [];
  for (const k of load.aftershock ? [1, load.aftershock] : [1]) {
    if (t.hp > 0) hitTarget(w, c, src, t, { ...load, amount: load.amount * k });
    for (const u of around) if (u.hp > 0) hitTarget(w, c, src, u, { ...load, amount: load.amount * k * (s?.scale ?? 1) });
  }
}

/**
 * An attack lands at the end of its wind-up (攻击-2, 攻击-3): 麻痹 may interrupt an enemy's (状态-8); the locked
 * targets still on the field and alive take it — out of range or not — as hits, a healer's heals (职业-2), or the
 * projectiles a ranged attacker launches; then an operator's skill counts the attack (技能-2, 技能-4).
 * @param {World} w @param {Content} c @param {Unit} a
 */
function land(w, c, a) {
  const sw = /** @type {Swing} */ (a.swing);
  a.swing = null;
  if (palsyInterrupts(a)) { a.anim = ANIM.IDLE; return; }
  const op = a.kind === KIND.OPERATOR, heals = op && traitOf(c, a).heal, load = loadOf(a, sw.mods);
  for (const id of sw.targets) {
    const t = w.units.find((u) => u.id === id);
    if (t && t.hp > 0 && !t.hidden) deliver(w, c, a, t, { load, heals: !!heals, cross: !!sw.mods.cross });
  }
  if (op) afterAttack(w, c, a, sw.mods);
  const ch = sw.mods.channel;
  if (ch && (sw.left ?? ch.hits) > 1) a.swing = { ...sw, wind: secondsToFrames(ch.duration / ch.hits), since: 0, left: (sw.left ?? ch.hits) - 1 };
}

/**
 * One locked target of a landing attack (攻击-2, 攻击-3, 职业-2, 敌能-7): a healer's heals, a cross splash's hits around
 * it, a ranged attacker's projectile, or the hits.
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit} t @param {{ load: Load, heals: boolean, cross: boolean }} how
 */
function deliver(w, c, a, t, how) {
  const load = loadFor(c, a, t, how.load);
  if (how.heals) for (let k = 0; k < load.times; k++) w.events.push({ type: 'heal', id: a.id, target: t.id, amount: heal(a, t, load.amount) });
  else if (how.cross) for (const u of crossOf(w, a, t)) hitTarget(w, c, a, u, load);
  else if (shoots(c, a, how.heals)) launch(w, a, t, load);
  else impact(w, c, a, t, load);
}

/**
 * Starts an attack (攻击-2): the cooldown starts — the next attack may start an attack interval from now —, the
 * targets are locked and the swing waits its wind-up; it lands at once without one. An attack during a 狂躁 burst
 * counts once (元素-4).
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit[]} targets @param {AttackMods} mods
 */
function startSwing(w, c, a, targets, mods) {
  const s = statsOf(a), ch = mods.channel, every = ch ? secondsToFrames(ch.duration / ch.hits) : 0;
  const interval = ch ? ch.hits * every + secondsToFrames(ch.after) : intervalFrames(s.bat, s.aspd);
  a.atkCd = interval - 1;
  a.anim = ANIM.ATTACK;
  rampageAttack(a);
  const wind = ch ? every : windupFrames(timingOf(c, a), interval);
  for (const t of targets) w.events.push({ type: 'attack', id: a.id, target: t.id, wind });
  a.swing = { wind, since: 0, targets: targets.map((t) => t.id), mods };
  if (a.swing.wind === 0) land(w, c, a);
}

/**
 * One frame of a swing (攻击-2): it lands when its wind-up is over; 麻痹 cuts an enemy's 2 s into it at the latest
 * (状态-8).
 * @param {World} w @param {Content} c @param {Unit} a
 */
function advanceSwing(w, c, a) {
  const sw = /** @type {Swing} */ (a.swing);
  sw.wind--;
  sw.since++;
  if (sw.wind <= 0) { land(w, c, a); return; }
  if (sw.since >= PALSY_CUT_FRAMES && palsyInterrupts(a)) { a.swing = null; a.anim = ANIM.IDLE; }
}

/**
 * One operator's attack (攻击-1, 攻击-2, 技能-3…技能-5, 职业-2, 职业-3): a swing under way goes on; with the cooldown
 * out, no swing and a target, its skill may start or end, the first targets are locked — as many as the skill's mods or
 * the trait allow, whichever is more; the trait's hits multiply the skill's — and a new swing starts.
 * @param {World} w @param {Content} c @param {Unit} op
 */
function operatorAttack(w, c, op) {
  if (op.swing) advanceSwing(w, c, op);
  if (op.atkCd > 0) { op.atkCd--; return; }
  if (op.swing) return;
  if (targetsOf(w, c, op).length === 0) { op.anim = ANIM.IDLE; return; }
  const mods = beforeAttack(w, c, op), t = traitOf(c, op);
  const targets = firstN(targetsOf(w, c, op), Math.max(mods.targets, traitTargets(t, op)));
  startSwing(w, c, op, targets, { ...mods, times: mods.times * t.hits });
}

/**
 * Every operator's turn this frame (攻击-1). It lets go of what its block count no longer holds (阻挡-3); its skill runs
 * (技能-2…技能-4); then, if it can act (not 晕眩, 冻结 …), its attack — one that cannot act neither attacks nor counts
 * its cooldown down, and loses the swing it was in (攻击-2).
 * @param {World} w @param {Content} c
 */
export function operatorsAttack(w, c) {
  for (const op of w.units) {
    if (op.kind !== KIND.OPERATOR || op.hp <= 0) continue;
    enforceCapacity(w, op);
    tickSkill(w, c, op);
    if (!statsOf(op).disabled) operatorAttack(w, c, op);
    else op.swing = null;
  }
}

/**
 * Every projectile's frame (攻击-3): one that reaches its target hits it with what it carries, its shooter as the
 * source while that is still on the field.
 * @param {World} w @param {Content} c
 */
export function shotsFly(w, c) {
  flyShots(w, (s, t) => { impact(w, c, w.units.find((u) => u.id === s.src && u.hp > 0) ?? null, t, s); });
}

/**
 * Who an enemy can attack (敌人攻击-1, 合作-9): a melee enemy only the unit blocking it; a ranged one every selectable
 * operator or neutral unit whose collider (radius 0.25) its attack radius reaches — distance ≤ radius + 0.25 — and
 * the unit blocking it in any case.
 * @param {World} w @param {Unit} e @returns {Unit[]}
 */
export function enemyTargets(w, e) {
  const blocker = e.blockedBy >= 0 ? w.units.find((u) => u.id === e.blockedBy) ?? null : null;
  if (e.base.applyWay === 'MELEE' || !(e.base.rangeRadius > 0)) return blocker ? [blocker] : [];
  const reach = e.base.rangeRadius + ALLY_COLLIDER_RADIUS, r2 = reach * reach;
  const side = (/** @type {Unit} */ u) => u.kind === KIND.OPERATOR || (u.kind === KIND.ENEMY && u.base.neutral === true && u !== e);
  const out = w.units.filter((u) => side(u) && u.hp > 0 && (u === blocker || selectable(u))
    && (u.x - e.x) * (u.x - e.x) + (u.y - e.y) * (u.y - e.y) <= r2);
  if (blocker && !out.includes(blocker)) out.push(blocker);
  return out;
}

/**
 * An enemy's attack this frame (敌人攻击-1, 攻击-2): like an operator's — a swing under way goes on; the cooldown counts
 * down while it can act; when it is out and there is a target, the first in the official order (索敌-5) is locked and a
 * swing starts. One that cannot act, has no attack or has disappeared loses its swing. Returns whether it is attacking
 * this frame (it does not walk).
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function enemyAttack(w, c, e) {
  const s = statsOf(e);
  if (s.disabled || s.atk <= 0 || e.hidden) { e.swing = null; return false; }
  const swinging = e.swing !== null;
  if (e.swing) advanceSwing(w, c, e);
  if (e.atkCd > 0) { e.atkCd--; return swinging; }
  if (e.swing) return true;
  const t = sortAllies(e, foeTargets(w, c, e, enemyTargets(w, e)), FPS)[0];
  if (!t) return swinging;
  startSwing(w, c, e, [t], foeAttack(w, c, e, { scale: 1, times: 1, targets: 1, skill: false }));
  return true;
}
