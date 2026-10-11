// Shared test fixtures. tinyContent: a tiny hand-made level for unit tests of the simulation and the lockstep: 6 columns × 3 rows, route coordinates (row 0 nearest).
//   row 2   S  .  W  W  .  .      S start (enemies come in), W high ground (ranged)
//   row 1   _  _  _  _  _  E      _ road (melee), E goal
//   row 0   .  .  W  W  .  .      . floor (nothing)
// The route goes from S (2,0) down to the road (1,0), then right to E (1,5).

/** @param {string} key @param {string} height @param {string} buildable */
const t = (key, height, buildable) => ({ key, height, buildable, passable: 'ALL', side: 'ALL' });
const F = t('tile_floor', 'LOWLAND', 'NONE'), R = t('tile_road', 'LOWLAND', 'MELEE'), W = t('tile_wall', 'HIGHLAND', 'RANGED');
const S = t('tile_start', 'LOWLAND', 'NONE'), E = t('tile_end', 'LOWLAND', 'NONE');

/**
 * A SPAWN action of `key` on `route`, acting at `preDelay` seconds (and `count` times, `interval` apart) after its
 * fragment starts; other fields of @aue/sim's WaveAction may be given in `more`.
 * @param {number} preDelay @param {string} key @param {Record<string, unknown>} [more] @returns {any}
 */
export const spawnAt = (preDelay, key, more = {}) => ({ type: 'SPAWN', key, route: 0, count: 1, preDelay, interval: 0, ...more });

/**
 * One wave of one fragment holding `actions` (no delays, no waiting cap); `fragment` gives the fragment's preDelay.
 * @param {any[]} actions @param {number} [fragment] @returns {any}
 */
export const oneWave = (actions, fragment = 0) => ({ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: fragment, actions }] });

/** A fresh copy each call (tests may change it). Shaped as @aue/sim's Content. @returns {any} */
export function tinyContent() {
  return {
    level: {
      id: 'tiny', width: 6, height: 3,
      options: { maxLifePoint: 3, initialCost: 10, maxCost: 12, costIncreaseTime: 1, characterLimit: 2, moveMultiplier: 1 },
      tiles: [[F, F, W, W, F, F], [R, R, R, R, R, E], [S, F, W, W, F, F]],
      routes: [{ start: { row: 2, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK',
        checkpoints: [{ type: 'MOVE', row: 1, col: 0, time: 0 }, { type: 'WAIT_FOR_SECONDS', row: 0, col: 0, time: 3 }] }],
      waves: [oneWave([spawnAt(0.5, 'slime'), spawnAt(2, 'slime')])],
    },
    enemies: { slime: { name: 'slime', maxHp: 100, atk: 0, def: 10, res: 0, moveSpeed: 1 } },
    operators: {
      guard: { name: 'guard', position: 'MELEE', cost: 5, blockCnt: 2, baseAttackTime: 1, maxHp: 1000, atk: 50, def: 100, res: 0, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
      sniper: { name: 'sniper', position: 'RANGED', cost: 3, blockCnt: 1, baseAttackTime: 1.5, maxHp: 500, atk: 30, def: 20, res: 0,
        range: [{ row: -1, col: 0 }, { row: -1, col: 1 }, { row: 0, col: 1 }, { row: -1, col: -1 }] },
    },
  };
}
