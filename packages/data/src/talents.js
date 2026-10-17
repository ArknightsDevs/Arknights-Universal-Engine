// An operator's talents (docs/spec/operators.md 干员-4) and the pieces they share with the modules' talent parts
// (干员-5): unlock phase, blackboards, optional text. Pure functions over parsed game data.
import { asArray, asInt, asNumber, asObject, asString, field } from './validate.js';

/** PHASE_n → n. @param {unknown} v @param {string} p */
export const phaseOf = (v, p) => {
  const s = asString(v, p);
  if (!/^PHASE_[0-2]$/.test(s)) throw new Error(`${p}: expected PHASE_0…PHASE_2, got ${s}`);
  return Number(s.slice(6));
};

/** A string that may be missing. @param {unknown} v @param {string} p @returns {string | null} */
export function optString(v, p) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error(`${p}: expected a string or null`);
  return v;
}

/**
 * A blackboard list split into numbers and texts (干员-4): an entry carrying a valueStr is a text (its value is a
 * placeholder), the others are numbers. The texts are only present when there are some.
 * @param {unknown} raw @param {string} p @returns {{ bb: Record<string, number>, text?: Record<string, string> }}
 */
export function boardsOf(raw, p) {
  /** @type {Record<string, number>} */
  const bb = {};
  /** @type {Record<string, string>} */
  const text = {};
  asArray(raw ?? [], p).forEach((b, i) => {
    const bp = `${p}[${i}]`, o = asObject(b, bp), key = asString(field(o, 'key', bp), `${bp}.key`);
    if (Object.hasOwn(bb, key) || Object.hasOwn(text, key)) throw new Error(`${bp}.key: duplicate ${key}`);
    const str = optString(o.valueStr, `${bp}.valueStr`);
    if (str === null) bb[key] = asNumber(field(o, 'value', bp), `${bp}.value`, -1e9, 1e9);
    else text[key] = str;
  });
  return Object.keys(text).length ? { bb, text } : { bb };
}

/**
 * The unlock condition and potential every candidate carries.
 * @param {Record<string, unknown>} o @param {string} p
 * @returns {{ phase: number, level: number, potential: number }}
 */
export function unlockOf(o, p) {
  const u = asObject(field(o, 'unlockCondition', p), `${p}.unlockCondition`);
  return {
    phase: phaseOf(u.phase, `${p}.unlockCondition.phase`), level: asInt(u.level, `${p}.unlockCondition.level`, 0, 200),
    potential: asInt(o.requiredPotentialRank, `${p}.requiredPotentialRank`, 0, 5),
  };
}

/**
 * One talent candidate of character_table (干员-4): unlock, name, description (null for a hidden talent), range id, the
 * blackboard, whether the talent is hidden, the token it belongs to, the talent it is (prefabKey; a module's talent parts
 * name it, 干员-7).
 * @param {unknown} raw @param {string} p
 */
function candidateOf(raw, p) {
  const o = asObject(raw, p);
  return {
    ...unlockOf(o, p), name: optString(o.name, `${p}.name`), description: optString(o.description, `${p}.description`),
    rangeId: optString(o.rangeId, `${p}.rangeId`), ...boardsOf(o.blackboard, `${p}.blackboard`),
    hidden: o.isHideTalent === true, token: optString(o.tokenKey, `${p}.tokenKey`), prefab: optString(o.prefabKey, `${p}.prefabKey`),
  };
}

/**
 * A module part's talent candidate (干员-5): the talent index it adds to (−1, −2: a talent of its own), the talent it is
 * (prefabKey), the unlock, the name, the upgrade description, the range id, the blackboard, whether it is hidden, the
 * modes it is valid in.
 * @param {unknown} raw @param {string} p
 */
export function partTalentOf(raw, p) {
  const o = asObject(raw, p), modes = o.validModeIndices;
  if (modes !== null && modes !== undefined) asArray(modes, `${p}.validModeIndices`).forEach((m, i) => asInt(m, `${p}.validModeIndices[${i}]`, 0, 9));
  return {
    index: asInt(field(o, 'talentIndex', p), `${p}.talentIndex`, -9, 9), prefab: optString(o.prefabKey, `${p}.prefabKey`), ...unlockOf(o, p),
    name: optString(o.name, `${p}.name`),
    upgrade: optString(o.upgradeDescription, `${p}.upgradeDescription`), rangeId: optString(o.rangeId, `${p}.rangeId`),
    ...boardsOf(o.blackboard, `${p}.blackboard`), hidden: o.isHideTalent === true, modes: modes ?? null,
  };
}

/**
 * Every talent of an operator, each with its candidates in order (干员-4); none for a null talents list.
 * @param {unknown} raw character_table's talents @param {string} p
 */
export function talentsOf(raw, p) {
  return asArray(raw ?? [], p).map((t, i) => {
    const tp = `${p}[${i}]`;
    return asArray(asObject(t, tp).candidates ?? [], `${tp}.candidates`).map((c, k) => candidateOf(c, `${tp}.candidates[${k}]`));
  });
}
