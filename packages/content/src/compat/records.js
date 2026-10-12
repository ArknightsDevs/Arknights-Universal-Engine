// Stronghold records of the engine's operators (docs/spec/compat.md 兼容-3): an operator's training data at a build as
// the chess record and the def a Stronghold kit receives — the operator's own attributes at that training (without
// its talents, which the kit applies), its range, trait, talents (with its module's changes) and the skills it has
// unlocked at their levels, the selected one as `skill` — the shape of Stronghold's 自选 records (shared/diy.js,
// shared/loadoutRecord.js), at any training instead of its fixed forms.
import rangeTable from '../../data/ranges.json' with { type: 'json' };
import { coveredBranch, BRANCHES } from '../traits.js';
import { statsAt, moduleAt } from '../operators.js';
import { unlockedAt, talentsAt } from '../talents.js';
import { normalizeChess, flattenBlackboard } from './sh/simdata.js';

/** @typedef {import('../operators.js').Training} Training @typedef {import('../operators.js').Build} Build @typedef {Record<string, any>} Rec */

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** A range id's cells as [row, col] pairs, or null. @param {string | null | undefined} id @returns {number[][] | null} */
export function gridOf(id) {
  const cells = id ? /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id] : undefined;
  return cells ? cells.map((c) => [c.row, c.col]) : null;
}

/** skill_table's spType number → Stronghold's name. @type {Record<string, string>} */
const SP_NAMES = { 1: 'INCREASE_WITH_TIME', 2: 'INCREASE_WHEN_ATTACK', 4: 'INCREASE_WHEN_TAKEN_DAMAGE', 8: 'NONE' };

/**
 * The skill records of a training (兼容-3): each skill unlocked at its elite phase at the build's skill level.
 * @param {Training} t @param {Build} b @returns {Rec[]}
 */
function skillRecords(t, b) {
  return t.skills.flatMap((slot, index) => {
    if (slot.phase > b.elite) return [];
    const lv = slot.levels[clamp(b.skillLevel, 1, slot.levels.length) - 1];
    const sp = lv.spData, bb = flattenBlackboard(lv.blackboard), bbStr = Object.fromEntries(lv.blackboard.filter((e) => /** @type {any} */ (e).valueStr != null).map((e) => [e.key, /** @type {any} */ (e).valueStr]));
    return [{
      skillId: slot.id, index, name: '', skillType: lv.skillType, durationType: lv.durationType, duration: lv.duration,
      spType: SP_NAMES[String(sp.spType)] ?? String(sp.spType), spCost: sp.spCost, initSp: sp.initSp, maxChargeTime: sp.maxChargeTime,
      bb, bbStr, rangeId: lv.rangeId ?? null, rangeGrid: gridOf(lv.rangeId), desc: lv.description ?? '', trigger: { rule: 'DEFAULT' },
    }];
  });
}

/**
 * A talent record (兼容-3) from a talent candidate. @param {import('../operators.js').TalentCandidate} c @param {number} index @returns {Rec}
 */
const talentRecord = (c, index) => ({
  index, name: c.name ?? '', desc: c.description ?? '', bb: { ...c.bb }, bbStr: { ...(c.text ?? {}) }, rangeGrid: gridOf(c.rangeId),
  tokenKey: c.token ?? null, hidden: !!c.hidden,
});

/**
 * The talent records of a training (兼容-3): each talent's last unlocked candidate, then the module's changes —
 * Stronghold's merge (composeTalents): over a talent the module's values win and the talent's other keys stay; a change
 * of no talent (index −1, a range) is added.
 * @param {Training} t @param {Build} b @param {ReturnType<typeof moduleAt>} mod @returns {Rec[]}
 */
function talentRecords(t, b, mod) {
  /** @type {(Rec | null)[]} */
  const out = talentsAt(t, b).map((c, i) => (c ? talentRecord(/** @type {any} */ (c), i) : null));
  for (const c of partsOf(mod, 'TALENT').flatMap((p) => p.talents).filter((x) => unlockedAt(x, b))) {
    const rec = changedTalent(c.index >= 0 ? out[c.index] : null, c);
    if (c.index >= 0) out[c.index] = rec; else out.push(rec);
  }
  return /** @type {Rec[]} */ (out.filter((x) => x !== null));
}

/**
 * A module level's parts of a kind (TALENT…, TRAIT…) for the operator itself in every mode and map.
 * @param {ReturnType<typeof moduleAt>} mod @param {string} kind
 */
const partsOf = (mod, kind) => (mod?.parts ?? []).filter((p) => p.target.startsWith(kind) && !p.token && !p.gameTag && !p.mapTag);

/**
 * A talent as a module changes it (兼容-3): the module's values win, the talent's other keys stay; a change of no
 * talent stands alone.
 * @param {Rec | null} old @param {import('../operators.js').ModulePart['talents'][number]} c @returns {Rec}
 */
function changedTalent(old, c) {
  const o = old ?? { name: '', desc: '', bb: {}, bbStr: {}, rangeGrid: null, tokenKey: null, hidden: c.hidden };
  return { index: c.index, name: c.name ?? o.name, desc: c.upgrade ?? o.desc, bb: { ...o.bb, ...c.bb }, bbStr: { ...o.bbStr, ...(c.text ?? {}) },
    rangeGrid: gridOf(c.rangeId) ?? o.rangeGrid, tokenKey: o.tokenKey, hidden: !!(o.hidden && c.hidden), fromModule: true };
}

/** The trait part of a training (兼容-3): its blackboard, its module's override's when there is one. @param {Training} t @param {Build} b @param {ReturnType<typeof moduleAt>} mod */
function traitRecord(t, b, mod) {
  let bb = t.traits.filter((c) => unlockedAt(c, b)).at(-1)?.bb ?? {};
  for (const c of partsOf(mod, 'TRAIT').flatMap((p) => p.trait)) if (unlockedAt(c, b)) bb = { ...bb, ...c.bb };
  return { desc: '', bb: { ...bb } };
}

/**
 * An operator's chess record at a build (兼容-3), as Stronghold's 自选 record of `charId` in the slot `diyFor`.
 * @param {string} charId @param {Training} t @param {Build} b @returns {Rec}
 */
export function recordOf(charId, t, b) {
  const mod = moduleAt(t, b), s = statsAt(t, b, mod), skills = skillRecords(t, b), sel = skills.find((x) => x.index === b.skill) ?? null;
  const m = (b.module ?? -1) >= 0 ? t.modules[/** @type {number} */ (b.module)] : null, arts = coveredBranch(t.branch) && BRANCHES[t.branch].dmgType === 'arts';
  return {
    chessId: `aue_${charId}`, baseId: `aue_${charId}`, charId, diyFor: `aue_${charId}`, name: t.name, rarity: t.rarity, tier: t.rarity,
    profession: t.profession, subProfessionId: t.branch, position: t.position,
    status: { phase: b.elite, level: b.level, skillLevel: b.skillLevel, equipLevel: m ? (b.moduleLevel ?? 1) : 0 },
    stats: { maxHp: s.maxHp, atk: s.atk, def: s.def, res: s.res, cost: s.cost, blockCnt: s.blockCnt, bat: s.baseAttackTime, aspd: s.aspd,
      respawnTime: s.respawnTime, spRecovery: 1, hpRecoveryPerSec: 0, moveSpeed: 1, tauntLevel: s.tauntLevel, massLevel: s.massLevel },
    rangeGrid: t.phases[b.elite].range.map((c) => [c.row, c.col]), dmgType: t.profession === 'MEDIC' ? 'HEAL' : arts ? 'MAGICAL' : 'PHYSICAL',
    trait: traitRecord(t, b, mod), talents: talentRecords(t, b, mod), skills, skill: sel,
    modules: t.modules.map((x) => ({ uniEquipId: x.id, name: x.name, typeName: x.type })),
    module: m ? { id: m.id, name: m.name, type: m.type, level: b.moduleLevel ?? 1, active: true } : { id: null, name: null, type: null, level: 0, active: false },
    tokens: [...new Set(t.talents.flat().map((c) => c.token).filter(Boolean))],
  };
}

/**
 * The def a kit receives for an operator at a build (兼容-3): the record normalised, with the loadout (the selected
 * skill and module, the potential) as Stronghold's 自选 def carries it.
 * @param {string} charId @param {Training} t @param {Build} b @returns {Rec}
 */
export function defOf(charId, t, b) {
  const rec = recordOf(charId, t, b), d = normalizeChess(rec);
  d.loadout = { skillIndex: rec.skill?.index ?? null, moduleId: rec.module.id ?? 'none', potential: b.potential, isDefault: false,
    diy: { charId, skillIndex: rec.skill?.index ?? null, uniEquipId: rec.module.id } };
  return d;
}
