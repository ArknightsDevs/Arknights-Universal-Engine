// The speed and pause controls and the cost request over lockstep (docs/spec/lockstep.md 同步-7, 同步-8; coop.md 合作-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { LockstepHost, framesAt, RESUME_MS, PAUSE_ASK_MS } from '../src/index.js';
import { play } from './harness.js';

/** Each client's last state equals the arbiter's at the same frame, and no desync was seen. @param {ReturnType<typeof import('./harness.js').play>} r */
function assertAgree(r) {
  assert.equal(r.desyncs.length, 0);
  for (const [seat, c] of r.clients.entries()) {
    assert.ok(c.world, `seat ${seat} has a world`);
    if (c.world) assert.equal(r.hash(c.world), r.host.hashes.get(c.world.frame), `seat ${seat} at frame ${c.world.frame}`);
  }
}

/** A host with both seats connected at wall time 0, recording what it sends. */
function host2() {
  /** @type {[number, any][]} */
  const out = [];
  const host = new LockstepHost({ hashEvery: 1, content: tinyContent(), seats: 2, seed: 1, send: (seat, msg) => out.push([seat, msg]) });
  host.hello(0, 0);
  host.hello(1, 0);
  return { host, out, controls: () => out.filter(([seat, m]) => seat === 0 && m.t === 'control').map(([, m]) => m) };
}

test('[同步-7] the battle runs at 2× only while both seats have their switch on; every peer plays the same frames', () => {
  const r = play({
    latency: [20, 20], ms: 6000,
    controls: [
      { at: 1000, seat: 0, act: (c) => c.speed(true) },
      { at: 2000, seat: 1, act: (c) => c.speed(true) },
      { at: 4000, seat: 0, act: (c) => c.speed(false) },
    ],
  });
  // from the hellos at 20 ms: 1× to 2020 ms, 2× to 4020, 1× to 6000
  assert.equal(r.host.sealed + 1, framesAt(2000 + 2 * 2000 + 1980));
  assert.deepEqual(r.clients.map((c) => c.control?.fast), [[0, 1], [0, 1]]);
  assertAgree(r);
});

test('[同步-8] a pause needs the mate’s yes; either seat resumes, and the clock runs again about 1 s later', () => {
  const r = play({
    latency: [20, 20], ms: 6000,
    controls: [
      { at: 1000, seat: 0, act: (c) => c.pause() },
      { at: 1500, seat: 1, act: (c) => c.pauseReply(true) },
      { at: 3000, seat: 0, act: (c) => c.resume() },
    ],
  });
  // from the hellos at 20 ms: runs to 1520, paused until the resume at 3020 + RESUME_MS, then runs to 6000
  assert.equal(r.host.sealed + 1, framesAt(1500 + 6000 - (3020 + RESUME_MS)));
  assert.deepEqual(r.clients.map((c) => c.control), [0, 1].map(() => ({ t: 'control', fast: [0, 0], held: 0, asker: -1, resuming: 0 })));
  assertAgree(r);
});

test('[同步-8] a pause request refused, ignored, or answered by the asker; pausing, resuming twice', () => {
  const { host, controls } = host2();
  host.pause(0, 100);
  host.pause(1, 110);
  assert.equal(host.asker, 0, 'one request at a time');
  host.pauseReply(0, 1, 120);
  assert.equal(host.held, false, 'the asker cannot agree with itself');
  host.pauseReply(1, 0, 130);
  assert.deepEqual([host.held, host.asker], [false, -1], 'refused');
  host.pauseReply(1, 1, 140);
  assert.equal(host.held, false, 'no open request');
  host.pause(1, 200);
  host.tick(200 + PAUSE_ASK_MS - 1);
  assert.equal(host.asker, 1);
  host.tick(200 + PAUSE_ASK_MS);
  assert.equal(host.asker, -1, 'unanswered: it lapses');
  host.resume(0, 16000);
  assert.equal(host.resumeAt, null, 'nothing to resume');
  host.pause(0, 16000);
  host.pauseReply(1, 1, 16000);
  host.pause(0, 16100);
  assert.equal(host.asker, -1, 'already paused');
  host.resume(1, 17000);
  host.resume(0, 17500);
  assert.equal(host.resumeAt, 17000 + RESUME_MS, 'the first resume counts');
  assert.deepEqual(controls().map((m) => [m.held, m.asker, m.resuming]).slice(-2), [[1, -1, 0], [1, -1, 1]], 'ignored requests send nothing');
  host.tick(17000 + RESUME_MS);
  assert.deepEqual(controls().at(-1), { t: 'control', fast: [0, 0], held: 0, asker: -1, resuming: 0 });
});

test('[同步-11] a match of two begins when both pages have loaded the battle; after that one seat keeps it running', () => {
  const host = new LockstepHost({ hashEvery: 1, content: tinyContent(), seats: 2, seed: 1, send: () => {} });
  host.hello(0, 0);
  host.ready(0, 500);
  host.hello(1, 1000);
  host.tick(3000);
  assert.deepEqual([host.begun, host.sealed], [false, -1], 'the mate connected but still loading: no frames');
  host.ready(1, 3000);
  host.tick(4000);
  assert.equal(host.sealed + 1, framesAt(1000), 'from the moment both are ready');
  host.bye(1, 4000);
  host.tick(5000);
  assert.equal(host.sealed + 1, framesAt(2000), 'the mate gone: it runs on (同步-6)');
  const alone = new LockstepHost({ hashEvery: 1, content: tinyContent(), seats: 1, seed: 1, send: () => {} });
  assert.equal(alone.begun, true, 'alone: at once');
});

test('[同步-8] alone, a pause takes effect at once', () => {
  const host = new LockstepHost({ hashEvery: 1, content: tinyContent(), seats: 1, seed: 1, send: () => {} });
  host.hello(0, 0);
  host.pause(0, 1000);
  host.tick(5000);
  assert.equal(host.sealed + 1, framesAt(1000));
});

test('[合作-5] a cost request to a mate who has left is accepted, whether made after they left or open when they left', () => {
  const after = play({ latency: [20, 20], ms: 4000, script: [{ at: 300, seat: 0, cmd: { type: 'ask' } }], drops: [{ seat: 1, from: 100, to: 2000 }] });
  assert.deepEqual(after.events[0].filter((e) => e.type === 'answer').map((e) => [e.owner, e.accept, e.amount]), [[0, 1, 2]]);
  assertAgree(after);
  const open = play({ latency: [20, 20], ms: 4000, script: [{ at: 100, seat: 0, cmd: { type: 'ask' } }], drops: [{ seat: 1, from: 1000, to: 2000 }] });
  const [answer] = open.events[0].filter((e) => e.type === 'answer');
  assert.deepEqual([answer.accept, answer.amount], [1, 2]);
  assert.ok(Number(answer.frame) >= framesAt(1000), `answered once the mate left: frame ${answer.frame}`);
  assertAgree(open);
  const both = play({ latency: [20, 20], ms: 2000, script: [{ at: 100, seat: 0, cmd: { type: 'ask' } }, { at: 400, seat: 1, cmd: { type: 'answer', accept: 0 } }] });
  assert.deepEqual(both.events[1].filter((e) => e.type === 'answer').map((e) => [e.accept, e.amount]), [[0, 0]], 'a mate who is there answers for themselves');
});
