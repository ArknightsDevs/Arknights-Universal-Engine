// Contract tests of the interface formats (ADR 0053): the render state matches its hand-written fixture number by
// number, events and messages are accepted exactly when well formed, and no input makes a validator throw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import {
  VIEW_VERSION, viewLength, writeView, readView, eventProblems, clientMessageProblem, commandProblem, snapshotProblem, PROTOCOL_VERSION,
} from '../src/index.js';

const SEED = 20261011;
const fixture = JSON.parse(readFileSync(new URL('fixtures/view-v1.json', import.meta.url), 'utf8'));

test('render state v1: the layout is the fixture, number by number, and reads back', () => {
  assert.equal(VIEW_VERSION, 1);
  const a = writeView(fixture.view);
  assert.deepEqual(Array.from(a), fixture.numbers);
  assert.deepEqual(readView(a), fixture.view);
  assert.equal(viewLength(2, 2), fixture.numbers.length);
});

test('render state: reuses a long enough array, refuses a wrong version or a short array', () => {
  const big = new Float64Array(64), a = writeView(fixture.view, big);
  assert.equal(a, big);
  assert.notEqual(writeView(fixture.view, new Float64Array(3)), null);
  assert.throws(() => readView(Float64Array.from([2, 0, 0, 0])), RangeError);
  assert.throws(() => readView(Float64Array.from([1, 0, 3, 0])), RangeError);
});

test('events: well formed ones pass; unknown types, wrong types and extra fields are reported', () => {
  assert.deepEqual(eventProblems({ type: 'hit', id: 1, target: 2, damage: 30 }), []);
  assert.deepEqual(eventProblems({ type: 'deploy', id: 1, key: 'char_500_noirc', owner: 0 }), []);
  assert.deepEqual(eventProblems(null), ['not an object']);
  assert.deepEqual(eventProblems({ type: 'explode' }), ['unknown event type explode']);
  assert.deepEqual(eventProblems({ type: 'death', id: '1', extra: 1 }), ['death.id is not a number', 'death has an unknown field extra']);
});

const HELLO = { t: 'hello', v: PROTOCOL_VERSION, seat: 1, key: 'k_abc-1', since: -1 };
const DEPLOY = { type: 'deploy', op: 'char_502_nblade', row: 3, col: 4, dir: 0 };

test('client messages: exactly the well-formed ones are accepted', () => {
  for (const m of [HELLO, { t: 'cmd', at: 99, cmd: DEPLOY }, { t: 'cmd', at: 0, cmd: { type: 'retreat', unit: 7 } }, { t: 'hash', frame: 30, hash: 0xffffffff }]) {
    assert.equal(clientMessageProblem(m), null, JSON.stringify(m));
  }
  const bad = [
    [[], 'message is not an object'], [{ t: 'nope' }, 'unknown message type nope'], [{ t: 'constructor' }, 'unknown message type constructor'],
    [{ ...HELLO, v: 2 }, 'protocol version 2, expected 1'], [{ ...HELLO, seat: 8 }, 'hello.seat out of range'], [{ ...HELLO, key: 'a b' }, 'hello.key is not an id'],
    [{ ...HELLO, since: 1.5 }, 'hello.since out of range'], [{ ...HELLO, admin: true }, 'unknown field admin'], [{ t: 'hash', frame: 1 }, 'missing field hash'],
    [{ t: 'hash', frame: 1, hash: -1 }, 'hash.hash is not a uint32'], [{ t: 'hash', frame: -1, hash: 1 }, 'hash.frame out of range'],
    [{ t: 'cmd', at: 2e6, cmd: DEPLOY }, 'cmd.at out of range'], [{ t: 'cmd', at: 1, cmd: { ...DEPLOY, row: 64 } }, 'deploy tile out of range'],
    [{ t: 'cmd', at: 1, cmd: { ...DEPLOY, dir: 4 } }, 'deploy.dir is not 0–3'], [{ t: 'cmd', at: 1, cmd: { ...DEPLOY, op: '../x' } }, 'deploy.op is not an id'],
    [{ t: 'cmd', at: 1, cmd: { type: 'retreat', unit: 0 } }, 'retreat.unit is not a unit id'], [{ t: 'cmd', at: 1, cmd: 'deploy' }, 'command is not an object'],
    [{ t: 'cmd', at: 1, cmd: { type: 'toString' } }, 'unknown command type toString'],
  ];
  for (const [m, why] of bad) assert.equal(clientMessageProblem(m), why, JSON.stringify(m));
});

test('client messages: no JSON value makes the validator throw; it returns a string or null', () => {
  fc.assert(fc.property(fc.jsonValue(), (v) => {
    const r = clientMessageProblem(v), c = commandProblem(v);
    return (r === null || typeof r === 'string') && (c === null || typeof c === 'string');
  }), { seed: SEED, numRuns: 3000 });
});

test('client messages: generated well-formed deploys are accepted', () => {
  const deploy = fc.record({ type: fc.constant('deploy'), op: fc.stringMatching(/^[a-z0-9_]{1,64}$/), row: fc.integer({ min: 0, max: 63 }), col: fc.integer({ min: 0, max: 63 }), dir: fc.integer({ min: 0, max: 3 }) });
  fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000 }), deploy, (at, cmd) => clientMessageProblem({ t: 'cmd', at, cmd }) === null), { seed: SEED, numRuns: 1000 });
});

test('snapshot envelope v1', () => {
  assert.equal(snapshotProblem({ v: 1, frame: 0, data: {} }), null);
  assert.equal(snapshotProblem([]), 'snapshot is not an object');
  assert.equal(snapshotProblem({ v: 2, frame: 0, data: {} }), 'snapshot version 2, expected 1');
  assert.equal(snapshotProblem({ v: 1, frame: -1, data: {} }), 'snapshot.frame out of range');
  assert.equal(snapshotProblem({ v: 1, frame: 0, data: [] }), 'snapshot.data is not an object');
  assert.equal(snapshotProblem({ v: 1, frame: 0 }), 'missing field data');
});
