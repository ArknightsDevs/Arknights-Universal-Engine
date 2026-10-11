// The server side of lockstep (spec 同步-3, 同步-5, 同步-6): the clock, sealing frames, relaying commands, the arbiter's
// own simulation, desync recovery. Transport-agnostic: messages come in through the methods (already validated with
// clientMessageProblem) and go out through `send`.
import { PROTOCOL_VERSION } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot } from '@aue/sim';
import { MAX_AHEAD, HASH_HISTORY, framesAt } from './constants.js';

/** @typedef {import('@aue/schema').Command} Command @typedef {import('@aue/schema').ServerMessage} ServerMessage */
/** @typedef {{ seat: number, frame: number, ours: number, theirs: number }} Desync */
/**
 * @typedef {object} HostOptions
 * @property {import('@aue/sim').Content} content
 * @property {number} seats
 * @property {number} seed
 * @property {(seat: number, msg: ServerMessage) => void} send
 * @property {(d: Desync) => void} [onDesync]
 */

export class LockstepHost {
  /** @param {HostOptions} o */
  constructor(o) {
    this.o = o;
    /** @type {import('@aue/sim').World} */
    this.world = createWorld(o.content, { seed: o.seed, players: o.seats });
    /** the last sealed frame */
    this.sealed = -1;
    /** @type {number | null} */
    this.startMs = null;
    /** @type {number | null} */
    this.pausedAt = null;
    /** @type {Map<number, [number, Command][]>} */
    this.pending = new Map();
    /** @type {Set<number>} */
    this.connected = new Set();
    /** @type {Map<number, number>} frames done → the arbiter's hash */
    this.hashes = new Map();
  }

  /** A seat says hello: it gets the arbiter's snapshot and, from then on, every sealed frame (同步-5). @param {number} seat @param {number} now */
  hello(seat, now) {
    if (this.startMs === null) this.startMs = now;
    if (this.pausedAt !== null) { this.startMs += now - this.pausedAt; this.pausedAt = null; }
    this.connected.add(seat);
    this.o.send(seat, { t: 'welcome', v: PROTOCOL_VERSION, seat, seed: this.o.seed, frame: this.sealed, snapshot: takeSnapshot(this.world) });
  }

  /** A seat's connection closed. With nobody left the battle pauses (同步-6). @param {number} seat @param {number} now */
  bye(seat, now) {
    this.connected.delete(seat);
    if (this.connected.size === 0 && this.pausedAt === null) this.pausedAt = now;
  }

  /** A command for frame `at` (同步-3): too late → the next open frame, and the sender is told. @param {number} seat @param {number} at @param {Command} cmd */
  command(seat, at, cmd) {
    if (at > this.sealed + MAX_AHEAD) { this.o.send(seat, { t: 'error', code: 'too-far-ahead', message: `frame ${at} is more than ${MAX_AHEAD} frames ahead` }); return; }
    const frame = Math.max(at, this.sealed + 1);
    if (frame !== at) this.o.send(seat, { t: 'restamp', from: at, to: frame });
    const list = this.pending.get(frame) ?? [];
    list.push([seat, cmd]);
    this.pending.set(frame, list);
  }

  /** A seat's state hash after `frame` frames (同步-5). @param {number} seat @param {number} frame @param {number} hash */
  hash(seat, frame, hash) {
    const ours = this.hashes.get(frame);
    if (ours === undefined || ours === hash) return;
    this.o.onDesync?.({ seat, frame, ours, theirs: hash });
    this.o.send(seat, { t: 'resync', snapshot: takeSnapshot(this.world) });
  }

  /** Seals every frame due by `now`, runs them in the arbiter and sends them to the connected seats. @param {number} now */
  tick(now) {
    if (this.startMs === null || this.pausedAt !== null) return;
    const due = framesAt(now - this.startMs) - 1, from = this.sealed + 1;
    if (due < from) return;
    /** @type {[number, number, Command][]} */
    const cmds = [];
    for (let f = from; f <= due; f++) {
      const list = this.pending.get(f) ?? [];
      this.pending.delete(f);
      for (const [seat, cmd] of list) cmds.push([f, seat, cmd]);
      step(this.world, this.o.content, list);
      this.hashes.set(this.world.frame, stateHash(this.world));
      this.hashes.delete(this.world.frame - HASH_HISTORY);
    }
    this.sealed = due;
    for (const seat of this.connected) this.o.send(seat, { t: 'frames', from, to: due, cmds });
  }
}
