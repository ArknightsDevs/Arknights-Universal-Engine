// Operators attack (spec 攻击-1, 伤害-1, 伤害-2): when the cooldown is out and an enemy stands in range, hit the
// earliest-spawned one for physical damage, then wait the attack interval.
import { KIND, ANIM } from '@aue/schema';
import { offsetTile } from './dir.js';
import { tileOf } from './body.js';

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

/** Physical damage after defence, at least 5 % of the attack (spec 伤害-1, 伤害-2). @param {number} atk @param {number} def */
export const physicalDamage = (atk, def) => Math.max(atk - def, atk * 0.05);

/**
 * The enemy an operator attacks: the earliest-spawned living enemy whose tile (spec 体积-1) is in range.
 * @param {World} w @param {Unit} op @param {Cell[]} range @returns {Unit | null}
 */
export function pickTarget(w, op, range) {
  const cells = new Set(range.map((off) => { const c = rangeCell(op, off); return `${c.row},${c.col}`; }));
  for (const u of w.units) {
    if (u.kind !== KIND.ENEMY || u.hp <= 0) continue;
    const [r, c] = tileOf(u);
    if (cells.has(`${r},${c}`)) return u;
  }
  return null;
}

/** Every operator's attack this frame. @param {World} w @param {Content} c */
export function operatorsAttack(w, c) {
  for (const op of w.units) {
    if (op.kind !== KIND.OPERATOR) continue;
    if (op.atkCd > 0) { op.atkCd--; continue; }
    const t = pickTarget(w, op, c.operators[op.key].range);
    op.anim = t ? ANIM.ATTACK : ANIM.IDLE;
    if (!t) continue;
    const dmg = physicalDamage(op.atk, t.def);
    t.hp = Math.max(0, t.hp - dmg);
    op.atkCd = op.atkInterval - 1;
    w.events.push({ type: 'attack', id: op.id, target: t.id }, { type: 'hit', id: op.id, target: t.id, damage: dmg });
  }
}
