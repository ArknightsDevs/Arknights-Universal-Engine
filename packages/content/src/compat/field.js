// What Stronghold's battle answers about the field and does on it (docs/spec/compat.md 兼容-4), over the engine's own:
// the enemies on tiles or within a radius that an ability may select (索敌-2), the unit on a tile, the enemies a unit
// blocks; damage (伤害-7, 元素-2), healing (伤害-11), 生命流失 (伤害-10) and retreat (撤退-1). The battle's methods
// (battle.js) call these; units are the kits' (unit.js).
import { KIND, attrs, body, damage, traits, elements, deck, blocking, routes, paths } from '@aue/sim';
import { canTargetEnemy } from './sh/targeting.js';
import { ELEMENT } from './mods.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').damage.Damage} Damage */

/** The level's grid. @param {ShBattle} b */
const gridOf = (b) => ({ rows: b.c.level.height, cols: b.c.level.width });

/**
 * The enemies on the tile keys, in the keys' order, that `attacker` may select with `profile` (索敌-2); one on several
 * tiles once.
 * @param {ShBattle} b @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} attacker @param {Record<string, any>} [profile]
 * @returns {ShUnit[]}
 */
export function enemiesInKeys(b, keys, attacker, profile) {
  if (!keys) return [];
  const g = gridOf(b), list = b.enemies.map((e) => ({ e, at: body.bodyKeys(e, g) })), out = /** @type {ShUnit[]} */ ([]);
  for (const k of keys) {
    for (const { e, at } of list) if (at.includes(k) && !out.includes(e) && canTargetEnemy(attacker, e, profile)) out.push(e);
  }
  return out;
}

/**
 * The enemies on the field within `r` tiles of (x, y): a huge one by its body unless `centre`, which counts every one
 * by its position.
 * @param {ShBattle} b @param {number} x @param {number} y @param {number} r @param {boolean} [centre] @returns {ShUnit[]}
 */
export function enemiesInRadius(b, x, y, r, centre = false) {
  const r2 = r * r + 1e-9;
  return b.enemies.filter((e) => e.alive && !e.hidden && (e.hitArea && !centre ? body.bodyInRadius(e, x, y, r) : (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= r2));
}

/** Those of them an ability may select: not 无法选中, not 隐匿. @param {ShBattle} b @param {number} x @param {number} y @param {number} r @param {boolean} [centre] */
export function foesInRadius(b, x, y, r, centre = false) {
  return enemiesInRadius(b, x, y, r, centre).filter((e) => { const f = attrs.statsOf(/** @type {Unit} */ (e.u)).flags; return !f.untargetable && !f.stealth; });
}

/** The ally on a tile, or null. @param {ShBattle} b @param {number} r @param {number} c */
export function unitAt(b, r, c) {
  return b.allyUnits.find((a) => a.alive && a.tileR === r && a.tileC === c) ?? null;
}

/** The allies on the field in a unit's attack range that it may select (孤立 aside), not devices. @param {ShBattle} b @param {ShUnit} unit */
export function alliesInGrid(b, unit) {
  const keys = unit.rangeKeySet, g = gridOf(b);
  return b.allies().filter((a) => !a.hidden && body.bodyKeys(a, g).some((k) => keys.has(k)) && b.allySelectable(a, unit));
}

/**
 * The allies on the tile keys a healer may heal that need it — HP below the maximum (or, with `element`, 元素损伤 taken) —,
 * the lowest HP ratio first; one under 禁疗 or no ally may heal only for itself.
 * @param {ShBattle} b @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} healer @param {boolean} [element]
 */
export function injuredAlliesInKeys(b, keys, healer, element = false) {
  if (!keys) return [];
  const set = new Set(keys), g = gridOf(b);
  const out = b.allies().filter((a) => {
    const s = attrs.statsOf(/** @type {Unit} */ (a.u));
    if (a.hidden || !body.bodyKeys(a, g).some((k) => set.has(k))) return false;
    if (a !== healer && (s.flags.healFree || s.flags.noAllyHeal)) return false;
    return a.hp < s.maxHp - 1e-6 || (element && Object.keys(/** @type {Unit} */ (a.u).ep ?? {}).length > 0);
  });
  return out.map((a, i) => ({ a, i })).sort((x, y) => x.a.hpRatio - y.a.hpRatio || x.i - y.i).map((x) => x.a);
}

/** Whether a tile takes no unit placed by content: off the map, or a unit on it. @param {ShBattle} b @param {number} r @param {number} c */
export function isReservedTile(b, r, c) {
  return !b.grid.inBounds(r, c) || b.w.units.some((u) => u.hp > 0 && u.kind === KIND.OPERATOR && body.tileOf(u)[0] === r && body.tileOf(u)[1] === c);
}

/** What is left of an enemy's route, in tiles (索敌-6). @param {ShBattle} b @param {ShUnit} e */
export const remainingDistance = (b, e) => (e?.u && e.u.kind === KIND.ENEMY ? routes.pathDistance(b.c, e.u) : 0);

/** A unit lets go of every enemy it blocks (阻挡-3). @param {ShBattle} b @param {ShUnit} u */
export function releaseBlocked(b, u) {
  if (u?.u) blocking.releaseAll(b.w, u.u.id);
}

/** The enemies a unit blocks that it may select with `profile`. @param {ShUnit} u @param {Record<string, any>} [profile] */
export const blockedTargets = (u, profile) => (u?.blocking ?? []).filter((e) => canTargetEnemy(u, e, profile));

/** The hits kits deal themselves (not the engine's attacks'), for the attack overrides that act on an attack's own (specs.js). @type {WeakSet<object>} */
export const kitHits = new WeakSet();

/**
 * Stronghold's damage info as the engine's hit (the same names, ADR 0012): a copy, its amount a number; marked as a
 * kit's own hit.
 * @param {Record<string, any>} d @returns {Damage}
 */
function hitOf(d) {
  const hit = /** @type {Damage} */ ({ ...d, type: d.type ?? 'phys', amount: Number.isFinite(+d.amount) ? +d.amount : 0, tags: [...(d.tags ?? [])] });
  kitHits.add(hit);
  return hit;
}

/**
 * Damage from a unit, or from none (伤害-7): an operator's is credited with a kill (职业-5); 元素损伤 (`type` 'element')
 * goes to the target's element (元素-2). Returns the HP taken (the 元素损伤 dealt).
 * @param {ShBattle} b @param {ShUnit | null} source @param {ShUnit} target @param {Record<string, any>} dmg
 */
export function dealDamage(b, source, target, dmg) {
  const t = target?.u, s = source?.u ?? null;
  if (!t || !target.alive) return 0;
  if (dmg.type === 'element') {
    const el = ELEMENT[dmg.element];
    return el ? elements.dealEp(b.w, t, el, Number(dmg.amount) || 0, s) : 0;
  }
  const hit = hitOf(dmg);
  return s && s.kind === KIND.OPERATOR ? traits.creditedDamage(b.w, b.c, s, t, hit) : damage.dealDamage(b.w, s, t, hit);
}

/** A heal (伤害-11). @param {ShBattle} b @param {ShUnit | null} source @param {ShUnit} target @param {number} amount */
export function heal(b, source, target, amount) {
  return target?.u && target.alive ? damage.heal(b.w, source?.u ?? null, target.u, Number(amount) || 0) : 0;
}

/**
 * 生命流失 (伤害-10), tagged as Stronghold tags it.
 * @param {ShBattle} b @param {ShUnit} target @param {number} amount @param {{ source?: ShUnit | null, tags?: string[] }} [o]
 */
export function loseHp(b, target, amount, o = {}) {
  if (!target?.u || !target.alive || !(amount > 0)) return 0;
  return damage.dealDamage(b.w, o.source?.u ?? null, target.u, { type: 'true', amount, hpLoss: true, tags: ['hpLoss', ...(o.tags ?? [])] });
}

/** An operator leaves the field as a retreat (撤退-1). @param {ShBattle} b @param {ShUnit} unit */
export function retreat(b, unit) {
  if (unit?.u && unit.alive && unit.u.kind === KIND.OPERATOR) deck.withdraw(b.w, b.c, unit.u);
}

/**
 * The ground tiles the field's enemies walk on (Stronghold's groundPathTiles): of every route the level's waves spawn on
 * that is not a flying one (every such route when none is named), the tiles its way crosses (寻路-2) from its start
 * through its MOVE and APPEAR_AT_POS checkpoints to its end. Tile keys.
 * @param {ShBattle} b @returns {Set<number>}
 */
export function groundPathTiles(b) {
  const lv = b.c.level, out = new Set();
  const used = new Set(lv.waves.flatMap((w) => w.fragments.flatMap((f) => f.actions)).filter((a) => a.type === 'SPAWN' && Number.isInteger(a.route)).map((a) => a.route));
  const walks = (/** @type {any} */ r) => !!r && r.motion !== 'FLY';
  const any = [...used].some((i) => walks(lv.routes[i]));
  const keyOf = (/** @type {{ row: number, col: number }} */ p) => Math.max(0, Math.min(lv.height - 1, Math.round(p.row))) * lv.width + Math.max(0, Math.min(lv.width - 1, Math.round(p.col)));
  lv.routes.forEach((r, i) => {
    if (!walks(r) || (any && !used.has(i))) return;
    const pts = [r.start, ...r.checkpoints.filter((cp) => cp.type === 'MOVE' || cp.type === 'APPEAR_AT_POS'), r.end].map(keyOf);
    for (let j = 1; j < pts.length; j++) for (const k of paths.routeTiles(lv, pts[j - 1], pts[j], { diagonal: r.allowDiagonal ?? true }) ?? []) out.add(k);
  });
  return out;
}
