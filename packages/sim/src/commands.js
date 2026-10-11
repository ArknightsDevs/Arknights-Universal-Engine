// Player commands (spec 部署-1, 部署-2, 撤退-1). A command that breaks a rule is ignored, the same way on every peer:
// the server relays commands without judging them, every simulation applies the same rules.
import { KIND } from '@aue/schema';
import { tileAt, buildableFor } from './level.js';
import { makeOperator } from './units.js';
import { releaseAll } from './blocking.js';
import { onDeploy, commandSkill } from './skills.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('@aue/schema').Command} Command */
/** @typedef {import('@aue/schema').DeployCommand} DeployCommand */

/**
 * Why a deploy is refused, or null (spec 部署-1, 部署-2).
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd @returns {string | null}
 */
export function deployProblem(w, c, seat, cmd) {
  const d = Object.hasOwn(c.operators, cmd.op) ? c.operators[cmd.op] : null, p = w.players[seat];
  if (!d || !p) return 'unknown operator or seat';
  if (p.deployed.includes(cmd.op)) return 'already deployed';
  if (p.deployed.length >= c.level.options.characterLimit) return 'deploy limit reached';
  if (p.cost < d.cost) return 'not enough cost';
  if (!buildableFor(tileAt(c.level, cmd.row, cmd.col), d.position)) return 'tile not buildable for this operator';
  if (w.units.some((u) => u.kind === KIND.OPERATOR && u.x === cmd.col && u.y === cmd.row)) return 'tile occupied';
  return null;
}

/** @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd */
function deploy(w, c, seat, cmd) {
  if (deployProblem(w, c, seat, cmd)) return;
  const p = w.players[seat], u = makeOperator(w, c, { key: cmd.op, owner: seat, row: cmd.row, col: cmd.col, dir: cmd.dir });
  p.cost -= c.operators[cmd.op].cost;
  p.deployed.push(cmd.op);
  w.units.push(u);
  w.events.push({ type: 'deploy', id: u.id, key: u.key, owner: seat });
  onDeploy(w, c, u);
}

/** Retreat: a player's own operator leaves the field (spec 撤退-1). @param {World} w @param {number} seat @param {number} unit */
function retreat(w, seat, unit) {
  const i = w.units.findIndex((u) => u.id === unit && u.kind === KIND.OPERATOR && u.owner === seat);
  if (i < 0) return;
  const [u] = w.units.splice(i, 1), p = w.players[seat];
  releaseAll(w, u.id);
  p.deployed = p.deployed.filter((k) => k !== u.key);
  w.events.push({ type: 'retreat', id: u.id });
}

/** Applies one command of a seat. @param {World} w @param {Content} c @param {number} seat @param {Command} cmd */
export function applyCommand(w, c, seat, cmd) {
  if (cmd.type === 'deploy') deploy(w, c, seat, cmd);
  else if (cmd.type === 'skill') commandSkill(w, c, seat, cmd.unit);
  else retreat(w, seat, cmd.unit);
}
