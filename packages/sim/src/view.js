// The world as the renderer sees it (schema render state v1).
import { writeView } from '@aue/schema';
import { codeOfDir } from './dir.js';

/** @typedef {import('./types.js').World} World */

/**
 * Writes the render state of the world (into `out` when it is long enough).
 * @param {World} w @param {Float64Array} [out] @returns {Float64Array}
 */
export function toView(w, out) {
  return writeView({
    frame: w.frame,
    players: w.players.map((p) => ({ life: p.life, cost: p.cost })),
    units: w.units.map((u) => ({ id: u.id, kind: u.kind, owner: u.owner, x: u.x, y: u.y, z: u.z, dir: codeOfDir(u.dir), hp: u.hp, maxHp: u.maxHp, anim: u.anim })),
  }, out);
}
