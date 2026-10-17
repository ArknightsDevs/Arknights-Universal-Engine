// Auras (docs/spec/traits.md 职业-13, docs/spec/field.md 部署-5, 部署-6, docs/spec/devices.md 装置-4): an operator that
// raises the 生命回复速度 of every operator in its attack range by a share of its attack, an operator's talents for every
// operator of a profession or faction, its talents for the units in its attack range, a 替身's slow of the enemies
// around it, and a device's modifiers for every enemy, while the source is on the field — a buff per aura on each of
// them, kept in step every frame, gone with the aura's source.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { inKeys, hostile } from './targeting.js';
import { reachKeys } from './reach.js';
import { traitOf, dollNow, summonHeld } from './traits.js';
import { statMods } from './skills.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/**
 * What an aura gives one unit: its source, its strength (to see a change), its modifiers and flags.
 * @typedef {{ src: number, value: number, mods: Record<string, number>, flags?: Record<string, boolean> }} Want
 */

/** Whether a buff is an aura's. @param {{ key: string }} b */
const isAura = (b) => b.key.startsWith('aura:') || b.key.startsWith('field:') || b.key.startsWith('range:') || b.key.startsWith('doll:') || b.key.startsWith('mod:');

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
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src), amount = shareOf(c, src, share) * statsOf(src).atk;
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
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src);
  talents.forEach((t, i) => {
    for (const u of units) {
      const fits = t.side === 'enemy' ? hostile(u) : u.kind === KIND.OPERATOR && (!t.ranged || c.operators[u.key].position === 'RANGED');
      if (fits && inKeys(u, keys, grid)) want.get(u)?.set(`range:${src.id}:${i}`, { src: src.id, value: 0, mods: t.mods });
    }
  });
}

/**
 * The slow of a 替身's aura (职业-16): while it fights, every ground enemy (not neutral) in its range moves at × `moveMul`
 * (最终乘算), one buff per 替身.
 * @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function dollAura(c, src, units, want) {
  const a = dollNow(c, src)?.aura;
  if (!a) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src);
  for (const u of units) if (hostile(u) && !statsOf(u).flying && inKeys(u, keys, grid)) want.get(u)?.set(`doll:${src.id}`, { src: src.id, value: a.moveMul, mods: { moveMul: a.moveMul } });
}

/**
 * The auras a module adds to an operator's trait (职业-20): the enemies (not neutral) it blocks, those its own summons
 * block, or those with a tile in its attack range, each with the aura's modifiers and flags — a buff `mod:<its id>:<n>`.
 * @param {World} w @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function moduleAuras(w, c, src, units, want) {
  const list = traitOf(c, src).auras;
  if (list.length === 0) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src), bySummon = summonHeld(w, src);
  const holds = { blocked: (/** @type {Unit} */ u) => u.blockedBy === src.id, summonBlocked: bySummon, range: (/** @type {Unit} */ u) => inKeys(u, keys, grid) };
  list.forEach((a, i) => {
    for (const u of units) if (hostile(u) && holds[a.to](u)) want.get(u)?.set(`mod:${src.id}:${i}`, { src: src.id, value: 0, mods: a.mods ?? {}, ...(a.flags ? { flags: a.flags } : {}) });
  });
}

/**
 * A device's modifiers for every enemy on the field, neutral units aside (装置-4): one buff per device, so the devices'
 * modifiers stack.
 * @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function deviceAura(c, src, units, want) {
  const mods = c.devices?.[src.key]?.enemyMods;
  if (!mods) return;
  for (const u of units) if (u.kind === KIND.ENEMY && u.base.neutral !== true) want.get(u)?.set(`aura:${src.id}`, { src: src.id, value: 0, mods });
}

/**
 * Every aura this frame, before the operators' turns (职业-13, 职业-16, 职业-20, 部署-5, 部署-6, 装置-4): each operator on
 * the field gives its regen aura, its on-field team talents, its in-range talents, its 替身's slow and its module's auras as buffs, each device
 * its modifiers for the enemies; a unit out of an aura's reach, or whose source left, loses its buff.
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
    dollAura(c, src, units, want);
    moduleAuras(w, c, src, units, want);
  }
  for (const src of units) if (src.kind === KIND.DEVICE) deviceAura(c, src, units, want);
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
    if (!b) addBuff(u, makeBuff({ key, src: x.src, value: x.value, mods: x.mods, ...(x.flags ? { flags: x.flags } : {}) }));
    else if (b.value !== x.value) retune(u, b, x.value, x.mods);
  }
}
