// Creating units from content (spec 部署-1, 出怪-1, 移动-1).
import { FPS, secondsToFrames } from '@aue/math';
import { KIND, ANIM } from '@aue/schema';
import { tileAt } from './level.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Content} Content */

/** @param {import('./level.js').Tile | null} tile */
const heightLevel = (tile) => (tile && tile.height === 'HIGHLAND' ? 1 : 0);

/**
 * A deployed operator.
 * @param {World} w @param {Content} c @param {{ key: string, owner: number, row: number, col: number, dir: number }} o @returns {Unit}
 */
export function makeOperator(w, c, o) {
  const d = c.operators[o.key];
  return {
    id: w.nextId++, kind: KIND.OPERATOR, key: o.key, owner: o.owner, x: o.col, y: o.row, z: heightLevel(tileAt(c.level, o.row, o.col)),
    dir: o.dir, hp: d.maxHp, maxHp: d.maxHp, atk: d.atk, def: d.def, atkInterval: secondsToFrames(d.baseAttackTime), atkCd: 0,
    route: -1, leg: 0, speed: 0, anim: ANIM.IDLE,
  };
}

/**
 * An enemy at the start of its route (spec 出怪-1).
 * @param {World} w @param {Content} c @param {{ key: string, route: number }} e @returns {Unit}
 */
export function makeEnemy(w, c, e) {
  const d = c.enemies[e.key], start = c.level.routes[e.route].start;
  return {
    id: w.nextId++, kind: KIND.ENEMY, key: e.key, owner: -1, x: start.col, y: start.row, z: heightLevel(tileAt(c.level, start.row, start.col)),
    dir: 0, hp: d.maxHp, maxHp: d.maxHp, atk: d.atk, def: d.def, atkInterval: 0, atkCd: 0,
    route: e.route, leg: 0, speed: (d.moveSpeed * c.level.options.moveMultiplier) / FPS, anim: ANIM.MOVE,
  };
}
