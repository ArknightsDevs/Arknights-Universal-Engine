// Device meshes (docs/spec/render.md 渲染-20): a level device drawn from its mesh model instead of a figure or a card —
// 堡垒守御's facilities (守御-3): one part for each of its levels, the part of the level it is at shown, unlit with its
// texture, at its tile.
import * as THREE from 'three';
import { toThree } from './camera.js';

/**
 * A mesh model file: its parts, each a level's mesh in the device's own space (the level's world axes, tiles as units)
 * with its texture (relative to the assets) and its triangles.
 * @typedef {{ parts: { name: string, level: number, texture: string, position: number[], uv: number[], index: number[] }[] }} DeviceMeshFile
 */
/** @typedef {{ parts: { level: number, geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial }[] }} DeviceMeshModel */
/** @typedef {{ version: number, models: Record<string, string> }} DeviceMeshIndex */
/** A device's mesh object: its parts, the level shown (−1 none yet). @typedef {{ group: THREE.Group, meshes: THREE.Mesh[], level: number }} DeviceMesh */

/** A part's geometry: its positions turned into three's axes, its uvs and triangles. @param {DeviceMeshFile['parts'][number]} p */
export function partGeometry(p) {
  const pos = new Float32Array(p.position.length);
  for (let i = 0; i < p.position.length; i += 3) pos.set(toThree([p.position[i], p.position[i + 1], p.position[i + 2]]), i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.uv), 2));
  g.setIndex(p.index);
  return g;
}

/**
 * Loads the mesh models a list of content keys needs from an index (paths relative to baseUrl); keys the index does not
 * have are left out. Textures are sRGB, shared between parts.
 * @param {DeviceMeshIndex} index @param {string} baseUrl @param {string[]} ids @returns {Promise<Map<string, DeviceMeshModel>>}
 */
export async function loadDeviceMeshes(index, baseUrl, ids) {
  const loader = new THREE.TextureLoader(), out = new Map(), textures = new Map();
  /** @param {string} f @returns {Promise<THREE.Texture>} */
  const texture = (f) => {
    if (!textures.has(f)) textures.set(f, loader.loadAsync(new URL(f, baseUrl).href).then((t) => { t.colorSpace = THREE.SRGBColorSpace; return t; }));
    return textures.get(f);
  };
  await Promise.all([...new Set(ids)].filter((id) => Object.hasOwn(index.models, id)).map(async (id) => {
    const file = /** @type {DeviceMeshFile} */ (await fetch(new URL(index.models[id], baseUrl)).then((r) => r.json()));
    const parts = await Promise.all(file.parts.map(async (p) => ({
      level: p.level, geometry: partGeometry(p), material: new THREE.MeshBasicMaterial({ map: await texture(p.texture), side: THREE.DoubleSide, alphaTest: 0.5 }),
    })));
    out.set(id, { parts });
  }));
  return out;
}

/** A device's mesh object from its model, no part shown yet. @param {DeviceMeshModel} model @returns {DeviceMesh} */
export function newDeviceMesh(model) {
  const group = new THREE.Group();
  const meshes = model.parts.map((p) => { const m = new THREE.Mesh(p.geometry, p.material); m.userData.level = p.level; m.visible = false; group.add(m); return m; });
  return { group, meshes, level: -1 };
}

/**
 * The devices drawn as meshes (渲染-20) in a group: `draw` places a unit's mesh — made on first sight when its key has a
 * model — at its level and reports whether it drew one; `prune` drops those gone; `setLevels` takes the page's levels.
 * @param {THREE.Group} group @param {Map<string, DeviceMeshModel>} models @param {(id: number) => string} keyOf
 */
export function createMeshDrawer(group, models, keyOf) {
  /** @type {Map<number, DeviceMesh>} */
  const placed = new Map();
  /** @type {Map<number, number>} */
  const levels = new Map();
  return {
    placed,
    /** @param {{ id: number, kind: number }} u @param {boolean} device @param {[number, number, number]} at */
    draw(u, device, at) {
      let d = placed.get(u.id);
      const model = d || !device ? undefined : models.get(keyOf(u.id));
      if (!d && model) { d = newDeviceMesh(model); group.add(d.group); placed.set(u.id, d); }
      if (!d) return false;
      showLevel(d, levels.get(u.id) ?? 0);
      d.group.position.set(...at);
      return true;
    },
    /** @param {Set<number>} seen */
    prune(seen) { for (const [id, d] of placed) if (!seen.has(id)) { group.remove(d.group); placed.delete(id); } },
    /** @param {Record<string, number>} by */
    setLevels(by) { levels.clear(); for (const [id, l] of Object.entries(by)) levels.set(Number(id), l); },
  };
}

/** Shows the part of a level (the model's level 0 for a level it has no part of). @param {DeviceMesh} d @param {number} level */
export function showLevel(d, level) {
  const at = d.meshes.some((m) => m.userData.level === level) ? level : 0;
  if (d.level === at) return;
  d.level = at;
  for (const m of d.meshes) m.visible = m.userData.level === at;
}
