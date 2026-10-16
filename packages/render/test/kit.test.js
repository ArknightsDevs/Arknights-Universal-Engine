// Terrain from a tile kit without a GPU (docs/spec/render.md 渲染-7): which piece a tile gets, where its triangles go,
// the materials and lights, start and end markers, pick quads, and units standing on the theme's high ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tinyContent } from '@aue/testkit';
import { kitKey, kitPattern, KIT_LIGHT, tileWorld, STEP_HEIGHT } from '../src/index.js';
import { createKitTerrain } from '../src/kit.js';

const level = tinyContent().level;

/** One square piece per key at a height (z down), on material 0 or 1, with the road's south-west corner marked by its uv. */
const square = (/** @type {number} */ z, /** @type {number} */ material) => ({ groups: [{ material, position: [-0.5, -0.5, z, 0.5, -0.5, z, 0.5, 0.5, z, -0.5, 0.5, z],
  normal: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], uv: [0.1, 0.2, 1, 0, 1, 1, 0, 1], index: [0, 1, 2, 0, 2, 3] }] });
const all = (/** @type {number} */ piece) => Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i.toString(2).padStart(4, '0'), piece]));
/** @type {import('../src/kit.js').TileKit} */
const kit = {
  version: 1, theme: 'test', highland: 0.3,
  materials: [{ name: 'ground', map: 'a.webp', color: [1, 0.5, 1], cutout: null, emissiveMap: 'e.webp', emissive: [0.2, 0.2, 0.2] },
    { name: 'deco', map: 'b.webp', color: [1, 1, 1], cutout: 0.5, emissiveMap: null, emissive: [0, 0, 0] }],
  pieces: [square(0.02, 0), square(-0.28, 1), square(-0.28, 0)],
  tiles: { tile_road: { ...all(0), '0101': 2 }, tile_wall: all(1) },
};
const loaded = { kit, textures: new Map(['a.webp', 'b.webp', 'e.webp'].map((f) => [f, new THREE.Texture()])) };

test('[渲染-7] a tile\'s pieces: its key, else an alias, else by class; none when the kit has none of them', () => {
  assert.equal(kitKey(kit, { key: 'tile_road', height: 'LOWLAND' }), 'tile_road');
  assert.equal(kitKey(kit, { key: 'tile_start_cooperate', height: 'LOWLAND' }), 'tile_road', 'no tile_start: the ground class');
  assert.equal(kitKey({ ...kit, tiles: { ...kit.tiles, tile_start: all(0) } }, { key: 'tile_start_cooperate', height: 'LOWLAND' }), 'tile_start');
  assert.equal(kitKey(kit, { key: 'tile_passable_wall', height: 'HIGHLAND', buildable: 'RANGED' }), 'tile_wall');
  assert.equal(kitKey(kit, { key: 'tile_forbidden', height: 'HIGHLAND', buildable: 'NONE' }), null, 'no tile_forbidden in this kit');
});

test('[渲染-7] the neighbour pattern: north, east, south, west, 1 for high ground, outside the map 0', () => {
  // tiny level, row 0 south: floor floor wall wall floor floor / road ×5 end / start floor wall wall floor floor
  assert.equal(kitPattern(level, 1, 0), '0100');
  assert.equal(kitPattern(level, 2, 1), '1010');
  assert.equal(kitPattern(level, 4, 2), '0001');
  assert.equal(kitPattern(level, 0, 0), '0000');
});

test('[渲染-7] the kit terrain: pieces at their tiles, mirrored winding, one mesh per material, lit, with pick quads', () => {
  const t = createKitTerrain(level, loaded, new Map());
  const meshes = /** @type {THREE.Mesh[]} */ (t.object.children.filter((c) => c instanceof THREE.Mesh && c.visible));
  assert.equal(meshes.length, 2, 'one mesh per material used');
  const ground = meshes.find((m) => /** @type {THREE.MeshLambertMaterial} */ (m.material).alphaTest === 0);
  const deco = meshes.find((m) => /** @type {THREE.MeshLambertMaterial} */ (m.material).alphaTest === 0.5);
  assert.ok(ground && deco);
  const gm = /** @type {THREE.MeshLambertMaterial} */ (ground.material);
  const srgb = new THREE.Color().setRGB(1, 0.5, 0.2, THREE.SRGBColorSpace);
  assert.deepEqual([gm.color.r, gm.color.g, gm.emissive.r, gm.map === loaded.textures.get('a.webp'), gm.emissiveMap === loaded.textures.get('e.webp')],
    [1, srgb.g, srgb.b, true, true], 'colours are sRGB');
  // every lowland tile without its own key in the kit is drawn as road: 14 lowland tiles × 4 corners
  const pos = /** @type {THREE.BufferAttribute} */ (ground.geometry.getAttribute('position'));
  assert.equal(pos.count, 14 * 4);
  // tile (0, 0): x = 0 − 2.5, y = 0 − 1; corner 0 is (−0.5, −0.5, 0.02) → three.js (−3, −0.02, 1.5)
  assert.deepEqual([pos.getX(0), pos.getY(0), pos.getZ(0)].map((v) => Math.round(v * 1000) / 1000), [-3, -0.02, 1.5]);
  assert.deepEqual([...(/** @type {THREE.BufferAttribute} */ (ground.geometry.index).array)].slice(0, 6), [0, 2, 1, 0, 3, 2], 'corners the other way round');
  const lights = t.object.children.filter((c) => c instanceof THREE.Light);
  assert.deepEqual(lights.map((l) => [l.type, /** @type {THREE.Light} */ (l).intensity]), [['AmbientLight', KIT_LIGHT.ambient], ['DirectionalLight', KIT_LIGHT.directional]]);
  const picks = t.object.children.filter((c) => c.userData.col !== undefined);
  assert.equal(picks.length, 18);
  const wall = picks.find((c) => c.userData.col === 2 && c.userData.row === 0);
  assert.ok(wall && !wall.visible && Math.abs(wall.position.y - 0.3) < 1e-12, 'the pick quad of high ground at the kit\'s height');
  t.dispose();
});

test('[渲染-7] the road piece follows the neighbour pattern', () => {
  // only (2, 1) and (3, 1) see high ground north and south ('1010'); no tile has '0101', so piece 2 is never used:
  // check by switching '1010' to piece 2 — the deco material's mesh then has the wall tiles plus those two
  const k = { ...kit, tiles: { ...kit.tiles, tile_road: { ...all(0), '1010': 2 } } };
  const t = createKitTerrain(level, { ...loaded, kit: k }, new Map());
  const ground = /** @type {THREE.Mesh} */ (t.object.children.find((c) => c instanceof THREE.Mesh && /** @type {THREE.MeshLambertMaterial} */ (c.material).alphaTest === 0));
  const pos = /** @type {THREE.BufferAttribute} */ (ground.geometry.getAttribute('position'));
  const raised = Array.from({ length: pos.count }, (_, i) => pos.getY(i)).filter((y) => Math.abs(y - 0.28) < 1e-6).length;
  assert.equal(raised, 2 * 4, 'the two tiles between high ground use the raised piece');
  t.dispose();
});

test('[渲染-7] start and end tiles carry their marker texture on top, before the range and the shadows; others none', () => {
  const marker = new THREE.Texture();
  const t = createKitTerrain(level, loaded, new Map([['tile:tile_start', marker], ['tile:tile_road', new THREE.Texture()]]));
  const marks = /** @type {THREE.Mesh[]} */ (t.object.children.filter((c) => c instanceof THREE.Mesh && c.visible && /** @type {THREE.MeshBasicMaterial} */ (c.material).map === marker));
  assert.equal(marks.length, 1);
  const m = marks[0], mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
  assert.deepEqual([m.renderOrder, mat.transparent, mat.depthWrite, Math.round(m.position.y * 1000) / 1000], [-3, true, false, 0.005]);
  assert.equal(t.object.children.filter((c) => c instanceof THREE.Mesh && c.visible).length, 3, 'no marker for the road');
  t.dispose();
});

test('[渲染-7] high ground is the theme\'s height when given, else STEP_HEIGHT', () => {
  assert.equal(tileWorld({ width: 3, height: 3, highland: 0.3 }, 1, 1, 1)[2], -0.3);
  assert.equal(tileWorld({ width: 3, height: 3 }, 1, 1, 1)[2], -STEP_HEIGHT);
});

test('[渲染-7] a level kit\'s scenery: drawn from the map\'s centre, not highlighted; a blending material is transparent', () => {
  const blendKit = { ...kit, materials: [...kit.materials, { name: 'fog', map: 'b.webp', color: [1, 1, 1], cutout: null, emissiveMap: null, emissive: [0, 0, 0], blend: true, opacity: 0.4 }],
    pieces: [...kit.pieces, { groups: [{ ...square(-1, 2).groups[0] }] }], scenery: 3 };
  const patched = /** @type {THREE.Material[]} */ ([]);
  const t = createKitTerrain(level, { ...loaded, kit: blendKit }, new Map(), (m) => patched.push(m));
  const meshes = /** @type {THREE.Mesh[]} */ (t.object.children.filter((c) => c instanceof THREE.Mesh && c.visible));
  const fog = meshes.find((m) => /** @type {THREE.MeshLambertMaterial} */ (m.material).transparent);
  assert.ok(fog, 'the scenery mesh');
  const fm = /** @type {THREE.MeshLambertMaterial} */ (fog.material), pos = /** @type {THREE.BufferAttribute} */ (fog.geometry.getAttribute('position'));
  assert.deepEqual([fm.opacity, fm.depthWrite, patched.includes(fm)], [0.4, false, false]);
  assert.deepEqual([pos.getX(0), pos.getY(0), pos.getZ(0)], [-0.5, 1, 0.5], 'corner (−0.5, −0.5, −1) at the map\'s centre → three.js (−0.5, 1, 0.5)');
  t.dispose();
});
