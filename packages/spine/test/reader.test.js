// The Spine 3.8 binary reader (docs/spec/spine.md) on skeletons built byte by byte (test/writer.js): every primitive,
// every section, every attachment type and timeline kind, the durations and event times; malformed files are refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BinaryReader, readSkeleton, animationTimes, isReadable, CURVE } from '../src/index.js';
import { Writer, skeleton } from './writer.js';

/** @param {Writer} w */
const reader = (w) => new BinaryReader(w.bytes());

test('[骨骼-1] primitives: big-endian numbers, varints (zigzag too), strings with a length prefix, booleans', () => {
  const w = new Writer().byte(-3).short(-2).int32(-5).float(1.5).bool(true).bool(false);
  for (const v of [0, 1, 127, 128, 16383, 16384, 2 ** 28, 2 ** 31 - 1]) w.varint(v);
  for (const v of [0, -1, 1, -64, 63, -(2 ** 31), 2 ** 31 - 1]) w.varint(v, false);
  w.string(null).string('').string('Attack').string('攻击_ü').floats([0.1]);
  const r = reader(w);
  assert.deepEqual([r.byte(), r.short(), r.int32(), r.float(), r.bool(), r.bool()], [-3, -2, -5, 1.5, true, false]);
  assert.deepEqual(Array.from({ length: 8 }, () => r.varint(true)), [0, 1, 127, 128, 16383, 16384, 2 ** 28, 2 ** 31 - 1]);
  assert.deepEqual(Array.from({ length: 7 }, () => r.varint(false)), [0, -1, 1, -64, 63, -(2 ** 31), 2 ** 31 - 1]);
  assert.deepEqual([r.string(), r.string(), r.string(), r.string()], [null, '', 'Attack', '攻击_ü']);
  assert.equal(r.float(), Math.fround(0.1), 'floats are exactly the 32-bit values');
  assert.throws(() => r.byte(), /past the end/);
  const refs = new BinaryReader(Uint8Array.from([0, 2, 3]));
  refs.strings = ['a', 'b'];
  assert.deepEqual([refs.stringRef(), refs.stringRef()], [null, 'b']);
  assert.throws(() => refs.stringRef(), /past the table/);
});

test('[骨骼-1] only 3.8 is readable (not 3.8.75)', () => {
  assert.deepEqual(['3.8.99', '3.8.75', '4.0.64', '3.7.94', null].map(isReadable), [true, false, false, false, false]);
  assert.throws(() => readSkeleton(skeleton(() => {}, { version: '4.1.20' })), /not 3\.8/);
});

/** Bones (a root and a child), two slots, one constraint of each kind. @param {Writer} w @param {boolean} ne */
function setup(w, ne) {
  w.varint(2);
  for (const [name, parent] of [['root', -1], ['arm', 0]]) {
    w.string(/** @type {string} */ (name));
    if (parent !== -1) w.varint(/** @type {number} */ (parent));
    w.floats([10, 1, 2, 1, 1, 0, 0, 5]).varint(0).bool(false);
    if (ne) w.int32(0x9bc9e2ff);
  }
  w.varint(2);
  w.string('body').varint(0).int32(-1).int32(-1).ref('body').varint(0);
  w.string('fx').varint(1).int32(0x80808080).int32(0x102030).ref(null).varint(2);
  w.varint(1).string('ik').varint(0).bool(false).varint(1).varint(1).varint(0).float(1).float(0).byte(-1).bool(true).bool(false).bool(false);
  w.varint(1).string('tc').varint(1).bool(true).varint(1).varint(1).varint(0).bool(false).bool(true).floats([1, 2, 3, 4, 5, 6, 0.5, 0.5, 0.5, 0.5]);
  w.varint(1).string('pc').varint(2).bool(false).varint(1).varint(1).varint(1).varint(0).varint(1).varint(2).floats([0, 1, 2, 1, 1]);
}

/** Weighted vertices of n vertices on bone 1. @param {Writer} w @param {number} n */
const weighted = (w, n) => { w.bool(true); for (let i = 0; i < n; i++) w.varint(1).varint(1).floats([i, -i, 1]); return w; };

/** The default skin with every attachment type, and a named skin. @param {Writer} w @param {boolean} ne */
function skins(w, ne) {
  const opt = () => { if (ne) w.int32(-1); };
  w.varint(2);
  w.varint(0).varint(4);
  w.ref('body').ref(null).byte(0).ref('body').floats([0, 1, 2, 1, 1, 20, 30]).int32(-1);
  w.ref('box').ref(null).byte(1).varint(2).bool(false).floats([0, 0, 1, 1]); opt();
  w.ref('mesh').ref(null).byte(2).ref('mesh').int32(-1).varint(3).floats([0, 0, 1, 0, 0, 1]).varint(3).short(0).short(1).short(2);
  weighted(w, 3).varint(3);
  if (ne) w.varint(2).short(0).short(2).float(10).float(10);
  w.ref('linked').ref('real').byte(3).ref('mesh').int32(-1).ref(null).ref('mesh').bool(true);
  if (ne) w.float(10).float(10);
  w.varint(1).varint(3);
  w.ref('path').ref(null).byte(4).bool(false).bool(true).varint(3).bool(false).floats([0, 0, 1, 1, 2, 2]).float(7); opt();
  w.ref('point').ref(null).byte(5).floats([45, 1, 2]); opt();
  w.ref('clip').ref(null).byte(6).varint(1).varint(2).bool(false).floats([0, 0, 1, 1]); opt();
  w.varint(1).ref('alt').varint(1).varint(1).varint(1).varint(0).varint(0).varint(1).varint(0).varint(1);
  w.varint(0).varint(1).ref('body').ref(null).byte(0).ref('alt').floats([0, 0, 0, 1, 1, 1, 1]).int32(-1);
}

/** Two events: OnAttack, and one with audio. @param {Writer} w */
function events(w) {
  w.varint(2).ref('OnAttack').varint(-2, false).float(0.5).string('hit').string(null);
  w.ref('Sound').varint(0, false).float(0).string(null).string('a.ogg').float(0.8).float(-0.5);
}

/** One frame per curve type after the first. @param {Writer} w @param {number} n @param {(i: number) => void} values */
function frames(w, n, values) {
  for (let i = 0; i < n; i++) {
    w.float(i / 10);
    values(i);
    if (i < n - 1) { const t = i % 3; w.byte(t); if (t === CURVE.BEZIER) w.floats([0.25, 0, 0.75, 1]); }
  }
}

/** An animation with every timeline kind; its last key is at `last`. @param {Writer} w @param {number} last */
function attack(w, last) {
  w.string('Attack');
  w.varint(1).varint(1).varint(3);
  w.byte(0).varint(2).float(0).ref('body').float(0.2).ref(null);
  w.byte(1).varint(2); frames(w, 2, () => w.int32(-1));
  w.byte(2).varint(2); frames(w, 2, () => w.int32(-1).int32(0));
  w.varint(1).varint(1).varint(4);
  for (const code of [0, 1, 2, 3]) { const n = code === 0 ? 4 : 3; w.byte(code).varint(n); frames(w, n, () => (code === 0 ? w.float(90) : w.float(1).float(2))); }
  w.varint(1).varint(0).varint(2); frames(w, 2, () => w.float(1).float(0).byte(1).bool(false).bool(true));
  w.varint(1).varint(0).varint(2); frames(w, 2, () => w.floats([1, 1, 1, 1]));
  w.varint(1).varint(0).varint(3);
  w.byte(0).varint(2); frames(w, 2, () => w.float(3));
  w.byte(1).varint(2); frames(w, 2, () => w.float(4));
  w.byte(2).varint(2); frames(w, 2, () => w.float(1).float(1));
  w.varint(1).varint(0).varint(1).varint(1).varint(1).ref('mesh').varint(2);
  frames(w, 2, (i) => { if (i === 0) w.varint(0); else w.varint(2).varint(1).floats([0.5, -0.5]); });
  w.varint(1).float(0.25).varint(1).varint(1).varint(0, true);
  w.varint(3).float(0.6).varint(0).varint(1, false).float(2).bool(true).string('x');
  w.float(0.3).varint(0).varint(0, false).float(0).bool(false);
  w.float(last).varint(1).varint(0, false).float(0).bool(false).float(1).float(0);
}

/** A whole skeleton. @param {boolean} ne */
const full = (ne) => skeleton((w) => {
  setup(w, ne);
  skins(w, ne);
  events(w);
  w.varint(2);
  attack(w, 1.25);
  w.string('Idle').varint(0).varint(0).varint(0).varint(0).varint(0).varint(0).varint(0).varint(0);
}, { nonessential: ne });

test('[骨骼-2] [骨骼-3] header, string table, bones, slots and the three kinds of constraints', () => {
  for (const ne of [false, true]) {
    const s = readSkeleton(full(ne));
    assert.deepEqual([s.hash, s.version, s.x, s.y, s.width, s.height], ['hash', '3.8.99', 1, 2, 30, 40]);
    assert.deepEqual(s.nonessential, ne ? { fps: 30, images: './images/', audio: null } : null);
    assert.deepEqual(s.bones.map((b) => [b.name, b.parent, b.length, b.color]), [['root', -1, 5, ne ? 0x9bc9e2ff | 0 : 0], ['arm', 0, 5, ne ? 0x9bc9e2ff | 0 : 0]]);
    assert.deepEqual(s.slots.map((x) => [x.name, x.bone, x.attachment, x.blend, x.dark]), [['body', 0, 'body', 0, -1], ['fx', 1, null, 2, 0x102030]]);
    assert.deepEqual([s.constraints.ik[0].target, s.constraints.ik[0].bend, s.constraints.ik[0].compress], [0, -1, true]);
    assert.deepEqual([s.constraints.transform[0].offsetShearY, s.constraints.transform[0].relative], [6, true]);
    assert.deepEqual([s.constraints.path[0].spacing, s.constraints.path[0].rotate, s.constraints.path[0].positionValue], [1, 2, 1]);
  }
});

test('[骨骼-4] skins: the default skin first, every attachment type, plain and weighted vertices', () => {
  const s = readSkeleton(full(true));
  assert.deepEqual(s.skins.map((k) => k.name), ['default', 'alt']);
  const byKey = Object.fromEntries(s.skins[0].attachments.map((a) => [a.key, /** @type {any} */ (a.attachment)]));
  assert.deepEqual(Object.values(byKey).map((a) => a.type), ['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping']);
  assert.deepEqual([byKey.mesh.weighted, byKey.mesh.bones, byKey.mesh.vertices.length, byKey.mesh.triangles, byKey.mesh.hull], [true, [1, 1, 1, 1, 1, 1], 9, [0, 1, 2], 3]);
  assert.deepEqual([byKey.linked.name, byKey.linked.parent, byKey.linked.inheritDeform], ['real', 'mesh', true]);
  assert.deepEqual([byKey.path.lengths, byKey.path.constantSpeed], [[7], true]);
  assert.deepEqual([byKey.clipping ?? byKey.clip].map((a) => [a.end, a.vertices]), [[1, [0, 0, 1, 1]]]);
  assert.deepEqual([s.skins[1].bones, s.skins[1].ik, s.skins[1].path], [[1], [0], [0]]);
  assert.equal(readSkeleton(skeleton((w) => { setup(w, false); w.varint(0).varint(0).varint(0).varint(0); })).skins.length, 0, 'no default slots: no default skin');
});

test('[骨骼-5] animations: every timeline kind with its curves, draw order, events; the duration is the last key', () => {
  const s = readSkeleton(full(false)), [a, idle] = s.animations;
  assert.deepEqual(a.timelines.map((t) => t.kind), ['attachment', 'color', 'twoColor', 'rotate', 'translate', 'scale', 'shear', 'ik', 'transform',
    'pathPosition', 'pathSpacing', 'pathMix', 'deform']);
  assert.deepEqual(a.timelines[0].frames, [{ time: 0, values: ['body'] }, { time: Math.fround(0.2), values: [null] }]);
  assert.deepEqual(a.timelines[3].frames.map((f) => f.curve), [{ type: CURVE.LINEAR }, { type: CURVE.STEPPED }, { type: CURVE.BEZIER, c: [0.25, 0, 0.75, 1] }, undefined]);
  assert.deepEqual(a.timelines[1].frames[0].curve, { type: CURVE.LINEAR });
  assert.deepEqual(a.timelines[12].frames.map((f) => f.values), [[], [1, 0.5, -0.5]]);
  assert.deepEqual(a.drawOrder, [{ time: 0.25, offsets: [[1, 0]] }]);
  assert.deepEqual(a.events.map((e) => [e.time, e.event, e.int, e.string]), [[Math.fround(0.6), 0, 1, 'x'], [Math.fround(0.3), 0, 0, 'hit'], [1.25, 1, 0, null]]);
  assert.deepEqual([a.events[2].volume, a.events[2].balance], [1, 0]);
  assert.equal(a.duration, 1.25);
  assert.deepEqual([idle.duration, idle.timelines.length], [0, 0]);
  assert.deepEqual(s.events.map((e) => [e.name, e.int, e.audio, e.volume]), [['OnAttack', -2, null, 1], ['Sound', 0, 'a.ogg', Math.fround(0.8)]]);
});

test('[骨骼-6] what the battle needs: each animation\'s duration and OnAttack times in order', () => {
  const t = animationTimes(readSkeleton(full(false)));
  assert.deepEqual(t, { Attack: { duration: 1.25, hits: [Math.fround(0.3), Math.fround(0.6)] }, Idle: { duration: 0, hits: [] } });
  assert.deepEqual(animationTimes(readSkeleton(full(false)), /^sound$/i).Attack.hits, [1.25]);
});

test('[骨骼-1] malformed files: unknown codes, early ends and bytes left over are refused', () => {
  const good = full(false);
  assert.throws(() => readSkeleton(good.subarray(0, good.length - 3)), /past the end/);
  assert.throws(() => readSkeleton(Uint8Array.from([...good, 0])), /left after/);
  const badAttachment = skeleton((w) => { setup(w, false); w.varint(1).varint(0).varint(1).ref('x').ref(null).byte(9); });
  assert.throws(() => readSkeleton(badAttachment), /unknown attachment type 9/);
  const anim = (/** @type {(w: Writer) => void} */ f) => skeleton((w) => { setup(w, false); w.varint(0).varint(0).varint(0).varint(1); f(w); });
  assert.throws(() => readSkeleton(anim((w) => w.string('A').varint(1).varint(0).varint(1).byte(7).varint(0))), /unknown slot timeline 7/);
  assert.throws(() => readSkeleton(anim((w) => w.string('A').varint(0).varint(1).varint(0).varint(1).byte(5).varint(0))), /unknown bone timeline 5/);
  assert.throws(() => readSkeleton(anim((w) => w.string('A').varint(0).varint(0).varint(0).varint(0).varint(0).varint(0).varint(0).varint(1).float(0).varint(4))), /unknown event 4/);
});
