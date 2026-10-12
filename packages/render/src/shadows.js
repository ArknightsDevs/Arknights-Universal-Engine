// The shadows under units (docs/spec/render.md 渲染-6): the shadow texture lying flat on the ground at each drawn unit's
// height, a little south of its feet, half transparent. Shadows are drawn before every unit (render order −1) and are
// depth-tested against the terrain without writing depth (ADR 0027); without the texture there are none.
import * as THREE from 'three';

/** The shadow (渲染-6): its size in tiles (east–west, north–south), how far south of the feet it lies, its opacity. */
export const SHADOW = Object.freeze({ width: 0.608, depth: 0.194, south: 0.17, opacity: 0.502 });

/** @typedef {[number, number, number]} Vec3 */

/** @param {THREE.Texture | undefined} map the texture 'ui:shadow' */
export function createShadows(map) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(SHADOW.width, SHADOW.depth).rotateX(-Math.PI / 2);
  // pulled towards the camera so it does not fight with the tile top it lies on
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: SHADOW.opacity, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  /** @type {Map<number, THREE.Mesh>} */
  const meshes = new Map();

  return {
    object: group,
    /** A unit's shadow for its feet at `at` (three.js coordinates). @param {number} id @param {Vec3} at */
    place(id, at) {
      if (!map) return;
      let m = meshes.get(id);
      if (!m) { m = new THREE.Mesh(geometry, material); m.renderOrder = -1; group.add(m); meshes.set(id, m); }
      m.position.set(at[0], at[1], at[2] + SHADOW.south);
    },
    /** @param {number} id */
    drop(id) {
      const m = meshes.get(id);
      if (m) { group.remove(m); meshes.delete(id); }
    },
    count: () => meshes.size,
    dispose() { geometry.dispose(); material.dispose(); meshes.clear(); },
  };
}
