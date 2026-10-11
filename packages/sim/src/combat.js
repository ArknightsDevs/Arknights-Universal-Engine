// Attacks (spec 攻击-1, 敌人攻击-1, 索敌-1…索敌-5, 伤害-7): when the cooldown is out, the first candidate in the official
// order takes a hit of the attacker's attack, then the attacker waits its attack interval.
import { FPS } from '@aue/math';
import { KIND, ANIM } from '@aue/schema';
import { offsetTile } from './dir.js';
import { statsOf, intervalFrames } from './attrs.js';
import { rangeKeys, inKeys, selectable, sortEnemies, sortAllies } from './targeting.js';
import { dealDamage } from './damage.js';
import { remainingDistance } from './routes.js';
import { enforceCapacity } from './blocking.js';
import { ALLY_COLLIDER_RADIUS } from './constants.js';

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
 * The enemy an operator attacks (索敌-1…索敌-3): of the selectable enemies with a tile in range — and, for a melee
 * operator, the enemies it blocks wherever they stand (阻挡-4) — the first in the official order. Melee operators cannot
 * select flying enemies.
 * @param {World} w @param {Content} c @param {Unit} op @returns {Unit | null}
 */
export function pickTarget(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, d = c.operators[op.key], melee = d.position === 'MELEE';
  const keys = rangeKeys(grid, op, d.range, statsOf(op).rangeExtend);
  const cands = w.units.filter((u) => u.kind === KIND.ENEMY && selectable(u, { canHitFly: !melee })
    && ((melee && u.blockedBy === op.id) || inKeys(u, keys, grid)));
  return sortEnemies(op, cands, { melee, pathDist: (e) => remainingDistance(c, e) })[0] ?? null;
}

/**
 * Hits a target and starts the cooldown (伤害-6, 伤害-7): one hit of the attacker's attack, of its damage type.
 * @param {World} w @param {Unit} a @param {Stats} s @param {Unit} t
 */
function strike(w, a, s, t) {
  a.atkCd = intervalFrames(s.bat, s.aspd) - 1;
  a.anim = ANIM.ATTACK;
  w.events.push({ type: 'attack', id: a.id, target: t.id });
  dealDamage(w, a, t, { type: a.base.dmgType, amount: s.atk });
}

/**
 * Every operator's attack this frame (攻击-1). An operator first lets go of what its block count no longer holds
 * (阻挡-3). One that cannot act (晕眩, 冻结 …) neither attacks nor counts its cooldown down.
 * @param {World} w @param {Content} c
 */
export function operatorsAttack(w, c) {
  for (const op of w.units) {
    if (op.kind !== KIND.OPERATOR || op.hp <= 0) continue;
    enforceCapacity(w, op);
    const s = statsOf(op);
    if (s.disabled) continue;
    if (op.atkCd > 0) { op.atkCd--; continue; }
    const t = pickTarget(w, c, op);
    if (t) strike(w, op, s, t);
    else op.anim = ANIM.IDLE;
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
 * is out and there is a target, the first in the official order (索敌-5) takes the hit. An enemy without attack does
 * not attack. Returns whether it attacked.
 * @param {World} w @param {Content} _c @param {Unit} e
 */
export function enemyAttack(w, _c, e) {
  const s = statsOf(e);
  if (s.disabled || s.atk <= 0) return false;
  if (e.atkCd > 0) { e.atkCd--; return false; }
  const t = sortAllies(e, enemyTargets(w, e), FPS)[0];
  if (!t) return false;
  strike(w, e, s, t);
  return true;
}
