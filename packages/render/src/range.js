// The attack range (docs/spec/render.md 渲染-9): a quad on each tile in range with the striped range texture, orange for
// a range that attacks and cyan for one that heals, the stripes scrolling with real time; its depth is taken 0.2 tiles
// higher than it lies, so it is not lost in the ground. It is drawn after the start and end markers, before the
// shadows and the units.
import * as THREE from 'three';
import { toThree, tileWorld } from './camera.js';

/**
 * The range's look (渲染-9): colours (sRGB) by use, the opacity, the stripes' scroll speed (texture heights per second)
 * and how much higher its depth is taken (tiles).
 */
export const RANGE = Object.freeze({
  attack: Object.freeze([1, 0.6, 0.12]), heal: Object.freeze([0.25, 0.86, 1]), opacity: 0.749, speed: 0.5, lift: 0.2,
});

/** The range's shaders: the striped texture in a colour, scrolled; its depth taken higher than it lies (渲染-9, 渲染-19). */
export const VERTEX = `uniform float lift;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
  vec4 raised = projectionMatrix * viewMatrix * (world + vec4(0.0, lift, 0.0, 0.0));
  gl_Position.z = raised.z / raised.w * gl_Position.w;
}`;
export const FRAGMENT = `uniform sampler2D map;
uniform vec3 color;
uniform float opacity;
uniform float shift;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv + vec2(0.0, shift));
  gl_FragColor = vec4(color * t.rgb, t.a * opacity);
  #include <colorspace_fragment>
}`;

/** @typedef {{ width: number, height: number, highland?: number, tiles: { height: string }[][] }} RangeLevel */

/**
 * The range system. Without the texture ('ui:range') it shows nothing.
 * @param {RangeLevel} level @param {THREE.Texture | undefined} map
 */
export function createRange(level, map) {
  const group = new THREE.Group(), quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shift = { value: 0 };
  if (map) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const material = (/** @type {readonly number[]} */ c) => new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
    uniforms: { map: { value: map }, color: { value: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) },
      opacity: { value: RANGE.opacity }, shift, lift: { value: RANGE.lift } },
  });
  const mats = { attack: material(RANGE.attack), heal: material(RANGE.heal) };
  return {
    object: group,
    /**
     * Shows a range (渲染-9): a quad on each tile (keys row × width + col) at its height; null or no texture shows none.
     * @param {Iterable<number> | null} keys @param {boolean} [heal]
     */
    show(keys, heal = false) {
      group.clear();
      if (!map || !keys) return;
      for (const k of keys) {
        const row = Math.floor(k / level.width), col = k % level.width, t = level.tiles[row]?.[col];
        if (!t) continue;
        const m = new THREE.Mesh(quad, heal ? mats.heal : mats.attack);
        m.position.set(...toThree(tileWorld(level, col, row, t.height === 'HIGHLAND' ? 1 : 0)));
        m.renderOrder = -2;
        group.add(m);
      }
    },
    /** Scrolls the stripes to a moment of real time (渲染-9). @param {number} seconds */
    tick(seconds) { shift.value = -RANGE.speed * seconds; },
    count: () => group.children.length,
    dispose() { group.clear(); quad.dispose(); mats.attack.dispose(); mats.heal.dispose(); },
  };
}
