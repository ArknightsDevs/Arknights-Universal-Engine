// The battle renderer: a three.js scene of systems — terrain, units (Spine figures or cards) — under the official
// camera, then the overlays (HP and SP bars) over it with the depth cleared (ADR 0027). The page owns the loop: it
// calls update() with each render state from the worker and render() once per animation frame.
import * as THREE from 'three';
import { applyPose, DEFAULT_VIEW } from './camera.js';
import { createTerrain } from './terrain.js';
import { createUnits } from './units.js';
import { createOverlays } from './overlays.js';
import { spineModel } from './spine.js';

/**
 * @typedef {object} RendererOptions
 * @property {HTMLCanvasElement} canvas
 * @property {import('./terrain.js').TerrainLevel} level
 * @property {Map<string, THREE.Texture>} textures keyed 'tile:<key>', 'avatar:<charId>', 'enemy:<enemyKey>', 'ui:bar'
 * @property {readonly number[]} [view] the level's camera view vector
 * @property {import('./units.js').Models} [models] Spine models by content key (operators by character id)
 * @property {Set<string>} [leaders] content keys of leader enemies (red HP bars)
 */

/** @param {RendererOptions} o */
export function createBattleRenderer(o) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true });
  renderer.autoClear = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color(0x404040);
  const terrain = createTerrain(o.level, o.textures), units = createUnits(o.textures, o.models);
  scene.add(terrain.object, units.object);
  const overlays = createOverlays(o.textures, o.leaders);
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
    /**
     * @param {import('@aue/schema').View} view @param {Record<string, string>} keys content keys of units (at least of those
     *   not given before)
     * @param {Record<string, string | number>[]} [events] the frame's presentation events
     */
    update(view, keys, events = []) {
      units.update(view, keys, o.level, performance.now(), events);
      overlays.update(view, keys, o.level, units.shows);
    },
    render() {
      units.pose(camera);
      overlays.pose(camera);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.clearDepth();
      renderer.render(overlays.scene, camera);
    },
    /** The tile under a point of the canvas, or null. @param {number} x @param {number} y client coordinates */
    pick(x, y) {
      const r = o.canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(terrain.object.children, false).find((/** @type {THREE.Intersection} */ h) => h.object.userData.col !== undefined);
      return hit ? { col: hit.object.userData.col, row: hit.object.userData.row } : null;
    },
    dispose() { terrain.dispose(); units.dispose(); overlays.dispose(); renderer.dispose(); },
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

/**
 * @typedef {{ version: number, models: Record<string, Record<string, { skel: string, atlas: string, pages: Record<string, string>, pma: boolean }>> }} SpineIndex
 */

/**
 * Loads the Spine models a list of content keys needs from a model index (paths relative to baseUrl); keys the index
 * does not have are left out.
 * @param {SpineIndex} index @param {string} baseUrl @param {string[]} ids @returns {Promise<import('./units.js').Models>}
 */
export async function loadSpineModels(index, baseUrl, ids) {
  const loader = new THREE.TextureLoader(), out = /** @type {import('./units.js').Models} */ (new Map());
  const url = (/** @type {string} */ f) => new URL(f, baseUrl).href;
  await Promise.all([...new Set(ids)].filter((id) => index.models[id]).map(async (id) => {
    /** @type {Record<string, import('./spine.js').SpineModel>} */
    const sides = {};
    for (const [side, m] of Object.entries(index.models[id])) {
      const [skel, atlas] = await Promise.all([fetch(url(m.skel)).then((r) => r.arrayBuffer()), fetch(url(m.atlas)).then((r) => r.text())]);
      const pages = new Map(await Promise.all(Object.entries(m.pages).map(async ([name, file]) => /** @type {[string, THREE.Texture]} */ ([name, await loader.loadAsync(url(file))]))));
      sides[side] = spineModel(new Uint8Array(skel), atlas, pages, m.pma);
    }
    out.set(id, sides);
  }));
  return out;
}
