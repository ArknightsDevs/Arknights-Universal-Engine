// Creating units from content (spec 部署-1, 出怪-1, 属性-1): the base attributes come from the content, the buffs start
// empty, the HP and the element values full.
import { KIND, ANIM } from '@aue/schema';
import { tileAt } from './level.js';
import { dirOfCode, DEFAULT_DIR } from './dir.js';
import { statsOf } from './attrs.js';
import { makeSkillState } from './skills.js';
import { LEADER_MAX_EP } from './elements.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Base} Base */
/** @typedef {import('./types.js').Content} Content @typedef {import('./types.js').EnemyDef} EnemyDef @typedef {import('./types.js').OperatorDef} OperatorDef */

/** @param {import('./level.js').Tile | null} tile */
const heightLevel = (tile) => (tile && tile.height === 'HIGHLAND' ? 1 : 0);

/** What a content record may leave out, with the value then (属性-3, 敌人攻击-1). */
const OPTIONAL = Object.freeze({
  aspd: 100, blockCnt: 1, moveSpeed: 1, tauntLevel: 0, massLevel: 0, epDamageResistance: 0, epResistance: 0, motion: 'WALK',
  dmgType: 'phys', rangeRadius: 0, applyWay: 'MELEE',
});

/** A record's maximum element value: its own, else 2000 for a leader (领袖, levelType BOSS), else 1000 (元素-1). @param {Record<string, any>} r */
const maxEpOf = (r) => r.maxEp ?? (r.levelType === 'BOSS' ? LEADER_MAX_EP : 1000);

/**
 * The base attributes of a content record (属性-1); what the record leaves out takes the default.
 * @param {EnemyDef | OperatorDef} d @returns {Base}
 */
export function baseOf(d) {
  /** @type {Record<string, any>} */
  const r = d;
  /** @param {keyof typeof OPTIONAL} k @returns {any} */
  const opt = (k) => r[k] ?? OPTIONAL[k];
  return {
    maxHp: d.maxHp, atk: d.atk, def: d.def, res: d.res, aspd: opt('aspd'), bat: d.baseAttackTime ?? 1, blockCnt: opt('blockCnt'),
    moveSpeed: opt('moveSpeed'), tauntLevel: opt('tauntLevel'), massLevel: opt('massLevel'), epDamageResistance: opt('epDamageResistance'),
    epResistance: opt('epResistance'), motion: opt('motion'), immune: [...(d.immune ?? [])], dmgType: opt('dmgType'),
    rangeRadius: opt('rangeRadius'), applyWay: opt('applyWay'), maxEp: maxEpOf(r), shared: r.shared === true,
    levelType: r.levelType ?? 'NORMAL', neutral: r.neutral === true, deathLife: r.deathLife ?? 0, lifeCost: r.lifePointReduce ?? 1,
  };
}

/**
 * The fields every unit starts with: full HP, no buffs, ready to attack, not blocked, created now.
 * @param {World} w @param {Base} base
 */
function fresh(w, base) {
  const maxHp = statsOf({ base, buffs: [] }).maxHp;
  return { base, buffs: [], hp: maxHp, maxHp, atkCd: 0, blockedBy: -1, blockedAt: -1, born: w.frame, bornN: ++w.bornThisFrame, path: [], pt: 0, wait: -1, hidden: false, skill: null, ep: {}, swing: null };
}

/**
 * A deployed operator; `dir` is the protocol's direction code (schema DIR), `paid` what its deployment cost (部署-3).
 * @param {World} w @param {Content} c @param {{ key: string, owner: number, row: number, col: number, dir: number, paid?: number }} o @returns {Unit}
 */
export function makeOperator(w, c, o) {
  return {
    id: w.nextId++, kind: KIND.OPERATOR, key: o.key, owner: o.owner, x: o.col, y: o.row, z: heightLevel(tileAt(c.level, o.row, o.col)),
    dir: dirOfCode(o.dir), ...fresh(w, baseOf(c.operators[o.key])), route: -1, leg: 0, frag: 0, wave: -1, anim: ANIM.IDLE, paid: o.paid ?? c.operators[o.key].cost,
    skill: c.operators[o.key].skill ? makeSkillState(/** @type {import('./types.js').SkillDef} */ (c.operators[o.key].skill)) : null,
  };
}

/**
 * An enemy at the start of its route (spec 出怪-1): the centre of the start tile, moved by the route's spawn offset.
 * `frag` is the frame its fragment began (路线-1), `wave` the wave that waits for it (波次-3; −1 for none), `unharmful`
 * whether it costs no life at the goal (目标-1).
 * @param {World} w @param {Content} c @param {{ key: string, route: number, frag?: number, wave?: number, unharmful?: boolean }} e @returns {Unit}
 */
export function makeEnemy(w, c, e) {
  const r = c.level.routes[e.route], start = r.start, off = r.spawnOffset ?? { x: 0, y: 0 };
  return {
    id: w.nextId++, kind: KIND.ENEMY, key: e.key, owner: -1, x: start.col + off.x, y: start.row + off.y,
    z: heightLevel(tileAt(c.level, start.row, start.col)), dir: DEFAULT_DIR, ...fresh(w, baseOf(c.enemies[e.key])), route: e.route, leg: 0,
    frag: e.frag ?? w.frame, wave: e.wave ?? -1, ...(e.unharmful ? { unharmful: true } : {}), anim: ANIM.MOVE, paid: 0,
  };
}
