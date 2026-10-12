// The operator being placed without a GPU (docs/spec/render.md 渲染-14): its figure idle on the tile facing the chosen
// way, its shadow, the direction indicator at its feet while the facing is chosen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { DIR } from '@aue/schema';
import { createPlacing, INDICATOR, SHADOW, toThree, tileWorld } from '../src/index.js';
import { tinyModel } from './model.js';

const level = tinyContent().level;
const textures = () => new Map(['ui:shadow', 'ui:directionRing', 'ui:directionArrow'].map((k) => [k, new THREE.Texture()]));
const models = () => new Map([['guard', { front: tinyModel(), back: tinyModel() }]]);
/** @param {THREE.Object3D} o */
const meshes = (o) => /** @type {THREE.Mesh[]} */ (o.children.filter((c) => c instanceof THREE.Mesh));
const near = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test('[渲染-14] the operator placed stands on its tile, idle, with its shadow; facing up shows its back, left mirrors it', () => {
  const p = createPlacing(textures(), models(), level), camera = new THREE.PerspectiveCamera();
  camera.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.5);
  p.set({ key: 'guard', col: 1, row: 2, h: 1, dir: DIR.RIGHT, ring: false });
  const at = toThree(tileWorld(level, 1, 2, 1)), fig = p.object.children[3], [front, back] = /** @type {THREE.Mesh[]} */ (fig.children);
  assert.equal(p.shows(), true);
  assert.ok(near(fig.position.toArray(), at), 'its feet on the tile');
  const shadow = /** @type {THREE.Group} */ (p.object.children[0]).children[0];
  assert.ok(near(shadow.position.toArray(), [at[0], at[1], at[2] + SHADOW.south]), 'its shadow south of its feet');
  const [ring, arrow] = meshes(p.object);
  assert.deepEqual([ring.visible, arrow.visible], [false, false], 'no indicator while dragged');
  /** A side's drawn x coordinates. @param {THREE.Mesh} m */
  const xs = (m) => Array.from(/** @type {THREE.BufferAttribute} */ (m.geometry.getAttribute('position')).array).filter((_, i) => i % 3 === 0);
  p.pose(camera, performance.now());
  assert.ok(fig.quaternion.equals(camera.quaternion), 'facing the camera');
  assert.deepEqual([front.visible, back.visible], [true, false]);
  const right = xs(front);
  p.set({ key: 'guard', col: 1, row: 2, h: 1, dir: DIR.UP, ring: false });
  p.pose(camera, performance.now());
  assert.deepEqual([front.visible, back.visible], [false, true], 'facing up: its back');
  p.set({ key: 'guard', col: 1, row: 2, h: 1, dir: DIR.LEFT, ring: false });
  p.pose(camera, performance.now());
  assert.ok(front.visible);
  assert.deepEqual(xs(front), right.map((x) => -x), 'facing left: mirrored');
  p.set(null);
  assert.equal(p.shows(), false);
  assert.equal(/** @type {THREE.Group} */ (p.object.children[0]).children.length, 0, 'its shadow gone');
  p.set({ key: 'nobody', col: 0, row: 0, h: 0, dir: DIR.RIGHT, ring: true });
  assert.equal(p.shows(), false, 'no model, nothing placed');
  assert.deepEqual([ring.visible, arrow.visible], [false, false]);
  p.dispose();
});

test('[渲染-14] while the facing is chosen: the ring at its feet, the arrow on it pointing the facing, after the shadows', () => {
  const p = createPlacing(textures(), models(), level), at = toThree(tileWorld(level, 2, 1, 0));
  const [ring, arrow] = meshes(p.object);
  const facings = [[DIR.RIGHT, [1, 0, 0]], [DIR.UP, [0, 0, -1]], [DIR.LEFT, [-1, 0, 0]], [DIR.DOWN, [0, 0, 1]]];
  for (const [dir, d] of /** @type {[number, number[]][]} */ (facings)) {
    p.set({ key: 'guard', col: 2, row: 1, h: 0, dir, ring: true });
    assert.deepEqual([ring.visible, arrow.visible], [true, true]);
    assert.ok(near(ring.position.toArray(), at));
    assert.ok(near(arrow.position.toArray(), [at[0] + INDICATOR.out * d[0], at[1], at[2] + INDICATOR.out * d[2]]), `arrow ${dir} out along its facing`);
    const tip = new THREE.Vector3(1, 0, 0).applyQuaternion(arrow.quaternion);
    assert.ok(near(tip.toArray(), d), `arrow ${dir} points out`);
  }
  ring.geometry.computeBoundingBox();
  const size = /** @type {THREE.Box3} */ (ring.geometry.boundingBox).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 0.704) < 1e-6 && Math.abs(size.z - 0.704) < 1e-6 && size.y < 1e-6, 'flat, 0.704 tiles across');
  const rm = /** @type {THREE.MeshBasicMaterial} */ (ring.material), am = /** @type {THREE.MeshBasicMaterial} */ (arrow.material);
  assert.deepEqual([rm.opacity, am.opacity, rm.depthWrite, rm.depthTest, ring.renderOrder, arrow.renderOrder], [0.502, 1, false, true, -0.9, -0.8]);
  assert.equal(am.color.getHexString(THREE.SRGBColorSpace), 'ff9900', 'orange (1, 0.6, 0)');
  p.dispose();
  const bare = createPlacing(new Map([['ui:shadow', new THREE.Texture()]]), models(), level);
  bare.set({ key: 'guard', col: 2, row: 1, h: 0, dir: DIR.RIGHT, ring: true });
  assert.deepEqual(meshes(bare.object).map((m) => m.visible), [false, false], 'no indicator textures: no indicator');
  bare.dispose();
});
