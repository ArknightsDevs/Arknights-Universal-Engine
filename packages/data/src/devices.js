// The devices a level places (docs/spec/level.md 关卡-6): each predefined unit's record from the character table — its
// attributes at its training (its phase, its level between that phase's first and last key frames) and its talents'
// blackboard (a device's talents are hidden ones) — besides the co-op stage control, which is no unit (合作-6).
import { asArray, asNumber, asObject, asString, field } from './validate.js';

/** The co-op stage controller (合作-6): no unit on the field. */
const STAGE_CONTROLLER = 'trap_179_muctrl';

/** The phases by name. @type {Readonly<Record<string, number>>} */
const PHASE = Object.freeze({ PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 });

/** The attributes a device record keeps, by the character table's names. */
const ATTRS = Object.freeze({ maxHp: 'maxHp', atk: 'atk', def: 'def', res: 'magicResistance', blockCnt: 'blockCnt', baseAttackTime: 'baseAttackTime',
  aspd: 'attackSpeed', tauntLevel: 'tauntLevel', massLevel: 'massLevel' });

/**
 * The attributes at `level` of a phase: its first key frame's, its last one's at their levels, linear in between.
 * @param {unknown} phase @param {number} level @param {string} p the path for errors @returns {Record<string, number>}
 */
function attributesAt(phase, level, p) {
  const frames = asArray(field(asObject(phase, p), 'attributesKeyFrames', p), `${p}.attributesKeyFrames`);
  if (frames.length === 0) throw new Error(`${p}.attributesKeyFrames: empty`);
  const at = (/** @type {number} */ i) => {
    const fp = `${p}.attributesKeyFrames[${i}]`, o = asObject(frames[i], fp);
    return { level: asNumber(field(o, 'level', fp), `${fp}.level`, 1, 999), data: asObject(field(o, 'data', fp), `${fp}.data`) };
  };
  const a = at(0), b = at(frames.length - 1), t = b.level > a.level ? Math.min(1, Math.max(0, (level - a.level) / (b.level - a.level))) : 0;
  return Object.fromEntries(Object.entries(ATTRS).map(([k, src]) => {
    const x = asNumber(field(a.data, src, `${p}.data`), `${p}.data.${src}`, -1e9, 1e9), y = asNumber(field(b.data, src, `${p}.data`), `${p}.data.${src}`, -1e9, 1e9);
    return [k, x + (y - x) * t];
  }));
}

/**
 * Its talents' blackboard at a phase: every talent's last candidate unlocked at it, their keys merged in order.
 * @param {Record<string, unknown>} c the character table entry @param {number} phase @param {string} p @returns {Record<string, number>}
 */
function talentBb(c, phase, p) {
  /** @type {Record<string, number>} */
  let bb = {};
  for (const [i, t] of asArray(c.talents ?? [], `${p}.talents`).entries()) {
    const cands = asArray(field(asObject(t, `${p}.talents[${i}]`), 'candidates', `${p}.talents[${i}]`), `${p}.talents[${i}].candidates`);
    const unlocked = cands.filter((x) => (PHASE[String(/** @type {any} */ (x)?.unlockCondition?.phase)] ?? 0) <= phase).at(-1);
    for (const e of asArray(/** @type {any} */ (unlocked)?.blackboard ?? [], `${p}.talents[${i}].blackboard`)) {
      const o = asObject(e, `${p}.talents[${i}].blackboard[]`);
      bb = { ...bb, [asString(field(o, 'key', p), `${p}.key`)]: asNumber(field(o, 'value', p), `${p}.value`, -1e9, 1e9) };
    }
  }
  return bb;
}

/**
 * The records of the devices among a level's predefined units (关卡-6), by key: name, attributes and talents' blackboard
 * at the training its first instance has; none for the stage control.
 * @param {unknown} charTable character_table.json @param {unknown} raw level.predefines @returns {Record<string, Record<string, unknown>>}
 */
export function devicesOf(charTable, raw) {
  if (raw === null || raw === undefined) return {};
  const pd = asObject(raw, 'level.predefines'), table = asObject(charTable, 'character_table');
  /** @type {Record<string, Record<string, unknown>>} */
  const out = {};
  for (const k of ['characterInsts', 'tokenInsts']) {
    for (const [i, x] of (Array.isArray(pd[k]) ? pd[k] : []).entries()) {
      const p = `level.predefines.${k}[${i}]`, inst = asObject(field(asObject(x, p), 'inst', p), `${p}.inst`), key = asString(field(inst, 'characterKey', `${p}.inst`), `${p}.inst.characterKey`);
      if (key === STAGE_CONTROLLER || Object.hasOwn(out, key) || !Object.hasOwn(table, key)) continue;
      const cp = `character_table[${key}]`, c = asObject(table[key], cp), phase = PHASE[String(inst.phase)] ?? 0, level = typeof inst.level === 'number' ? inst.level : 1;
      const phases = asArray(field(c, 'phases', cp), `${cp}.phases`);
      out[key] = { name: asString(field(c, 'name', cp), `${cp}.name`), ...attributesAt(phases[Math.min(phase, phases.length - 1)], level, `${cp}.phases[${phase}]`), talentBb: talentBb(c, phase, cp) };
    }
  }
  return out;
}
