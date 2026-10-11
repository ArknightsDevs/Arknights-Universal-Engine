// Creating units from content (spec 部署-1, 出怪-1, 属性-1): the base attributes come from the content, the buffs start
// empty, the HP full.
import { KIND, ANIM } from '@aue/schema';
import { tileAt } from './level.js';
import { dirOfCode, DEFAULT_DIR } from './dir.js';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Base} Base */
/** @typedef {import('./types.js').Content} Content @typedef {import('./types.js').EnemyDef} EnemyDef @typedef {import('./types.js').OperatorDef} OperatorDef */

/** @param {import('./level.js').Tile | null} tile */
const heightLevel = (tile) => (tile && tile.height === 'HIGHLAND' ? 1 : 0);

/**
 * The base attributes of a content record (属性-1); what the record leaves out takes the default.
 * @param {EnemyDef | OperatorDef} d @returns {Base}
 */
export function baseOf(d) {
  return {
    maxHp: d.maxHp, atk: d.atk, def: d.def, res: d.res, aspd: d.aspd ?? 100, bat: d.baseAttackTime ?? 1,
    blockCnt: 'blockCnt' in d ? d.blockCnt : 0, moveSpeed: 'moveSpeed' in d ? d.moveSpeed : 1, tauntLevel: d.tauntLevel ?? 0,
    massLevel: d.massLevel ?? 0, epDamageResistance: d.epDamageResistance ?? 0, epResistance: d.epResistance ?? 0,
    motion: 'motion' in d && d.motion ? d.motion : 'WALK', immune: [...(d.immune ?? [])], dmgType: d.dmgType ?? 'phys',
  };
}

/**
 * The fields every unit starts with: full HP, no buffs, ready to attack, not blocked, created now.
 * @param {World} w @param {Base} base
 */
function fresh(w, base) {
  const maxHp = statsOf({ base, buffs: [] }).maxHp;
  return { base, buffs: [], hp: maxHp, maxHp, atkCd: 0, blockedBy: -1, born: w.frame, bornN: ++w.bornThisFrame };
}

/**
 * A deployed operator; `dir` is the protocol's direction code (schema DIR).
 * @param {World} w @param {Content} c @param {{ key: string, owner: number, row: number, col: number, dir: number }} o @returns {Unit}
 */
export function makeOperator(w, c, o) {
  return {
    id: w.nextId++, kind: KIND.OPERATOR, key: o.key, owner: o.owner, x: o.col, y: o.row, z: heightLevel(tileAt(c.level, o.row, o.col)),
    dir: dirOfCode(o.dir), ...fresh(w, baseOf(c.operators[o.key])), route: -1, leg: 0, anim: ANIM.IDLE,
  };
}

/**
 * An enemy at the start of its route (spec 出怪-1).
 * @param {World} w @param {Content} c @param {{ key: string, route: number }} e @returns {Unit}
 */
export function makeEnemy(w, c, e) {
  const start = c.level.routes[e.route].start;
  return {
    id: w.nextId++, kind: KIND.ENEMY, key: e.key, owner: -1, x: start.col, y: start.row, z: heightLevel(tileAt(c.level, start.row, start.col)),
    dir: DEFAULT_DIR, ...fresh(w, baseOf(c.enemies[e.key])), route: e.route, leg: 0, anim: ANIM.MOVE,
  };
}
