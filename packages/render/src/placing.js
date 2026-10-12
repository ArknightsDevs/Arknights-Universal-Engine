// The operator being placed (docs/spec/render.md 渲染-14): while the player deploys one, its figure stands on the tile
// it would go to, idle, facing the chosen way, with its shadow; while the facing is chosen, the direction indicator
// lies at its feet — a ring, and on it an arrow pointing the facing. The indicator is drawn after the shadows and
// before the units, depth-tested against the terrain without writing depth (ADR 0027).
import * as THREE from 'three';
import { DIR, KIND } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';
import { FPS, newFigure, poseFigure } from './figure.js';
import { operatorFacing } from './roles.js';
import { createShadows } from './shadows.js';

/**
 * The direction indicator (渲染-14): the ring's and the arrow's size in tiles (their textures are square), how far
 * from the feet the arrow's centre lies, their colours (r, g, b, a).
 */
export const INDICATOR = Object.freeze({ size: 0.704, out: 0.333, ring: Object.freeze([1, 1, 1, 0.502]), arrow: Object.freeze([1, 0.6, 0, 1]) });

/** The turn about the up axis that points east to a facing. @type {Record<number, number>} */
const TURN = { [DIR.RIGHT]: 0, [DIR.UP]: Math.PI / 2, [DIR.LEFT]: Math.PI, [DIR.DOWN]: -Math.PI / 2 };

/**
 * The operator being placed: its model's content key, the tile (column, row, height level), its facing (DIR) and
 * whether the direction indicator shows.
 * @typedef {{ key: string, col: number, row: number, h: number, dir: number, ring: boolean }} Placing
 */

/** A flat square on the ground drawn with a texture in a colour. @param {THREE.Texture | undefined} map @param {readonly number[]} c @param {number} order */
function flat(map, c, order) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(INDICATOR.size, INDICATOR.size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map, color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace), transparent: true, opacity: c[3], depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  }));
  m.renderOrder = order;
  m.visible = false;
  return m;
}

/**
 * The placing system: `set` shows an operator being placed (null for none); `pose` animates it.
 * @param {Map<string, THREE.Texture>} textures 'ui:shadow', 'ui:directionRing', 'ui:directionArrow'
 * @param {import('./units.js').Models} models @param {{ width: number, height: number, highland?: number }} field
 */
export function createPlacing(textures, models, field) {
  const group = new THREE.Group(), shadows = createShadows(textures.get('ui:shadow'));
  const ringMap = textures.get('ui:directionRing'), arrowMap = textures.get('ui:directionArrow');
  const ring = flat(ringMap, INDICATOR.ring, -0.9), arrow = flat(arrowMap, INDICATOR.arrow, -0.8);
  group.add(shadows.object, ring, arrow);
  /** @type {{ key: string, f: import('./figure.js').Figure } | null} */
  let shown = null, start = 0;

  const drop = () => {
    if (shown) { group.remove(shown.f.group); for (const x of Object.values(shown.f.sides)) x.dispose(); }
    shown = null;
    shadows.drop(0);
    ring.visible = arrow.visible = false;
  };

  /** The figure of a model, idle from now. @param {string} key */
  const figureOf = (key) => {
    if (shown?.key === key) return shown.f;
    drop();
    const f = newFigure(models.get(key), /** @type {any} */ ({ kind: KIND.OPERATOR, x: 0 }), 0);
    if (!f) return null;
    Object.assign(f, { role: 'idle', view: 'idle', since: 0 });
    start = performance.now();
    group.add(f.group);
    shown = { key, f };
    return f;
  };

  return {
    object: group,
    /** @param {Placing | null} p */
    set(p) {
      const f = p ? figureOf(p.key) : null;
      if (!p || !f) { drop(); return; }
      const at = /** @type {[number, number, number]} */ (toThree(tileWorld(field, p.col, p.row, p.h)));
      const facing = operatorFacing(p.dir, { back: !!f.sides.back, backDies: false, dying: false });
      Object.assign(f, { side: facing.side, flip: facing.flip });
      f.group.position.set(...at);
      shadows.place(0, at);
      const show = p.ring && !!ringMap && !!arrowMap, turn = TURN[p.dir] ?? 0;
      ring.visible = arrow.visible = show;
      ring.position.set(...at);
      arrow.position.set(at[0] + INDICATOR.out * Math.cos(turn), at[1], at[2] - INDICATOR.out * Math.sin(turn));
      arrow.rotation.set(0, turn, 0);
    },
    /** Poses the figure for the moment `now`, facing the camera. @param {THREE.Camera} camera @param {number} [now] ms */
    pose(camera, now = performance.now()) {
      if (shown) poseFigure(shown.f, ((now - start) * FPS) / 1000, camera);
    },
    /** Whether an operator is being shown placed. */
    shows: () => shown !== null,
    dispose() { drop(); shadows.dispose(); for (const m of [ring, arrow]) { m.geometry.dispose(); /** @type {THREE.Material} */ (m.material).dispose(); } },
  };
}
