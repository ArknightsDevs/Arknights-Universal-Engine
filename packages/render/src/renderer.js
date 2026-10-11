// The battle renderer (M0.5): a three.js scene of systems — terrain, units — under the official camera. The page owns
// the loop: it calls update() with each render state from the worker and render() once per animation frame.
import * as THREE from 'three';
import { applyPose, DEFAULT_VIEW } from './camera.js';
import { createTerrain } from './terrain.js';
import { createUnits } from './units.js';

/**
 * @typedef {object} RendererOptions
 * @property {HTMLCanvasElement} canvas
 * @property {import('./terrain.js').TerrainLevel} level
 * @property {Map<string, THREE.Texture>} textures keyed 'tile:<key>', 'avatar:<charId>', 'enemy:<enemyKey>'
 * @property {readonly number[]} [view] the level's camera view vector
 */

/** @param {RendererOptions} o */
export function createBattleRenderer(o) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color(0x404040);
  const terrain = createTerrain(o.level, o.textures), units = createUnits(o.textures);
  scene.add(terrain.object, units.object);
  const ray = new THREE.Raycaster();

  const resize = () => {
    const w = o.canvas.clientWidth, h = o.canvas.clientHeight;
    renderer.setPixelRatio(globalThis.devicePixelRatio || 1);
    renderer.setSize(w, h, false);
    applyPose(camera, o.view ?? DEFAULT_VIEW, w / Math.max(1, h));
  };
  resize();

  return {
    resize,
    /** @param {import('@aue/schema').View} view @param {Record<string, string>} keys */
    update: (view, keys) => units.update(view, keys, o.level),
    render: () => renderer.render(scene, camera),
    /** The tile under a point of the canvas, or null. @param {number} x @param {number} y client coordinates */
    pick(x, y) {
      const r = o.canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(terrain.object.children, false).find((/** @type {THREE.Intersection} */ h) => h.object.userData.col !== undefined);
      return hit ? { col: hit.object.userData.col, row: hit.object.userData.row } : null;
    },
    dispose() { terrain.dispose(); units.dispose(); renderer.dispose(); },
  };
}

/**
 * Loads the textures a manifest lists (relative to baseUrl), as sRGB.
 * @param {{ files: Record<string, { file: string }> }} manifest @param {string} baseUrl @returns {Promise<Map<string, THREE.Texture>>}
 */
export async function loadTextures(manifest, baseUrl) {
  const loader = new THREE.TextureLoader(), out = new Map();
  await Promise.all(Object.entries(manifest.files).map(async ([key, f]) => {
    const t = await loader.loadAsync(new URL(f.file, baseUrl).href);
    t.colorSpace = THREE.SRGBColorSpace;
    out.set(key, t);
  }));
  return out;
}
