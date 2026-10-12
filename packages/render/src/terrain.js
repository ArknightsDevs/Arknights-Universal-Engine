// The terrain system: one textured top per tile at its height, high ground with side faces. Every tile key must have a
// texture — nothing untextured is drawn (the caller checks the textures before building).
import * as THREE from 'three';
import { toThree, tileWorld, STEP_HEIGHT } from './camera.js';

/** @typedef {{ width: number, height: number, tiles: { key: string, height: string }[][] }} TerrainLevel */

/** The tile keys a level needs textures for. @param {TerrainLevel} level @returns {string[]} */
export function tileKeys(level) {
  return [...new Set(level.tiles.flat().map((t) => t.key))].sort();
}

/** @param {THREE.Texture} map @param {number} shade */
const material = (map, shade) => new THREE.MeshBasicMaterial({ map, color: new THREE.Color(shade, shade, shade) });

/**
 * @param {TerrainLevel} level @param {Map<string, THREE.Texture>} textures keyed 'tile:<tileKey>'
 * @param {(m: THREE.Material) => void} [patch] applied to every material (the tile highlight, 渲染-8)
 * @returns {{ object: THREE.Group, dispose(): void }}
 */
export function createTerrain(level, textures, patch = () => {}) {
  const group = new THREE.Group(), top = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const side = new THREE.BoxGeometry(1, STEP_HEIGHT, 1).translate(0, -STEP_HEIGHT / 2, 0);
  /** @type {Map<string, THREE.Material[]>} */
  const mats = new Map();
  for (const key of tileKeys(level)) {
    const map = textures.get(`tile:${key}`);
    if (!map) throw new Error(`no texture for tile ${key}`);
    const pair = [material(map, 1), material(map, 0.55)];
    pair.forEach(patch);
    mats.set(key, pair);
  }
  level.tiles.forEach((cols, row) => cols.forEach((t, col) => {
    const hl = t.height === 'HIGHLAND' ? 1 : 0, [m, dark] = /** @type {THREE.Material[]} */ (mats.get(t.key));
    const at = toThree(tileWorld(level, col, row, hl));
    const mesh = new THREE.Mesh(top, m);
    mesh.position.set(...at);
    mesh.userData = { col, row };
    group.add(mesh);
    if (hl) { const box = new THREE.Mesh(side, dark); box.position.set(...at); group.add(box); }
  }));
  return {
    object: group,
    dispose() { top.dispose(); side.dispose(); for (const list of mats.values()) for (const m of list) m.dispose(); },
  };
}
