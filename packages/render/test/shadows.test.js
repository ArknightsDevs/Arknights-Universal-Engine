// Shadows without a GPU (docs/spec/render.md 渲染-6): one under each drawn unit, lying flat south of its feet, half
// transparent, drawn before the units, kept while a figure plays its die clip; none without the texture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { ANIM } from '@aue/schema';
import { unitTextureKey, SHADOW } from '../src/index.js';
import { createUnits } from '../src/units.js';
import { tinyModel } from './model.js';

const level = tinyContent().level;
/** @param {string[]} keys */
const textures = (keys) => new Map(keys.map((k) => [k, new THREE.Texture()]));
const base = { owner: 0, dir: 0, hp: 1, maxHp: 1, anim: ANIM.IDLE, sp: -1, spCost: 0, skill: 0, skillLeft: -1 };
/** @param {number} frame @param {any[]} units */
const view = (frame, units) => ({ frame, players: [], units: units.map((x) => ({ ...base, ...x })) });

test('[渲染-6] shadows: one per drawn unit, flat on the ground south of its feet, half transparent, before the units', () => {
  const u = createUnits(textures([unitTextureKey(0, 'guard'), unitTextureKey(1, 'slime'), 'ui:shadow']));
  u.update(view(1, [{ id: 1, kind: 0, x: 1, y: 1, z: 1 }, { id: 2, kind: 1, x: 0, y: 2, z: 0 }, { id: 3, kind: 1, x: 0, y: 2, z: 0 }]),
    { 1: 'guard', 2: 'slime', 3: 'mystery' }, level);
  const shadows = /** @type {THREE.Mesh[]} */ (u.shadows.children), card = /** @type {THREE.Sprite} */ (u.object.children[0]);
  assert.equal(shadows.length, 2, 'the unit without a texture has no shadow');
  const [s] = shadows, mat = /** @type {THREE.MeshBasicMaterial} */ (s.material);
  assert.deepEqual(s.position.toArray(), [card.position.x, card.position.y, card.position.z + SHADOW.south]);
  s.geometry.computeBoundingBox();
  const size = /** @type {THREE.Box3} */ (s.geometry.boundingBox).getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 0.608) < 1e-6 && Math.abs(size.z - 0.194) < 1e-6 && size.y < 1e-6, 'flat, 0.608 × 0.194 tiles');
  assert.deepEqual([mat.opacity, mat.transparent, mat.depthWrite, mat.depthTest, s.renderOrder], [0.502, true, false, true, -1]);
  u.update(view(2, [{ id: 2, kind: 1, x: 0.5, y: 1, z: 0 }]), {}, level);
  assert.equal(u.shadows.children.length, 1);
  assert.ok(Math.abs(u.shadows.children[0].position.z - (u.object.children[0].position.z + SHADOW.south)) < 1e-12, 'follows the unit');
  u.dispose();
  const bare = createUnits(textures([unitTextureKey(1, 'slime')]));
  bare.update(view(1, [{ id: 2, kind: 1, x: 0, y: 2, z: 0 }]), { 2: 'slime' }, level);
  assert.deepEqual([bare.count(), bare.shadows.children.length], [1, 0], 'no shadow texture: no shadows');
  bare.dispose();
});

test('[渲染-6] shadows: a dying figure keeps its shadow until it is removed', () => {
  const u = createUnits(textures(['ui:shadow']), new Map([['slime', { front: tinyModel() }]]));
  u.update(view(1, [{ id: 1, kind: 1, owner: -1, x: 1, y: 1, z: 0, anim: ANIM.MOVE }]), { 1: 'slime' }, level, 0);
  assert.equal(u.shadows.children.length, 1);
  u.update(view(2, []), {}, level, 0, [{ type: 'death', id: 1 }]);
  assert.equal(u.shadows.children.length, 1, 'kept while the die clip (0.6 s) plays');
  u.update(view(2 + 18, []), {}, level, 0);
  assert.equal(u.shadows.children.length, 0, 'gone with the figure');
  u.dispose();
});
