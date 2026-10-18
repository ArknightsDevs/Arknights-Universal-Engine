// 炼金单元 (docs/spec/skills.md 技能-13): what a 炼金师's skill throws — a spot on the ground that lasts its seconds and
// keeps the thrower's attack as it was then. Every interval the ground enemies within its radius take arts damage of no
// source; while they are in it they, and the friendly units in it, have its modifiers (aura.js gives those); it can
// drift away from its thrower and grow. It stays when its thrower leaves the field.
import { KIND } from '@aue/schema';
import { FPS, secondsToFrames, hypot } from '@aue/math';
import { statsOf } from './attrs.js';
import { tileOf } from './body.js';
import { frontOf } from './dir.js';
import { reachKeys } from './reach.js';
import { inKeys, hostile } from './targeting.js';
import { targetsOf } from './combat.js';
import { dealDamage } from './damage.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Alchemy} Alchemy @typedef {import('./types.js').AlchemyDef} AlchemyDef */

/** A 炼金单元's record: its thrower's skill's. @param {Content} c @param {Alchemy} a @returns {AlchemyDef} */
export const alchemyDef = (c, a) => /** @type {AlchemyDef} */ (c.operators[a.key]?.skill?.alchemy);

/**
 * Where a 炼金单元 lands (技能-13): for the enemies, the tile of the operator's first target, else the farthest tile
 * straight ahead in its range (its own tile at the least); for the friendly units, the tile of the one in its range (not
 * a 装置) with the lowest HP share, the latest deployed of equals, else its own.
 * @param {World} w @param {Content} c @param {Unit} op @param {AlchemyDef} def @returns {[number, number]}
 */
function landing(w, c, op, def) {
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, op), [r, col] = tileOf(op);
  if (def.at === 'ally') {
    const mates = w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && c.operators[u.key]?.profession !== 'TRAP' && inKeys(u, keys, grid));
    const share = (/** @type {Unit} */ u) => u.hp / statsOf(u).maxHp;
    const pick = mates.reduce((/** @type {Unit | null} */ best, u) => (!best || share(u) < share(best) || (share(u) === share(best) && u.id > best.id) ? u : best), null);
    return pick ? tileOf(pick) : [r, col];
  }
  const target = targetsOf(w, c, op)[0];
  if (target) return tileOf(target);
  for (let k = grid.rows + grid.cols; k > 0; k--) {
    const [fr, fc] = frontOf(r, col, op.dir, k);
    if (fr >= 0 && fr < grid.rows && fc >= 0 && fc < grid.cols && keys.has(fr * grid.cols + fc)) return [fr, fc];
  }
  return [r, col];
}

/** Whether another operator (not a summon) has a tile in an operator's range (技能-13: 引星棘刺's 心相). @param {World} w @param {Content} c @param {Unit} op */
function othersInRange(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, op);
  return w.units.some((u) => u !== op && u.hp > 0 && u.kind === KIND.OPERATOR && u.summoner === undefined && inKeys(u, keys, grid));
}

/**
 * An operator's skill throws its 炼金单元 (技能-13): it lands at once where landing says, with the operator's attack now;
 * its seconds, plus `extend` while another operator is in the operator's range; a drift away from the operator's tile.
 * The `alchemy` event tells the renderer.
 * @param {World} w @param {Content} c @param {Unit} op @param {AlchemyDef} def
 */
export function throwAlchemy(w, c, op, def) {
  const [y, x] = landing(w, c, op, def), [oy, ox] = tileOf(op), seconds = def.seconds + (def.extend && othersInRange(w, c, op) ? def.extend : 0);
  const len = hypot(x - ox, y - oy), d = def.drift;
  /** @type {Alchemy} */
  const a = { id: w.nextId++, key: op.key, src: op.id, owner: op.owner, cx: x, cy: y, r: def.radius, born: w.frame, end: w.frame + secondsToFrames(seconds), atk: statsOf(op).atk,
    ...(d && len > 0 ? { vx: (x - ox) / len * d.speed, vy: (y - oy) / len * d.speed, until: w.frame + secondsToFrames(d.seconds) } : {}) };
  (w.alchemy ??= []).push(a);
  w.events.push({ type: 'alchemy', id: a.id, src: op.id, x, y, r: a.r, frames: a.end - a.born, vx: a.vx ?? 0, vy: a.vy ?? 0, grow: d && len > 0 ? d.grow : 0, drift: a.until !== undefined ? a.until - a.born : 0 });
}

/**
 * Whether a unit is in a 炼金单元 (技能-13): within its radius of its centre, or for a square one on its tile or one of the
 * 8 around it.
 * @param {Alchemy} a @param {AlchemyDef} def @param {Unit} u
 */
export function inAlchemy(a, def, u) {
  if (def.square) {
    const [r, col] = tileOf(u);
    return Math.abs(r - Math.round(a.cy)) <= 1 && Math.abs(col - Math.round(a.cx)) <= 1;
  }
  const dx = u.x - a.cx, dy = u.y - a.cy;
  return dx * dx + dy * dy <= a.r * a.r;
}

/** Whether a unit is a ground enemy (技能-13). @param {Unit} u */
export const groundFoe = (u) => hostile(u) && u.hp > 0 && !statsOf(u).flying;

/**
 * One 炼金单元's damage this frame (技能-13): every `interval` seconds from its landing, each ground enemy in it takes
 * arts damage of its attack × `scale` × `dmgMul` — one of 重量 at least `heavy.weight` its `heavy.scale` more —, of no source.
 * @param {World} w @param {Content} c @param {Alchemy} a @param {AlchemyDef} def
 */
function alchemyHits(w, c, a, def) {
  const t = w.frame - a.born, every = Math.max(1, secondsToFrames(def.interval ?? 1));
  if (t <= 0 || t % every !== 0) return;
  for (const u of w.units.filter((x) => groundFoe(x) && inAlchemy(a, def, x))) {
    const heavy = def.heavy && statsOf(u).massLevel >= def.heavy.weight ? def.heavy.scale ?? 0 : 0, scale = (def.scale ?? 0) + heavy;
    if (scale > 0) dealDamage(w, null, u, { type: 'arts', amount: a.atk * scale * (def.dmgMul ?? 1), sourceless: true }, c);
  }
}

/**
 * The 炼金单元 this frame, before the auras (技能-13): those past their end are gone — the one at its end still deals the
 * damage of that moment —; the others drift and grow while they do, then deal their damage.
 * @param {World} w @param {Content} c
 */
export function tickAlchemy(w, c) {
  if (!w.alchemy || w.alchemy.length === 0) return;
  w.alchemy = w.alchemy.filter((a) => w.frame <= a.end && alchemyDef(c, a));
  for (const a of w.alchemy) {
    const def = alchemyDef(c, a);
    if (a.until !== undefined && w.frame < a.until) {
      a.cx += (a.vx ?? 0) / FPS; a.cy += (a.vy ?? 0) / FPS; a.r += (def.drift?.grow ?? 0) / FPS;
    }
    alchemyHits(w, c, a, def);
  }
}
