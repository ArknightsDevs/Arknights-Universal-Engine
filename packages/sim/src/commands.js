// Player commands (spec 部署-1…部署-3, 撤退-1). A command that breaks a rule is ignored, the same way on every peer:
// the server relays commands without judging them, every simulation applies the same rules.
import { KIND } from '@aue/schema';
import { tileAt, buildableFor } from './level.js';
import { makeOperator } from './units.js';
import { releaseAll } from './blocking.js';
import { onDeploy, commandSkill } from './skills.js';
import { traitDeploy } from './traits.js';
import { cardOf, deployCost, leaveField } from './deck.js';
import { isDown } from './coop.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('@aue/schema').Command} Command */
/** @typedef {import('@aue/schema').DeployCommand} DeployCommand */

/**
 * Why a deploy is refused, or null (spec 部署-1…部署-3).
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd @returns {string | null}
 */
export function deployProblem(w, c, seat, cmd) {
  const d = Object.hasOwn(c.operators, cmd.op) ? c.operators[cmd.op] : null, p = w.players[seat];
  if (!d || !p) return 'unknown operator or seat';
  if (isDown(p)) return 'player down';
  if (p.deployed.includes(cmd.op)) return 'already deployed';
  if (p.deployed.length >= c.level.options.characterLimit) return 'deploy limit reached';
  if (w.frame < cardOf(p, cmd.op).ready) return 'redeploying';
  if (p.cost < deployCost(c, p, cmd.op)) return 'not enough cost';
  if (!buildableFor(tileAt(c.level, cmd.row, cmd.col), d.position)) return 'tile not buildable for this operator';
  if (w.units.some((u) => u.kind === KIND.OPERATOR && u.x === cmd.col && u.y === cmd.row)) return 'tile occupied';
  return null;
}

/**
 * Deploys: the cost of now (部署-3) is paid and kept on the unit; its trait takes hold, then its passive skill starts.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function deploy(w, c, seat, cmd) {
  if (deployProblem(w, c, seat, cmd)) return;
  const p = w.players[seat], paid = deployCost(c, p, cmd.op);
  const u = makeOperator(w, c, { key: cmd.op, owner: seat, row: cmd.row, col: cmd.col, dir: cmd.dir, paid });
  p.cost -= paid;
  p.deployed.push(cmd.op);
  w.units.push(u);
  w.events.push({ type: 'deploy', id: u.id, key: u.key, owner: seat });
  traitDeploy(w, c, u);
  onDeploy(w, c, u);
}

/**
 * Retreat: a player's own operator leaves the field (spec 撤退-1) with its refund, a penalty layer and its 再部署时间.
 * @param {World} w @param {Content} c @param {number} seat @param {number} unit
 */
function retreat(w, c, seat, unit) {
  const i = w.units.findIndex((u) => u.id === unit && u.kind === KIND.OPERATOR && u.owner === seat);
  if (i < 0) return;
  const [u] = w.units.splice(i, 1);
  releaseAll(w, u.id);
  leaveField(w, c, u, true);
  w.events.push({ type: 'retreat', id: u.id });
}

/** Applies one command of a seat. @param {World} w @param {Content} c @param {number} seat @param {Command} cmd */
export function applyCommand(w, c, seat, cmd) {
  if (cmd.type === 'deploy') deploy(w, c, seat, cmd);
  else if (cmd.type === 'skill') commandSkill(w, c, seat, cmd.unit);
  else retreat(w, c, seat, cmd.unit);
}
