// Auras (docs/spec/traits.md 职业-13): an operator that raises the 生命回复速度 of every operator in its attack range by a
// share of its attack — a buff per aura on each of them, kept in step every frame, gone with the aura's source.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { rangeKeys, inKeys } from './targeting.js';
import { traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/** The buff key of an aura's source. @param {number} id */
const keyOf = (id) => `aura:${id}`;

/**
 * An aura's share of its source's attack now (职业-13): its skill's `attack@atk_to_hp_recovery_ratio` (or the same key
 * without `attack@`) while the skill runs and gives one, else the trait's.
 * @param {Content} c @param {Unit} op @param {number} base
 */
function shareOf(c, op, base) {
  const bb = op.skill && op.skill.active ? c.operators[op.key].skill?.bb ?? {} : {};
  return bb['attack@atk_to_hp_recovery_ratio'] ?? bb.atk_to_hp_recovery_ratio ?? base;
}

/**
 * Every aura this frame, before the operators' turns (职业-13): each operator on the field with a regen aura gives
 * every operator with a tile in its attack range (itself too) a buff `aura:<its id>` with 生命回复速度 + share × its
 * attack; one out of range, or whose source left, loses it.
 * @param {World} w @param {Content} c
 */
export function auras(w, c) {
  const grid = { rows: c.level.height, cols: c.level.width }, ops = w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0);
  /** @type {Map<Unit, Map<string, number>>} */
  const want = new Map(ops.map((u) => [u, new Map()]));
  for (const src of ops) {
    const share = traitOf(c, src).regenAura;
    if (!(share > 0)) continue;
    const keys = rangeKeys(grid, src, c.operators[src.key].range, statsOf(src).rangeExtend), amount = shareOf(c, src, share) * statsOf(src).atk;
    for (const u of ops) if (inKeys(u, keys, grid)) want.get(u)?.set(keyOf(src.id), amount);
  }
  for (const u of w.units) sync(u, want.get(u) ?? new Map());
}

/**
 * A unit's aura buffs as they should be (职业-13): the ones it should have added or retuned, the others removed.
 * @param {Unit} u @param {Map<string, number>} want key → 生命回复速度
 */
function sync(u, want) {
  for (const b of u.buffs.filter((x) => x.key.startsWith('aura:') && !want.has(x.key))) removeBuff(u, b);
  for (const [key, amount] of want) {
    const b = u.buffs.find((x) => x.key === key);
    if (!b) addBuff(u, makeBuff({ key, src: Number(key.slice(5)), value: amount, mods: { hpRegen: amount } }));
    else if (b.value !== amount) retune(u, b, amount, { hpRegen: amount });
  }
}
