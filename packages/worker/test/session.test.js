// The worker's BattleSession against an in-process LockstepHost, with a fake socket and a manual clock: render states
// are posted after frame times, commands reach the field, a closed socket reconnects, bad server messages are reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readView, clientMessageProblem } from '@aue/schema';
import { LockstepHost } from '@aue/net';
import { tinyContent } from '@aue/testkit';
import { BattleSession } from '../src/index.js';

/** A manual clock and timer queue. */
function clock() {
  let now = 0;
  /** @type {{ at: number, fn: () => void }[]} */
  const timers = [];
  return {
    now: () => now,
    later: (/** @type {() => void} */ fn, /** @type {number} */ ms) => { timers.push({ at: now + ms, fn }); },
    /** @param {number} ms @param {(t: number) => void} each */
    run(ms, each) {
      for (const end = now + ms; now < end; now++) {
        each(now);
        timers.sort((a, b) => a.at - b.at);
        while (timers.length && timers[0].at <= now) /** @type {any} */ (timers.shift()).fn();
      }
    },
  };
}

/** A session wired to a host through fake sockets (no latency). */
function rig() {
  const c = tinyContent(), t = clock(), posts = /** @type {any[]} */ ([]);
  /** @type {any} */
  let sock = null;
  const host = new LockstepHost({ content: c, seats: 1, seed: 5, send: (_seat, msg) => sock?.onmessage?.(JSON.stringify(msg)) });
  const session = new BattleSession(c, {
    now: t.now, later: t.later, post: (m) => posts.push(m),
    connect: () => {
      sock = { onopen: null, onmessage: null, onclose: null, close() { const s = sock; sock = null; host.bye(0, t.now()); s?.onclose?.(); },
        send(/** @type {string} */ text) {
          const m = JSON.parse(text);
          assert.equal(clientMessageProblem(m), null);
          if (m.t === 'hello') host.hello(0, t.now()); else if (m.t === 'cmd') host.command(0, m.at, m.cmd); else host.hash(0, m.frame, m.hash);
        } };
      const s = sock;
      t.later(() => s.onopen?.(), 1);
      return s;
    },
  });
  return { host, session, posts, t, socket: () => sock };
}

test('the session plays the server frames and posts a render state per frame time', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(1000, (now) => r.host.tick(now));
  const frames = r.posts.filter((p) => p.type === 'frame');
  assert.ok(frames.length >= 25, `${frames.length} frames posted`);
  const v = readView(frames.at(-1).view);
  assert.equal(v.frame, frames.at(-1).frame);
  assert.ok(Math.abs(v.frame - r.host.world.frame) <= 3, `client ${v.frame} vs server ${r.host.world.frame}`);
});

test('a command reaches the field; the debug state matches the server at the same frame', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(300, (now) => r.host.tick(now));
  r.session.command({ type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 });
  r.t.run(1000, (now) => r.host.tick(now));
  const d = r.session.debug();
  assert.equal(d.hash, r.host.hashes.get(d.frame));
  assert.ok(r.posts.some((p) => p.type === 'frame' && p.events.some((/** @type {any} */ e) => e.type === 'deploy')));
  const keys = Object.assign({}, ...r.posts.filter((p) => p.type === 'frame').map((p) => p.keys));
  assert.ok(Object.values(keys).includes('guard') && Object.values(keys).includes('slime'), JSON.stringify(keys));
});

test('a closed socket reconnects and the session resumes from the server snapshot', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(1000, (now) => r.host.tick(now));
  assert.equal(r.session.client.world?.units.length, 1, 'an enemy is on the field before the drop');
  r.socket().close();
  r.t.run(2500, (now) => r.host.tick(now));
  assert.deepEqual(r.posts.filter((p) => p.type === 'net').map((p) => p.state), ['open', 'closed', 'open']);
  const d = r.session.debug();
  assert.equal(d.hash, r.host.hashes.get(d.frame));
  const afterReconnect = r.posts.findLastIndex((p) => p.type === 'net' && p.state === 'open');
  const firstFrame = r.posts.slice(afterReconnect).find((p) => p.type === 'frame');
  assert.ok(firstFrame && Object.keys(firstFrame.keys).length > 0, 'after a restore every unit is announced again');
  r.session.stop();
  assert.equal(r.socket(), null);
});

test('bad server messages are reported and do not break the session', () => {
  const r = rig();
  r.session.start({ url: 'ws://x', seat: 0, key: 'k' });
  r.t.run(100, (now) => r.host.tick(now));
  r.session.receive('{not json');
  r.session.receive(JSON.stringify({ t: 'frames', from: 5, to: 1, cmds: [] }));
  r.session.receive(JSON.stringify({ t: 'resync', snapshot: { v: 9 } }));
  assert.deepEqual(r.posts.filter((p) => p.state === 'bad-message').map((p) => p.reason),
    ['message is not an object', 'frames range malformed', 'snapshot: missing field frame']);
  r.t.run(500, (now) => r.host.tick(now));
  assert.equal(r.session.debug().hash, r.host.hashes.get(r.session.debug().frame));
});
