// The battle renderer: a three.js scene of systems — terrain (a map theme's tile kit, or flat textures), the units'
// shadows, units (Spine figures or cards), the attack effects — under the official camera, then the overlays (HP and SP
// bars) over it with the depth cleared (ADR 0027). The page owns the loop: it calls update() with each render state
// from the worker and render() once per animation frame.
import * as THREE from 'three';
import { applyPose, DEFAULT_VIEW } from './camera.js';
import { createTerrain } from './terrain.js';
import { createKitTerrain } from './kit.js';
import { createHighlight } from './highlight.js';
import { createRange } from './range.js';
import { createEffects } from './effects.js';
import { FPS } from './figure.js';
import { createUnits } from './units.js';
import { createOverlays } from './overlays.js';
import { spineModel } from './spine.js';

/**
 * @typedef {object} RendererOptions
 * @property {HTMLCanvasElement} canvas
 * @property {import('./terrain.js').TerrainLevel} level
 * @property {Map<string, THREE.Texture>} textures keyed 'tile:<key>', 'avatar:<charId>', 'enemy:<enemyKey>', 'ui:bar', 'ui:shadow',
 *   'ui:range'
 * @property {readonly number[]} [view] the level's camera view vector
 * @property {import('./units.js').Models} [models] Spine models by content key (operators by character id)
 * @property {Set<string>} [leaders] content keys of leader enemies (red HP bars)
 * @property {import('./kit.js').LoadedKit | null} [kit] the map theme's tile kit (渲染-7); without one the tiles are flat
 *   textures
 * @property {import('./fx/player.js').FxPack | null} [effects] the units' attack effects (渲染-10, 渲染-11); none without
 */

/** Battle time from the frames the renderer is given: 30 a second, interpolated up to a frame past the last. */
function battleClock() {
  let frame = 0, at = 0, last = -1;
  return {
    /** @param {number} f @param {number} now ms */
    seen(f, now) { frame = f; at = now; },
    /** Battle seconds since the last call (0 to 0.1). @param {number} now ms */
    delta(now) {
      const f = frame + Math.min(1, Math.max(0, ((now - at) * FPS) / 1000)), d = last < 0 ? 0 : (f - last) / FPS;
      last = f;
      return Math.min(0.1, Math.max(0, d));
    },
  };
}

/** @param {RendererOptions} o */
export function createBattleRenderer(o) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true });
  renderer.autoClear = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color(0x404040);
  const highlight = createHighlight(o.level), patch = highlight.patch;
  const terrain = o.kit ? createKitTerrain(o.level, o.kit, o.textures, patch) : createTerrain(o.level, o.textures, patch);
  const units = createUnits(o.textures, o.models), field = { ...o.level, highland: o.kit?.kit.highland };
  const range = createRange(field, o.textures.get('ui:range')), effects = o.effects ? createEffects(o.effects, field) : null, clock = battleClock();
  scene.add(terrain.object, range.object, units.shadows, units.object, ...(effects ? [effects.object] : []));
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
      units.update(view, keys, field, performance.now(), events);
      overlays.update(view, keys, field, units.shows);
      clock.seen(view.frame, performance.now());
      effects?.update(view, keys, events);
    },
    /** Highlights the tiles (keys row × width + col) the selected operator can be deployed on (渲染-8); null for none. @param {Iterable<number> | null} keys */
    highlight: (keys) => highlight.set(keys),
    /** Shows an attack range (渲染-9): tile keys, healing or not; null for none. @param {Iterable<number> | null} keys @param {boolean} [heal] */
    range: (keys, heal) => range.show(keys, heal),
    render() {
      range.tick(performance.now() / 1000);
      units.pose(camera);
      overlays.pose(camera);
      effects?.step(clock.delta(performance.now()), camera);
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
    dispose() { terrain.dispose(); range.dispose(); highlight.dispose(); units.dispose(); overlays.dispose(); effects?.dispose(); renderer.dispose(); },
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
 * The tile kits of the assets (渲染-7): per theme its kit file, the default theme and the themes of particular levels.
 * @typedef {{ version: number, default: string, levels?: Record<string, string>, kits: Record<string, string> }} KitIndex
 */

/**
 * Loads the tile kit a level uses (渲染-7) — the index's theme for the level, else the default — with its textures
 * (sRGB, repeating); paths relative to baseUrl. Null when the index names no kit for it.
 * @param {KitIndex} index @param {string} baseUrl @param {string} levelId @returns {Promise<import('./kit.js').LoadedKit | null>}
 */
export async function loadTileKit(index, baseUrl, levelId) {
  const path = index.kits[index.levels?.[levelId] ?? index.default];
  if (!path) return null;
  const url = new URL(path, baseUrl), kit = /** @type {import('./kit.js').TileKit} */ (await fetch(url).then((r) => r.json()));
  const loader = new THREE.TextureLoader(), textures = new Map();
  const files = new Set(kit.materials.flatMap((m) => [m.map, m.emissiveMap]).filter((f) => f !== null));
  await Promise.all([...files].map(async (f) => {
    const t = await loader.loadAsync(new URL(/** @type {string} */ (f), url).href);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    textures.set(f, t);
  }));
  return { kit, textures };
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
