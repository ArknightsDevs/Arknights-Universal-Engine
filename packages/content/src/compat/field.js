// What Stronghold's battle answers about the field and does on it (docs/spec/compat.md 兼容-4), over the engine's own:
// the enemies on tiles or within a radius that an ability may select (索敌-2), the unit on a tile, the enemies a unit
// blocks; damage (伤害-7, 元素-2), healing (伤害-11), 生命流失 (伤害-10) and retreat (撤退-1). The battle's methods
// (battle.js) call these; units are the kits' (unit.js).
import { KIND, attrs, body, damage, traits, elements, deck } from '@aue/sim';
import { canTargetEnemy } from './sh/targeting.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').damage.Damage} Damage */

/** Stronghold's element names → the engine's (元素-1). @type {Record<string, import('@aue/sim').elements.Element>} */
const ELEMENT = { neural: 'SANITY', erosion: 'WATER', burn: 'FIRE', apoptosis: 'DARK' };

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

/** The enemies a unit blocks that it may select with `profile`. @param {ShUnit} u @param {Record<string, any>} [profile] */
export const blockedTargets = (u, profile) => (u?.blocking ?? []).filter((e) => canTargetEnemy(u, e, profile));

/**
 * Stronghold's damage info as the engine's hit (the same names, ADR 0012): a copy, its amount a number.
 * @param {Record<string, any>} d @returns {Damage}
 */
const hitOf = (d) => /** @type {Damage} */ ({ ...d, type: d.type ?? 'phys', amount: Number.isFinite(+d.amount) ? +d.amount : 0, tags: [...(d.tags ?? [])] });

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
    return el ? elements.dealEp(b.w, t, el, Number(dmg.amount) || 0) : 0;
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
