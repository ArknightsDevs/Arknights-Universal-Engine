// The direction indicator (docs/spec/render.md 渲染-14, 渲染-22): lying flat at an operator's feet, a ring and on it an
// arrow pointing the operator's facing. Every operator on the field has one; the operator being placed has one while
// its facing is chosen. Drawn after the shadows and before the units, depth-tested against the terrain without writing
// depth (ADR 0027); without the two textures there are none.
import * as THREE from 'three';
import { DIR } from '@aue/schema';

/**
 * The direction indicator: the ring's and the arrow's size in tiles (their textures are square), how far from the feet
 * the arrow's centre lies, their colours (r, g, b, a).
 */
export const INDICATOR = Object.freeze({ size: 0.704, out: 0.333, ring: Object.freeze([1, 1, 1, 0.502]), arrow: Object.freeze([1, 0.6, 0, 1]) });

/** The turn about the up axis that points east to a facing. @type {Record<number, number>} */
const TURN = { [DIR.RIGHT]: 0, [DIR.UP]: Math.PI / 2, [DIR.LEFT]: Math.PI, [DIR.DOWN]: -Math.PI / 2 };

const PLANE = new THREE.PlaneGeometry(INDICATOR.size, INDICATOR.size).rotateX(-Math.PI / 2);

/** A material for a flat square on the ground drawn with a texture in a colour. @param {THREE.Texture | undefined} map @param {readonly number[]} c */
const flatMaterial = (map, c) => new THREE.MeshBasicMaterial({
  map, color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace), transparent: true, opacity: c[3], depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
});

/**
 * Indicators by id: `place(id, at, dir)` lays one at feet `at` (three.js coordinates) pointing a facing (schema DIR),
 * `drop(id)` takes it away.
 * @param {THREE.Texture | undefined} ringMap 'ui:directionRing' @param {THREE.Texture | undefined} arrowMap 'ui:directionArrow'
 */
export function createIndicators(ringMap, arrowMap) {
  const group = new THREE.Group(), ringMat = flatMaterial(ringMap, INDICATOR.ring), arrowMat = flatMaterial(arrowMap, INDICATOR.arrow);
  /** @type {Map<number, { ring: THREE.Mesh, arrow: THREE.Mesh }>} */
  const shown = new Map();
  const mesh = (/** @type {THREE.Material} */ m, /** @type {number} */ order) => { const x = new THREE.Mesh(PLANE, m); x.renderOrder = order; group.add(x); return x; };
  return {
    object: group,
    /** @param {number} id @param {[number, number, number]} at @param {number} dir */
    place(id, at, dir) {
      if (!ringMap || !arrowMap) return;
      let x = shown.get(id);
      if (!x) { x = { ring: mesh(ringMat, -0.9), arrow: mesh(arrowMat, -0.8) }; shown.set(id, x); }
      const turn = TURN[dir] ?? 0;
      x.ring.position.set(...at);
      x.arrow.position.set(at[0] + INDICATOR.out * Math.cos(turn), at[1], at[2] - INDICATOR.out * Math.sin(turn));
      x.arrow.rotation.set(0, turn, 0);
    },
    /** @param {number} id */
    drop(id) {
      const x = shown.get(id);
      if (x) { group.remove(x.ring, x.arrow); shown.delete(id); }
    },
    count: () => shown.size,
    dispose() { ringMat.dispose(); arrowMat.dispose(); shown.clear(); },
  };
}
