// A battle session in the worker (ADR 0009, 0053): the socket, the lockstep client, the frame clock, and the render
// state posted to the main thread after each frame time. Everything that touches the platform comes in through `io`,
// so the session runs the same in a Worker and in a Node test.
import { serverMessageProblem, PROTOCOL_VERSION } from '@aue/schema';
import { toView, stateHash } from '@aue/sim';
import { LockstepClient } from '@aue/net';

/** @typedef {{ send(text: string): void, close(): void, onopen: (() => void) | null, onmessage: ((text: string) => void) | null, onclose: (() => void) | null }} SocketLike */
/**
 * @typedef {object} SessionIO
 * @property {(url: string) => SocketLike} connect
 * @property {(msg: object, transfer?: Transferable[]) => void} post to the main thread
 * @property {() => number} now milliseconds
 * @property {(fn: () => void, ms: number) => unknown} later
 */
/** @typedef {{ url: string, seat: number, key: string }} Target */

const FRAME_MS = 1000 / 30, RECONNECT_MS = 1000;

export class BattleSession {
  /** @param {import('@aue/sim').Content} content @param {SessionIO} io */
  constructor(content, io) {
    this.io = io;
    /** @type {Record<string, string | number>[]} */
    this.events = [];
    this.client = new LockstepClient({ content, send: (m) => this.socket?.send(JSON.stringify(m)), onFrame: (_w, ev) => { this.events.push(...ev); } });
    /** @type {SocketLike | null} */
    this.socket = null;
    /** @type {Target | null} */
    this.target = null;
    this.stopped = false;
    this.ticks = 0;
    this.t0 = 0;
    /** @type {Set<number>} unit ids whose content key the page has */
    this.known = new Set();
    /** @type {import('@aue/sim').World | null} the world the known ids belong to (a restore starts a new one) */
    this.knownWorld = null;
  }

  /** Connects and starts the frame clock. @param {Target} target */
  start(target) {
    this.target = target;
    this.t0 = this.io.now();
    this.open();
    this.io.later(() => this.tick(), FRAME_MS);
  }

  open() {
    const t = /** @type {Target} */ (this.target), s = this.io.connect(t.url);
    this.socket = s;
    s.onopen = () => {
      s.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, seat: t.seat, key: t.key, since: this.client.world?.frame ?? -1 }));
      this.io.post({ type: 'net', state: 'open' });
    };
    s.onmessage = (text) => this.receive(text);
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      this.io.post({ type: 'net', state: 'closed' });
      if (!this.stopped) this.io.later(() => this.open(), RECONNECT_MS);
    };
  }

  /** A server message: checked, then handed to the lockstep client; a bad one is reported, not fatal. @param {string} text */
  receive(text) {
    /** @type {unknown} */
    let msg;
    try { msg = JSON.parse(text); } catch { msg = null; }
    const why = serverMessageProblem(msg);
    if (why) { this.io.post({ type: 'net', state: 'bad-message', reason: why }); return; }
    try { this.client.receive(/** @type {import('@aue/schema').ServerMessage} */ (msg)); } catch (e) {
      this.io.post({ type: 'net', state: 'bad-message', reason: String(e instanceof Error ? e.message : e) });
    }
  }

  /** One frame time: play this tick's frames, post the render state, schedule the next tick without drift. */
  tick() {
    if (this.stopped) return;
    const played = this.client.pump(), w = this.client.world;
    if (played > 0 && w) {
      const view = toView(w);
      this.io.post({ type: 'frame', frame: w.frame, view, events: this.events, keys: this.newKeys(w) }, [view.buffer]);
      this.events = [];
    }
    this.ticks++;
    this.io.later(() => this.tick(), Math.max(0, this.t0 + (this.ticks + 1) * FRAME_MS - this.io.now()));
  }

  /**
   * The content keys of units the page has not been told about (all of them after a restore).
   * @param {import('@aue/sim').World} w @returns {Record<string, string>}
   */
  newKeys(w) {
    if (this.knownWorld !== w) { this.known.clear(); this.knownWorld = w; }
    /** @type {Record<string, string>} */
    const out = {};
    for (const u of w.units) if (!this.known.has(u.id)) { this.known.add(u.id); out[u.id] = u.key; }
    return out;
  }

  /** @param {import('@aue/schema').Command} cmd */
  command(cmd) { this.client.command(cmd); }

  /** The state for tests and the debug panel. */
  debug() {
    const w = this.client.world;
    return { type: 'debug', frame: w?.frame ?? -1, hash: w ? stateHash(w) : 0, sealed: this.client.sealed, stats: this.client.stats };
  }

  stop() {
    this.stopped = true;
    const s = this.socket;
    this.socket = null;
    s?.close();
  }
}
