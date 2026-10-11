// An operator's modules (docs/spec/operators.md 干员-5): per module level, the attribute additions and the parts that
// override the trait or add talents. Pure functions over parsed game data.
import { asArray, asInt, asNumber, asObject, asString, field } from './validate.js';
import { boardsOf, optString, partTalentOf, phaseOf, unlockOf } from './talents.js';

/** A module's attribute key and its name in the engine (属性-1). */
const MODULE_STATS = Object.freeze({
  max_hp: 'maxHp', atk: 'atk', def: 'def', attack_speed: 'aspd', magic_resistance: 'res', cost: 'cost', respawn_time: 'respawnTime',
  block_cnt: 'blockCnt', base_attack_time: 'baseAttackTime',
});
/** What only a token's attributes add besides: how many it may have deployed. */
const TOKEN_STATS = Object.freeze({ ...MODULE_STATS, max_deck_stack_cnt: 'maxDeckStackCnt', max_deploy_count: 'maxDeployCount' });
const TARGETS = new Set(['TRAIT', 'TRAIT_DATA_ONLY', 'DISPLAY', 'OVERWRITE_BATTLE_DATA', 'TALENT', 'TALENT_DATA_ONLY']);

/**
 * A module level's attribute additions in the engine's names; an attribute that is not listed throws.
 * @param {unknown} raw @param {string} p @param {Readonly<Record<string, string>>} names @returns {Record<string, number>}
 */
function statsOf(raw, p, names) {
  /** @type {Record<string, number>} */
  const out = {};
  asArray(raw ?? [], p).forEach((b, i) => {
    const bp = `${p}[${i}]`, o = asObject(b, bp), key = asString(field(o, 'key', bp), `${bp}.key`), to = names[key];
    if (!to) throw new Error(`${bp}.key: unsupported attribute ${key}`);
    if (o.valueStr !== null && o.valueStr !== undefined) throw new Error(`${bp}.valueStr: unexpected text`);
    out[to] = (out[to] ?? 0) + asNumber(field(o, 'value', bp), `${bp}.value`, -1e9, 1e9);
  });
  return out;
}

/** A trait candidate of a module part: unlock, the two descriptions, range id, blackboard. @param {unknown} raw @param {string} p */
function partTraitOf(raw, p) {
  const o = asObject(raw, p);
  return {
    ...unlockOf(o, p), add: optString(o.additionalDescription, `${p}.additionalDescription`),
    override: optString(o.overrideDescripton, `${p}.overrideDescripton`), rangeId: optString(o.rangeId, `${p}.rangeId`),
    ...boardsOf(o.blackboard, `${p}.blackboard`),
  };
}

/**
 * One part of a module level: its target, whether it is for a token, the game and map tags it is valid in, its trait
 * candidates and its talent candidates.
 * @param {unknown} raw @param {string} p
 */
function partOf(raw, p) {
  const o = asObject(raw, p), target = asString(field(o, 'target', p), `${p}.target`);
  if (!TARGETS.has(target)) throw new Error(`${p}.target: unsupported ${target}`);
  const trait = asObject(field(o, 'overrideTraitDataBundle', p), `${p}.overrideTraitDataBundle`).candidates;
  const talents = asObject(field(o, 'addOrOverrideTalentDataBundle', p), `${p}.addOrOverrideTalentDataBundle`).candidates;
  return {
    target, token: o.isToken === true, gameTag: optString(o.validInGameTag, `${p}.validInGameTag`), mapTag: optString(o.validInMapTag, `${p}.validInMapTag`),
    trait: asArray(trait ?? [], `${p}.overrideTraitDataBundle.candidates`).map((c, i) => partTraitOf(c, `${p}.overrideTraitDataBundle.candidates[${i}]`)),
    talents: asArray(talents ?? [], `${p}.addOrOverrideTalentDataBundle.candidates`).map((c, i) => partTalentOf(c, `${p}.addOrOverrideTalentDataBundle.candidates[${i}]`)),
  };
}

/** One module level (干员-5). @param {unknown} raw @param {string} p */
function levelOf(raw, p) {
  const o = asObject(raw, p), tokens = asObject(o.tokenAttributeBlackboard ?? {}, `${p}.tokenAttributeBlackboard`);
  return {
    level: asInt(field(o, 'equipLevel', p), `${p}.equipLevel`, 1, 10),
    stats: statsOf(o.attributeBlackboard, `${p}.attributeBlackboard`, MODULE_STATS),
    tokens: Object.fromEntries(Object.keys(tokens).toSorted().map((id) => [id, statsOf(tokens[id], `${p}.tokenAttributeBlackboard.${id}`, TOKEN_STATS)])),
    parts: asArray(field(o, 'parts', p), `${p}.parts`).map((x, i) => partOf(x, `${p}.parts[${i}]`)),
  };
}

/**
 * Every module of an operator that has battle data, in the order of uniequip_table's charEquip (干员-5). The original
 * module has no battle data and is left out.
 * @param {string} charId @param {{ uniequip: unknown, battle: unknown }} tables uniequip_table and battle_equip_table
 */
export function modulesOf(charId, tables) {
  const uni = asObject(tables.uniequip, 'uniequip_table'), dict = asObject(field(uni, 'equipDict', 'uniequip_table'), 'uniequip_table.equipDict');
  const battle = asObject(tables.battle, 'battle_equip_table');
  const ids = asArray(asObject(field(uni, 'charEquip', 'uniequip_table'), 'uniequip_table.charEquip')[charId] ?? [], `charEquip[${charId}]`);
  return ids.map((id) => asString(id, `charEquip[${charId}]`)).filter((id) => Object.hasOwn(battle, id)).map((id) => {
    const p = `equipDict[${id}]`, e = asObject(field(dict, id, 'uniequip_table.equipDict'), p);
    if (e.charId !== charId) throw new Error(`${p}.charId: ${String(e.charId)} is not ${charId}`);
    const types = [asString(field(e, 'typeName1', p), `${p}.typeName1`), optString(e.typeName2, `${p}.typeName2`)];
    const bp = `battle_equip_table[${id}]`;
    return {
      id, name: asString(field(e, 'uniEquipName', p), `${p}.uniEquipName`), type: types.filter((t) => t !== null).join('-'),
      phase: phaseOf(e.unlockEvolvePhase, `${p}.unlockEvolvePhase`), level: asInt(e.unlockLevel, `${p}.unlockLevel`, 0, 200),
      levels: asArray(field(asObject(battle[id], bp), 'phases', bp), `${bp}.phases`).map((l, i) => levelOf(l, `${bp}.phases[${i}]`)),
    };
  });
}
