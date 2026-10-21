// Operators with everything their training needs (docs/spec/operators.md 干员-1…干员-5): each elite phase's attack
// range and attribute keyframes, the trust keyframe, the potential modifiers, every skill with all its levels, the
// trait candidates, the talents, the modules. Pure functions over parsed game data.
import { asArray, asInt, asNumber, asObject, asString, field } from './validate.js';
import { phaseOf, talentsOf } from './talents.js';
import { modulesOf } from './modules.js';

/** character_table's attribute keys kept for a keyframe, and their names in the engine (属性-1). */
const STATS = Object.freeze({
  maxHp: 'maxHp', atk: 'atk', def: 'def', magicResistance: 'res', cost: 'cost', blockCnt: 'blockCnt', baseAttackTime: 'baseAttackTime',
  respawnTime: 'respawnTime', attackSpeed: 'aspd', tauntLevel: 'tauntLevel', massLevel: 'massLevel',
});
/** What a summon's keyframe keeps besides (召唤-2): how many may be deployed and held at once. */
const TOKEN_STATS = Object.freeze({ ...STATS, maxDeployCount: 'maxDeployCount', maxDeckStackCnt: 'maxDeckStackCnt' });
/** A potential's attributeType and the engine's attribute it adds to (干员-1). */
const POTENTIAL_STATS = Object.freeze({ COST: 'cost', RESPAWN_TIME: 'respawnTime', ATK: 'atk', DEF: 'def', MAX_HP: 'maxHp', ATTACK_SPEED: 'aspd', MAGIC_RESISTANCE: 'res' });
/**
 * The description of a skill the player may close (技能-7), the same test as @aue/content's skills.js: 「可随时停止技能」
 * 「可随时主动关闭」「手动停止」….
 */
const CLOSABLE = /(随时|主动|手动)[^，。；\n<]*(停止|关闭)/u;

/**
 * A keyframe's attributes in the engine's names.
 * @param {unknown} raw @param {string} p @param {Readonly<Record<string, string>>} [keys] @returns {Record<string, number>}
 */
function statsOf(raw, p, keys = STATS) {
  const d = asObject(raw, p);
  return Object.fromEntries(Object.entries(keys).map(([k, to]) => [to, asNumber(field(d, k, p), `${p}.${k}`, -1e9, 1e9)]));
}

/** A blackboard list as { key: value }. @param {unknown} raw @param {string} p @returns {Record<string, number>} */
function boardOf(raw, p) {
  return Object.fromEntries((Array.isArray(raw) ? raw : []).map((b, i) => {
    const o = asObject(b, `${p}[${i}]`);
    return [asString(field(o, 'key', `${p}[${i}]`), `${p}[${i}].key`), asNumber(field(o, 'value', `${p}[${i}]`), `${p}[${i}].value`, -1e9, 1e9)];
  }));
}

/**
 * @param {unknown} rangesRaw range_table.json @param {string} id
 * @returns {{ row: number, col: number }[]}
 */
function rangeOf(rangesRaw, id) {
  const p = `ranges[${id}]`, r = asObject(field(asObject(rangesRaw, 'ranges'), id, 'ranges'), p);
  return asArray(field(r, 'grids', p), `${p}.grids`).map((g, i) => {
    const o = asObject(g, `${p}.grids[${i}]`);
    return { row: asInt(field(o, 'row', p), `${p}.grids[${i}].row`, -64, 64), col: asInt(field(o, 'col', p), `${p}.grids[${i}].col`, -64, 64) };
  });
}

/**
 * Every range of range_table by id, in id order (干员-8): its grids as they are in the source.
 * @param {unknown} rangesRaw range_table.json @returns {Record<string, { row: number, col: number }[]>}
 */
export function extractRanges(rangesRaw) {
  const ids = Object.keys(asObject(rangesRaw, 'ranges')).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(ids.map((id) => [id, rangeOf(rangesRaw, id)]));
}

/**
 * One operator (干员-1…干员-5).
 * @param {unknown} raw character_table entry @param {string} id @param {unknown} rangesRaw @param {unknown} skillsRaw
 * @param {{ uniequip: unknown, battle: unknown }} equipment uniequip_table and battle_equip_table
 * @returns {Record<string, unknown>}
 */
export function extractTraining(raw, id, rangesRaw, skillsRaw, equipment) {
  const p = `characters[${id}]`, c = asObject(raw, p), keys = c.profession === 'TOKEN' ? TOKEN_STATS : STATS;
  const phases = asArray(field(c, 'phases', p), `${p}.phases`).map((ph, i) => {
    const pp = `${p}.phases[${i}]`, o = asObject(ph, pp);
    return {
      maxLevel: asInt(field(o, 'maxLevel', pp), `${pp}.maxLevel`, 1, 200),
      range: rangeOf(rangesRaw, asString(field(o, 'rangeId', pp), `${pp}.rangeId`)),
      frames: asArray(field(o, 'attributesKeyFrames', pp), `${pp}.attributesKeyFrames`).map((f, k) => {
        const fp = `${pp}.attributesKeyFrames[${k}]`, fo = asObject(f, fp);
        return { level: asInt(field(fo, 'level', fp), `${fp}.level`, 1, 200), stats: statsOf(field(fo, 'data', fp), `${fp}.data`, keys) };
      }),
    };
  });
  const favor = asArray(c.favorKeyFrames ?? [], `${p}.favorKeyFrames`).map((f, k) => asObject(f, `${p}.favorKeyFrames[${k}]`)).at(-1);
  return {
    name: asString(field(c, 'name', p), `${p}.name`),
    // its code name in Latin letters (Kal'tsit), shown under the name
    appellation: typeof c.appellation === 'string' ? c.appellation : '',
    position: asString(field(c, 'position', p), `${p}.position`),
    profession: asString(field(c, 'profession', p), `${p}.profession`),
    branch: asString(field(c, 'subProfessionId', p), `${p}.subProfessionId`),
    powers: powersOf(c, p),
    mainPower: mainPowerOf(c, p),
    rarity: asInt(Number(asString(field(c, 'rarity', p), `${p}.rarity`).replace('TIER_', '')), `${p}.rarity`, 1, 6),
    phases,
    favor: favor ? { level: asInt(favor.level, `${p}.favorKeyFrames.level`, 0, 200), stats: statsOf(favor.data, `${p}.favorKeyFrames.data`) } : null,
    potentials: asArray(c.potentialRanks ?? [], `${p}.potentialRanks`).map((r, i) => potentialOf(r, `${p}.potentialRanks[${i}]`)),
    // a summon's empty skill slot stays null: a slot's index is its owner's skill's (召唤-1)
    skills: asArray(field(c, 'skills', p), `${p}.skills`).map((s, i) => (asObject(s, `${p}.skills[${i}]`).skillId === null ? null : skillOf(s, `${p}.skills[${i}]`, skillsRaw))),
    traits: traitsOf(c.trait, `${p}.trait`),
    talents: talentsOf(c.talents, `${p}.talents`),
    modules: modulesOf(id, equipment),
    ...tokensOf(c, p),
    // a summon's description says what it is (召唤-1): 不会受到攻击…; an operator's is its trait's text (干员-3)
    description: c.description === null || c.description === undefined ? null : asString(c.description, `${p}.description`),
  };
}

/**
 * The summons an operator makes (召唤-1): those it shows, its skills' and its talents' — sorted; nothing when none.
 * @param {Record<string, unknown>} c @param {string} p @returns {{ tokens?: string[] }}
 */
function tokensOf(c, p) {
  const shown = Object.keys(asObject(c.displayTokenDict ?? {}, `${p}.displayTokenDict`));
  const bySkill = asArray(c.skills ?? [], `${p}.skills`).map((s) => asObject(s, `${p}.skills`).overrideTokenKey);
  const byTalent = asArray(c.talents ?? [], `${p}.talents`).flatMap((t) => asArray(asObject(t, `${p}.talents`).candidates ?? [], `${p}.talents.candidates`))
    .map((x) => asObject(x, `${p}.talents.candidates`).tokenKey);
  const all = [...new Set([...shown, ...bySkill, ...byTalent].filter((x) => typeof x === 'string' && x !== ''))].toSorted();
  return all.length ? { tokens: /** @type {string[]} */ (all) } : {};
}

/**
 * Every summon of character_table (召唤-1): its training data as an operator's, in id order.
 * @param {unknown} charactersRaw @param {unknown} rangesRaw @param {unknown} skillsRaw
 * @param {{ uniequip: unknown, battle: unknown }} equipment @returns {Record<string, Record<string, unknown>>}
 */
export function extractTokens(charactersRaw, rangesRaw, skillsRaw, equipment) {
  // (the summons: every token_ character whose profession is TOKEN)
  const all = asObject(charactersRaw, 'characters');
  const ids = Object.keys(all).filter((id) => id.startsWith('token_') && asObject(all[id], `characters[${id}]`).profession === 'TOKEN').toSorted();
  return Object.fromEntries(ids.map((id) => [id, extractTraining(all[id], id, rangesRaw, skillsRaw, equipment)]));
}

/**
 * The units a rune puts into a player's deck (符文-6): every `token_key` of an `insert_token_card` rune anywhere in the
 * activity table, sorted.
 * @param {unknown} activityRaw activity_table @returns {string[]}
 */
export function carriedIds(activityRaw) {
  /** @type {Set<string>} */
  const ids = new Set();
  /** @param {unknown} x */
  const walk = (x) => {
    if (Array.isArray(x)) { for (const v of x) walk(v); return; }
    if (typeof x !== 'object' || x === null) return;
    const o = /** @type {Record<string, unknown>} */ (x);
    if (o.key === 'insert_token_card' && Array.isArray(o.blackboard)) {
      for (const b of o.blackboard) if (b && b.key === 'token_key' && typeof b.valueStr === 'string') ids.add(b.valueStr);
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(activityRaw);
  return [...ids].toSorted();
}

/**
 * The training data of the units runes put into decks (符文-6, carriedIds), by id.
 * @param {unknown} charactersRaw @param {readonly string[]} ids @param {unknown} rangesRaw @param {unknown} skillsRaw @param {Parameters<typeof extractTraining>[4]} equipment
 */
export function extractCarried(charactersRaw, ids, rangesRaw, skillsRaw, equipment) {
  const all = asObject(charactersRaw, 'characters');
  return Object.fromEntries(ids.filter((id) => Object.hasOwn(all, id)).map((id) => [id, extractTraining(all[id], id, rangesRaw, skillsRaw, equipment)]));
}

/**
 * An operator's factions (干员-10): the nation, group and team ids of its main power, then of each sub power, without
 * repeats; the main power is the top-level ids when there is no mainPower.
 * @param {Record<string, unknown>} c @param {string} p @returns {string[]}
 */
function powersOf(c, p) {
  /** @type {string[]} */
  const out = [];
  /** @param {Record<string, unknown>} o @param {string} pp */
  const add = (o, pp) => {
    for (const k of ['nationId', 'groupId', 'teamId']) {
      if (o[k] === null || o[k] === undefined) continue;
      const v = asString(o[k], `${pp}.${k}`);
      if (!out.includes(v)) out.push(v);
    }
  };
  add(c.mainPower ? asObject(c.mainPower, `${p}.mainPower`) : c, c.mainPower ? `${p}.mainPower` : p);
  asArray(c.subPower ?? [], `${p}.subPower`).forEach((s, i) => add(asObject(s, `${p}.subPower[${i}]`), `${p}.subPower[${i}]`));
  return out;
}

/**
 * An operator's main power (干员-10): its nation, group and team ids, null for none; the top-level ids when there is no
 * mainPower.
 * @param {Record<string, unknown>} c @param {string} p @returns {{ nationId: string | null, groupId: string | null, teamId: string | null }}
 */
function mainPowerOf(c, p) {
  const o = c.mainPower ? asObject(c.mainPower, `${p}.mainPower`) : c, pp = c.mainPower ? `${p}.mainPower` : p;
  const id = (/** @type {string} */ k) => (o[k] === null || o[k] === undefined ? null : asString(o[k], `${pp}.${k}`));
  return { nationId: id('nationId'), groupId: id('groupId'), teamId: id('teamId') };
}

/**
 * The factions' names by id (干员-10), from handbook_team_table, in id order.
 * @param {unknown} teamsRaw @returns {Record<string, string>}
 */
export function extractPowers(teamsRaw) {
  const t = asObject(teamsRaw, 'teams'), ids = Object.keys(t).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(ids.map((id) => [id, asString(field(asObject(t[id], `teams[${id}]`), 'powerName', `teams[${id}]`), `teams[${id}].powerName`)]));
}

/** One potential rank's attribute additions (干员-1). @param {unknown} raw @param {string} p @returns {Record<string, number>} */
function potentialOf(raw, p) {
  const r = asObject(raw, p), buff = r.buff ? asObject(r.buff, `${p}.buff`) : null;
  const mods = buff ? asArray(asObject(buff.attributes, `${p}.buff.attributes`).attributeModifiers ?? [], `${p}.buff.attributes.attributeModifiers`) : [];
  /** @type {Record<string, number>} */
  const out = {};
  mods.forEach((m, i) => {
    const mp = `${p}.buff.attributes.attributeModifiers[${i}]`, o = asObject(m, mp);
    const to = /** @type {Record<string, string>} */ (POTENTIAL_STATS)[asString(o.attributeType, `${mp}.attributeType`)];
    if (!to || o.formulaItem !== 'ADDITION') throw new Error(`${mp}: unsupported ${String(o.attributeType)} ${String(o.formulaItem)}`);
    out[to] = (out[to] ?? 0) + asNumber(o.value, `${mp}.value`, -1e6, 1e6);
  });
  return out;
}

/** One skill slot with its skill's name and every level of it (干员-2). @param {unknown} raw @param {string} p @param {unknown} skillsRaw */
function skillOf(raw, p, skillsRaw) {
  const s = asObject(raw, p), id = asString(field(s, 'skillId', p), `${p}.skillId`);
  const sp = `skills[${id}]`, levels = asArray(field(asObject(field(asObject(skillsRaw, 'skills'), id, 'skills'), sp), 'levels', sp), `${sp}.levels`);
  const token = s.overrideTokenKey === null || s.overrideTokenKey === undefined ? null : asString(s.overrideTokenKey, `${p}.overrideTokenKey`);
  const first = levels.length ? asObject(levels[0], `${sp}.levels[0]`) : {};
  return {
    id, name: typeof first.name === 'string' ? first.name : '', phase: phaseOf(asObject(field(s, 'unlockCond', p), `${p}.unlockCond`).phase, `${p}.unlockCond.phase`),
    levels: levels.map((l, i) => levelOf(l, `${sp}.levels[${i}]`)), ...(token ? { token } : {}),
  };
}

/**
 * One skill level as the engine's skill reads it (技能-1, 技能-7): trigger, duration, SP data, blackboard, and whether
 * its description lets the player close it.
 * @param {unknown} raw @param {string} p
 */
function levelOf(raw, p) {
  const o = asObject(raw, p), sp = asObject(field(o, 'spData', p), `${p}.spData`);
  return {
    skillType: field(o, 'skillType', p), durationType: field(o, 'durationType', p), duration: asNumber(field(o, 'duration', p), `${p}.duration`, -1e6, 1e6),
    spData: { spType: field(sp, 'spType', `${p}.spData`), spCost: field(sp, 'spCost', `${p}.spData`), initSp: field(sp, 'initSp', `${p}.spData`), maxChargeTime: field(sp, 'maxChargeTime', `${p}.spData`) },
    blackboard: (Array.isArray(o.blackboard) ? o.blackboard : []).map((b, k) => { const e = asObject(b, `${p}.blackboard[${k}]`); return { key: e.key, value: e.value }; }),
    stoppable: CLOSABLE.test(typeof o.description === 'string' ? o.description : ''),
    rangeId: o.rangeId === null || o.rangeId === undefined ? null : asString(o.rangeId, `${p}.rangeId`),
    description: typeof o.description === 'string' ? o.description : '',
  };
}

/** The trait candidates with their unlock conditions, and the range id of one that has it (干员-3). @param {unknown} raw @param {string} p */
function traitsOf(raw, p) {
  if (raw === null || raw === undefined) return [];
  return asArray(field(asObject(raw, p), 'candidates', p), `${p}.candidates`).map((x, i) => {
    const cp = `${p}.candidates[${i}]`, o = asObject(x, cp), u = asObject(field(o, 'unlockCondition', cp), `${cp}.unlockCondition`);
    const rangeId = o.rangeId === null || o.rangeId === undefined ? null : asString(o.rangeId, `${cp}.rangeId`);
    return { phase: phaseOf(u.phase, `${cp}.unlockCondition.phase`), level: asInt(u.level, `${cp}.unlockCondition.level`, 0, 200), potential: asInt(o.requiredPotentialRank, `${cp}.requiredPotentialRank`, 0, 5),
      ...(rangeId === null ? {} : { rangeId }), bb: boardOf(o.blackboard, `${cp}.blackboard`) };
  });
}

/**
 * Every operator of character_table that is not a token or a trap, in id order (干员-1…干员-5).
 * @param {unknown} charactersRaw @param {unknown} rangesRaw @param {unknown} skillsRaw
 * @param {{ uniequip: unknown, battle: unknown }} equipment uniequip_table and battle_equip_table @returns {Record<string, Record<string, unknown>>}
 */
export function extractRoster(charactersRaw, rangesRaw, skillsRaw, equipment) {
  const all = asObject(charactersRaw, 'characters');
  const ids = Object.keys(all).filter((id) => id.startsWith('char_') && !['TOKEN', 'TRAP'].includes(String(asObject(all[id], `characters[${id}]`).profession))).toSorted();
  return Object.fromEntries(ids.map((id) => [id, extractTraining(all[id], id, rangesRaw, skillsRaw, equipment)]));
}
