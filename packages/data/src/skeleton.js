// The walking-skeleton extractor: one co-op stage, four operators (three reserve operators and 米格鲁 with her first
// skill) and the enemies of a few spawns, as one compact object (written to packages/content/data/skeleton.json by
// cli/skeleton.js). Pure functions over parsed game data.
import { asArray, asNumber, asObject, asString, field, wrapped, wrappedNumber } from './validate.js';
import { extractRoutesAndWaves, extractTiles } from './skeleton-world.js';
import { hiddenGroupsOf } from './waves.js';

export const SKELETON_OPERATORS = Object.freeze(['char_500_noirc', 'char_502_nblade', 'char_503_rang', 'char_122_beagle']);
/** The skill level an operator reaches at elite 0 (技能-1): level 4, levels[3]. */
const E0_SKILL_LEVEL = 3;
const OPTION_KEYS = ['maxLifePoint', 'initialCost', 'maxCost', 'costIncreaseTime', 'characterLimit', 'moveMultiplier'];

/**
 * @param {unknown} raw level.options
 * @returns {Record<string, number>}
 */
function extractOptions(raw) {
  const o = asObject(raw, 'level.options');
  return Object.fromEntries(OPTION_KEYS.map((k) => [k, asNumber(field(o, k, 'level.options'), `level.options.${k}`, 0, 1e6)]));
}

/**
 * { [key]: m_value } when the wrapper is defined (m_defined), else nothing: the attribute takes its default.
 * @param {Record<string, unknown>} o @param {string} key @param {string} path path of o
 * @returns {Record<string, number>}
 */
function definedNumber(o, key, path) {
  const w = asObject(field(o, key, path), `${path}.${key}`);
  return w.m_defined === true ? { [key]: wrappedNumber(o, key, path) } : {};
}

/** The enemy_database immunities and the status flags they stand for (状态-7). */
const IMMUNE_FLAGS = Object.freeze({
  stunImmune: 'stun', silenceImmune: 'silence', sleepImmune: 'sleep', frozenImmune: 'freeze', levitateImmune: 'levitate',
  disarmedCombatImmune: 'disarmedCombat', fearedImmune: 'fear', palsyImmune: 'palsy', attractImmune: 'attract',
  teleportImmune: 'teleport', groundBoundImmune: 'groundbind',
});

/**
 * { immune: [flags] } for each immunity defined as true, else nothing.
 * @param {Record<string, unknown>} at attributes @param {string} path path of at
 * @returns {{ immune?: string[] }}
 */
function immunities(at, path) {
  const out = Object.entries(IMMUNE_FLAGS).filter(([k]) => {
    if (!Object.hasOwn(at, k)) return false;
    const w = asObject(at[k], `${path}.${k}`);
    return w.m_defined === true && w.m_value === true;
  }).map(([, flag]) => flag);
  return out.length > 0 ? { immune: out } : {};
}

/**
 * One enemy at level 0.
 * @param {unknown} entry enemy_database entry
 * @param {string} key
 * @returns {Record<string, string | number | string[]>}
 */
function readEnemy(entry, key) {
  const p = `enemyDb[${key}]`;
  const values = asArray(field(asObject(entry, p), 'Value', p), `${p}.Value`);
  const dp = `${p}.Value[0].enemyData`;
  const data = asObject(field(asObject(values[0], `${p}.Value[0]`), 'enemyData', `${p}.Value[0]`), dp);
  const ap = `${dp}.attributes`;
  const at = asObject(field(data, 'attributes', dp), ap);
  return {
    name: asString(wrapped(data, 'name', dp), `${dp}.name.m_value`),
    maxHp: wrappedNumber(at, 'maxHp', ap),
    atk: wrappedNumber(at, 'atk', ap),
    def: wrappedNumber(at, 'def', ap),
    res: wrappedNumber(at, 'magicResistance', ap),
    moveSpeed: wrappedNumber(at, 'moveSpeed', ap),
    baseAttackTime: wrappedNumber(at, 'baseAttackTime', ap),
    rangeRadius: wrappedNumber(data, 'rangeRadius', dp),
    applyWay: asString(wrapped(data, 'applyWay', dp), `${dp}.applyWay.m_value`),
    motion: asString(wrapped(data, 'motion', dp), `${dp}.motion.m_value`),
    ...definedNumber(at, 'blockCnt', ap),
    massLevel: wrappedNumber(at, 'massLevel', ap),
    levelType: asString(wrapped(data, 'levelType', dp), `${dp}.levelType.m_value`),
    ...definedNumber(at, 'epDamageResistance', ap),
    ...definedNumber(at, 'epResistance', ap),
    ...immunities(at, ap),
  };
}

/**
 * The 共同敌手 of a level (合作-2): the enemy keys its rune `env_gbuff_new_with_verify` with key
 * `cooperate_enemy_side_shared` lists (`|`-separated in its `enemy` entry).
 * @param {unknown} runesRaw level.runes @returns {Set<string>}
 */
export function sharedEnemies(runesRaw) {
  /** @type {Set<string>} */
  const out = new Set();
  if (!Array.isArray(runesRaw)) return out;
  runesRaw.forEach((r, i) => {
    const rp = `level.runes[${i}]`, rune = asObject(r, rp);
    if (rune.key !== 'env_gbuff_new_with_verify' || !Array.isArray(rune.blackboard)) return;
    const bb = Object.fromEntries(rune.blackboard.map((b, k) => { const o = asObject(b, `${rp}.blackboard[${k}]`); return [String(o.key), o.valueStr]; }));
    if (bb.key === 'cooperate_enemy_side_shared') for (const k of String(bb.enemy ?? '').split('|')) if (k) out.add(k);
  });
  return out;
}

/**
 * The enemies used, level 0 of their enemy_database entry.
 * @param {unknown} dbRaw enemy_database.json
 * @param {string[]} keys
 * @returns {Record<string, Record<string, string | number | string[]>>}
 */
function extractEnemies(dbRaw, keys) {
  const list = asArray(field(asObject(dbRaw, 'enemyDb'), 'enemies', 'enemyDb'), 'enemyDb.enemies');
  return Object.fromEntries(
    keys.map((key) => {
      const entry = list.find((e) => asObject(e, 'enemyDb.enemies[]').Key === key);
      if (entry === undefined) throw new Error(`enemyDb: no enemy ${key}`);
      return [key, readEnemy(entry, key)];
    }),
  );
}

/**
 * @param {unknown} rangesRaw range_table.json
 * @param {string} rangeId
 * @returns {{ row: number, col: number }[]} the grids as they are in the source
 */
function rangeGrids(rangesRaw, rangeId) {
  const rp = `ranges[${rangeId}]`;
  const r = asObject(field(asObject(rangesRaw, 'ranges'), rangeId, 'ranges'), rp);
  return asArray(field(r, 'grids', rp), `${rp}.grids`).map((g, i) => {
    const gp = `${rp}.grids[${i}]`;
    const o = asObject(g, gp);
    return { row: asNumber(field(o, 'row', gp), `${gp}.row`, -64, 64), col: asNumber(field(o, 'col', gp), `${gp}.col`, -64, 64) };
  });
}

/**
 * The trait's blackboard at elite 0 and potential 0 (职业-7): of the candidates unlocked at PHASE_0 and potential 0, the
 * last; {} when the operator has no trait record.
 * @param {Record<string, unknown>} c character_table entry @param {string} p its path
 * @returns {Record<string, number>}
 */
function traitBlackboard(c, p) {
  if (c.trait === null || c.trait === undefined) return {};
  const tp = `${p}.trait`, cands = asArray(field(asObject(c.trait, tp), 'candidates', tp), `${tp}.candidates`).map((x, i) => asObject(x, `${tp}.candidates[${i}]`));
  const at0 = cands.filter((x) => asObject(x.unlockCondition, `${tp}.unlockCondition`).phase === 'PHASE_0' && x.requiredPotentialRank === 0);
  const pick = at0[at0.length - 1];
  if (!pick) return {};
  return Object.fromEntries(asArray(field(pick, 'blackboard', tp), `${tp}.blackboard`).map((b, i) => {
    const bp = `${tp}.blackboard[${i}]`, o = asObject(b, bp);
    return [asString(field(o, 'key', bp), `${bp}.key`), asNumber(field(o, 'value', bp), `${bp}.value`, -1e9, 1e9)];
  }));
}

/**
 * The first skill's level at elite 0, as skill_table writes it (技能-1), with its id; nothing when the operator has no
 * skill.
 * @param {Record<string, unknown>} c character_table entry @param {string} p its path @param {unknown} skillsRaw skill_table.json
 * @returns {{ skillLevel?: Record<string, unknown> }}
 */
function firstSkill(c, p, skillsRaw) {
  const list = asArray(field(c, 'skills', p), `${p}.skills`);
  if (list.length === 0) return {};
  const id = asString(field(asObject(list[0], `${p}.skills[0]`), 'skillId', `${p}.skills[0]`), `${p}.skills[0].skillId`);
  const sp = `skills[${id}]`, levels = asArray(field(asObject(field(asObject(skillsRaw, 'skills'), id, 'skills'), sp), 'levels', sp), `${sp}.levels`);
  const lp = `${sp}.levels[${Math.min(E0_SKILL_LEVEL, levels.length - 1)}]`, lv = asObject(levels[Math.min(E0_SKILL_LEVEL, levels.length - 1)], lp);
  const keep = ['skillType', 'durationType', 'duration', 'spData', 'blackboard', 'description'];
  return { skillLevel: { id, ...Object.fromEntries(keep.map((k) => [k, field(lv, k, lp)])) } };
}

/**
 * One operator at elite 0, max level.
 * @param {unknown} raw character_table entry
 * @param {string} id
 * @param {unknown} rangesRaw range_table.json
 * @param {unknown} skillsRaw skill_table.json
 * @returns {Record<string, unknown>}
 */
function extractOperator(raw, id, rangesRaw, skillsRaw) {
  const p = `characters[${id}]`;
  const c = asObject(raw, p);
  const pp = `${p}.phases[0]`;
  const phase = asObject(asArray(field(c, 'phases', p), `${p}.phases`)[0], pp);
  const frames = asArray(field(phase, 'attributesKeyFrames', pp), `${pp}.attributesKeyFrames`);
  if (frames.length === 0) throw new Error(`${pp}.attributesKeyFrames: empty`);
  const fp = `${pp}.attributesKeyFrames[last]`;
  const d = asObject(field(asObject(frames[frames.length - 1], fp), 'data', fp), `${fp}.data`);
  const position = asString(field(c, 'position', p), `${p}.position`);
  if (position !== 'MELEE' && position !== 'RANGED') throw new Error(`${p}.position: expected MELEE or RANGED, got ${position}`);
  const num = (/** @type {string} */ k) => asNumber(field(d, k, `${fp}.data`), `${fp}.data.${k}`, 0, 1e9);
  return {
    name: asString(field(c, 'name', p), `${p}.name`),
    position,
    cost: num('cost'),
    blockCnt: num('blockCnt'),
    baseAttackTime: num('baseAttackTime'),
    maxHp: num('maxHp'),
    atk: num('atk'),
    def: num('def'),
    res: num('magicResistance'),
    range: rangeGrids(rangesRaw, asString(field(phase, 'rangeId', pp), `${pp}.rangeId`)),
    profession: asString(field(c, 'profession', p), `${p}.profession`),
    branch: asString(field(c, 'subProfessionId', p), `${p}.subProfessionId`),
    respawnTime: num('respawnTime'),
    traitBb: traitBlackboard(c, p),
    ...firstSkill(c, p, skillsRaw),
  };
}

/**
 * Build the skeleton fixture.
 * @param {{ level: unknown, enemyDb: unknown, characters: unknown, ranges: unknown, skills: unknown, commit: string }} input parsed JSON files
 * @returns {Record<string, unknown>}
 */
export function extractSkeleton({ level, enemyDb, characters, ranges, skills, commit }) {
  const lv = asObject(level, 'level');
  const { width, height, tiles } = extractTiles(field(lv, 'mapData', 'level'));
  const { routes, waves } = extractRoutesAndWaves(field(lv, 'waves', 'level'), field(lv, 'routes', 'level'));
  for (const [i, r] of routes.entries()) {
    if (r.start.row >= height || r.start.col >= width) throw new Error(`routes[${i}].start lies outside the ${width}x${height} map`);
  }
  const chars = asObject(characters, 'characters');
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit, server: 'zh_CN' },
    level: {
      id: 'act1multi_01',
      width,
      height,
      options: extractOptions(field(lv, 'options', 'level')),
      tiles,
      routes,
      waves,
      hiddenGroups: hiddenGroupsOf(lv.runes ?? null, 'NORMAL'),
    },
    enemies: Object.fromEntries(Object.entries(extractEnemies(enemyDb, [...new Set(waves.flatMap((w) => w.fragments.flatMap((f) => f.actions.map((a) => a.key))))].toSorted()))
      .map(([k, e]) => [k, sharedEnemies(lv.runes ?? null).has(k) ? { ...e, shared: true } : e])),
    operators: Object.fromEntries(SKELETON_OPERATORS.map((id) => [id, extractOperator(field(chars, id, 'characters'), id, ranges, skills)])),
  };
}
