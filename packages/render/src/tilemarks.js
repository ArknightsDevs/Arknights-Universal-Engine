// The marks on the field (docs/spec/render.md 渲染-19): the tiles the seats marked (the co-op mark, ui.md 界面-37) drawn
// as the range is (渲染-9) — a striped quad on each tile, scrolling — in this seat's colour or the mate's, over the
// range and before the units.
import * as THREE from 'three';
import { toThree, tileWorld } from './camera.js';
import { RANGE, VERTEX, FRAGMENT } from './range.js';

/** The marks' colours (sRGB): this seat's blue, the mate's green (its marks' arrow); their opacity. */
export const TILE_MARKS = Object.freeze({ mine: Object.freeze([0, 0.6, 0.86]), mate: Object.freeze([0.004, 0.557, 0.494]), opacity: 0.85 });

/** A mark: its tile (row × width + col) and whether the mate made it. @typedef {{ key: number, mate: boolean }} TileMark */

/**
 * The marks layer. Without the range texture ('ui:range') it shows nothing.
 * @param {import('./range.js').RangeLevel} level @param {THREE.Texture | undefined} map
 */
export function createTileMarks(level, map) {
  const group = new THREE.Group(), quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shift = { value: 0 };
  const material = (/** @type {readonly number[]} */ c) => new THREE.ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false,
    uniforms: { map: { value: map }, color: { value: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace) },
      opacity: { value: TILE_MARKS.opacity }, shift, lift: { value: RANGE.lift } },
  });
  const mats = { mine: material(TILE_MARKS.mine), mate: material(TILE_MARKS.mate) };
  return {
    object: group,
    /** Shows the marks (渲染-19): one quad a mark at its tile's height; null or no texture shows none. @param {readonly TileMark[] | null} marks */
    show(marks) {
      group.clear();
      if (!map || !marks) return;
      for (const m of marks) {
        const row = Math.floor(m.key / level.width), col = m.key % level.width, t = level.tiles[row]?.[col];
        if (!t) continue;
        const q = new THREE.Mesh(quad, m.mate ? mats.mate : mats.mine);
        q.position.set(...toThree(tileWorld(level, col, row, t.height === 'HIGHLAND' ? 1 : 0)));
        q.renderOrder = -1;
        group.add(q);
      }
    },
    /** Scrolls the stripes to a moment of real time, as the range's. @param {number} seconds */
    tick(seconds) { shift.value = -RANGE.speed * seconds; },
    count: () => group.children.length,
    dispose() { group.clear(); quad.dispose(); mats.mine.dispose(); mats.mate.dispose(); },
  };
}
