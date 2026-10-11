// Lockstep over a simulated network (docs/spec/lockstep.md): every peer plays the same frames as the server's arbiter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { framesThisTick, INPUT_DELAY, MAX_PLAY_SPEED, MAX_AHEAD } from '../src/index.js';
import { LockstepHost } from '../src/index.js';
import { tinyContent } from '@aue/testkit';
import { play } from './harness.js';

/** @type {import('@aue/schema').Command} */
const GUARD = { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 };
/** @type {import('@aue/schema').Command} */
const SNIPER = { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 1 };

/**
 * Every hash a client reported equals the arbiter's for that frame, and each client's last state equals the arbiter's
 * at the same frame (clients lag the server by their latency, so they stop at different frames).
 * @param {ReturnType<typeof play>} r @param {number} [minHashes]
 */
function assertAgree(r, minHashes = 5) {
  for (const [seat, sent] of r.sent.entries()) {
    for (const [frame, h] of sent) {
      const ours = r.host.hashes.get(frame);
      if (ours !== undefined) assert.equal(h, ours, `seat ${seat} frame ${frame}`);
    }
    assert.ok(sent.size >= minHashes, `seat ${seat} reported ${sent.size} hashes`);
  }
  for (const [seat, c] of r.clients.entries()) {
    assert.ok(c.world, `seat ${seat} has a world`);
    if (c.world) assert.equal(r.hash(c.world), r.host.hashes.get(c.world.frame), `seat ${seat} at frame ${c.world.frame}`);
  }
}

test('[同步-3] the input delay is 0.3 s = 9 frames; commands act at their stamped frame on every peer', () => {
  assert.equal(INPUT_DELAY, 9);
  const r = play({ latency: [40, 90], ms: 9000, script: [{ at: 500, seat: 0, cmd: GUARD }, { at: 700, seat: 1, cmd: SNIPER }] });
  assertAgree(r);
  assert.deepEqual(r.clients.map((c) => c.stats.restamps), [0, 0]);
  assert.equal(r.desyncs.length, 0);
  assert.equal(r.host.world.units.filter((u) => u.kind === 0).length, 2);
});

test('[同步-3] a command arriving after its frame was sealed moves to the next open frame, and the sender is told', () => {
  const r = play({ latency: [30, 320], ms: 6000, script: [{ at: 2000, seat: 1, cmd: GUARD }] });
  assertAgree(r);
  assert.equal(r.clients[1].stats.restamps, 1);
  assert.equal(r.host.world.units.filter((u) => u.kind === 0).length, 1);
});

test('[同步-3] commands stamped too far ahead are refused with an error', () => {
  /** @type {any[]} */
  const out = [];
  const host = new LockstepHost({ content: tinyContent(), seats: 2, seed: 1, send: (seat, msg) => out.push([seat, msg]) });
  host.hello(0, 0);
  const last = host.sealed + MAX_AHEAD;
  host.command(0, last, GUARD);
  host.command(0, last + 1, GUARD);
  assert.deepEqual(out.slice(1).map(([, m]) => m.t), ['error']);
  assert.equal(host.pending.get(last)?.length, 1);
});

test('[同步-4] pacing: one frame per frame time within the jitter buffer, at most 5 when behind', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 50].map(framesThisTick), [0, 1, 1, 2, 3, 4, 5, 5]);
  assert.equal(MAX_PLAY_SPEED, 5);
  fc.assert(fc.property(fc.integer({ min: -10, max: 10_000 }), fc.integer({ min: 0, max: 50 }), (b, d) => {
    const n = framesThisTick(b);
    return n >= 0 && n <= MAX_PLAY_SPEED && framesThisTick(b + d) >= n;
  }), { seed: 20261011, numRuns: 2000 });
});

test('[同步-5] a dropped seat comes back through the server snapshot and plays on in step; its operators kept fighting', () => {
  const r = play({ latency: [50, 60], ms: 10000, script: [{ at: 300, seat: 1, cmd: GUARD }], drops: [{ seat: 1, from: 2000, to: 5000 }] });
  assertAgree(r);
  assert.equal(r.host.world.units.filter((u) => u.kind === 0 && u.owner === 1).length, 1);
  assert.equal(r.desyncs.length, 0);
});

test('[同步-5] a peer whose state drifted is detected by its hash and restored from the arbiter', () => {
  const r = play({ latency: [50, 50], ms: 8000, script: [{ at: 300, seat: 0, cmd: GUARD }], tamper: [{ at: 3000, seat: 0, change: (w) => { w.players[0].cost += 3; } }] });
  assert.equal(r.desyncs.length, 1);
  assert.equal(r.desyncs[0].seat, 0);
  assert.equal(r.clients[0].stats.resyncs, 1);
  const last = Math.max(...r.sent[0].keys());
  assert.equal(r.sent[0].get(last), r.host.hashes.get(last));
});

test('[同步-6] with both seats gone the battle pauses, and resumes where it stopped', () => {
  const r = play({ latency: [20, 20], ms: 9000, drops: [{ seat: 0, from: 2000, to: 6000 }, { seat: 1, from: 2000, to: 6000 }] });
  const frames = r.host.sealed + 1;
  assert.ok(frames > 140 && frames < 160, `about 5 s of frames sealed, not 9 s: ${frames}`);
  assertAgree(r, 3);
});

test('[同步-3] [同步-5] the client: nothing is sent before the welcome; errors are counted; frames older than its state are skipped', async () => {
  const { LockstepClient } = await import('../src/index.js');
  const { createWorld, takeSnapshot } = await import('@aue/sim');
  /** @type {any[]} */
  const out = [];
  const content = tinyContent(), client = new LockstepClient({ content, send: (m) => out.push(m) });
  client.command(GUARD);
  assert.equal(client.pump(), 0);
  assert.deepEqual(out, []);
  const w = createWorld(content, { seed: 9, players: 2 });
  w.frame = 10;
  client.receive({ t: 'welcome', v: 1, seat: 0, seed: 9, frame: 9, snapshot: takeSnapshot(w) });
  client.receive({ t: 'frames', from: 8, to: 12, cmds: [[8, 1, GUARD], [11, 0, SNIPER]] });
  assert.deepEqual([...client.queue.keys()], [11]);
  client.receive({ t: 'error', code: 'too-far-ahead', message: 'x' });
  assert.equal(client.stats.errors, 1);
  client.command(GUARD);
  assert.deepEqual(out, [{ t: 'cmd', at: 10 + INPUT_DELAY, cmd: GUARD }]);
  assert.equal(client.backlog(), 3);
});
