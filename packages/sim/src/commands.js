// Player commands (spec 部署-1…部署-3, 撤退-1). A command that breaks a rule is ignored, the same way on every peer:
// the server relays commands without judging them, every simulation applies the same rules.
import { KIND } from '@aue/schema';
import { tileAt, buildableFor } from './level.js';
import { makeOperator } from './units.js';
import { onDeploy, commandSkill } from './skills.js';
import { traitDeploy, traitOfDef, traitOf } from './traits.js';
import { modeDeploy, deployTalents } from './modes.js';
import { cardOf, deployCost, withdraw } from './deck.js';
import { occupying, summonProblem, deploySummon, supplySummons, inOwnerRange, trapRefused } from './summons.js';
import { isDown, askCost, answerCost } from './coop.js';
import { emit } from './bus.js';
import { statsOf } from './attrs.js';
import { pointForm } from './tactical.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('@aue/schema').Command} Command */
/** @typedef {import('@aue/schema').DeployCommand} DeployCommand */

/**
 * Whether an operator may stand on a tile (部署-1): a tile of its position or of both; a melee one whose trait allows it
 * (职业-10) also on a ranged tile; a summon of 全部位 on either (召唤-4).
 * @param {Content} c @param {import('./types.js').OperatorDef} d @param {number} row @param {number} col
 */
export function fits(c, d, row, col) {
  const tile = tileAt(c.level, row, col), melee = buildableFor(tile, 'MELEE'), ranged = buildableFor(tile, 'RANGED');
  return d.position === 'ALL' ? melee || ranged : buildableFor(tile, d.position) || (traitOfDef(d).rangedTiles && ranged);
}

/**
 * Whether an operator (by content key) may stand on a tile (部署-1), for the deploy highlight (渲染-8).
 * @param {Content} c @param {string} key @param {number} row @param {number} col
 */
export const fitsTile = (c, key, row, col) => Object.hasOwn(c.operators, key) && fits(c, c.operators[key], row, col);

/** An operator record that takes no place in the deploy limit (部署-2): a free trait's. @param {import('./types.js').OperatorDef} d */
const free = (d) => traitOfDef(d).free === true;

/**
 * Why a deploy is refused, or null (spec 部署-1…部署-3, 召唤-4, 职业-14): a summon's by its card, an operator's by its own.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd @returns {string | null}
 */
export function deployProblem(w, c, seat, cmd) {
  const d = Object.hasOwn(c.operators, cmd.op) ? c.operators[cmd.op] : null, p = w.players[seat];
  if (!d || !p) return 'unknown operator or seat';
  if (c.decks && !c.decks[seat]?.includes(d.summon ? d.summoner ?? '' : cmd.op)) return 'not in the deck';
  if (isDown(p)) return 'player down';
  return d.summon ? summonProblem(w, c, seat, cmd.op) ?? limitProblem(w, c, seat, d) ?? placeProblem(w, c, seat, cmd, d.cost) ?? rangeProblem(w, c, seat, cmd)
    ?? trapProblem(w, c, seat, cmd) : operatorProblem(w, c, seat, cmd);
}

/**
 * A summon that may only stand in its owner's attack range (召唤-4), on a tile outside it.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
const rangeProblem = (w, c, seat, cmd) => (inOwnerRange(w, c, seat, cmd.op, cmd) ? null : 'outside the summoner\'s range');

/**
 * A summon whose owner's trait keeps it off the tiles of ground enemies (职业-14), on such a tile.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
const trapProblem = (w, c, seat, cmd) => (trapRefused(w, c, seat, cmd.op, cmd) ? 'an enemy on the tile' : null);

/**
 * An operator's own reasons (部署-2, 部署-3): on the field already, the deploy limit, redeploying, then the place's.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function operatorProblem(w, c, seat, cmd) {
  const p = w.players[seat], d = c.operators[cmd.op];
  if (p.deployed.includes(cmd.op)) return 'already deployed';
  return limitProblem(w, c, seat, d) ?? (w.frame < cardOf(p, cmd.op).ready ? 'redeploying' : null) ?? placeProblem(w, c, seat, cmd, deployCost(c, p, cmd.op));
}

/**
 * The deploy limit (部署-2, 召唤-4): an operator that is not free, or a summon whose 部署占用数 is 1, needs a place.
 * @param {World} w @param {Content} c @param {number} seat @param {import('./types.js').OperatorDef} d
 */
function limitProblem(w, c, seat, d) {
  const takes = d.summon ? d.summon.occupy === 1 : !free(d);
  return takes && occupying(w, c, seat, free) >= c.level.options.characterLimit ? 'deploy limit reached' : null;
}

/**
 * The cost and the tile (部署-1, 部署-2): the cost of now, a tile the record may stand on, no operator there.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd @param {number} cost
 */
function placeProblem(w, c, seat, cmd, cost) {
  if (w.players[seat].cost < cost) return 'not enough cost';
  if (!fits(c, c.operators[cmd.op], cmd.row, cmd.col)) return 'tile not buildable for this operator';
  if (w.units.some((u) => (u.kind === KIND.OPERATOR || u.kind === KIND.DEVICE) && u.x === cmd.col && u.y === cmd.row)) return 'tile occupied';
  return null;
}

/**
 * Deploys: the cost of now (部署-3) is paid and kept on the unit; its trait takes hold, then its passive skill starts.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function deploy(w, c, seat, cmd) {
  if (deployProblem(w, c, seat, cmd)) return;
  if (c.operators[cmd.op].summon) {
    deploySummon(w, c, seat, cmd);
    return;
  }
  const p = w.players[seat], paid = deployCost(c, p, cmd.op);
  const u = makeOperator(w, c, { key: cmd.op, owner: seat, row: cmd.row, col: cmd.col, dir: cmd.dir, paid });
  p.cost -= paid;
  p.deployed.push(cmd.op);
  w.units.push(u);
  w.events.push({ type: 'deploy', id: u.id, key: u.key, owner: seat });
  arrive(w, c, u);
}

/**
 * An operator's deployment takes hold (部署-2, 部署-9): the `enter` event, its trait, its attack mode, its deployment
 * talents, its passive skill, its summon cards, then the `deploy` event — `move` for a 移动.
 * @param {World} w @param {Content} c @param {import('./types.js').Unit} u @param {boolean} [move]
 */
export function arrive(w, c, u, move = false) {
  emit(w, 'enter', { unit: u });
  traitDeploy(w, c, u);
  modeDeploy(u, traitOf(c, u));
  deployTalents(w, c, u);
  onDeploy(w, c, u);
  supplySummons(w, c, u);
  emit(w, 'deploy', { unit: u, initial: false, ...(move ? { move: true } : {}) });
}

/**
 * Retreat: a player's own operator leaves the field (spec 撤退-1) with its refund, a penalty layer and its 再部署时间 —
 * not one that cannot retreat (`noRetreat`); a tactical summon in its summon form turns into its point instead (召唤-11).
 * @param {World} w @param {Content} c @param {number} seat @param {number} unit
 */
function retreat(w, c, seat, unit) {
  const u = w.units.find((x) => x.id === unit && x.kind === KIND.OPERATOR && x.owner === seat);
  if (u && !statsOf(u).flags.noRetreat && !pointForm(w, c, u)) withdraw(w, c, u);
}

/** Applies one command of a seat. @param {World} w @param {Content} c @param {number} seat @param {Command} cmd */
export function applyCommand(w, c, seat, cmd) {
  if (cmd.type === 'deploy') deploy(w, c, seat, cmd);
  else if (cmd.type === 'skill') commandSkill(w, c, seat, cmd.unit);
  else if (cmd.type === 'ask') askCost(w, c, seat);
  else if (cmd.type === 'answer') answerCost(w, c, seat, cmd.accept === 1);
  else retreat(w, c, seat, cmd.unit);
}
