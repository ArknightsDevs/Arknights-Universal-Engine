// The network messages, version 2 (ADR 0053; version 2 adds the skill command). Messages from browsers are untrusted: the server accepts one only when
// clientMessageProblem returns null — exact fields, integers in range, short ids, nothing else.
import { isRecord, isInt, isId, keyProblem } from './checks.js';

export const PROTOCOL_VERSION = 2;

/** Largest frame number (about 9.5 hours at 30 frames per second). */
export const MAX_FRAME = 1_000_000;
/** Largest seat index. */
export const MAX_SEAT = 7;

/** @typedef {{ type: 'deploy', op: string, row: number, col: number, dir: number }} DeployCommand */
/** @typedef {{ type: 'retreat', unit: number }} RetreatCommand */
/** @typedef {{ type: 'skill', unit: number }} SkillCommand */
/** @typedef {DeployCommand | RetreatCommand | SkillCommand} Command */

/** @type {Record<string, (c: Record<string, unknown>) => string | null>} */
const COMMANDS = {
  deploy: (c) => keyProblem(c, ['type', 'op', 'row', 'col', 'dir'])
    ?? (!isId(c.op) ? 'deploy.op is not an id' : null)
    ?? (!isInt(c.row, 0, 63) || !isInt(c.col, 0, 63) ? 'deploy tile out of range' : null)
    ?? (!isInt(c.dir, 0, 3) ? 'deploy.dir is not 0–3' : null),
  retreat: (c) => keyProblem(c, ['type', 'unit']) ?? (!isInt(c.unit, 1, 0x7fffffff) ? 'retreat.unit is not a unit id' : null),
  skill: (c) => keyProblem(c, ['type', 'unit']) ?? (!isInt(c.unit, 1, 0x7fffffff) ? 'skill.unit is not a unit id' : null),
};

/** @param {unknown} c @returns {string | null} why the command is malformed, or null */
export function commandProblem(c) {
  if (!isRecord(c)) return 'command is not an object';
  const check = typeof c.type === 'string' && Object.hasOwn(COMMANDS, c.type) ? COMMANDS[c.type] : null;
  return check ? check(c) : `unknown command type ${String(c.type)}`;
}

/** @type {Record<string, (m: Record<string, unknown>) => string | null>} */
const CLIENT = {
  hello: (m) => keyProblem(m, ['t', 'v', 'seat', 'key', 'since'])
    ?? (m.v !== PROTOCOL_VERSION ? `protocol version ${String(m.v)}, expected ${PROTOCOL_VERSION}` : null)
    ?? (!isInt(m.seat, 0, MAX_SEAT) ? 'hello.seat out of range' : null)
    ?? (!isId(m.key) ? 'hello.key is not an id' : null)
    ?? (!isInt(m.since, -1, MAX_FRAME) ? 'hello.since out of range' : null),
  cmd: (m) => keyProblem(m, ['t', 'at', 'cmd']) ?? (!isInt(m.at, 0, MAX_FRAME) ? 'cmd.at out of range' : null) ?? commandProblem(m.cmd),
  hash: (m) => keyProblem(m, ['t', 'frame', 'hash'])
    ?? (!isInt(m.frame, 0, MAX_FRAME) ? 'hash.frame out of range' : null)
    ?? (!isInt(m.hash, 0, 0xffffffff) ? 'hash.hash is not a uint32' : null),
};

/**
 * Why a message from a browser is rejected, or null when it is well formed.
 * @param {unknown} m the parsed JSON @returns {string | null}
 */
export function clientMessageProblem(m) {
  if (!isRecord(m)) return 'message is not an object';
  const check = typeof m.t === 'string' && Object.hasOwn(CLIENT, m.t) ? CLIENT[m.t] : null;
  return check ? check(m) : `unknown message type ${String(m.t)}`;
}

/** @param {unknown} cmds @returns {string | null} */
function sealedCommandsProblem(cmds) {
  if (!Array.isArray(cmds)) return 'frames.cmds is not an array';
  for (const c of cmds) {
    if (!Array.isArray(c) || c.length !== 3 || !isInt(c[0], 0, MAX_FRAME) || !isInt(c[1], 0, MAX_SEAT)) return 'frames.cmds has a malformed entry';
    const why = commandProblem(c[2]);
    if (why) return why;
  }
  return null;
}

/** @type {Record<string, (m: Record<string, unknown>) => string | null>} */
const SERVER = {
  welcome: (m) => keyProblem(m, ['t', 'v', 'seat', 'seed', 'frame', 'snapshot'])
    ?? (m.v !== PROTOCOL_VERSION ? `protocol version ${String(m.v)}, expected ${PROTOCOL_VERSION}` : null)
    ?? (!isInt(m.seat, 0, MAX_SEAT) || !isInt(m.frame, -1, MAX_FRAME) || !Number.isSafeInteger(m.seed) ? 'welcome fields out of range' : null),
  frames: (m) => keyProblem(m, ['t', 'from', 'to', 'cmds'])
    ?? (!isInt(m.from, 0, MAX_FRAME) || !isInt(m.to, 0, MAX_FRAME) || /** @type {number} */ (m.to) < /** @type {number} */ (m.from) ? 'frames range malformed' : null)
    ?? sealedCommandsProblem(m.cmds),
  restamp: (m) => keyProblem(m, ['t', 'from', 'to']) ?? (!isInt(m.from, 0, MAX_FRAME) || !isInt(m.to, 0, MAX_FRAME) ? 'restamp out of range' : null),
  resync: (m) => keyProblem(m, ['t', 'snapshot']),
  error: (m) => keyProblem(m, ['t', 'code', 'message']) ?? (typeof m.code !== 'string' || typeof m.message !== 'string' ? 'error fields are not strings' : null),
};

/**
 * Why a message from the server is rejected, or null. Clients check it too: a broken or hostile host must not crash
 * a page. Snapshots are checked when they are restored (snapshotProblem).
 * @param {unknown} m the parsed JSON @returns {string | null}
 */
export function serverMessageProblem(m) {
  if (!isRecord(m)) return 'message is not an object';
  const check = typeof m.t === 'string' && Object.hasOwn(SERVER, m.t) ? SERVER[m.t] : null;
  return check ? check(m) : `unknown message type ${String(m.t)}`;
}

/** @typedef {{ t: 'hello', v: number, seat: number, key: string, since: number }} HelloMessage */
/** @typedef {{ t: 'cmd', at: number, cmd: Command }} CommandMessage */
/** @typedef {{ t: 'hash', frame: number, hash: number }} HashMessage */
/** @typedef {HelloMessage | CommandMessage | HashMessage} ClientMessage */

/** @typedef {{ t: 'welcome', v: number, seat: number, seed: number, frame: number, snapshot: object | null }} WelcomeMessage */
/** @typedef {{ t: 'frames', from: number, to: number, cmds: [number, number, Command][] }} FramesMessage */
/** @typedef {{ t: 'restamp', from: number, to: number }} RestampMessage */
/** @typedef {{ t: 'resync', snapshot: object }} ResyncMessage */
/** @typedef {{ t: 'error', code: string, message: string }} ErrorMessage */
/** @typedef {WelcomeMessage | FramesMessage | RestampMessage | ResyncMessage | ErrorMessage} ServerMessage */
