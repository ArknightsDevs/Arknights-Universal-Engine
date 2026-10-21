// Absent seats (docs/spec/lockstep.md 同步-14): the battle begins once the other seats are ready, a pause of the seat
// alone takes hold at once, and the absent seat's answer to a cost request is yes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { LockstepHost } from '../src/index.js';

/** A host of two seats, seat 1 absent, seat 0 connected at wall time 0. */
function hostWithAbsent() {
  /** @type {[number, any][]} */
  const out = [];
  const host = new LockstepHost({ hashEvery: 1, content: tinyContent(), seats: 2, seed: 1, send: (seat, msg) => out.push([seat, msg]), absent: [1] });
  host.hello(0, 0);
  return { host, out };
}

test('[同步-14] with seat 1 absent the battle begins once seat 0 is ready', () => {
  const { host } = hostWithAbsent();
  assert.equal(host.begun, false);
  host.ready(0, 10);
  assert.equal(host.begun, true);
  host.tick(1010);
  assert.ok(host.sealed > 0, 'frames are sealed');
  const both = new LockstepHost({ content: tinyContent(), seats: 2, seed: 1, send: () => {} });
  both.hello(0, 0);
  both.ready(0, 10);
  assert.equal(both.begun, false, 'without an absent seat it still waits for both');
});

test('[同步-14] a pause and a resume of the only seat played take hold at once; the absent seat answers a cost request yes', () => {
  const { host } = hostWithAbsent();
  host.ready(0, 0);
  host.tick(1000);
  const before = host.sealed;
  host.pause(0, 1000);
  assert.deepEqual([host.held, host.asker], [true, -1]);
  host.tick(3000);
  assert.equal(host.sealed, before, 'held: no frame sealed');
  host.resume(0, 3000);
  assert.deepEqual([host.held, host.resumeAt], [false, null], 'no wait before it runs again');
  host.tick(4000);
  assert.ok(host.sealed - before >= 29 && host.sealed - before <= 31, 'a second of battle after the resume');
  host.command(0, host.sealed + 1, { type: 'ask' });
  const f = host.sealed + 1, cmds = host.frameCommands(f);
  assert.deepEqual(cmds.filter(([s]) => s === 1), [[1, { type: 'answer', accept: 1 }]]);
});
