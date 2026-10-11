// Whole levels (docs/spec/level.md 关卡-2): a level extracted by @aue/data (data/levels/<id>.json) assembled at a
// difficulty — its hidden groups, life point, enemy replacements and enemy multipliers applied.
import act1multi01 from '../data/levels/act1multi_01.json' with { type: 'json' };

/** @typedef {'NORMAL' | 'FOUR_STAR'} Difficulty */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** The extracted levels, by id. @type {Readonly<Record<string, any>>} */
export const LEVELS = Object.freeze({ act1multi_01: act1multi01 });

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
 * A level at a difficulty (关卡-2), as @aue/sim's level and enemies; `attack` adds each enemy's attack timing.
 * Throws for a level with runes not supported at that difficulty.
 * @param {string} id @param {Difficulty} difficulty @param {(key: string) => object} [attack]
 * @returns {{ level: import('@aue/sim').Content['level'], enemies: Record<string, EnemyDef> }}
 */
export function levelAt(id, difficulty, attack = () => ({})) {
  const raw = LEVELS[id];
  if (!raw) throw new RangeError(`no level ${id}`);
  const d = raw.difficulties[difficulty];
  if (!d) throw new RangeError(`level ${id}: no difficulty ${difficulty}`);
  if (d.unsupported.length > 0) throw new RangeError(`level ${id} at ${difficulty}: runes not supported yet: ${d.unsupported.join(', ')}`);
  const replace = (/** @type {string} */ k) => d.replace[k] ?? k;
  const waves = raw.level.waves.map((/** @type {any} */ w) => ({
    ...w, fragments: w.fragments.map((/** @type {any} */ f) => ({ ...f, actions: f.actions.map((/** @type {any} */ a) => (a.type === 'SPAWN' ? { ...a, key: replace(a.key) } : a)) })),
  }));
  const used = new Set(waves.flatMap((/** @type {any} */ w) => w.fragments.flatMap((/** @type {any} */ f) => f.actions.filter((/** @type {any} */ a) => a.type === 'SPAWN').map((/** @type {any} */ a) => a.key))));
  return {
    level: { ...raw.level, waves, hiddenGroups: d.hiddenGroups, options: { ...raw.level.options, ...(d.lifePoint !== undefined ? { maxLifePoint: d.lifePoint } : {}) } },
    enemies: Object.fromEntries(Object.entries(raw.enemies).filter(([k]) => used.has(k)).map(([k, e]) => [k, { ...multiplied(k, /** @type {EnemyDef} */ (e), d.enemyMul), ...attack(k) }])),
  };
}
