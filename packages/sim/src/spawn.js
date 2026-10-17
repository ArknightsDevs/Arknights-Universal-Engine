// An enemy spawning (docs/spec/waves.md 波次-1): a wave's or a branch's SPAWN action acting once (守御-6) — the enemy
// at the start of its route, its spawn event, its abilities set up, the `deploy` and `enemySpawn` events.
import { makeEnemy } from './units.js';
import { foeSpawn } from './foes.js';
import { emit } from './bus.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */

/**
 * @param {World} w @param {Content} c @param {{ key: string, route: number, unharmful?: boolean }} a
 * @param {number} fragAt the frame its fragment began @param {number} wave the wave that waits for it, −1 for none
 */
export function spawnEnemy(w, c, a, fragAt, wave) {
  const u = makeEnemy(w, c, { key: a.key, route: a.route, frag: fragAt, wave, unharmful: a.unharmful });
  w.units.push(u);
  w.events.push({ type: 'spawn', id: u.id, key: u.key });
  foeSpawn(w, c, u);
  emit(w, 'deploy', { unit: u, initial: false });
  emit(w, 'enemySpawn', { enemy: u });
  return u;
}
