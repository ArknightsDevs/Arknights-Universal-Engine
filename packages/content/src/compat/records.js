// Stronghold records of the engine's operators (docs/spec/compat.md 兼容-3): an operator's training data at a build as
// the chess record and the def a Stronghold kit receives — the operator's own attributes at that training (without
// its talents, which the kit applies), its range, trait, talents (with its module's changes) and the skills it has
// unlocked at their levels, the selected one as `skill`, its module choices and the record without a module (`…Base`) —
// the shape of Stronghold's 自选 records (shared/diy.js, shared/loadoutRecord.js), at any training instead of its fixed forms.
import rangeTable from '../../data/ranges.json' with { type: 'json' };
import { coveredBranch, BRANCHES } from '../traits.js';
import { statsAt, moduleAt, traitAt } from '../operators.js';
import { unlockedAt, talentsAt } from '../talents.js';
import { SUMMON_PAGES, tokenBuild, tokenModule, limitsAt, supplyAt } from '../tokens.js';
import { normalizeChess, normalizeToken, flattenBlackboard } from './sh/simdata.js';

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

/** A number as Stronghold's records print it: a whole one as it is, another to 6 places. @param {number} v */
const cleanNum = (v) => (Number.isInteger(v) || Math.abs(v) >= 1e6 ? v : Math.round(v * 1e6) / 1e6);

/**
 * A blackboard value in a description's format (`0%`, `0.0`, …; none: as it is), as Stronghold's records print it.
 * @param {unknown} v @param {string | undefined} fmt
 */
function formatValue(v, fmt) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
  if (!fmt) return String(cleanNum(v));
  const pct = fmt.endsWith('%'), core = pct ? fmt.slice(0, -1) : fmt, decimals = core.includes('.') ? core.split('.')[1].length : 0;
  const scale = Number(`1e${decimals}`), x = pct ? v * 100 : v, rounded = (Math.sign(x) * Math.round(Math.abs(x) * scale + 1e-9)) / scale;
  return rounded.toFixed(decimals) + (pct ? '%' : '');
}

/**
 * A description with its placeholders — `{key}`, `{-key}`, `{key:format}`, keys in any case — filled from the
 * blackboard (a text value wins where there is no format); an unknown one stays.
 * @param {string} text @param {Record<string, number>} bb @param {Record<string, string>} bbStr
 */
function filled(text, bb, bbStr) {
  const num = new Map(Object.entries(bb ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const str = new Map(Object.entries(bbStr ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return text.replace(/\{(-?)([^{}:]+)(?::([^{}]+))?\}/g, (m, neg, key, fmt) => {
    const k = key.trim().toLowerCase();
    if (str.has(k) && (!num.has(k) || !fmt)) return String(str.get(k));
    return num.has(k) ? formatValue(neg ? -Number(num.get(k)) : num.get(k), fmt) : m;
  });
}

/** Official rich text without its markup (`<@…>`, `<$…>`, `<#…>`, `</>`, colours, bold, italics); literal labels stay. @param {string} s */
const plain = (s) => s.replace(/<[@$#][^<>]*>/g, '').replace(/<\/>/g, '').replace(/<\/?color[^<>]*>/gi, '').replace(/<\/?[bi]>/gi, '');

/**
 * A description as a record's `desc` and `descRaw`, as Stronghold's records have them: its literal `\n` as newlines,
 * its placeholders filled; the one without markup, the other with it.
 * @param {string | null | undefined} raw @param {Record<string, number>} [bb] @param {Record<string, string>} [bbStr]
 */
export function textPair(raw, bb = {}, bbStr = {}) {
  const descRaw = filled(String(raw ?? '').replace(/\\n/g, '\n'), bb, bbStr);
  return { desc: plain(descRaw), descRaw };
}

/**
 * The skill records of a training (兼容-3): each skill unlocked at its elite phase at the build's skill level.
 * @param {Training} t @param {Build} b @returns {Rec[]}
 */
function skillRecords(t, b) {
  return t.skills.flatMap((slot, index) => {
    if (!slot || slot.phase > b.elite) return [];
    const lv = slot.levels[clamp(b.skillLevel, 1, slot.levels.length) - 1];
    const sp = lv.spData, bb = flattenBlackboard(lv.blackboard), bbStr = Object.fromEntries(lv.blackboard.filter((e) => /** @type {any} */ (e).valueStr != null).map((e) => [e.key, /** @type {any} */ (e).valueStr]));
    return [{
      skillId: slot.id, index, name: '', skillType: lv.skillType, durationType: lv.durationType, duration: lv.duration,
      spType: SP_NAMES[String(sp.spType)] ?? String(sp.spType), spCost: sp.spCost, initSp: sp.initSp, maxChargeTime: sp.maxChargeTime,
      bb, bbStr, rangeId: lv.rangeId ?? null, rangeGrid: gridOf(lv.rangeId), ...textPair(lv.description, bb, bbStr), trigger: { rule: 'DEFAULT' },
    }];
  });
}

/**
 * A talent record (兼容-3) from a talent candidate. @param {import('../operators.js').TalentCandidate} c @param {number} index @returns {Rec}
 */
const talentRecord = (c, index) => ({
  index, name: c.name ?? '', ...textPair(c.description, c.bb, c.text), bb: { ...c.bb }, bbStr: { ...(c.text ?? {}) }, rangeGrid: gridOf(c.rangeId),
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
  for (const c of talentChanges(mod, b)) {
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
 * A module level's talent changes at a build: of each talent part, the last unlocked candidate for each talent (a
 * part's candidates are its potential steps).
 * @param {ReturnType<typeof moduleAt>} mod @param {Build} b
 */
function talentChanges(mod, b) {
  return partsOf(mod, 'TALENT').flatMap((p) => {
    const last = new Map(p.talents.filter((c) => unlockedAt(c, b)).map((c) => [c.index, c]));
    return [...last.values()];
  });
}

/**
 * The module choices of a training as Stronghold's records list them (兼容-3): each module unlocked at the build, at its
 * module level — its flat attributes, its trait (null for none) and its talent changes, each as the module states it.
 * @param {Training} t @param {Build} b @returns {Rec[]}
 */
function moduleRecords(t, b) {
  return t.modules.flatMap((m, i) => {
    if (!unlockedAt({ ...m, potential: 0 }, b)) return [];
    const lv = moduleAt(t, { ...b, module: i }), trait = partsOf(lv, 'TRAIT').some((p) => p.trait.some((c) => unlockedAt(c, b)));
    return [{
      uniEquipId: m.id, name: m.name, typeName: m.type, isDefault: i === b.module, level: lv?.level ?? 1, attr: { ...(lv?.stats ?? {}) },
      traitOverride: trait ? traitRecord(t, b, lv) : null,
      talentChanges: talentChanges(lv, b).map((c) => ({ talentIndex: c.index, name: c.name ?? null, ...textPair(c.upgrade, c.bb, c.text), bb: { ...c.bb },
        bbStr: { ...(c.text ?? {}) }, rangeGrid: gridOf(c.rangeId), tokenKey: null, hidden: !!c.hidden })),
    }];
  });
}

/**
 * A talent as a module changes it (兼容-3): the module's values win, the talent's other keys stay; a change of no
 * talent stands alone.
 * @param {Rec | null} old @param {import('../operators.js').ModulePart['talents'][number]} c @returns {Rec}
 */
function changedTalent(old, c) {
  const o = old ?? { name: '', desc: '', descRaw: '', bb: {}, bbStr: {}, rangeGrid: null, tokenKey: null, hidden: c.hidden };
  const bb = { ...o.bb, ...c.bb }, bbStr = { ...o.bbStr, ...(c.text ?? {}) }, text = c.upgrade != null ? textPair(c.upgrade, bb, bbStr) : { desc: o.desc, descRaw: o.descRaw ?? o.desc };
  return { index: c.index, name: c.name ?? o.name, ...text, bb, bbStr,
    rangeGrid: gridOf(c.rangeId) ?? o.rangeGrid, tokenKey: o.tokenKey, hidden: !!(o.hidden && c.hidden), fromModule: true };
}

/**
 * The trait part of a training (兼容-3): its blackboard with its module's values (干员-7), and — as Stronghold's records
 * have them — the values of the module's display-only trait parts too (an added line's, e.g. 黑's 「攻击正前方的敌人时攻击力
 * 提升至105%」, whose effect the game gives a hidden talent).
 * @param {Training} t @param {Build} b @param {ReturnType<typeof moduleAt>} mod
 */
function traitRecord(t, b, mod) {
  let bb = { ...traitAt(t, b, mod) };
  for (const c of partsOf(mod, 'DISPLAY').flatMap((p) => p.trait ?? [])) if (unlockedAt(c, b)) bb = { ...bb, ...c.bb };
  return { desc: '', bb };
}

/** Attributes as a record's `stats`. @param {ReturnType<typeof statsAt>} s */
const statsRecord = (s) => ({ maxHp: s.maxHp, atk: s.atk, def: s.def, res: s.res, cost: s.cost, blockCnt: s.blockCnt, bat: s.baseAttackTime, aspd: s.aspd,
  respawnTime: s.respawnTime, spRecovery: 1, hpRecoveryPerSec: 0, moveSpeed: 1, tauntLevel: s.tauntLevel, massLevel: s.massLevel });

/**
 * An operator's chess record at a build (兼容-3), as Stronghold's 自选 record of `charId` in the slot `diyFor`.
 * @param {string} charId @param {Training} t @param {Build} b @returns {Rec}
 */
export function recordOf(charId, t, b) {
  const mod = moduleAt(t, b), s = statsAt(t, b, mod), skills = skillRecords(t, b), sel = skills.find((x) => x.index === b.skill) ?? null;
  const m = (b.module ?? -1) >= 0 ? t.modules[/** @type {number} */ (b.module)] : null, arts = coveredBranch(t.branch) && BRANCHES[t.branch].dmgType === 'arts';
  return {
    chessId: `aue_${charId}`, baseId: `aue_${charId}`, charId, diyFor: `aue_${charId}`, name: t.name, rarity: t.rarity, tier: t.rarity, ...t.mainPower,
    profession: t.profession, subProfessionId: t.branch, position: t.position,
    status: { phase: b.elite, level: b.level, skillLevel: b.skillLevel, equipLevel: m ? (b.moduleLevel ?? 1) : 0 },
    stats: statsRecord(s), rangeGrid: t.phases[b.elite].range.map((c) => [c.row, c.col]), dmgType: t.profession === 'MEDIC' ? 'HEAL' : arts ? 'MAGICAL' : 'PHYSICAL',
    trait: traitRecord(t, b, mod), talents: talentRecords(t, b, mod), skills, skill: sel,
    modules: moduleRecords(t, b), statsBase: statsRecord(statsAt(t, b, null)), traitBase: traitRecord(t, b, null), talentsBase: talentRecords(t, b, null),
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

/**
 * A summon's record at its owner's build (兼容-3, 召唤-2…召唤-4), as a variant of Stronghold's tokens.json: its
 * attributes with its field limit, range, trait, talents and the skill of its owner's slot at their training; how many
 * its owner's deployment adds (null: none said) and how the owner makes it.
 * @param {string} id @param {Training} token @param {Training} owner @param {Build} b @returns {Rec}
 */
export function tokenRecordOf(id, token, owner, b) {
  const tb = tokenBuild(token, b), mod = tokenModule(owner, b, id), s = statsAt(token, tb, mod), supply = supplyAt(owner, b, id);
  const byTalent = owner.talents.flat().some((c) => c.token === id), bySkill = b.skill >= 0 && owner.skills[b.skill]?.token === id;
  return {
    name: token.name, profession: 'TOKEN', subProfessionId: token.branch, position: SUMMON_PAGES[id]?.position ?? token.position,
    description: textPair(token.description).desc, phase: tb.elite, level: tb.level,
    stats: { ...statsRecord(s), deployLimit: limitsAt(token, tb, mod).deployLimit }, rangeGrid: token.phases[tb.elite].range.map((c) => [c.row, c.col]),
    trait: traitRecord(token, tb, mod), talents: talentRecords(token, tb, mod), skill: skillRecords(token, tb).find((x) => x.index === tb.skill) ?? null,
    count: supply > 0 ? supply : null, sources: byTalent || bySkill ? [...(byTalent ? ['talent'] : []), ...(bySkill ? ['skill'] : [])] : ['display'],
  };
}

/** The def a kit receives for a summon (兼容-3): its record (tokenRecordOf) normalised. @param {string} id @param {Training} token @param {Training} owner @param {Build} b */
export const tokenDefOf = (id, token, owner, b) => normalizeToken(id, tokenRecordOf(id, token, owner, b));
