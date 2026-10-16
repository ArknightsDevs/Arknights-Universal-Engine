// A UI's particle effects (docs/spec/render.md 渲染-18): the effect pack's effects (the battle's player, 渲染-10) at
// places of a UI — on a page, through an orthographic camera over the page (one unit a CSS pixel), or on a UI's 3D
// scene's world-space canvas (渲染-17) — following their nodes as the page moves them. The effects' own axes are the
// UI's: x right, y up, z into the canvas; their mesh particles' own z the other way (a figure stands up from a canvas
// lying on the ground while a system placed at negative z floats above it).
import * as THREE from 'three';
import { FxInstance } from './fx/player.js';
import { cameraAxes } from './effects.js';

/** @typedef {import('./fx/geometry.js').Root} Root */

/** At most this many seconds of an effect simulated before it shows, in steps of PREWARM_STEP (渲染-18). */
export const PREWARM = 45, PREWARM_STEP = 0.1;

/**
 * A root's scale (its x axis's length) and the root at unit scale: the player sizes its particles in world units, so
 * an effect's scale goes on its group and its root is divided by it (渲染-18). @param {Root} r
 */
export function unitRoot(r) {
  const k = Math.hypot(r.ex[0], r.ex[1], r.ex[2]) || 1, d = (/** @type {number[]} */ v) => v.map((x) => x / k);
  return { k, root: { o: d(r.o), ex: d(r.ex), ey: d(r.ey), ez: d(r.ez) } };
}

/**
 * The root of an effect at a point of a page (CSS pixels from the top left), the effect's unit `s` pixels: three's
 * x right, y up (the page's y turned), z toward the viewer.
 * @param {number} x @param {number} y @param {number} s @returns {Root}
 */
export const pageRoot = (x, y, s) => ({ o: [x, -y, 0], ex: [s, 0, 0], ey: [0, s, 0], ez: [0, 0, -s] });

/** A playing effect: its instance, whether it is gone, the page rectangle it is clipped to. @typedef {{ inst: FxInstance, done: boolean, clip: number[] | null }} Live */

/**
 * Draws a page layer: the unclipped effects at once, then each clipped one inside its rectangle (渲染-18).
 * @param {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera }} own @param {Set<Live>} live
 */
function drawPage(own, live) {
  const r = own.renderer, clipped = [...live].filter((h) => h.clip);
  if (!clipped.length) { r.render(own.scene, own.camera); return; }
  for (const h of clipped) h.inst.group.visible = false;
  r.render(own.scene, own.camera);
  r.autoClear = false;
  const shown = [...live].filter((h) => !h.clip && h.inst.group.visible);
  for (const h of shown) h.inst.group.visible = false;
  r.setScissorTest(true);
  for (const h of clipped) {
    const [x, y, w, hh] = /** @type {number[]} */ (h.clip);
    h.inst.group.visible = true;
    r.setScissor(x, r.domElement.clientHeight - y - hh, w, hh);
    r.render(own.scene, own.camera);
    h.inst.group.visible = false;
  }
  r.setScissorTest(false);
  r.autoClear = true;
  for (const h of [...shown, ...clipped]) h.inst.group.visible = true;
  };

/** An effect's scale and its parts' world boxes of drawn vertices (a batch's unused ones sit at the origin). @param {Live} h */
function inspectOf(h) {
  return { k: h.inst.group.scale.x, sz: h.inst.sysAt.map((x) => (x ? Math.round(x.sz * 100) / 100 : null)), ui: h.inst.uiScale, parts: h.inst.group.children.map((m) => {
    const g = /** @type {THREE.Mesh} */ (m).geometry, pos = g?.getAttribute('position'), box = new THREE.Box3(), v = new THREE.Vector3();
    for (let i = 0; pos && i < (g.drawRange.count === Infinity ? pos.count : Math.min(pos.count, g.drawRange.count)); i++) {
      v.fromBufferAttribute(pos, i);
      if (v.x || v.y || v.z) box.expandByPoint(v.applyMatrix4(m.matrixWorld));
    }
    return box.isEmpty() ? null : { min: box.min.toArray().map(Math.round), max: box.max.toArray().map(Math.round) };
  }).filter(Boolean) };
}

/**
 * The effects of a UI.
 * @param {{ pack: { data: any, textures: Map<string, THREE.Texture> }, canvas?: HTMLCanvasElement, scene?: THREE.Object3D, camera?: () => THREE.Camera | null }} o
 *   with a canvas: drawn there through an orthographic page camera; else into a scene, seen through its camera
 */
export function createUiFx(o) {
  const own = o.canvas ? { renderer: new THREE.WebGLRenderer({ canvas: o.canvas, alpha: true, antialias: true }), scene: new THREE.Scene(),
    camera: new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000) } : null;
  own?.renderer.setClearColor(0x000000, 0);
  const into = own ? own.scene : /** @type {THREE.Object3D} */ (o.scene);
  const cam = () => (own ? own.camera : o.camera?.() ?? null);
  /** @type {Set<Live>} */
  const live = new Set();
  return {
    /** Whether the pack has an effect. @param {string} key */
    has: (key) => !!o.pack.data.fx[key],
    /**
     * Plays an effect at a root; the handle moves it, stops it (its particles finish), or removes it at once. `scale`:
     * the UI particle component's. A system scaled by its own transform only (local or shape scaling) is not scaled
     * by the root's scale: its sizes are divided back by it. @param {string} key @param {Root} root @param {number} [scale]
     */
    play(key, root, scale = 1) {
      const e = o.pack.data.fx[key];
      if (!e) return null;
      // a UI's effects loop until their node goes (the player's 'loop' kind: no time cap)
      const u = unitRoot(root);
      /** @type {Live} */
      const h = { inst: new FxInstance(e, u.root, { kind: 'loop', tex: o.pack.textures, flipMeshZ: true, uiScale: scale / u.k }), done: false, clip: null };
      h.inst.group.scale.setScalar(u.k);
      // a looping effect is already running when it shows: one cycle simulated first (up to PREWARM seconds); one that
      // plays once (a title's) starts as it shows
      const loops = (e.ps ?? []).some((/** @type {any} */ p) => p.loop);
      for (let t = 0; loops && t < Math.min(PREWARM, e.d ?? 0); t += PREWARM_STEP) h.inst.step(PREWARM_STEP);
      into.add(h.inst.group);
      live.add(h);
      return {
        /** @param {Root} r */ move: (r) => { const m = unitRoot(r); Object.assign(h.inst.R, m.root); h.inst.group.scale.setScalar(m.k); },
        /** Drawn only inside a rectangle of the page (CSS pixels x, y, w, h; null: anywhere), as a mask clips it. @param {number[] | null} r */
        clip: (r) => { h.clip = r; },
        stop: () => h.inst.stop(),
        remove: () => { if (!h.done) { live.delete(h); into.remove(h.inst.group); h.inst.dispose(); h.done = true; } },
        /** Whether it has finished (its particles all gone) or was removed. */
        get done() { return h.done; },
      };
    },
    /** The page's size in CSS pixels (an own canvas). @param {number} w @param {number} h @param {number} [ratio] */
    resize(w, h, ratio = 1) {
      if (!own) return;
      Object.assign(own.camera, { left: 0, right: w, top: 0, bottom: -h });
      own.camera.updateProjectionMatrix();
      own.renderer.setPixelRatio(ratio);
      own.renderer.setSize(w, h, false);
    },
    /** Advances the effects by dt seconds and draws them (an own canvas: renders it). @param {number} dt */
    frame(dt) {
      const c = cam();
      if (!c) return;
      c.updateMatrixWorld();
      const axes = cameraAxes(c);
      for (const h of live) {
        h.inst.step(dt);
        h.inst.draw(axes);
        if (h.inst.done) { live.delete(h); into.remove(h.inst.group); h.inst.dispose(); h.done = true; }
      }
      if (own) drawPage(own, live);
    },
    /** How many play now (for tests). */
    get count() { return live.size; },
    /** Each playing effect's scale and the world box of its drawn vertices, for tests and checking. */
    inspect: () => [...live].map(inspectOf),
    dispose() {
      for (const h of live) { into.remove(h.inst.group); h.inst.dispose(); }
      live.clear();
      own?.renderer.dispose();
    },
  };
}
