// The field marks the page shows (render spec 渲染-8, 渲染-9), from the session's world: with an operator selected for
// deployment, the tiles it may be deployed on now and, on one of them, its range deployed there; without one, what this
// seat's operator on the pointer's tile reaches now.
import { KIND } from '@aue/schema';
import { fitsTile, placedReach, reachKeys, healsNow, summons, facilities } from '@aue/sim';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content */
/**
 * What the page asks: the selected operator (content key) and its facing (schema DIR), and the tile under the pointer.
 * @typedef {{ op?: string | null, dir?: number, tile?: { row: number, col: number } | null }} MarkQuery
 */
/** @typedef {{ deployable: number[], range: { keys: number[], heal: boolean } | null }} Marks tile keys are row × width + col */

/**
 * The tiles an operator may be deployed on now (渲染-8): the ones it fits (部署-1) on the field as the facilities make it
 * (守御-5) with no operator or device on them but a built platform — for a summon of `seat` that may only stand in its
 * owner's attack range, within it (召唤-4); for a builder, in a rest, next to a facility below level 3 (守御-4).
 * @param {World} w @param {Content} c @param {string} op @param {number} [seat] @returns {number[]}
 */
export function deployableKeys(w, c, op, seat = 0) {
  const { width, height } = c.level, field = facilities.fieldContent(w, c), builder = c.operators[op]?.builder;
  if (builder && w.fortress?.phase !== 'rest') return [];
  const holds = (/** @type {import('@aue/sim').Unit} */ u) => u.kind === KIND.OPERATOR || (u.kind === KIND.DEVICE && !facilities.builtPlatform(w, c, u.y, u.x));
  const taken = new Set(w.units.filter(holds).map((u) => u.y * width + u.x));
  const keys = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (taken.has(row * width + col) || !fitsTile(field, op, row, col) || (builder && !facilities.nextToFacility(w, c, row, col))) continue;
      if (summons.inOwnerRange(w, c, seat, op, { row, col })) keys.push(row * width + col);
    }
  }
  return keys;
}

/**
 * The marks for a query (渲染-8, 渲染-9): with `op`, the tiles it may be deployed on and, when the tile is one of them,
 * its range deployed there facing `dir`; without, the range of `seat`'s operator on the tile now (攻击-1, 技能-8) and
 * whether it heals now (职业-2).
 * @param {World | null} w @param {Content} c @param {number} seat @param {MarkQuery} q @returns {Marks}
 */
export function marksFor(w, c, seat, q) {
  if (!w) return { deployable: [], range: null };
  const t = q.tile ?? null;
  if (q.op && Object.hasOwn(c.operators, q.op)) {
    const deployable = deployableKeys(w, c, q.op, seat);
    if (!t || !deployable.includes(t.row * c.level.width + t.col)) return { deployable, range: null };
    const r = placedReach(c, q.op, t.row, t.col, q.dir ?? 0);
    return { deployable, range: { keys: [...r.keys], heal: r.heal } };
  }
  const u = t && w.units.find((x) => x.kind === KIND.OPERATOR && x.owner === seat && x.x === t.col && x.y === t.row);
  return { deployable: [], range: u ? { keys: [...reachKeys(c, u)], heal: healsNow(c, u) } : null };
}
