// The tile highlight (docs/spec/render.md 渲染-8): a texture with one texel per tile holds each tile's highlight value;
// the terrain's materials sample it at their world position and multiply their final colour by the highlight factor
// 2·clamp(h, 0, 0.5) + 5·clamp(h − 0.5, 0, 0.5) — 1 at h = 0.5, darker below, brighter above.
import * as THREE from 'three';

/** Highlight values (渲染-8): a tile as it is, and a tile the selected operator can be deployed on. */
export const HIGHLIGHT = Object.freeze({ normal: 0.5, deployable: 0.6 });

/** The factor a highlight value multiplies a colour by (渲染-8). @param {number} h */
export const highlightFactor = (h) => 2 * Math.min(Math.max(h, 0), 0.5) + 5 * Math.min(Math.max(h - 0.5, 0), 0.5);

const VERTEX_HEAD = 'varying vec2 vAueTile;\n';
const VERTEX_TAIL = '#include <project_vertex>\nvAueTile = (modelMatrix * vec4(transformed, 1.0)).xz;';
const FRAGMENT_HEAD = 'uniform sampler2D aueHighlight;\nuniform vec2 aueTiles;\nvarying vec2 vAueTile;\n';
// the texel of the tile under the fragment: three.js x = col − (w − 1) / 2, z = (h − 1) / 2 − row
const FRAGMENT_TAIL = `#include <colorspace_fragment>
{
  vec3 h = texture2D(aueHighlight, vec2((vAueTile.x + aueTiles.x * 0.5) / aueTiles.x, (aueTiles.y * 0.5 - vAueTile.y) / aueTiles.y)).rgb;
  gl_FragColor.rgb *= 2.0 * clamp(h, 0.0, 0.5) + 5.0 * clamp(h - 0.5, 0.0, 0.5);
}`;

/**
 * The highlight of a level's tiles: `patch` makes a terrain material follow it, `set` highlights tiles.
 * @param {{ width: number, height: number }} level
 */
export function createHighlight(level) {
  const n = level.width * level.height, data = new Float32Array(n * 4).fill(HIGHLIGHT.normal);
  const map = new THREE.DataTexture(data, level.width, level.height, THREE.RGBAFormat, THREE.FloatType);
  map.magFilter = map.minFilter = THREE.NearestFilter;
  map.needsUpdate = true;
  const uniforms = { aueHighlight: { value: map }, aueTiles: { value: new THREE.Vector2(level.width, level.height) } };
  return {
    map,
    /** Makes a terrain material multiply its colour by its tile's highlight factor. @param {THREE.Material} m */
    patch(m) {
      m.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <project_vertex>', VERTEX_TAIL);
        shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <colorspace_fragment>', FRAGMENT_TAIL);
      };
      m.customProgramCacheKey = () => 'aue-highlight';
    },
    /**
     * Highlights tiles (渲染-8): the given ones (keys row × width + col) get `value`, the others none.
     * @param {Iterable<number> | null} keys @param {number} [value]
     */
    set(keys, value = HIGHLIGHT.deployable) {
      data.fill(HIGHLIGHT.normal);
      for (const k of keys ?? []) if (k >= 0 && k < n) data.fill(value, k * 4, k * 4 + 4);
      map.needsUpdate = true;
    },
    dispose() { map.dispose(); },
  };
}
