// The world and one frame of it (spec 帧-1): commands, cost, spawns, buffs, enemy movement, operator attacks, removal
// of the dead — in that order, every frame, on every peer.
import { secondsToFrames } from '@aue/math';
import { ANIM, KIND } from '@aue/schema';
import { seedState } from './rng.js';
import { hashNumbers, HASH_START } from './hash.js';
import { spawnFrames, spawnDue, enemiesAct } from './enemies.js';
import { releaseAll } from './blocking.js';
import { operatorsAttack } from './combat.js';
import { applyCommand } from './commands.js';
import { tickBuffs } from './buffs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('@aue/schema').Command} Command */

/**
 * A new world at frame 0 (spec 费用-1: each player starts with the level's initial cost and life).
 * @param {Content} c @param {{ seed: number, players: number }} o @returns {World}
 */
export function createWorld(c, o) {
  const { initialCost, maxLifePoint, costIncreaseTime } = c.level.options;
  return {
    frame: 0, rng: seedState(o.seed), nextId: 1, nextSpawn: 0, spawnFrames: spawnFrames(c), bornThisFrame: 0, units: [], events: [],
    players: Array.from({ length: o.players }, () => ({ life: maxLifePoint, cost: initialCost, costTimer: secondsToFrames(costIncreaseTime), deployed: [] })),
  };
}

/** Each player gains 1 cost every costIncreaseTime, up to maxCost (spec 费用-1). @param {World} w @param {Content} c */
function gainCost(w, c) {
  const { maxCost, costIncreaseTime } = c.level.options;
  for (const p of w.players) {
    if (--p.costTimer > 0) continue;
    p.costTimer = secondsToFrames(costIncreaseTime);
    p.cost = Math.min(maxCost, p.cost + 1);
  }
}

/**
 * Removes units with no HP left (伤害-9): enemies killed by attacks die, enemies at the goal leave quietly; an operator
 * that falls releases what it blocks (阻挡-3) and may be deployed again (INF-0009).
 * @param {World} w
 */
function removeDead(w) {
  const reachedGoal = new Set(w.events.filter((e) => e.type === 'goal').map((e) => e.id));
  for (const u of w.units) {
    if (u.hp > 0) continue;
    u.anim = ANIM.DIE;
    if (!reachedGoal.has(u.id)) w.events.push({ type: 'death', id: u.id });
    releaseAll(w, u.id);
    if (u.kind === KIND.OPERATOR) w.players[u.owner].deployed = w.players[u.owner].deployed.filter((k) => k !== u.key);
  }
  w.units = w.units.filter((u) => u.hp > 0);
}

/**
 * Runs frame `w.frame` with the commands executed in it ([seat, command] in the order the server sealed them) and
 * advances to the next frame. Returns the frame's presentation events.
 * @param {World} w @param {Content} c @param {[number, Command][]} commands
 */
export function step(w, c, commands = []) {
  w.events = [];
  w.bornThisFrame = 0;
  for (const [seat, cmd] of commands) applyCommand(w, c, seat, cmd);
  gainCost(w, c);
  spawnDue(w, c);
  tickBuffs(w);
  enemiesAct(w, c);
  operatorsAttack(w, c);
  removeDead(w);
  w.frame++;
  return w.events;
}

/**
 * Plain data as numbers for the hash (spec 同步-1): a tag, then the value — numbers (−0 as 0), strings by length and
 * UTF-16 code units, booleans, null, arrays by length then items, objects by key count then each key and value in
 * order. Keys holding undefined are skipped, as a snapshot (JSON) drops them.
 * @param {number[]} out @param {unknown} v
 */
export function pushValue(out, v) {
  if (typeof v === 'number') out.push(0, v + 0);
  else if (typeof v === 'string') pushText(out, 1, v);
  else if (typeof v === 'boolean') out.push(2, v ? 1 : 0);
  else if (v === null) out.push(3);
  else if (Array.isArray(v)) { out.push(4, v.length); for (const x of v) pushValue(out, x); }
  else if (typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    out.push(5, entries.length);
    for (const [k, x] of entries) { pushText(out, 1, k); pushValue(out, x); }
  } else throw new TypeError(`stateHash: not plain data: ${typeof v}`);
}

/** @param {number[]} out @param {number} tag @param {string} s */
function pushText(out, tag, s) {
  out.push(tag, s.length);
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
}

/**
 * The state hash (spec 同步-1): the frame, the random state, the id and spawn counters, the players and the units, all
 * of their data.
 * @param {World} w @returns {number}
 */
export function stateHash(w) {
  /** @type {number[]} */
  const nums = [];
  pushValue(nums, { frame: w.frame, rng: w.rng, nextId: w.nextId, nextSpawn: w.nextSpawn, players: w.players, units: w.units });
  return hashNumbers(HASH_START, nums);
}

