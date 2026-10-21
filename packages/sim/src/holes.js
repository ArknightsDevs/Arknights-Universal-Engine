// 地穴 (docs/spec/field.md 地图-4): a ground enemy standing on a 地穴 falls — its HP goes to 0 and it leaves at the end of
// the frame with no one's kill. Checked every frame once the enemies have acted, so an enemy that walks, slides or lands
// onto one falls in that frame.
import { KIND } from '@aue/schema';
import { keyAt, isHole } from './paths.js';
import { statsOf } from './attrs.js';
import { setHp } from './damage.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */

/** Every ground enemy on a 地穴 falls (地图-4). @param {World} w @param {Content} c */
export function fallIntoHoles(w, c) {
  const m = c.level;
  for (const e of w.units) {
    if (e.kind !== KIND.ENEMY || e.hp <= 0 || e.hidden || statsOf(e).flying) continue;
    const k = keyAt(m, e.x, e.y);
    if (k >= 0 && isHole(m.tiles[Math.floor(k / m.width)][k % m.width])) { e.ab['@fell'] = 1; setHp(e, 0); }
  }
}
