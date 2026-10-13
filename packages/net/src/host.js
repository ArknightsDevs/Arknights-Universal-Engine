// The server side of lockstep (spec 同步-3, 同步-5…同步-8): the clock, sealing frames, relaying commands, the arbiter's
// own simulation, desync recovery, the speed and pause controls. Transport-agnostic: messages come in through the
// methods (already validated with clientMessageProblem) and go out through `send`.
import { PROTOCOL_VERSION } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, contentHash } from '@aue/sim';
import { MAX_AHEAD, HASH_HISTORY, HASH_EVERY, framesAt, PAUSE_ASK_MS, RESUME_MS } from './constants.js';

/** @typedef {import('@aue/schema').Command} Command @typedef {import('@aue/schema').ServerMessage} ServerMessage */
/** @typedef {import('@aue/schema').Match} Match */
/** @typedef {{ seat: number, frame: number, ours: number, theirs: number }} Desync */
/**
 * The host's options: the content and the match settings it was made from (同步-9; none when the clients know the
 * content otherwise), the seats, the seed, the transport, the desync report; `hashEvery`, the frames between the
 * arbiter's kept hashes, a divisor of HASH_EVERY — the clients report every HASH_EVERY frames (同步-5), so by default
 * it hashes only those; 1 keeps every frame's (tests).
 * @typedef {{ content: import('@aue/sim').Content, seats: number, seed: number, send: (seat: number, msg: ServerMessage) => void,
 *   onDesync?: (d: Desync) => void, match?: Match | null, hashEvery?: number }} HostOptions
 */

export class LockstepHost {
  /** @param {HostOptions} o */
  constructor(o) {
    this.o = o;
    /** @type {import('@aue/sim').World} */
    this.world = createWorld(o.content, { seed: o.seed, players: o.seats });
    /** the content's hash, sent with the welcome (同步-10) */
    this.content = contentHash(o.content);
    /** the last sealed frame */
    this.sealed = -1;
    /** the battle clock: battle milliseconds at wall time `ms`, running at `rate` while `running` (同步-3, 同步-7, 同步-8) */
    this.clock = { ms: /** @type {number | null} */ (null), battle: 0 };
    /** @type {Map<number, [number, Command][]>} */
    this.pending = new Map();
    /** @type {Set<number>} */
    this.connected = new Set();
    /** the seats whose page has loaded the battle; the battle begins once every seat has (alone, at once; 同步-11) */
    /** @type {Set<number>} */
    this.loaded = new Set();
    this.begun = o.seats <= 1;
    /** @type {Map<number, number>} frames done → the arbiter's hash, at the frames the clients report (同步-5) */
    this.hashes = new Map();
    /** the frames between kept hashes: every frame a client reports must have one, or its hash goes unchecked */
    this.hashEvery = o.hashEvery ?? HASH_EVERY;
    if (!Number.isSafeInteger(this.hashEvery) || this.hashEvery < 1 || HASH_EVERY % this.hashEvery !== 0) throw new RangeError(`hashEvery must divide HASH_EVERY (${HASH_EVERY})`);
    /**
     * Content with a world setup (钩子-4: kits, 兼容-6) cannot be restored from a snapshot: a joining or desynced seat
     * replays every sealed command from frame 0 (同步-5), kept here.
     * @type {[number, number, Command][] | null}
     */
    this.history = o.content.behaviors?.world ? [] : null;
    /** each seat's 2× switch (同步-7) */
    this.fast = Array.from({ length: o.seats }, () => 0);
    /** paused by agreement (同步-8); the seat asking to pause and since when; when a resume takes effect */
    this.held = false;
    this.asker = -1;
    this.askedAt = 0;
    /** @type {number | null} */
    this.resumeAt = null;
  }

  /**
   * What a seat starts from (同步-5): the arbiter's snapshot, or the sealed commands to replay from frame 0.
   * @returns {{ snapshot: import('@aue/schema').Snapshot | null, replay: [number, number, import('@aue/schema').Command][] | null }}
   */
  state() {
    return this.history ? { snapshot: null, replay: [...this.history] } : { snapshot: takeSnapshot(this.world), replay: null };
  }

  /** The clock's speed: 2 when every seat has its 2× switch on (同步-7). */
  rate() { return this.fast.every((f) => f === 1) ? 2 : 1; }

  /** Whether the clock runs: the battle has begun, someone is connected and it is not paused (同步-6, 同步-8, 同步-11). */
  running() { return this.begun && this.connected.size > 0 && !this.held; }

  /** Battle milliseconds at wall time `now`. @param {number} now */
  battleMs(now) {
    const { ms, battle } = this.clock;
    return ms === null || !this.running() ? battle : battle + (now - ms) * this.rate();
  }

  /** Folds the time so far into the clock before its speed or running state changes. @param {number} now */
  rebase(now) {
    this.clock = { ms: now, battle: this.battleMs(now) };
  }

  /** The control state to every connected seat (同步-7, 同步-8). */
  broadcastControl() {
    const msg = { t: /** @type {const} */ ('control'), fast: [...this.fast], held: this.held ? 1 : 0, asker: this.asker, resuming: this.resumeAt === null ? 0 : 1 };
    for (const seat of this.connected) this.o.send(seat, msg);
  }

  /** A seat says hello: it gets the arbiter's snapshot, the controls and, from then on, every sealed frame (同步-5). @param {number} seat @param {number} now */
  hello(seat, now) {
    this.rebase(now);
    this.connected.add(seat);
    this.o.send(seat, { t: 'welcome', v: PROTOCOL_VERSION, seat, seed: this.o.seed, frame: this.sealed, ...this.state(), match: this.o.match ?? null, content: this.content });
    this.broadcastControl();
  }

  /** A seat's page has loaded the battle: once every seat's has, the battle begins (同步-11). @param {number} seat @param {number} now */
  ready(seat, now) {
    this.rebase(now);
    this.loaded.add(seat);
    if (this.loaded.size >= this.o.seats) this.begun = true;
  }

  /** A seat's connection closed. With nobody left the clock stops (同步-6). @param {number} seat @param {number} now */
  bye(seat, now) {
    this.rebase(now);
    this.connected.delete(seat);
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

  /** A seat turns its 2× switch on or off (同步-7). @param {number} seat @param {number} on @param {number} now */
  speed(seat, on, now) {
    this.rebase(now);
    this.fast[seat] = on ? 1 : 0;
    this.broadcastControl();
  }

  /**
   * A seat asks to pause (同步-8): alone it pauses at once; with a mate, the mate must agree. A pause already on or asked
   * for changes nothing.
   * @param {number} seat @param {number} now
   */
  pause(seat, now) {
    if (this.held || this.asker >= 0) return;
    if (this.o.seats === 1) { this.rebase(now); this.held = true; }
    else { this.asker = seat; this.askedAt = now; }
    this.broadcastControl();
  }

  /** The mate answers a pause request (同步-8): yes pauses now, no closes it. @param {number} seat @param {number} accept @param {number} now */
  pauseReply(seat, accept, now) {
    if (this.asker < 0 || this.asker === seat) return;
    this.asker = -1;
    if (accept) { this.rebase(now); this.held = true; }
    this.broadcastControl();
  }

  /** Any seat resumes a pause (同步-8): after RESUME_MS the clock runs again. @param {number} _seat @param {number} now */
  resume(_seat, now) {
    if (!this.held || this.resumeAt !== null) return;
    this.resumeAt = now + RESUME_MS;
    this.broadcastControl();
  }

  /** Control timers (同步-8): a resume coming due, a pause request nobody answered. @param {number} now */
  controls(now) {
    if (this.resumeAt !== null && now >= this.resumeAt) {
      this.held = false;
      this.clock = { ms: this.resumeAt, battle: this.clock.battle };
      this.resumeAt = null;
      this.broadcastControl();
    }
    if (this.asker >= 0 && now - this.askedAt >= PAUSE_ASK_MS) { this.asker = -1; this.broadcastControl(); }
  }

  /** A seat's state hash after `frame` frames (同步-5). @param {number} seat @param {number} frame @param {number} hash */
  hash(seat, frame, hash) {
    const ours = this.hashes.get(frame);
    if (ours === undefined || ours === hash) return;
    this.o.onDesync?.({ seat, frame, ours, theirs: hash });
    this.o.send(seat, { t: 'resync', ...this.state(), frame: this.sealed });
  }

  /**
   * A frame's commands plus, for a seat that is not connected, a yes to the mate's cost request — open, or made in this
   * frame (合作-5: a request to a mate who has left is accepted).
   * @param {number} f @returns {[number, Command][]}
   */
  frameCommands(f) {
    const list = this.pending.get(f) ?? [];
    this.pending.delete(f);
    if (this.o.seats !== 2) return list;
    for (const seat of [0, 1]) {
      const mate = 1 - seat, asking = this.world.players[mate].ask >= 0 || list.some(([s, c]) => s === mate && c.type === 'ask');
      if (!this.connected.has(seat) && asking) list.push([seat, { type: 'answer', accept: 1 }]);
    }
    return list;
  }

  /** Seals every frame due by `now`, runs them in the arbiter and sends them to the connected seats. @param {number} now */
  tick(now) {
    this.controls(now);
    if (this.clock.ms === null) return;
    const due = framesAt(this.battleMs(now)) - 1, from = this.sealed + 1;
    if (due < from) return;
    /** @type {[number, number, Command][]} */
    const cmds = [];
    for (let f = from; f <= due; f++) {
      const list = this.frameCommands(f);
      for (const [seat, cmd] of list) { cmds.push([f, seat, cmd]); this.history?.push([f, seat, cmd]); }
      step(this.world, this.o.content, list);
      if (this.world.frame % this.hashEvery === 0) this.hashes.set(this.world.frame, stateHash(this.world));
      this.hashes.delete(this.world.frame - HASH_HISTORY);
    }
    this.sealed = due;
    for (const seat of this.connected) this.o.send(seat, { t: 'frames', from, to: due, cmds });
  }
}
