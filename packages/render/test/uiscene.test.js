// A UI screen's 3D scene (docs/spec/render.md 渲染-17): Unity's space to three's, meshes, and where a world-space
// canvas falls on the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { posOf, quatOf, meshGeometry, canvasCorners } from '../src/uiscene.js';

test('[渲染-17] Unity\'s left-handed space to three\'s: z negated, rotations mirrored, triangles wound the other way', () => {
  assert.deepEqual(posOf([1, 2, 3]), [1, 2, -3]);
  assert.deepEqual(quatOf([0.1, 0.2, 0.3, 0.9]), [-0.1, -0.2, 0.3, 0.9]);
  const g = meshGeometry({ position: [0, 0, 1, 1, 0, 1, 0, 1, 1], normal: [0, 0, 1, 0, 0, 1, 0, 0, 1], uv: [0, 0, 1, 0, 0, 1], index: [0, 1, 2] });
  assert.deepEqual([...g.getAttribute('position').array], [0, 0, -1, 1, 0, -1, 0, 1, -1]);
  assert.deepEqual([...g.getAttribute('normal').array].filter((_, i) => i % 3 === 2), [-1, -1, -1]);
  assert.deepEqual([...(/** @type {THREE.BufferAttribute} */ (g.getIndex())).array], [0, 2, 1]);
  // a rotation and its mirror turn a mirrored vector alike: Unity's +z forward ends as three's −z
  const q = quatOf([0, Math.SQRT1_2, 0, Math.SQRT1_2]), v = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...q));
  assert.deepEqual(v.toArray().map((x) => Math.round(x * 1e6) / 1e6 + 0), [1, 0, 0], 'Unity turns +z to +x by +90° about y; mirrored, the mirrored −z goes to the mirror of +x, which is +x');
});

test('[渲染-17] a world-space canvas\'s corners on the page, top-left first; none behind the camera', () => {
  const parent = new THREE.Object3D(), cam = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  cam.position.set(0, 0, 10);
  cam.updateMatrixWorld(true);
  const rt = { size: [2, 2], pivot: [0.5, 0.5], scale: [1, 1], pos: [0, 0], q: [0, 0, 0, 1] };
  const c = /** @type {number[][]} */ (canvasCorners(parent, rt, cam, 100, 100));
  assert.deepEqual(c.map((p) => p.map((v) => Math.round(v * 1000) / 1000)), [[45, 45], [55, 45], [55, 55], [45, 55]]);
  cam.position.set(0, 0, -10);
  cam.updateMatrixWorld(true);
  assert.equal(canvasCorners(parent, rt, cam, 100, 100), null, 'the camera looks away from it');
  assert.equal(parent.children.length, 0, 'nothing left behind');
});
