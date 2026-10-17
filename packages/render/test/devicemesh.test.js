// Device meshes without a GPU (docs/spec/render.md 渲染-20): a facility drawn as its mesh, the part of its level shown,
// at its tile, no shadow; the part's positions turned from the level's world into three's axes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { ANIM, KIND } from '@aue/schema';
import { partGeometry, newDeviceMesh, showLevel, toThree, tileWorld } from '../src/index.js';
import { createUnits } from '../src/units.js';

const level = tinyContent().level;
/** A part of a level: one triangle. @param {number} lv */
const part = (lv) => ({ name: `box_${lv}`, level: lv, texture: 't.webp', position: [0, 0, 0, 1, 0, 0, 0, 1, -0.5], uv: [0, 0, 1, 0, 0, 1], index: [0, 1, 2] });
const model = () => ({ parts: [0, 1, 2, 3].map((lv) => ({ level: lv, geometry: partGeometry(part(lv)), material: new THREE.MeshBasicMaterial() })) });

test('[渲染-20] a part\'s geometry: the level\'s world axes turned into three\'s, its uvs and triangle', () => {
  const g = partGeometry(part(1));
  assert.deepEqual([...g.attributes.position.array].map((v) => v + 0), [0, 0, 0, 1, 0, 0, 0, 0.5, -1], 'x stays, height (−z) is up, rows (y) go into the screen');
  assert.deepEqual([...g.attributes.uv.array], [0, 0, 1, 0, 0, 1]);
  assert.deepEqual([...(g.index?.array ?? [])], [0, 1, 2]);
});

test('[渲染-20] a facility\'s mesh shows the part of its level, level 0 for one it has none of', () => {
  const d = newDeviceMesh(model());
  assert.deepEqual(d.meshes.map((m) => m.visible), [false, false, false, false]);
  showLevel(d, 2);
  assert.deepEqual(d.meshes.map((m) => m.visible), [false, false, true, false]);
  showLevel(d, 7);
  assert.deepEqual(d.meshes.map((m) => m.visible), [true, false, false, false]);
});

test('[渲染-20] the units draw a device with a mesh model as the mesh at its tile, at the level the page gives, without a shadow', () => {
  const tex = new Map([['ui:shadow', new THREE.Texture()]]), u = createUnits(tex, new Map(), new Set(), new Map([['fac', model()]]));
  const unit = { id: 4, kind: KIND.DEVICE, owner: -1, x: 3, y: 0, z: 0, dir: 0, hp: 1, maxHp: 1, anim: ANIM.IDLE, sp: -1, spCost: 0, skill: 0, skillLeft: -1 };
  const view = { frame: 1, players: [], units: [unit] };
  u.update(/** @type {any} */ (view), { 4: 'fac' }, level);
  const g = /** @type {THREE.Group} */ (u.object.children[0]);
  assert.deepEqual(g.position.toArray(), toThree(tileWorld(level, 3, 0, 0)));
  assert.deepEqual(g.children.map((m) => m.visible), [true, false, false, false]);
  assert.deepEqual([u.count(), u.shows(4), u.shadows.children.length], [1, true, 0]);
  u.setLevels({ 4: 3 });
  u.update(/** @type {any} */ ({ ...view, frame: 2 }), {}, level);
  assert.deepEqual(g.children.map((m) => m.visible), [false, false, false, true]);
  u.update(/** @type {any} */ ({ ...view, frame: 3, units: [] }), {}, level);
  assert.deepEqual([u.count(), u.object.children.length], [0, 0]);
  u.dispose();
});
