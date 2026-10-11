// The network messages, version 1 (ADR 0053). Messages from browsers are untrusted: the server accepts one only when
// clientMessageProblem returns null — exact fields, integers in range, short ids, nothing else.
import { isRecord, isInt, isId, keyProblem } from './checks.js';

export const PROTOCOL_VERSION = 1;

/** Largest frame number (about 9.5 hours at 30 frames per second). */
export const MAX_FRAME = 1_000_000;
/** Largest seat index. */
export const MAX_SEAT = 7;

/** @typedef {{ type: 'deploy', op: string, row: number, col: number, dir: number }} DeployCommand */
/** @typedef {{ type: 'retreat', unit: number }} RetreatCommand */
/** @typedef {DeployCommand | RetreatCommand} Command */

/** @type {Record<string, (c: Record<string, unknown>) => string | null>} */
const COMMANDS = {
  deploy: (c) => keyProblem(c, ['type', 'op', 'row', 'col', 'dir'])
    ?? (!isId(c.op) ? 'deploy.op is not an id' : null)
    ?? (!isInt(c.row, 0, 63) || !isInt(c.col, 0, 63) ? 'deploy tile out of range' : null)
    ?? (!isInt(c.dir, 0, 3) ? 'deploy.dir is not 0–3' : null),
  retreat: (c) => keyProblem(c, ['type', 'unit']) ?? (!isInt(c.unit, 1, 0x7fffffff) ? 'retreat.unit is not a unit id' : null),
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
