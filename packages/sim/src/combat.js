// Attacks (spec 攻击-1, 敌人攻击-1, 索敌-1…索敌-5, 伤害-7, 职业-1…职业-5): when the cooldown is out, the first
// candidates in the official order take hits of the attacker's attack — or a healer's heals — then the attacker waits its
// attack interval.
import { FPS } from '@aue/math';
import { KIND, ANIM } from '@aue/schema';
import { offsetTile } from './dir.js';
import { statsOf, intervalFrames } from './attrs.js';
import { rangeKeys, inKeys, selectable, sortEnemies, sortAllies, sortHealTargets, firstN } from './targeting.js';
import { dealDamage, heal } from './damage.js';
import { pathDistance } from './routes.js';
import { enforceCapacity } from './blocking.js';
import { ALLY_COLLIDER_RADIUS } from './constants.js';
import { tickSkill, beforeAttack, afterAttack } from './skills.js';
import { palsyInterrupts } from './status.js';
import { dealEp, rampageAttack } from './elements.js';
import { traitOf, traitOfDef, traitTargets, traitHit, traitKill } from './traits.js';

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
  const cands = w.units.filter((u) => u.kind === KIND.ENEMY
    && ((held(u) && selectable(u, { canHitFly: true })) || (selectable(u, { canHitFly: t.antiAir }) && inKeys(u, keys, grid))));
  return sortEnemies(op, cands, { blockedFirst: t.blockedFirst, pathDist: (e) => pathDistance(c, e), filter: t.filter, secondary: t.secondary });
}

/** The enemy an operator attacks first (索敌-3). @param {World} w @param {Content} c @param {Unit} op @returns {Unit | null} */
export const pickTarget = (w, c, op) => targetsOf(w, c, op)[0] ?? null;

/** @typedef {{ scale: number, times: number, element?: string, ep?: number }} StrikeMods */

/** Starts the cooldown of an attack (攻击-1, 敌人攻击-1); an attack during a 狂躁 burst counts once (元素-4). @param {Unit} a @param {Stats} s */
function startAttack(a, s) {
  a.atkCd = intervalFrames(s.bat, s.aspd) - 1;
  a.anim = ANIM.ATTACK;
  rampageAttack(a);
}

/**
 * Starts the cooldown and hits the targets (伤害-6, 伤害-7, 技能-5, 元素-2, 职业-4, 职业-5): each target takes `times`
 * hits of the attack × the 攻击力倍率, of the attacker's damage type; after each, the attack's 元素损伤 if it carries
 * one. An operator's hit that kills is credited to it, then its trait acts on the hit.
 * @param {World} w @param {Content | null} c the content, for an operator's trait; null for an enemy @param {Unit} a
 * @param {Unit[]} targets @param {StrikeMods} [mods]
 */
function strike(w, c, a, targets, mods = { scale: 1, times: 1 }) {
  const s = statsOf(a);
  startAttack(a, s);
  const el = /** @type {import('./elements.js').Element | undefined} */ (mods.element), ep = mods.ep ?? 0;
  for (const t of targets) {
    w.events.push({ type: 'attack', id: a.id, target: t.id });
    for (let k = 0; k < mods.times; k++) {
      const alive = t.hp > 0;
      dealDamage(w, a, t, { type: a.base.dmgType, amount: s.atk * mods.scale });
      if (c && alive && t.hp <= 0) traitKill(w, c, a, t);
      if (el && ep > 0) dealEp(w, t, el, ep);
      if (c && alive) traitHit(w, c, a, t);
    }
  }
}

/**
 * A healer's attack (职业-2): the cooldown starts; each target is healed `times` times by the attack × the 攻击力倍率
 * (伤害-11), each a `heal` event.
 * @param {World} w @param {Unit} a @param {Stats} s @param {Unit[]} targets @param {StrikeMods} mods
 */
function healStrike(w, a, s, targets, mods) {
  startAttack(a, s);
  for (const t of targets) {
    w.events.push({ type: 'attack', id: a.id, target: t.id });
    for (let k = 0; k < mods.times; k++) w.events.push({ type: 'heal', id: a.id, target: t.id, amount: heal(a, t, s.atk * mods.scale) });
  }
}

/**
 * One operator's attack (攻击-1, 技能-3…技能-5, 职业-2, 职业-3): with a target and the cooldown out, its skill may start
 * or end, then it hits — or heals — the first targets: as many as the skill's mods or the trait allow, whichever is more;
 * the trait's hits multiply the skill's.
 * @param {World} w @param {Content} c @param {Unit} op
 */
function operatorAttack(w, c, op) {
  if (op.atkCd > 0) { op.atkCd--; return; }
  if (targetsOf(w, c, op).length === 0) { op.anim = ANIM.IDLE; return; }
  const mods = beforeAttack(w, c, op), t = traitOf(c, op);
  const targets = firstN(targetsOf(w, c, op), Math.max(mods.targets, traitTargets(t, op))), all = { ...mods, times: mods.times * t.hits };
  if (t.heal) healStrike(w, op, statsOf(op), targets, all);
  else strike(w, c, op, targets, all);
  afterAttack(w, c, op, mods);
}

/**
 * Every operator's turn this frame (攻击-1). It lets go of what its block count no longer holds (阻挡-3); its skill runs
 * (技能-2…技能-4); then, if it can act (not 晕眩, 冻结 …), its attack — one that cannot act neither attacks nor counts
 * its cooldown down.
 * @param {World} w @param {Content} c
 */
export function operatorsAttack(w, c) {
  for (const op of w.units) {
    if (op.kind !== KIND.OPERATOR || op.hp <= 0) continue;
    enforceCapacity(w, op);
    tickSkill(w, c, op);
    if (!statsOf(op).disabled) operatorAttack(w, c, op);
  }
}

/**
 * Who an enemy can attack (敌人攻击-1): a melee enemy only the unit blocking it; a ranged one every selectable
 * operator whose collider (radius 0.25) its attack radius reaches — distance ≤ radius + 0.25 — and the unit blocking
 * it in any case.
 * @param {World} w @param {Unit} e @returns {Unit[]}
 */
export function enemyTargets(w, e) {
  const blocker = e.blockedBy >= 0 ? w.units.find((u) => u.id === e.blockedBy) ?? null : null;
  if (e.base.applyWay === 'MELEE' || !(e.base.rangeRadius > 0)) return blocker ? [blocker] : [];
  const reach = e.base.rangeRadius + ALLY_COLLIDER_RADIUS, r2 = reach * reach;
  const out = w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && (u === blocker || selectable(u))
    && (u.x - e.x) * (u.x - e.x) + (u.y - e.y) * (u.y - e.y) <= r2);
  if (blocker && !out.includes(blocker)) out.push(blocker);
  return out;
}

/**
 * An enemy's attack this frame (敌人攻击-1): like an operator's — the cooldown counts down while it can act; when it
 * is out and there is a target, the first in the official order (索敌-5) takes the hit. 麻痹 interrupts it: no hit,
 * the cooldown starts over (状态-8). An enemy without attack does not attack. Returns whether it attacked.
 * @param {World} w @param {Content} _c @param {Unit} e
 */
export function enemyAttack(w, _c, e) {
  const s = statsOf(e);
  if (s.disabled || s.atk <= 0 || e.hidden) return false;
  if (e.atkCd > 0) { e.atkCd--; return false; }
  const t = sortAllies(e, enemyTargets(w, e), FPS)[0];
  if (!t) return false;
  if (palsyInterrupts(e)) {
    e.atkCd = intervalFrames(s.bat, s.aspd) - 1;
    e.anim = ANIM.IDLE;
    return true;
  }
  strike(w, null, e, [t]);
  return true;
}
