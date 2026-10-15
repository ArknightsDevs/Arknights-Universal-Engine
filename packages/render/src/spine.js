// Spine figures (ADR 0028; docs/spec/render.md 渲染-1, 渲染-2; docs/spec/spine.md 骨骼-16): a skeleton posed by
// @aue/spine each frame, its batches uploaded to one dynamic geometry with a material per atlas page and blend mode.
// The figure stands at its feet facing the camera; its depth is that of an upright pole at its feet (ADR 0027), so
// terrain hides it and figures never cut each other.
import * as THREE from 'three';
import { newPose, setupPose, applyAnimation, updateOrder, updateWorld, drawList, readSkeleton, readAtlas, animationTimes } from '@aue/spine';

/** @typedef {import('@aue/spine').Skeleton} Skeleton @typedef {import('@aue/spine').Atlas} Atlas */
/**
 * A Spine model; `scale` multiplies its drawn size across and up (渲染-2: a battle prefab's own scale over the standard).
 * @typedef {{ skeleton: Skeleton, atlas: Atlas, textures: THREE.Texture[], pma: boolean, scale?: [number, number] }} SpineModel
 */

/** Tiles per skeleton unit (渲染-2): the skeleton data's 0.01 × the battle prefab's 0.27. */
export const SKELETON_SCALE = 0.01 * 0.27;

/** The blend factors of a blend mode (骨骼-16): normal, additive, multiply, screen; premultiplied or straight textures. @param {number} mode @param {boolean} pma */
export function blendFactors(mode, pma) {
  if (mode === 2) return { src: THREE.DstColorFactor, dst: THREE.OneMinusSrcAlphaFactor };
  if (mode === 3) return { src: THREE.OneFactor, dst: THREE.OneMinusSrcColorFactor };
  return { src: pma ? THREE.OneFactor : THREE.SrcAlphaFactor, dst: mode === 1 ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor };
}

const VERTEX = `
attribute vec4 light;
attribute vec4 dark;
varying vec2 vUv;
varying vec4 vLight;
varying vec4 vDark;
void main() {
  vUv = uv;
  vLight = light;
  vDark = dark;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  // depth of the same height on an upright pole at the feet (ADR 0027)
  vec3 feet = modelMatrix[3].xyz;
  vec3 across = (modelMatrix * vec4(position.x, 0.0, 0.0, 0.0)).xyz;
  float up = length((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz) * position.y;
  vec4 pole = projectionMatrix * viewMatrix * vec4(feet + across + vec3(0.0, up, 0.0), 1.0);
  gl_Position.z = pole.z / pole.w * gl_Position.w;
}`;

const FRAGMENT = `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vLight;
varying vec4 vDark;
void main() {
  vec4 tex = texture2D(map, vUv);
  gl_FragColor.a = tex.a * vLight.a;
  gl_FragColor.rgb = ((tex.a - 1.0) * vDark.a + 1.0 - tex.rgb) * vDark.rgb + tex.rgb * vLight.rgb;
}`;

/** A material for one atlas page and blend mode. @param {THREE.Texture} map @param {number} mode @param {boolean} pma */
function material(map, mode, pma) {
  const f = blendFactors(mode, pma);
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map } }, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: f.src, blendDst: f.dst, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

/**
 * The geometry arrays of a list of batches (渲染-2): positions in tiles (x mirrored when flipped), UVs, colors,
 * indices, and one group per batch.
 * @param {import('@aue/spine').Batch[]} batches @param {number | [number, number]} scale tiles a skeleton unit (across, up)
 * @param {boolean} flip
 */
export function figureArrays(batches, scale, flip) {
  const [sx, sy] = typeof scale === 'number' ? [scale, scale] : scale;
  const n = batches.reduce((s, b) => s + b.positions.length / 2, 0), m = batches.reduce((s, b) => s + b.indices.length, 0);
  const position = new Float32Array(n * 3), uv = new Float32Array(n * 2), light = new Float32Array(n * 4), dark = new Float32Array(n * 4);
  const index = new Uint32Array(m), groups = [];
  let v = 0, k = 0;
  for (const b of batches) {
    const count = b.positions.length / 2;
    for (let i = 0; i < count; i++) {
      position[(v + i) * 3] = b.positions[i * 2] * sx * (flip ? -1 : 1);
      position[(v + i) * 3 + 1] = b.positions[i * 2 + 1] * sy;
    }
    uv.set(b.uvs, v * 2);
    light.set(b.light, v * 4);
    dark.set(b.dark, v * 4);
    groups.push({ start: k, count: b.indices.length, page: b.page, blend: b.blend });
    for (const i of b.indices) index[k++] = v + i;
    v += count;
  }
  return { position, uv, light, dark, index, groups };
}

/**
 * Puts an array into a geometry's attribute: into the one it has when the length is the same (the GPU buffer is
 * updated in place), else a new one.
 * @param {THREE.BufferGeometry} g @param {string} name @param {Float32Array} arr @param {number} size
 */
function refill(g, name, arr, size) {
  const old = /** @type {THREE.BufferAttribute | undefined} */ (g.getAttribute(name));
  if (old && old.array.length === arr.length) { /** @type {Float32Array} */ (old.array).set(arr); old.needsUpdate = true; return; }
  g.setAttribute(name, new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage));
}

/**
 * A figure of a Spine model: show(animation, time, loop, flip) poses it and refills its geometry; drawn at `scale` tiles
 * a skeleton unit times the model's own scale. @param {SpineModel} model @param {number} [scale]
 */
export function createFigure(model, scale = SKELETON_SCALE) {
  const s = model.skeleton, p = newPose(s), order = updateOrder(s), geometry = new THREE.BufferGeometry();
  const size = /** @type {[number, number]} */ ([scale * (model.scale?.[0] ?? 1), scale * (model.scale?.[1] ?? 1)]);
  /** @type {Map<string, THREE.ShaderMaterial>} */
  const mats = new Map();
  const mesh = /** @type {THREE.Mesh<THREE.BufferGeometry, THREE.Material[]>} */ (new THREE.Mesh(geometry, []));
  mesh.frustumCulled = false;
  const matOf = (/** @type {number} */ page, /** @type {number} */ blend) => {
    const key = `${page}:${blend}`;
    if (!mats.has(key)) mats.set(key, material(model.textures[page], blend, model.pma));
    return /** @type {THREE.ShaderMaterial} */ (mats.get(key));
  };
  const byName = new Map(s.animations.map((a) => [a.name, a])), times = animationTimes(s);
  return {
    object: mesh,
    /** Animation names. */
    animations: s.animations.map((a) => a.name),
    /** The duration of an animation in seconds, 0 when it has none. @param {string} name */
    duration: (name) => byName.get(name)?.duration ?? 0,
    /** The time of an animation's first OnAttack in seconds, 0 when it has none. @param {string} name */
    hit: (name) => times[name]?.hits[0] ?? 0,
    /** @param {string} name @param {number} time seconds @param {boolean} loop @param {boolean} flip */
    show(name, time, loop, flip) {
      setupPose(s, p);
      const anim = byName.get(name);
      if (anim) applyAnimation(p, s, anim, time, { loop, order });
      updateWorld(p, s, order);
      const a = figureArrays(drawList(p, s, model.atlas, { active: order.active, pma: model.pma }), size, flip);
      refill(geometry, 'position', a.position, 3);
      refill(geometry, 'uv', a.uv, 2);
      refill(geometry, 'light', a.light, 4);
      refill(geometry, 'dark', a.dark, 4);
      const idx = geometry.getIndex();
      if (idx && idx.array.length === a.index.length) { /** @type {Uint32Array} */ (idx.array).set(a.index); idx.needsUpdate = true; }
      else geometry.setIndex(new THREE.BufferAttribute(a.index, 1).setUsage(THREE.DynamicDrawUsage));
      geometry.clearGroups();
      const list = [];
      for (const g of a.groups) { geometry.addGroup(g.start, g.count, list.length); list.push(matOf(g.page, g.blend)); }
      mesh.material = list;
    },
    dispose() { geometry.dispose(); for (const m of mats.values()) m.dispose(); },
  };
}

/**
 * A Spine model from its files: the skeleton bytes, the atlas text and the page textures by page name. Page textures
 * are used as stored: not flipped (UV v runs down the page), not premultiplied again, no color space conversion.
 * @param {Uint8Array} skel @param {string} atlasText @param {Map<string, THREE.Texture>} pages @param {boolean} pma @returns {SpineModel}
 */
export function spineModel(skel, atlasText, pages, pma) {
  const atlas = readAtlas(atlasText), textures = atlas.pages.map((pg) => {
    const t = pages.get(pg.name);
    if (!t) throw new Error(`no texture for atlas page ${pg.name}`);
    t.flipY = false;
    t.premultiplyAlpha = false;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  });
  return { skeleton: readSkeleton(skel), atlas, textures, pma };
}
