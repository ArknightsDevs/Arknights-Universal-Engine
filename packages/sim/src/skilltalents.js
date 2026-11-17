// The talents an operator reads while its skill runs (docs/spec/skills.md 技能-17): a skill that raises a talent's numbers
// (「第一天赋效果提升至{talent_scale}倍」) comes with the talent fields as they read then (`skillTalents` of the operator's
// record); its talents' parts — chances, in-range modifiers, the trait's — are read from them while it runs.

/** @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').OperatorDef} OperatorDef */

/** An operator record's view while its skill runs: the record with its `skillTalents` over it, made once. @type {WeakMap<OperatorDef, OperatorDef>} */
const views = new WeakMap();

/**
 * The record an operator's talents are read from now (技能-17): its skill's talent fields over its own while its skill runs
 * and raises its talents; else its own. The same object each time for the same record: read it, never change it.
 * @param {OperatorDef} d @param {Unit} op @returns {OperatorDef}
 */
export function talentsNow(d, op) {
  const st = d.skillTalents;
  if (!st || !op.skill || !op.skill.active) return d;
  let v = views.get(d);
  if (v === undefined) {
    v = { ...d, ...st };
    views.set(d, v);
  }
  return v;
}

/** Whether two modifier sets are the same. @param {Record<string, number>} a @param {Record<string, number>} b */
export const sameMods = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.entries(b).every(([k, v]) => a[k] === v);

const TUNED = Object.freeze({ tune: true }), PLAIN = Object.freeze({});
/**
 * Whether an operator's aura buffs are tuned to their modifiers, not only to their strength (技能-17): the buff of an aura talent
 * given while its source's skill raises its talents has other modifiers than before, with the same strength. It runs for every
 * aura buff of every frame, so it returns a shared object: spread it, never change it.
 * @param {OperatorDef} d @returns {Readonly<{ tune: true } | {}>}
 */
export const tunedFor = (d) => (d.skillTalents ? TUNED : PLAIN);
