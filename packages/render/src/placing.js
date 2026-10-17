// The operator being placed (docs/spec/render.md 渲染-14): while the player deploys one, its figure stands on the tile
// it would go to (where the original puts its graphic, 渲染-2), idle, facing the chosen way, with its shadow; while the facing is chosen, the direction indicator
// lies at its feet — a ring, and on it an arrow pointing the facing. The indicator is drawn after the shadows and
// before the units, depth-tested against the terrain without writing depth (ADR 0027).
import * as THREE from 'three';
import { KIND } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';
import { FPS, newFigure, poseFigure } from './figure.js';
import { operatorFacing } from './roles.js';
import { createShadows } from './shadows.js';
import { createIndicators } from './indicators.js';
import { GRAPHIC } from './units.js';

/**
 * The operator being placed: its model's content key, the tile (column, row, height level), its facing (DIR) and
 * whether the direction indicator shows.
 * @typedef {{ key: string, col: number, row: number, h: number, dir: number, ring: boolean }} Placing
 */

/**
 * The placing system: `set` shows an operator being placed (null for none); `pose` animates it.
 * @param {Map<string, THREE.Texture>} textures 'ui:shadow', 'ui:directionRing', 'ui:directionArrow'
 * @param {import('./units.js').Models} models @param {{ width: number, height: number, highland?: number }} field
 */
export function createPlacing(textures, models, field) {
  const group = new THREE.Group(), shadows = createShadows(textures.get('ui:shadow'));
  const indicator = createIndicators(textures.get('ui:directionRing'), textures.get('ui:directionArrow'));
  group.add(shadows.object, indicator.object);
  /** @type {{ key: string, f: import('./figure.js').Figure } | null} */
  let shown = null, start = 0;

  const drop = () => {
    if (shown) { group.remove(shown.f.group); for (const x of Object.values(shown.f.sides)) x.dispose(); }
    shown = null;
    shadows.drop(0);
    indicator.drop(0);
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
      f.group.position.set(at[0], at[1] + GRAPHIC.up, at[2] + GRAPHIC.south);
      shadows.place(0, at);
      if (p.ring) indicator.place(0, at, p.dir); else indicator.drop(0);
    },
    /** Poses the figure for the moment `now`, facing the camera. @param {THREE.Camera} camera @param {number} [now] ms */
    pose(camera, now = performance.now()) {
      if (shown) poseFigure(shown.f, ((now - start) * FPS) / 1000, camera);
    },
    /** Whether an operator is being shown placed. */
    shows: () => shown !== null,
    dispose() { drop(); shadows.dispose(); indicator.dispose(); },
  };
}
