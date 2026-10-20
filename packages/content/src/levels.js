// Whole levels (docs/spec/level.md 关卡-2): a level extracted by @aue/data (data/levels/<id>.json) assembled at a
// difficulty — its hidden groups, life point, enemy replacements and enemy multipliers applied.
import act1multi01 from '../data/levels/act1multi_01.json' with { type: 'json' };
import act1multi02 from '../data/levels/act1multi_02.json' with { type: 'json' };
import act1multi06 from '../data/levels/act1multi_06.json' with { type: 'json' };
import act1multiHard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };
import act1multiRm07 from '../data/levels/act1multi_rm07.json' with { type: 'json' };
import act2multiRm01 from '../data/levels/act2multi_rm01.json' with { type: 'json' };
import act1multiTr01 from '../data/levels/act1multi_tr01.json' with { type: 'json' };
import act1multiFortressRm01 from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };
import act1multiFortressHard01 from '../data/levels/act1multi_fortress_hard-01.json' with { type: 'json' };
import { uncoveredAbilities, withFoeExtras } from './foes.js';
import { profiledDevices } from './devices.js';
import { CARRIED } from './carried.js';

/** @typedef {'NORMAL' | 'FOUR_STAR'} Difficulty */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** The extracted levels, by id. @type {Readonly<Record<string, any>>} */
export const LEVELS = Object.freeze({
  act1multi_01: act1multi01, act1multi_02: act1multi02, act1multi_06: act1multi06, 'act1multi_hard-02': act1multiHard02, act1multi_rm07: act1multiRm07,
  act2multi_rm01: act2multiRm01, act1multi_tr01: act1multiTr01, act1multi_fortress_rm01: act1multiFortressRm01, 'act1multi_fortress_hard-01': act1multiFortressHard01,
});

/** enemy_attribute_mul's keys and the enemy fields they multiply, with each field's value when the enemy has none. */
const MUL_FIELDS = Object.freeze({
  atk: ['atk', 0], def: ['def', 0], max_hp: ['maxHp', 0], magic_resistance: ['res', 0], move_speed: ['moveSpeed', 1], attack_speed: ['aspd', 100], mass_level: ['massLevel', 0],
});

/**
 * An enemy with every multiplier of the difficulty that applies to it (关卡-2): on the base values.
 * @param {string} key @param {EnemyDef} e @param {{ mods: Record<string, number>, enemy?: string[], exclude?: string[] }[]} muls @returns {EnemyDef}
 */
function multiplied(key, e, muls) {
  /** @type {Record<string, any>} */
  const out = { ...e };
  for (const m of muls) {
    if ((m.enemy && !m.enemy.includes(key)) || m.exclude?.includes(key)) continue;
    for (const [k, v] of Object.entries(m.mods)) {
      const [f, dflt] = /** @type {[string, number]} */ (MUL_FIELDS[/** @type {keyof typeof MUL_FIELDS} */ (k)]);
      out[f] = (out[f] ?? dflt) * v;
    }
  }
  return /** @type {EnemyDef} */ (out);
}

/**
 * A level's waves and branches (守御-6) with a difficulty's replacements of the enemies they spawn (关卡-2).
 * @param {any} level @param {Record<string, string>} replace @returns {{ waves: any[], branches?: Record<string, any[]> }}
 */
function replacedSpawns(level, replace) {
  const replaced = (/** @type {any} */ f) => ({ ...f, actions: f.actions.map((/** @type {any} */ a) => (a.type === 'SPAWN' ? { ...a, key: replace[a.key] ?? a.key } : a)) });
  const waves = level.waves.map((/** @type {any} */ w) => ({ ...w, fragments: w.fragments.map(replaced) }));
  if (!level.branches) return { waves };
  return { waves, branches: Object.fromEntries(Object.entries(level.branches).map(([k, fs]) => [k, /** @type {any[]} */ (fs).map(replaced)])) };
}

/**
 * The enemies a level's waves and branches spawn (关卡-2, 守御-6), and those their abilities bring in turn (a split, a
 * summon, a rebirth as another: an enemy key in a blackboard, 敌能-22).
 * @param {any[]} waves @param {Record<string, any[]> | undefined} branches @param {Record<string, any>} enemies the level's records
 */
function spawnedKeys(waves, branches, enemies) {
  const frags = [...waves.flatMap((/** @type {any} */ w) => w.fragments), ...Object.values(branches ?? {}).flat()];
  const used = new Set(frags.flatMap((/** @type {any} */ f) => f.actions.filter((/** @type {any} */ a) => a.type === 'SPAWN').map((/** @type {any} */ a) => a.key)));
  for (const k of used) {
    const e = enemies[k];
    const named = e ? [...Object.values(e.talents ?? {}), ...(e.skills ?? []).map((/** @type {any} */ x) => x.bb)].flatMap((bb) => Object.values(bb)) : [];
    for (const v of named) if (typeof v === 'string' && Object.hasOwn(enemies, v)) used.add(v);
  }
  return used;
}

/**
 * A level's options at a difficulty (关卡-2): the life point, the max cost and the cost recovery its runes set.
 * @param {any} options @param {{ lifePoint?: number, maxCost?: number, costScale?: number }} d
 */
function optionsAt(options, d) {
  return { ...options, ...(d.lifePoint !== undefined ? { maxLifePoint: d.lifePoint } : {}), ...(d.maxCost !== undefined ? { maxCost: d.maxCost } : {}),
    ...(d.costScale !== undefined ? { costIncreaseTime: options.costIncreaseTime * d.costScale } : {}) };
}

/** The levels being tested (关卡-8): they load with enemy abilities that have no behaviour yet, which do nothing there. */
export const TESTING = Object.freeze(['act1multi_fortress_rm01', 'act1multi_fortress_hard-01']);

/** Whether a level is being tested (关卡-8): one of TESTING, or its file says so. @param {string} id @param {any} raw */
const beingTested = (id, raw) => TESTING.includes(id) || raw.testing === true;

/**
 * A level at a difficulty (关卡-2), as @aue/sim's level and enemies; `attack` adds each enemy's attack timing.
 * Throws for a level with runes not supported at that difficulty, whose enemies there have abilities with no
 * behaviour yet — unless it is being tested (one of TESTING, or a level file that says so, `testing: true`): then the
 * level names them (`uncovered`, 关卡-8) —, or with devices not
 * profiled yet (装置-3).
 * @param {string} id @param {Difficulty} difficulty @param {(key: string) => object} [attack]
 * @param {Readonly<Record<string, any>>} [levels] the extracted levels to take it from (LEVELS)
 * @returns {{ level: import('@aue/sim').Content['level'], enemies: Record<string, EnemyDef>, blockAdd: number, devices: Record<string, import('@aue/sim').DeviceDef> }}
 */
export function levelAt(id, difficulty, attack = () => ({}), levels = LEVELS) {
  const raw = Object.hasOwn(levels, id) ? levels[id] : undefined;
  if (!raw) throw new RangeError(`no level ${id}`);
  const d = raw.difficulties[difficulty];
  if (!d) throw new RangeError(`level ${id}: no difficulty ${difficulty}`);
  if (d.unsupported.length > 0) throw new RangeError(`level ${id} at ${difficulty}: runes not supported yet: ${d.unsupported.join(', ')}`);
  const { waves, branches } = replacedSpawns(raw.level, d.replace);
  const used = spawnedKeys(waves, branches, raw.enemies);
  const missing = uncoveredAbilities(Object.entries(raw.enemies).filter(([k]) => used.has(k)).map(([k, e]) => withFoeExtras(k, /** @type {EnemyDef} */ (e))));
  if (missing.length > 0 && !beingTested(id, raw)) throw new RangeError(`level ${id} at ${difficulty}: enemy abilities not supported yet: ${missing.join(', ')}`);
  // a carried unit's card (符文-6) is no device on the field: carried.js makes it
  const dev = profiledDevices(Object.fromEntries(Object.entries(raw.devices ?? {}).filter(([k]) => !Object.hasOwn(CARRIED, k))));
  if (dev.missing.length > 0) throw new RangeError(`level ${id}: devices not supported yet: ${dev.missing.join(', ')}`);
  return {
    level: { ...raw.level, waves, ...(branches ? { branches } : {}), ...(missing.length > 0 ? { uncovered: missing } : {}), hiddenGroups: d.hiddenGroups, ...(dev.works ? { works: dev.works } : {}),
      options: optionsAt(raw.level.options, d) },
    enemies: Object.fromEntries(Object.entries(raw.enemies).filter(([k]) => used.has(k)).map(([k, e]) => [k, { ...multiplied(k, /** @type {EnemyDef} */ (e), d.enemyMul), ...attack(k) }])),
    blockAdd: d.blockAdd ?? 0,
    devices: dev.devices,
  };
}
