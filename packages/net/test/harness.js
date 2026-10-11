// A deterministic simulated network for lockstep tests: one host, two clients, per-seat one-way latency, messages
// passed through JSON like a socket, client messages validated as the server will validate them, and drops.
import { clientMessageProblem } from '@aue/schema';
import { stateHash } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { LockstepHost, LockstepClient, framesAt } from '../src/index.js';

/**
 * @typedef {object} Scenario
 * @property {number[]} latency one-way milliseconds per seat
 * @property {number} ms how long to run
 * @property {{ at: number, seat: number, cmd: import('@aue/schema').Command }[]} [script] commands by wall time
 * @property {{ seat: number, from: number, to: number }[]} [drops] disconnected intervals
 * @property {{ at: number, seat: number, change: (w: import('@aue/sim').World) => void }[]} [tamper]
 */

/** @param {Scenario} s */
export function play(s) {
  const content = tinyContent(), queue = /** @type {{ at: number, seq: number, run: () => void }[]} */ ([]);
  let now = 0, seq = 0;
  const later = (/** @type {number} */ delay, /** @type {() => void} */ run) => queue.push({ at: now + delay, seq: seq++, run });
  const down = (/** @type {number} */ seat) => (s.drops ?? []).some((d) => d.seat === seat && now >= d.from && now < d.to);
  /** @type {{ seat: number, frame: number, ours: number, theirs: number }[]} */
  const desyncs = [], sent = /** @type {Map<number, number>[]} */ ([new Map(), new Map()]);
  const host = new LockstepHost({
    content, seats: 2, seed: 9, onDesync: (d) => desyncs.push(d),
    send: (seat, msg) => later(s.latency[seat], () => { if (!down(seat)) clients[seat].receive(JSON.parse(JSON.stringify(msg))); }),
  });
  /** @param {number} seat @param {import('@aue/schema').ClientMessage} msg */
  const toHost = (seat, msg) => {
    if (clientMessageProblem(msg)) throw new Error(`client sent a malformed message: ${clientMessageProblem(msg)}`);
    if (msg.t === 'hash') sent[seat].set(msg.frame, msg.hash);
    later(s.latency[seat], () => {
      if (down(seat)) return;
      if (msg.t === 'hello') host.hello(seat, now);
      else if (msg.t === 'cmd') host.command(seat, msg.at, msg.cmd);
      else host.hash(seat, msg.frame, msg.hash);
    });
  };
  const clients = [0, 1].map((seat) => new LockstepClient({ content, send: (m) => toHost(seat, JSON.parse(JSON.stringify(m))) }));
  runScenario(s, { host, clients, queue, toHost, down, setNow: (/** @type {number} */ t) => { now = t; } });
  return { host, clients, desyncs, sent, hash: stateHash };
}

/** Runs the deliveries due by `t`, in time then send order. @param {any[]} queue @param {number} t */
function deliver(queue, t) {
  queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
  while (queue.length && queue[0].at <= t) queue.shift().run();
}

/** Drops begin (the host sees the seat leave) and end (the client says hello again). @param {Scenario} s @param {any} env @param {number} t */
function drops(s, env, t) {
  for (const d of s.drops ?? []) {
    if (d.from === t) env.host.bye(d.seat, t);
    if (d.to === t) env.toHost(d.seat, { t: 'hello', v: 1, seat: d.seat, key: `seat${d.seat}`, since: env.clients[d.seat].world?.frame ?? -1 });
  }
}

/** Scripted commands and tampering due at `t`. @param {Scenario} s @param {any} env @param {number} t */
function scripted(s, env, t) {
  for (const c of s.script ?? []) if (c.at === t && !env.down(c.seat)) env.clients[c.seat].command(c.cmd);
  for (const x of s.tamper ?? []) if (x.at === t) x.change(env.clients[x.seat].world);
}

/**
 * The wall clock, one millisecond at a time: deliveries, drops, scripted commands, the host's tick, the clients' frames.
 * @param {Scenario} s @param {any} env
 */
function runScenario(s, env) {
  for (const seat of [0, 1]) env.toHost(seat, { t: 'hello', v: 1, seat, key: `seat${seat}`, since: -1 });
  for (let t = 0; t <= s.ms; t++) {
    env.setNow(t);
    deliver(env.queue, t);
    drops(s, env, t);
    scripted(s, env, t);
    env.host.tick(t);
    if (framesAt(t) !== framesAt(t - 1)) for (const c of env.clients) c.pump();
  }
}
