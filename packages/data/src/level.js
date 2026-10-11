// A whole level as content (docs/spec/level.md 关卡-1, 关卡-2): its map, routes, waves, predefined units, co-op stages,
// what each difficulty changes, and its enemies with the level's overrides. Pure functions over parsed game data.
import { asArray, asNumber, asObject, asString, field } from './validate.js';
import { extractTiles, readRoute } from './skeleton-world.js';
import { extractWaves, predefinesOf, stagesOf, maskCovers } from './waves.js';
import { extractOptions } from './skeleton.js';
import { enemyOf, sharedEnemies, damageTypeOf } from './enemies.js';

/** @typedef {'NORMAL' | 'FOUR_STAR'} Difficulty */
/** @typedef {{ mods: Record<string, number>, enemy?: string[], exclude?: string[] }} EnemyMul */
/**
 * What a difficulty changes (关卡-2): hidden groups enabled, the life point, enemy multipliers, enemy replacements, and
 * the runes not supported yet.
 * @typedef {{ hiddenGroups: string[], lifePoint?: number, enemyMul: EnemyMul[], replace: Record<string, string>, unsupported: string[] }} DifficultyRules
 */

/** The runes 关卡-2 applies or that other clauses read (共同敌手, 合作-2). */
const KNOWN_RUNES = Object.freeze(['level_hidden_group_enable', 'level_hidden_group_disable', 'global_lifepoint', 'enemy_attribute_mul', 'level_enemy_replace']);
/** enemy_attribute_mul's keys (关卡-2). */
const MUL_KEYS = Object.freeze(['atk', 'def', 'max_hp', 'magic_resistance', 'move_speed', 'attack_speed', 'mass_level']);

/** @param {string} s a `|`-separated list @returns {string[]} */
const list = (s) => s.split('|').filter(Boolean);

/**
 * One rune's blackboard as { key: value }, valueStr when given.
 * @param {Record<string, unknown>} rune @param {string} rp @returns {Record<string, number | string>}
 */
function boardOf(rune, rp) {
  return Object.fromEntries(asArray(field(rune, 'blackboard', rp), `${rp}.blackboard`).map((b, k) => {
    const o = asObject(b, `${rp}.blackboard[${k}]`);
    return [asString(o.key, `${rp}.blackboard[${k}].key`), /** @type {number | string} */ (o.valueStr ?? o.value)];
  }));
}

/**
 * What the level's runes change at a difficulty (关卡-2).
 * @param {unknown} runesRaw level.runes @param {Difficulty} difficulty @returns {DifficultyRules}
 */
export function difficultyOf(runesRaw, difficulty) {
  /** @type {DifficultyRules} */
  const out = { hiddenGroups: [], enemyMul: [], replace: {}, unsupported: [] };
  /** @type {string[]} */
  const disabled = [];
  (Array.isArray(runesRaw) ? runesRaw : []).forEach((r, i) => {
    const rp = `level.runes[${i}]`, rune = asObject(r, rp), key = asString(field(rune, 'key', rp), `${rp}.key`);
    if (!maskCovers(rune.difficultyMask, difficulty)) return;
    const bb = boardOf(rune, rp), num = (/** @type {string} */ k) => asNumber(field(bb, k, `${rp}.blackboard`), `${rp}.blackboard.${k}`, 0, 1e9);
    if (key === 'level_hidden_group_enable') out.hiddenGroups.push(String(field(bb, 'key', `${rp}.blackboard`)));
    else if (key === 'level_hidden_group_disable') disabled.push(String(field(bb, 'key', `${rp}.blackboard`)));
    else if (key === 'global_lifepoint') out.lifePoint = num('value');
    else if (key === 'level_enemy_replace') out.replace[String(field(bb, 'key', `${rp}.blackboard`))] = String(field(bb, 'value', `${rp}.blackboard`));
    else if (key === 'enemy_attribute_mul') {
      out.enemyMul.push({
        mods: Object.fromEntries(MUL_KEYS.filter((k) => k in bb).map((k) => [k, num(k)])),
        ...(typeof bb.enemy === 'string' ? { enemy: list(bb.enemy) } : {}),
        ...(typeof bb.enemy_exclude === 'string' ? { exclude: list(bb.enemy_exclude) } : {}),
      });
    } else if (!(key === 'env_gbuff_new_with_verify' && bb.key === 'cooperate_enemy_side_shared') && !KNOWN_RUNES.includes(key)) out.unsupported.push(key);
  });
  out.hiddenGroups = out.hiddenGroups.filter((g) => !disabled.includes(g));
  return out;
}

/**
 * The level's routes, kept in data order, and the map from a data route index to the content's.
 * @param {unknown} routesRaw
 */
function routeTable(routesRaw) {
  const all = asArray(routesRaw, 'level.routes');
  /** @type {Map<number, number>} */
  const renumber = new Map();
  /** @type {import('./skeleton-world.js').Route[]} */
  const routes = [];
  const routeOf = (/** @type {number} */ index) => {
    if (index >= all.length || all[index] === null) throw new Error(`a spawn uses route ${index}, which does not exist`);
    if (!renumber.has(index)) { renumber.set(index, routes.length); routes.push(readRoute(all[index], `level.routes[${index}]`)); }
    return /** @type {number} */ (renumber.get(index));
  };
  return { routes, routeOf };
}

/**
 * A camera view vector (关卡-3): three finite numbers.
 * @param {unknown} v @returns {number[]}
 */
function viewOf(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new TypeError('level view: not three finite numbers');
  return [...v];
}

/**
 * A whole level (关卡-1, 关卡-2): `id` names it in the content.
 * @param {{ id: string, level: unknown, enemyDb: unknown, handbook?: unknown, commit: string, view?: { vector: unknown, source: string } }} input @returns {Record<string, unknown>}
 */
export function extractLevel({ id, level, enemyDb, handbook, commit, view }) {
  const lv = asObject(level, 'level');
  const { width, height, tiles } = extractTiles(field(lv, 'mapData', 'level'));
  const { routes, routeOf } = routeTable(field(lv, 'routes', 'level'));
  const waves = extractWaves(field(lv, 'waves', 'level'), routeOf);
  const runes = lv.runes ?? null, difficulties = { NORMAL: difficultyOf(runes, 'NORMAL'), FOUR_STAR: difficultyOf(runes, 'FOUR_STAR') };
  const spawned = waves.flatMap((w) => w.fragments.flatMap((f) => f.actions.filter((a) => a.type === 'SPAWN').map((a) => a.key)));
  const keys = [...new Set([...spawned, ...Object.values(difficulties).flatMap((d) => Object.values(d.replace))])].toSorted();
  const refs = new Map(asArray(lv.enemyDbRefs ?? [], 'level.enemyDbRefs').map((r, i) => {
    const o = asObject(r, `level.enemyDbRefs[${i}]`);
    return [asString(field(o, 'id', `level.enemyDbRefs[${i}]`), `level.enemyDbRefs[${i}].id`), o];
  }));
  const shared = sharedEnemies(runes);
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit, server: 'zh_CN', ...(view ? { view: view.source } : {}) },
    level: { id, width, height, options: extractOptions(field(lv, 'options', 'level')), tiles, routes, waves, predefines: predefinesOf(lv.predefines), stages: stagesOf(lv.predefines),
      ...(view ? { view: viewOf(view.vector) } : {}) },
    difficulties,
    enemies: Object.fromEntries(keys.map((k) => [k, { ...enemyOf(enemyDb, k, refs.get(k)), ...damageTypeOf(handbook, k), ...(shared.has(k) ? { shared: true } : {}) }])),
  };
}
