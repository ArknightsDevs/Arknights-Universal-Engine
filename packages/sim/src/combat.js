// Operators attack (spec 攻击-1, 索敌-1…索敌-3, 伤害-7): when the cooldown is out, the first candidate in the official
// order takes a hit of the operator's attack, then the operator waits its attack interval.
import { KIND, ANIM } from '@aue/schema';
import { offsetTile } from './dir.js';
import { statsOf, intervalFrames } from './attrs.js';
import { rangeKeys, inKeys, selectable, sortEnemies } from './targeting.js';
import { dealDamage } from './damage.js';
import { remainingDistance } from './enemies.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Cell} Cell */

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
 * The enemy an operator attacks (索敌-1…索敌-3): of the selectable enemies with a tile in range, the first in the
 * official order. Melee operators cannot select flying enemies.
 * @param {World} w @param {Content} c @param {Unit} op @returns {Unit | null}
 */
export function pickTarget(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, d = c.operators[op.key], melee = d.position === 'MELEE';
  const keys = rangeKeys(grid, op, d.range, statsOf(op).rangeExtend);
  const cands = w.units.filter((u) => u.kind === KIND.ENEMY && selectable(u, { canHitFly: !melee }) && inKeys(u, keys, grid));
  return sortEnemies(op, cands, { melee, pathDist: (e) => remainingDistance(c, e) })[0] ?? null;
}

/**
 * Every operator's attack this frame (攻击-1). An operator that cannot act (晕眩, 冻结 …) neither attacks nor counts its
 * cooldown down.
 * @param {World} w @param {Content} c
 */
export function operatorsAttack(w, c) {
  for (const op of w.units) {
    if (op.kind !== KIND.OPERATOR || op.hp <= 0) continue;
    const s = statsOf(op);
    if (s.disabled) continue;
    if (op.atkCd > 0) { op.atkCd--; continue; }
    const t = pickTarget(w, c, op);
    op.anim = t ? ANIM.ATTACK : ANIM.IDLE;
    if (!t) continue;
    op.atkCd = intervalFrames(s.bat, s.aspd) - 1;
    w.events.push({ type: 'attack', id: op.id, target: t.id });
    dealDamage(w, op, t, { type: op.base.dmgType, amount: s.atk });
  }
}
