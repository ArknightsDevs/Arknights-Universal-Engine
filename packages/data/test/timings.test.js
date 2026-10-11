// Attack timings from Spine skeletons (docs/spec/combat.md 攻击-2): the attack clip's choice, its length and first
// OnAttack from a skeleton's bytes, the check against a source's frame data, and the CLI's walk over a directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attackClip, attackTiming, frameProblem } from '../src/index.js';
import { timingsOf } from '../src/cli/timings.js';

/**
 * A minimal 3.8 skeleton: no bones, slots or skins; one event, OnAttack; each animation a draw order key at its length
 * and OnAttack keys at the given times.
 * @param {[string, number, number[]][]} anims name, length, OnAttack times
 */
function skel(anims) {
  /** @type {number[]} */
  const out = [];
  const byte = (/** @type {number} */ b) => { out.push(b & 0xff); };
  const varint = (/** @type {number} */ v) => { do { byte((v & 0x7f) | (v > 0x7f ? 0x80 : 0)); v >>>= 7; } while (v); };
  const float = (/** @type {number} */ v) => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v); for (let i = 0; i < 4; i++) byte(d.getUint8(i)); };
  const string = (/** @type {string | null} */ s) => { if (s === null) { varint(0); return; } const b = new TextEncoder().encode(s); varint(b.length + 1); b.forEach(byte); };
  string('h'); string('3.8.99'); [0, 0, 1, 1].forEach(float); byte(0);
  varint(1); string('OnAttack');
  for (let i = 0; i < 7; i++) varint(0);
  varint(1); varint(1); varint(0); float(0); string(null); string(null);
  varint(anims.length);
  for (const [name, length, hits] of anims) {
    string(name);
    for (let i = 0; i < 6; i++) varint(0);
    varint(1); float(length); varint(0);
    varint(hits.length);
    for (const t of hits) { float(t); varint(0); varint(0); float(0); byte(0); }
  }
  return Uint8Array.from(out);
}

test('[攻击-2] the attack clip: Attack, else Attack_Loop, else the first named attack…, else Combat', () => {
  assert.equal(attackClip(['Idle', 'Attack_A', 'Attack']), 'Attack');
  assert.equal(attackClip(['Attack_Begin', 'Attack_Loop', 'Attack_End']), 'Attack_Loop');
  assert.equal(attackClip(['Idle', 'B_Attack', 'attack_red', 'Attack_grey']), 'attack_red');
  assert.equal(attackClip(['Idle', 'Combat']), 'Combat');
  assert.equal(attackClip(['Idle', 'Die']), null);
});

test('[攻击-2] a timing from the bytes: the clip, its length and its first OnAttack; none without an OnAttack in the clip', () => {
  assert.deepEqual(attackTiming(skel([['Idle', 2, []], ['Attack', 1.5, [0.7, 0.3]]])), { clip: 'Attack', duration: 1.5, hit: Math.fround(0.3) });
  assert.equal(attackTiming(skel([['Attack', 1, []], ['Skill', 1, [0.5]]])), null);
  assert.equal(attackTiming(skel([['Idle', 1, [0.5]]])), null);
});

test('[攻击-2] the check against a source\'s frame data: the same OnAttack within 10⁻⁵ s', () => {
  const frames = (/** @type {number} */ t) => ({ BattleFront: { base: { animations: { Attack: { events: { OnAttack: { time: t, frame: 8 } } } } } } });
  const t = { clip: 'Attack', hit: Math.fround(0.26666668) };
  assert.equal(frameProblem(t, frames(0.26667)), null);
  assert.match(String(frameProblem(t, frames(0.3))), /0\.3 in the frame data/);
  assert.match(String(frameProblem(t, {})), /no OnAttack for Attack/);
});

test('[攻击-2] the CLI\'s walk: every unit with a skeleton and an attack clip, the rest listed; frame data checked for operators', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aue-timings-')), frames = mkdtempSync(join(tmpdir(), 'aue-frames-'));
  try {
    writeFileSync(join(dir, 'op_a.skel'), skel([['Attack', 1, [0.5]]]));
    writeFileSync(join(dir, 'foe_b.skel'), skel([['Idle', 1, []]]));
    writeFileSync(join(frames, 'op_a.json'), JSON.stringify({ BattleFront: { base: { animations: { Attack: { events: { OnAttack: { time: 0.5 } } } } } } }));
    const got = timingsOf(dir, ['op_a', 'foe_b', 'foe_missing'], frames, new Set(['op_a']));
    assert.deepEqual(got, { units: { op_a: { clip: 'Attack', duration: 1, hit: 0.5 } }, none: ['foe_b', 'foe_missing'] });
    writeFileSync(join(frames, 'op_a.json'), JSON.stringify({ BattleFront: { base: { animations: { Attack: { events: { OnAttack: { time: 0.4 } } } } } } }));
    assert.throws(() => timingsOf(dir, ['op_a'], frames, new Set(['op_a'])), /op_a: Attack: OnAttack 0\.5 here/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(frames, { recursive: true, force: true });
  }
});
