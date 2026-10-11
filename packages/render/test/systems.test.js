// The terrain and units systems without a GPU: what they put in the scene, and that nothing untextured is drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { tileKeys, unitTextureKey } from '../src/index.js';
import { createTerrain } from '../src/terrain.js';
import { createUnits } from '../src/units.js';

const level = tinyContent().level;
/** @param {string[]} keys */
const textures = (keys) => new Map(keys.map((k) => [k, new THREE.Texture()]));

test('terrain: one top per tile, side faces for high ground, at the tile positions; a missing texture is an error', () => {
  const keys = tileKeys(level).map((k) => `tile:${k}`);
  const t = createTerrain(level, textures(keys));
  const tops = t.object.children.filter((/** @type {THREE.Object3D} */ m) => m.userData.col !== undefined), sides = t.object.children.length - tops.length;
  assert.equal(tops.length, 18);
  assert.equal(sides, level.tiles.flat().filter((/** @type {{ height: string }} */ x) => x.height === 'HIGHLAND').length);
  const wall = tops.find((/** @type {THREE.Object3D} */ m) => m.userData.col === 2 && m.userData.row === 0);
  assert.ok(wall && Math.abs(wall.position.y - 0.4) < 1e-12, 'high ground top at 0.4');
  t.dispose();
  assert.throws(() => createTerrain(level, textures(keys.slice(1))), /no texture for tile/);
});

test('units: a card per textured unit at its feet; units without a texture are not drawn; gone units are removed', () => {
  const u = createUnits(textures([unitTextureKey(0, 'guard'), unitTextureKey(1, 'slime')]));
  const base = { owner: 0, dir: 0, hp: 1, maxHp: 1, anim: 0 };
  /** @param {any[]} units */
  const view = (units) => ({ frame: 1, players: [], units: units.map((x) => ({ ...base, ...x })) });
  u.update(view([{ id: 1, kind: 0, x: 1, y: 1, z: 0 }, { id: 2, kind: 1, x: 0, y: 2, z: 0 }, { id: 3, kind: 1, x: 0, y: 2, z: 0 }]),
    { 1: 'guard', 2: 'slime', 3: 'mystery' }, level);
  assert.equal(u.count(), 2);
  const card = /** @type {THREE.Sprite} */ (u.object.children[0]);
  assert.equal(card.material.depthWrite, false);
  assert.deepEqual([card.center.x, card.center.y], [0.5, 0]);
  u.update(view([{ id: 2, kind: 1, x: 0.5, y: 1, z: 0 }]), {}, level);
  assert.equal(u.count(), 1);
  u.dispose();
});
