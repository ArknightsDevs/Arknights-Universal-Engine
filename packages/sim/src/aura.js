// Auras (docs/spec/traits.md 职业-13, docs/spec/field.md 部署-5, 部署-6): an operator that raises the 生命回复速度 of
// every operator in its attack range by a share of its attack, an operator's talents for every operator of a profession
// or faction, and its talents for the units in its attack range, while it is on the field — a buff per aura on each of
// them, kept in step every frame, gone with the aura's source.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { rangeKeys, inKeys } from './targeting.js';
import { traitOf } from './traits.js';
import { statMods } from './skills.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** What an aura gives one unit: its source, its strength (to see a change) and its modifiers. @typedef {{ src: number, value: number, mods: Record<string, number> }} Want */

/** Whether a buff is an aura's. @param {{ key: string }} b */
const isAura = (b) => b.key.startsWith('aura:') || b.key.startsWith('field:') || b.key.startsWith('range:');

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
 * The regen aura of one source (职业-13): every operator with a tile in its attack range (itself too).
 * @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
function regenAura(c, src, ops, want) {
  const share = traitOf(c, src).regenAura;
  if (!(share > 0)) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = rangeKeys(grid, src, c.operators[src.key].range, statsOf(src).rangeExtend);
  const amount = shareOf(c, src, share) * statsOf(src).atk;
  for (const u of ops) if (inKeys(u, keys, grid)) want.get(u)?.set(`aura:${src.id}`, { src: src.id, value: amount, mods: { hpRegen: amount } });
}

/**
 * Whether a team talent is for an operator (部署-5): its profession, or one of its factions, is the talent's.
 * @param {import('./types.js').TeamTalent} t @param {import('./types.js').OperatorDef} d
 */
export const teamFits = (t, d) => ('profession' in t ? d.profession === t.profession : (d.powers ?? []).includes(t.power));

/**
 * The on-field team talents of one source (部署-5): every operator on the field the talent is for, any player's.
 * @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
function fieldTalents(c, src, ops, want) {
  (c.operators[src.key].fieldTalents ?? []).forEach((t, i) => {
    const mods = statMods(t.bb);
    for (const u of ops) if (teamFits(t, c.operators[u.key])) want.get(u)?.set(`field:${src.id}:${i}`, { src: src.id, value: 0, mods });
  });
}

/**
 * The in-range talents of one source (部署-6): the enemies (not neutral units), or the operators (only ranged ones when
 * the talent says so), with a tile in its attack range.
 * @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function rangeTalents(c, src, units, want) {
  const talents = c.operators[src.key].rangeTalents ?? [];
  if (talents.length === 0) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = rangeKeys(grid, src, c.operators[src.key].range, statsOf(src).rangeExtend);
  talents.forEach((t, i) => {
    for (const u of units) {
      const fits = t.side === 'enemy' ? u.kind === KIND.ENEMY && u.base.neutral !== true : u.kind === KIND.OPERATOR && (!t.ranged || c.operators[u.key].position === 'RANGED');
      if (fits && inKeys(u, keys, grid)) want.get(u)?.set(`range:${src.id}:${i}`, { src: src.id, value: 0, mods: t.mods });
    }
  });
}

/**
 * Every aura this frame, before the operators' turns (职业-13, 部署-5, 部署-6): each operator on the field gives its
 * regen aura, its on-field team talents and its in-range talents as buffs; a unit out of an aura's reach, or whose
 * source left, loses its buff.
 * @param {World} w @param {Content} c
 */
export function auras(w, c) {
  const units = w.units.filter((u) => u.hp > 0), ops = units.filter((u) => u.kind === KIND.OPERATOR);
  /** @type {Map<Unit, Map<string, Want>>} */
  const want = new Map(units.map((u) => [u, new Map()]));
  for (const src of ops) {
    regenAura(c, src, ops, want);
    fieldTalents(c, src, ops, want);
    rangeTalents(c, src, units, want);
  }
  for (const u of w.units) sync(u, want.get(u) ?? new Map());
}

/**
 * A unit's aura buffs as they should be: the ones it should have added or retuned, the others removed.
 * @param {Unit} u @param {Map<string, Want>} want by buff key
 */
function sync(u, want) {
  for (const b of u.buffs.filter((x) => isAura(x) && !want.has(x.key))) removeBuff(u, b);
  for (const [key, x] of want) {
    const b = u.buffs.find((y) => y.key === key);
    if (!b) addBuff(u, makeBuff({ key, src: x.src, value: x.value, mods: x.mods }));
    else if (b.value !== x.value) retune(u, b, x.value, x.mods);
  }
}
