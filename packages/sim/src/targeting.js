// Targeting (docs/spec/targeting.md): the tiles of a range, who can be selected, and the official order of candidates —
// 阻挡, then 仇恨值 compared at a precision of 0.1, then the order they appeared in — by a stable insertion sort.
import { offsetTile } from './dir.js';
import { bodyKeys } from './body.js';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Cell} Cell @typedef {import('./body.js').Grid} Grid */

/**
 * The keys (row × cols + col) of the tiles a range covers (索敌-1): each offset turned with the facing of a unit on
 * tile (y, x), every tile stretched `extend` tiles straight ahead (攻击距离), tiles off the board dropped.
 * @param {Grid} grid @param {{ x: number, y: number, dir: unknown }} at @param {readonly Cell[]} offsets @param {number} [extend]
 * @returns {Set<number>}
 */
export function rangeKeys(grid, at, offsets, extend = 0) {
  /** @type {Set<number>} */
  const keys = new Set();
  for (const off of offsets) {
    for (let k = 0; k <= extend; k++) {
      const [r, c] = offsetTile(at.y, at.x, off.row, off.col + k, at.dir);
      if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) keys.add(r * grid.cols + c);
    }
  }
  return keys;
}

/** Whether any tile of a unit is among the keys (体积-1, 体积-2). @param {Unit} u @param {Set<number>} keys @param {Grid} grid */
export const inKeys = (u, keys, grid) => bodyKeys(u, grid).some((k) => keys.has(k));

/**
 * @typedef {object} Selector what an attack can select
 * @property {boolean} [canHitFly] it can select flying units
 * @property {boolean} [ignoreCamou] it ignores 迷彩
 */

/**
 * Whether a unit can be selected by the other side (索敌-2): on the field and not disappeared (路线-4), not 无法选中,
 * not 隐匿, not asleep, not camouflaged (unless the attack ignores 迷彩), not flying (unless the attack can hit flying
 * units).
 * @param {Unit} u @param {Selector} [sel]
 */
export function selectable(u, sel = {}) {
  if (u.hp <= 0 || u.hidden) return false;
  const s = statsOf(u), f = s.flags;
  if (f.untargetable || f.stealth || f.sleep) return false;
  if (f.camou && !sel.ignoreCamou) return false;
  return !s.flying || !!sel.canHitFly;
}

/** 仇恨值 of an enemy-type unit (索敌-3): 10⁸ × 嘲讽等级 − clamp(路径距离, −10⁸, 10⁸). @param {number} taunt @param {number} dist */
export const enemyHatred = (taunt, dist) => 1e8 * taunt - Math.min(1e8, Math.max(-1e8, dist));

/**
 * 仇恨值 of a character-type unit (索敌-5): 3 × 10⁸ × 嘲讽等级 + clamp(创建时间 × 1000 + 同帧部署数, ±3 × 10⁸), the time in
 * seconds.
 * @param {number} taunt @param {number} seconds @param {number} sameFrame
 */
export const characterHatred = (taunt, seconds, sameFrame) => 3e8 * taunt + Math.min(3e8, Math.max(-3e8, seconds * 1000 + sameFrame));

/** A value at a comparison precision: times its reciprocal, then to an integer toward zero (索敌-3). @param {number} v @param {number} [precision] */
export const precisionKey = (v, precision = 0.1) => Math.trunc(v * (1 / precision)) + 0;

/**
 * A stable insertion sort (索敌-3): each item moves before the earlier ones it compares below, never past an equal one.
 * @template T @param {T[]} items sorted in place @param {(a: T, b: T) => number} cmp @returns {T[]}
 */
export function insertionSort(items, cmp) {
  for (let i = 1; i < items.length; i++) {
    const x = items[i];
    let j = i - 1;
    while (j >= 0 && cmp(items[j], x) > 0) {
      items[j + 1] = items[j];
      j--;
    }
    items[j + 1] = x;
  }
  return items;
}

/**
 * @typedef {object} EnemyOrder
 * @property {boolean} melee 阻挡 counts first only for melee attackers
 * @property {(e: Unit) => number} pathDist the enemy's 路径距离, in tiles
 * @property {(e: Unit) => number} [priority] a special priority, lower first (技能、天赋; M3)
 */

/**
 * An operator's candidates in the official order (索敌-3): enemies it blocks (melee only), the special priority, 仇恨值
 * high to low at a precision of 0.1, then the order the candidates come in (who appeared first).
 * @param {Unit} attacker @param {readonly Unit[]} cands in the order they appeared @param {EnemyOrder} o @returns {Unit[]}
 */
export function sortEnemies(attacker, cands, o) {
  const rows = cands.map((e) => ({
    e, b: o.melee && e.blockedBy === attacker.id ? 0 : 1, p: o.priority ? o.priority(e) : 0,
    h: precisionKey(enemyHatred(statsOf(e).taunt, o.pathDist(e))),
  }));
  return insertionSort(rows, (a, b) => a.b - b.b || a.p - b.p || b.h - a.h).map((r) => r.e);
}

/** The 仇恨值 of one of our units from its creation (索敌-5). @param {Unit} u @param {number} fps */
const hatredOfCharacter = (u, fps) => characterHatred(statsOf(u).taunt, u.born / fps, u.bornN);

/**
 * An enemy's candidates in the official order (索敌-5): the unit blocking it, 仇恨值 high to low at a precision of 0.1 —
 * so the last deployed first — then the order the candidates come in.
 * @param {Unit} enemy @param {readonly Unit[]} cands @param {number} fps @returns {Unit[]}
 */
export function sortAllies(enemy, cands, fps) {
  const rows = cands.map((a) => ({ a, b: a.id === enemy.blockedBy ? 0 : 1, h: precisionKey(hatredOfCharacter(a, fps)) }));
  return insertionSort(rows, (x, y) => x.b - y.b || y.h - x.h).map((r) => r.a);
}

/** The first n of an ordered list (索敌-3: 目标数). @template T @param {readonly T[]} list @param {number} n @returns {T[]} */
export const firstN = (list, n) => list.slice(0, Math.max(1, Math.floor(n)));
