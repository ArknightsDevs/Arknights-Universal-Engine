// A UI's particle effects (docs/spec/render.md 渲染-18): roots on a page and on a world-space canvas, the scale on the
// effect's group, mesh particles' z, and the UI particle component's scale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pageRoot, unitRoot, createUiFx, PREWARM } from '../src/uifx.js';
import { canvasRoot } from '../src/uiscene.js';

const round = (/** @type {number[]} */ v) => v.map((x) => Math.round(x * 1000) / 1000 + 0);

test('[渲染-18] a page root: x right, y up (the page\'s y turned), z into the page; its scale taken out onto the group', () => {
  const r = pageRoot(100, 50, 2);
  assert.deepEqual(r, { o: [100, -50, 0], ex: [2, 0, 0], ey: [0, 2, 0], ez: [0, 0, -2] });
  const u = unitRoot(r);
  assert.equal(u.k, 2);
  assert.deepEqual(u.root, { o: [50, -25, 0], ex: [1, 0, 0], ey: [0, 1, 0], ez: [0, 0, -1] }, 'the group scaled by 2 puts it back');
});

test('[渲染-18] a root on a world-space canvas lying on the ground: its point, its axes scaled alike in all three', () => {
  const parent = new THREE.Object3D();
  parent.position.set(-1000, 1000, 0);
  parent.updateMatrixWorld(true);
  const rt = { size: [1800, 1792], pivot: [0.5, 0.5], scale: [0.1, 0.1], pos: [0, 0], q: [0.70711, 0, 0, 0.70711] };
  const r = canvasRoot(parent, rt, 900, 896, 1);
  assert.deepEqual(round(r.o), [-1000, 1000, 0], 'the canvas\'s centre');
  assert.deepEqual([round(r.ex), round(r.ey), round(r.ez)], [[0.1, 0, 0], [0, 0, -0.1], [0, -0.1, 0]], 'y along the ground, z (Unity\'s +z, into it) down');
});

test('[渲染-18] the effects: one played, its group scaled; mesh particles\' z the other way; local scaling keeps its size', () => {
  const mesh = { name: 'q', v: [0, 0, 0, 1, 0, 0, 0, 0, 1], uv: [0, 0, 1, 0, 0, 1], f: [0, 1, 2] };
  const sys = (/** @type {number} */ scaling) => ({ dur: 5, loop: true, delay: { st: 0, sc: 0 }, life: { st: 0, sc: 5 }, speed: { st: 0, sc: 0 }, size: { st: 0, sc: 2 },
    rate: { st: 0, sc: 10 }, max: 10, shape: { on: false, type: 4, radius: 1, box: [1, 1, 1], pos: [0, 0, 0], rot: [0, 0, 0] }, render: { mode: 4, align: 1 }, mesh, tex: 't',
    blend: 'blend', scaling, space: 0 });
  const pack = { data: { fx: { e: { d: 5, ps: [sys(0), sys(1)], tr: [] } } }, textures: new Map([['t', new THREE.Texture()]]) };
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
  const fx = createUiFx({ pack, scene, camera: () => cam });
  const h = fx.play('e', pageRoot(0, 0, 0.5), 1);
  assert.ok(h && fx.count === 1);
  fx.frame(0.5);
  const [it] = /** @type {any[]} */ (fx.inspect());
  assert.equal(it.k, 0.5);
  assert.deepEqual(it.sz, [1, 2], 'hierarchy scaling: the root\'s scale applies; local: divided back (1 / 0.5)');
  assert.equal(it.ui, 2);
  assert.ok(PREWARM > 0);
  /** @type {any} */ (h).remove();
  assert.equal(fx.count, 0);
  // one that plays once is not run ahead: a burst at its start still shows (simulated a cycle first, it would be over)
  const once = { ...sys(0), loop: false, dur: 1, rate: { st: 0, sc: 0 }, life: { st: 0, sc: 0.5 }, bursts: [{ t: 0, n: { st: 0, sc: 3 }, cycles: 1, iv: 1 }] };
  const pack2 = { data: { fx: { b: { d: 1, ps: [once], tr: [] } } }, textures: pack.textures };
  const fx2 = createUiFx({ pack: pack2, scene, camera: () => cam });
  fx2.play('b', pageRoot(0, 0, 1), 1);
  fx2.frame(0.1);
  assert.ok(/** @type {any[]} */ (fx2.inspect())[0].parts.length > 0, 'the burst is drawn');
  fx2.dispose();
  fx.dispose();
});
