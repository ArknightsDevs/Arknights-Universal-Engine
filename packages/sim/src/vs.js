// A trait's 倍率 by the target (docs/spec/traits.md 职业-17): an operator's hits on a target as it stands — its attack
// 倍率 before the target's 防御, its 伤害倍率 after —, its heals by the one it heals, and a whole attack's by how many
// enemies its splash reaches.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { bursting } from './elements.js';
import { tileOf } from './body.js';
import { dirVec } from './dir.js';
import { reachKeys } from './reach.js';
import { inKeys, hostile } from './targeting.js';
import { inSkill } from './modes.js';
import { traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').VsScale} VsScale @typedef {import('./damage.js').Damage} Damage */

/** Whether a unit is blocked, or blocks a unit (职业-17). @param {World} w @param {Unit} t */
const inBlock = (w, t) => (t.blockedBy ?? -1) >= 0 || w.units.some((u) => u.blockedBy === t.id);

/** Whether a unit stands on the line of tiles straight in front of an operator (职业-17). @param {Unit} op @param {Unit} t */
function inFront(op, t) {
  const [fr, fc] = dirVec(op.dir), [or, oc] = tileOf(op), [tr, tc] = tileOf(t), dr = tr - or, dc = tc - oc;
  return dr * fc - dc * fr === 0 && dr * fr + dc * fc > 0;
}

/** Whether a unit stands on an operator's tile or one of the 8 around it (职业-17). @param {Unit} op @param {Unit} t */
function nearBy(op, t) {
  const [or, oc] = tileOf(op), [tr, tc] = tileOf(t);
  return Math.max(Math.abs(tr - or), Math.abs(tc - oc)) <= 1;
}

/**
 * The target conditions (职业-17), each asked of the operator and the target as the hit (when there is one) or the heal
 * is worked out.
 * @type {Readonly<Record<VsScale['when'], (w: World, op: Unit, t: Unit, value: number, dmg?: Damage) => boolean>>}
 */
const WHEN = Object.freeze({
  blocked: (w, _op, t) => inBlock(w, t),
  flying: (_w, _op, t) => statsOf(t).flying,
  skillGround: (_w, op, t) => inSkill(op) && !statsOf(t).flying,
  hpBelow: (_w, _op, t, v) => t.hp < v * statsOf(t).maxHp,
  heavy: (_w, _op, t, v) => statsOf(t).massLevel >= v,
  front: (_w, op, t) => inFront(op, t),
  near: (_w, op, t) => nearBy(op, t),
  burst: (_w, _op, t) => bursting(t),
  onGround: (_w, _op, t) => t.z === 0,
  skill: (_w, _op, _t, _v, dmg) => !!dmg?.isSkill,
  elite: (_w, _op, t) => t.base.levelType === 'ELITE' || t.base.levelType === 'BOSS',
});

/**
 * Whether a 倍率's condition holds for the target (and the hit). @param {World} w @param {Unit} op @param {Unit} t @param {VsScale} v
 * @param {Damage} [dmg]
 */
const holds = (w, op, t, v, dmg) => WHEN[v.when](w, op, t, v.value ?? 0, dmg);

/**
 * The 伤害倍率 by the distance to the target (职业-17): 1 up to `min` tiles, rising in a line to 1 + `dmg` at `max` and on.
 * @param {Unit} op @param {Unit} t @param {{ min: number, max: number, dmg: number }} far
 */
function farMul(op, t, far) {
  const d = Math.sqrt((t.x - op.x) * (t.x - op.x) + (t.y - op.y) * (t.y - op.y));
  return 1 + far.dmg * Math.min(1, Math.max(0, (d - far.min) / (far.max - far.min)));
}

/** How many enemies stand in an operator's attack range now (职业-17). @param {World} w @param {Content} c @param {Unit} op */
function crowdOf(w, c, op) {
  const keys = reachKeys(c, op), grid = { rows: c.level.height, cols: c.level.width };
  return w.units.filter((u) => hostile(u) && u.hp > 0 && !u.hidden && inKeys(u, keys, grid)).length;
}

/** One 倍率 on a hit whose condition holds (职业-17). @param {Damage} dmg @param {VsScale} v */
function scaleHit(dmg, v) {
  if (v.atk) dmg.amount *= v.atk;
  if (v.dmg) dmg.mul = (dmg.mul ?? 1) * v.dmg;
  if (v.noDodge && dmg.type === 'phys') dmg.canDodge = false;
}

/**
 * An operator's hit on a target, by its trait's 倍率 for the target (职业-17), before the hit is dealt: every one whose
 * condition holds — its attack 倍率 on the amount, its 伤害倍率 on the hit's `mul`, physical dodge ignored —, the
 * distance's and the enemies in range's 伤害倍率. A sourceless hit, 生命流失 and elemental damage take none; nor a
 * hit of a unit that is not an operator.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} t @param {Damage} dmg
 */
export function vsDamage(w, c, op, t, dmg) {
  if (op.kind !== KIND.OPERATOR || dmg.sourceless || dmg.hpLoss || dmg.type === 'elemental') return;
  const tr = traitOf(c, op);
  for (const v of tr.vs) if ((v.atk || v.dmg) && holds(w, op, t, v, dmg)) scaleHit(dmg, v);
  if (tr.far) dmg.mul = (dmg.mul ?? 1) * farMul(op, t, tr.far);
  if (tr.crowd) dmg.mul = (dmg.mul ?? 1) * (1 + tr.crowd.step * Math.min(tr.crowd.cap, crowdOf(w, c, op)));
}

/**
 * The 元素损伤 an operator deals a target, by its 元素损伤倍率 (`epDealtMul`, 职业-18) and its trait's 倍率 for the target
 * (`ep`, 职业-17); 1 for a source that is not an operator.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t
 */
export function vsEp(w, c, src, t) {
  if (!src || src.kind !== KIND.OPERATOR) return 1;
  let k = statsOf(src).epDealtMul;
  for (const v of traitOf(c, src).vs) if (v.ep && holds(w, src, t, v)) k *= v.ep;
  return k;
}

/**
 * An operator's heal on a unit, by its trait's 倍率 for the one healed (职业-17): the product of those whose condition
 * holds; 1 for a healer that is not an operator.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t
 */
export function vsHeal(w, c, src, t) {
  if (!src || src.kind !== KIND.OPERATOR) return 1;
  let k = 1;
  for (const v of traitOf(c, src).vs) if (v.heal && holds(w, src, t, v)) k *= v.heal;
  return k;
}
