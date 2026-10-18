// A trait's modifiers while a condition on the operator holds (docs/spec/traits.md 职业-18): its modules' additions that
// last while it blocks or does not, while its HP is above or below a share, while enemies or allies in its range are so,
// while no ally stands around it, while it holds stored energy — a buff each, given and taken back at its turn.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { bursting, ELEMENTS, epOf } from './elements.js';
import { tileOf } from './body.js';
import { rangeKeys, inKeys, hostile } from './targeting.js';
import { traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').WhileMods} WhileMods */

/** The units on an operator's own attack range now (职业-18): its range, not a skill's, turned with it and extended. @param {World} w @param {Content} c @param {Unit} op */
function inOwnRange(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, keys = rangeKeys(grid, op, op.range ?? c.operators[op.key].range, statsOf(op).rangeExtend);
  return w.units.filter((u) => u.hp > 0 && !u.hidden && inKeys(u, keys, grid));
}

/** Whether a unit is an operator, not a summon (职业-18). @param {Unit} u */
const isOperator = (u) => u.kind === KIND.OPERATOR && u.summoner === undefined;

/** Whether another operator stands on one of the tiles around a unit: the 4 next to it, or the 8 (职业-18). @param {World} w @param {Unit} op @param {number} n */
function crowded(w, op, n) {
  const [r, col] = tileOf(op);
  return w.units.some((u) => {
    if (u === op || u.hp <= 0 || !isOperator(u)) return false;
    const [ur, uc] = tileOf(u), dr = Math.abs(ur - r), dc = Math.abs(uc - col);
    return n === 4 ? dr + dc === 1 : Math.max(dr, dc) === 1;
  });
}

/** Whether a unit has an element value below its maximum. @param {Unit} u */
const epDamaged = (u) => ELEMENTS.some((el) => epOf(u, el) < statsOf(u).maxEp);

/**
 * The conditions on the operator (职业-18), each asked at its turn.
 * @type {Readonly<Record<WhileMods['when'], (w: World, c: Content, op: Unit, value: number) => boolean>>}
 */
const WHEN = Object.freeze({
  blocking: (w, _c, op) => w.units.some((e) => e.blockedBy === op.id && e.hp > 0),
  notBlocking: (w, _c, op) => !w.units.some((e) => e.blockedBy === op.id && e.hp > 0),
  hpAbove: (_w, _c, op, v) => op.hp > v * statsOf(op).maxHp,
  hpBelow: (_w, _c, op, v) => op.hp < v * statsOf(op).maxHp,
  enemies: (w, c, op, v) => inOwnRange(w, c, op).filter(hostile).length >= v,
  groundEnemies: (w, c, op, v) => inOwnRange(w, c, op).filter((u) => hostile(u) && !statsOf(u).flying).length >= v,
  eliteEnemies: (w, c, op) => inOwnRange(w, c, op).some((u) => hostile(u) && (u.base.levelType === 'ELITE' || u.base.levelType === 'BOSS')),
  burstEnemies: (w, c, op) => inOwnRange(w, c, op).some((u) => hostile(u) && bursting(u)),
  allies: (w, c, op, v) => inOwnRange(w, c, op).filter((u) => u !== op && isOperator(u)).length >= v,
  injuredAllies: (w, c, op) => inOwnRange(w, c, op).some((u) => u.kind === KIND.OPERATOR && u.hp < statsOf(u).maxHp),
  epAllies: (w, c, op) => inOwnRange(w, c, op).some((u) => u.kind === KIND.OPERATOR && epDamaged(u)),
  skillAllies: (w, c, op) => inOwnRange(w, c, op).some((u) => u !== op && isOperator(u) && !!u.skill && u.skill.active),
  alone4: (w, _c, op) => !crowded(w, op, 4),
  alone8: (w, _c, op) => !crowded(w, op, 8),
  energy: (_w, _c, op) => (op.buffs.find((b) => b.key === 'energy')?.value ?? 0) > 0,
  always: () => true,
  inSkill: (_w, _c, op) => !!op.skill && op.skill.active,
  alchemy: (w, _c, op) => (w.alchemy ?? []).some((a) => a.src === op.id),
});

/**
 * At the start of an operator's turn (职业-18): each of its trait's `whiles` is a buff `while:<n>` with its modifiers
 * while its condition holds; when it no longer does, the buff goes.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function traitWhiles(w, c, op) {
  const list = traitOf(c, op).whiles;
  for (let i = 0; i < list.length; i++) {
    const x = list[i], key = `while:${i}`, on = WHEN[x.when](w, c, op, x.value ?? 0), has = op.buffs.some((b) => b.key === key);
    if (on && !has) addBuff(op, makeBuff({ key, src: op.id, mods: { ...x.mods }, ...(x.flags ? { flags: { ...x.flags } } : {}) }));
    else if (!on && has) removeBuff(op, key);
  }
}
