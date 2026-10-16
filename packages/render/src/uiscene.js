// A UI screen's 3D scene (docs/spec/render.md 渲染-17): the screen's 3D nodes — their `t3` transforms, meshes, camera
// and light — drawn with three.js into a canvas behind the UI, following the UI's clips: a node's position curve (its
// `p3`), its active flag and a camera's field of view. Unity's left-handed space becomes three's right-handed one:
// (x, y, z) → (x, y, −z), rotations (x, y, z, w) → (−x, −y, z, w), triangles wound the other way. A world-space canvas
// among the nodes is the UI's to draw: `corners` says where its rectangle falls on the page.
import * as THREE from 'three';

/** @typedef {{ pos: number[], q: number[], scale: number[] }} T3 */
/**
 * A UI node as the UI keeps it (@aue/ui's UiNode, by shape): its pack node, children, active flag, and what clips set.
 * @typedef {{ n: { name: string, t3?: T3, comps: Record<string, any>, rt?: { size: number[], pivot: number[], scale: number[], pos: number[], q?: number[] } },
 *   kids: UiNode3[], active: boolean, p3?: number[] | null, fov?: number }} UiNode3
 */
/**
 * The meshes and materials of the scene (the assets' 3D index): meshes in Unity's space, the nodes drawing a built-in
 * primitive, materials with their texture files.
 * @typedef {{ meshes: Record<string, { position: number[], normal: number[], uv: number[], index: number[] }>, builtin: Record<string, string>,
 *   materials: Record<string, { map: string | null, emissiveMap: string | null, color: number[], emissive: number[], tint: number[] }> }} Scene3d
 */

/** A built-in sphere this large or larger around the scene is its sky (渲染-17). */
const SKY = 100;

/** Unity's position to three's. @param {number[]} p @returns {[number, number, number]} */
export const posOf = (p) => [p[0], p[1], -p[2]];
/** Unity's rotation to three's. @param {number[]} q @returns {[number, number, number, number]} */
export const quatOf = (q) => [-q[0], -q[1], q[2], q[3]];

/**
 * A mesh of the index as three's geometry: z negated, each triangle wound the other way (渲染-17).
 * @param {Scene3d['meshes'][string]} m @returns {THREE.BufferGeometry}
 */
export function meshGeometry(m) {
  const g = new THREE.BufferGeometry(), pos = m.position.slice(), nor = m.normal.slice();
  for (let i = 2; i < pos.length; i += 3) pos[i] = -pos[i];
  for (let i = 2; i < nor.length; i += 3) nor[i] = -nor[i];
  const index = m.index.slice();
  for (let i = 0; i + 2 < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor.length === pos.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (m.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
  g.setIndex(index);
  if (nor.length !== pos.length) g.computeVertexNormals();
  return g;
}

/** A built-in primitive: Unity's cube is 1 on a side, its sphere 1 across. @param {string} kind */
const primitive = (kind) => (kind === 'sphere' ? new THREE.SphereGeometry(0.5, 48, 24) : new THREE.BoxGeometry(1, 1, 1));

/**
 * A material of the index (渲染-17): lit by the scene's light, its colour times its tint, its emission map and colour.
 * @param {Scene3d['materials'][string]} m @param {(file: string) => THREE.Texture} tex @param {boolean} inside drawn from inside (a sky sphere)
 */
function materialOf(m, tex, inside) {
  const c = m.color.map((v, i) => v * (m.tint[i] ?? 1));
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(c[0], c[1], c[2]), side: inside ? THREE.BackSide : THREE.FrontSide,
    emissive: new THREE.Color(m.emissive[0], m.emissive[1], m.emissive[2]) });
  if (m.map) mat.map = tex(m.map);
  if (m.emissiveMap) mat.emissiveMap = tex(m.emissiveMap);
  return mat;
}

/** Places an object at a node's transform. @param {THREE.Object3D} o @param {T3} t */
function place(o, t) {
  o.position.set(...posOf(t.pos));
  o.quaternion.set(...quatOf(t.q));
  o.scale.set(t.scale[0], t.scale[1], t.scale[2]);
}

/**
 * The three objects of a node and its subtree; the camera and the 3D nodes it maps are collected.
 * @param {UiNode3} u @param {{ scene: Scene3d, tex: (file: string) => THREE.Texture, nodes: Map<UiNode3, THREE.Object3D>, cameras: { node: UiNode3, cam: THREE.PerspectiveCamera }[], sky?: number[] }} b
 */
function build(u, b) {
  const o = new THREE.Group();
  o.name = u.n.name;
  if (u.n.t3) place(o, u.n.t3);
  b.nodes.set(u, o);
  const c = u.n.comps;
  if (c.mesh) addMesh(o, u.n.name, c.mesh, b);
  if (c.camera && !c.camera.ortho) {
    // Unity's camera looks along its local +z, which the mirrored space turns into −z: three's camera as it is
    const cam = new THREE.PerspectiveCamera(c.camera.fov, 16 / 9, c.camera.near, c.camera.far);
    o.add(cam);
    b.cameras.push({ node: u, cam });
  }
  if (c.light) {
    const l = new THREE.DirectionalLight(new THREE.Color(c.light.color[0], c.light.color[1], c.light.color[2]), c.light.intensity * Math.PI);
    // it shines along the node's forward: Unity's local +z, the mirrored −z; Unity's intensity lights a white face
    // facing it fully, which three's (physical units) does at π times as much
    l.position.set(0, 0, 0);
    l.target.position.set(0, 0, -1);
    o.add(l, l.target);
  }
  for (const k of u.kids) if (k.n.t3) o.add(build(k, b));
  return o;
}

/** @param {THREE.Group} o @param {string} name @param {{ mesh: string | null, materials: string[] }} m @param {Parameters<typeof build>[1]} b */
function addMesh(o, name, m, b) {
  const kind = m.mesh ? null : b.scene.builtin[name];
  const def = b.scene.materials[m.materials[0] ?? ''];
  // a sky: a built-in sphere around the whole scene, untextured — its colour is the background behind the ground
  if (kind === 'sphere' && def && !def.map && Math.min(...(o.scale.toArray())) >= SKY) { b.sky = def.color.slice(0, 3).map((v, i) => v * (def.tint[i] ?? 1)); return; }
  const geo = m.mesh && b.scene.meshes[m.mesh] ? meshGeometry(b.scene.meshes[m.mesh]) : kind ? primitive(kind) : null;
  if (!geo || !def) return;
  o.add(new THREE.Mesh(geo, materialOf(def, b.tex, kind === 'sphere')));
}

/** A node and its ancestors up to the root are active. @param {UiNode3} u @param {Map<UiNode3, UiNode3>} up */
function shown(u, up) {
  for (let x = /** @type {UiNode3 | undefined} */ (u); x; x = up.get(x)) if (!x.active) return false;
  return true;
}

/**
 * Where a world-space canvas's rectangle falls on the page (渲染-17): its corners top-left, top-right, bottom-right,
 * bottom-left as page pixels of a view w × h, or null when one is behind the camera.
 * @param {THREE.Object3D} parent the canvas's parent object @param {NonNullable<UiNode3['n']['rt']>} rt
 * @param {THREE.Camera} cam @param {number} w @param {number} h @returns {number[][] | null}
 */
export function canvasCorners(parent, rt, cam, w, h) {
  const o = new THREE.Object3D();
  o.position.set(...posOf([rt.pos[0], rt.pos[1], 0]));
  if (rt.q) o.quaternion.set(...quatOf(rt.q));
  o.scale.set(rt.scale[0], rt.scale[1], 1);
  parent.add(o);
  o.updateWorldMatrix(true, false);
  const [sw, sh] = rt.size, [px, py] = rt.pivot, out = [];
  for (const [x, y] of [[0, sh], [sw, sh], [sw, 0], [0, 0]]) {
    const p = new THREE.Vector3(x - px * sw, y - py * sh, 0).applyMatrix4(o.matrixWorld).project(cam);
    if (p.z > 1 || p.z < -1) { parent.remove(o); return null; }
    out.push([(p.x + 1) / 2 * w, (1 - p.y) / 2 * h]);
  }
  parent.remove(o);
  return out;
}

/**
 * A world-space canvas's plane on the page (渲染-17): the projective map (row-major 3 × 3) from its pixels — x from its
 * left, y down from its top — to page pixels of a view [w, h], and the part of its plane in front of the camera's near
 * plane as a polygon of its pixels (none when it is all behind), so a canvas the camera comes down close to still
 * shows where it can be seen. The polygon reaches `pad` times the canvas's size past each edge: what the canvas holds
 * may overflow it. The map's scale is kept positive where the canvas is in front.
 * @param {THREE.Object3D} parent the canvas's parent object @param {NonNullable<UiNode3['n']['rt']>} rt
 * @param {THREE.Camera} cam @param {number[]} view @param {number} [pad]
 * @returns {{ H: number[], clip: number[][] }}
 */
export function canvasPlane(parent, rt, cam, view, pad = 0) {
  const [w, h] = view;
  const o = new THREE.Object3D();
  o.position.set(...posOf([rt.pos[0], rt.pos[1], 0]));
  if (rt.q) o.quaternion.set(...quatOf(rt.q));
  o.scale.set(rt.scale[0], rt.scale[1], 1);
  parent.add(o);
  o.updateWorldMatrix(true, false);
  cam.updateMatrixWorld();
  const e = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(o.matrixWorld).elements;
  parent.remove(o);
  const [sw, sh] = rt.size, [px, py] = rt.pivot, ax = -px * sw, ay = sh * (1 - py);
  // a clip coordinate as a function of the canvas pixel (x, y): the object point is (x + ax, ay − y, 0)
  const row = (/** @type {number} */ r) => [e[r], -e[4 + r], e[r] * ax + e[4 + r] * ay + e[12 + r]];
  const X = row(0), Y = row(1), Z = row(2), W = row(3);
  const H = [...X.map((v, i) => (v + W[i]) * w / 2), ...W.map((v, i) => (v - Y[i]) * h / 2), ...W];
  // in front of the near plane: z + w > 0 (a little margin), the rectangle clipped to it
  const f = (/** @type {number[]} */ p) => (Z[0] + W[0]) * p[0] + (Z[1] + W[1]) * p[1] + Z[2] + W[2] - 1e-4;
  const x0 = -pad * sw, y0 = -pad * sh, x1 = (1 + pad) * sw, y1 = (1 + pad) * sh;
  const rect = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], clip = [];
  for (let i = 0; i < 4; i++) {
    const a = rect[i], b = rect[(i + 1) % 4], fa = f(a), fb = f(b);
    if (fa >= 0) clip.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); clip.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return { H, clip };
}

/**
 * The root of an effect at a point of a world-space canvas (渲染-18): (x, y) in the canvas's pixels from its top left,
 * the effect's unit `s` canvas pixels; its axes the canvas's (x right, y up, z into it: Unity's local +z).
 * @param {THREE.Object3D} parent the canvas's parent object @param {NonNullable<UiNode3['n']['rt']>} rt @param {number} x @param {number} y @param {number} s
 * @returns {import('./fx/geometry.js').Root}
 */
export function canvasRoot(parent, rt, x, y, s) {
  const o = new THREE.Object3D();
  o.position.set(...posOf([rt.pos[0], rt.pos[1], 0]));
  if (rt.q) o.quaternion.set(...quatOf(rt.q));
  // a canvas's scale along its depth is not in the pack: as its x (canvases are scaled alike in every axis)
  o.scale.set(rt.scale[0], rt.scale[1], rt.scale[0]);
  parent.add(o);
  o.updateWorldMatrix(true, false);
  const [sw, sh] = rt.size, [px, py] = rt.pivot, m = o.matrixWorld;
  const at = new THREE.Vector3(x - px * sw, sh - y - py * sh, 0).applyMatrix4(m);
  // a unit step along each of the canvas's axes, in the world (its scale kept), times the effect's unit
  const zero = new THREE.Vector3(0, 0, 0).applyMatrix4(m);
  const axis = (/** @type {number[]} */ v) => new THREE.Vector3(...v).applyMatrix4(m).sub(zero).multiplyScalar(s).toArray();
  parent.remove(o);
  // Unity's local +z (into the canvas, away from its front) is three's local −z, mirrored
  return { o: at.toArray(), ex: axis([1, 0, 0]), ey: axis([0, 1, 0]), ez: axis([0, 0, -1]) };
}

/**
 * The 3D scene of a UI screen's subtree (渲染-17).
 * @param {{ canvas: HTMLCanvasElement, root: UiNode3, scene: Scene3d, base: string, renderer?: THREE.WebGLRenderer }} o
 */
export function createUiScene(o) {
  const scene = new THREE.Scene(), loader = new THREE.TextureLoader(), textures = new Map();
  const tex = (/** @type {string} */ f) => {
    if (!textures.has(f)) { const t = loader.load(new URL(f, o.base).href); t.colorSpace = THREE.SRGBColorSpace; textures.set(f, t); }
    return textures.get(f);
  };
  /** @type {Parameters<typeof build>[1]} */
  const b = { scene: o.scene, tex, nodes: new Map(), cameras: [] };
  scene.add(build(o.root, b), new THREE.AmbientLight(0xffffff, 0.6));
  /** @type {Map<UiNode3, UiNode3>} */
  const up = new Map();
  const link = (/** @type {UiNode3} */ u) => { for (const k of u.kids) { up.set(k, u); link(k); } };
  link(o.root);
  const view = b.cameras[0] ?? null;
  const renderer = o.renderer ?? new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  let w = 1, h = 1;
  /** The clips' state onto the objects. */
  const sync = () => {
    for (const [u, obj] of b.nodes) {
      obj.visible = u.active;
      if (u.p3) obj.position.set(...posOf(u.p3));
    }
    if (view) {
      const fov = view.node.fov ?? view.node.n.comps.camera.fov;
      if (view.cam.fov !== fov || view.cam.aspect !== w / h) { view.cam.fov = fov; view.cam.aspect = w / h; view.cam.updateProjectionMatrix(); }
    }
    scene.updateMatrixWorld(true);
  };
  return {
    /** The sky's colour (r, g, b in 0–1) for the page to show behind the ground, or null. */
    get background() { return b.sky ?? null; },
    /** The camera the scene is seen through, or null. */
    get camera() { return view?.cam ?? null; },
    /** The three.js scene (for the UI's effects on its world-space canvas, 渲染-18). */
    scene,
    /** An effect's root at a point of a world-space canvas node (canvasRoot), or null. @param {UiNode3} u @param {number} x @param {number} y @param {number} s */
    canvasRoot(u, x, y, s) {
      const parent = up.get(u), obj = parent ? b.nodes.get(parent) : undefined;
      return obj && u.n.rt ? canvasRoot(obj, u.n.rt, x, y, s) : null;
    },
    /** The canvas's size in CSS pixels. @param {number} width @param {number} height @param {number} [ratio] */
    resize(width, height, ratio = 1) { w = Math.max(1, width); h = Math.max(1, height); renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); },
    /** Draws the scene as the UI's clips have it now, if its camera's node is shown. */
    render() {
      sync();
      if (view && shown(view.node, up)) renderer.render(scene, view.cam);
    },
    /** Where a world-space canvas node falls on the page (corners as canvasCorners). @param {UiNode3} u */
    corners(u) {
      const parent = up.get(u), obj = parent ? b.nodes.get(parent) : undefined;
      return obj && u.n.rt && view ? canvasCorners(obj, u.n.rt, view.cam, w, h) : null;
    },
    /** A world-space canvas node's plane on the page (as canvasPlane), or null. @param {UiNode3} u @param {number} [pad] */
    plane(u, pad) {
      const parent = up.get(u), obj = parent ? b.nodes.get(parent) : undefined;
      return obj && u.n.rt && view ? canvasPlane(obj, u.n.rt, view.cam, [w, h], pad) : null;
    },
    dispose() { renderer.dispose(); for (const t of textures.values()) t.dispose(); },
  };
}
