// Overlays (docs/spec/render.md 渲染-5; ADR 0027): each drawn unit's HP bar under its model — blue for operators,
// orange for enemies, red for leaders — and an operator's SP bar under it; drawn after the scene with the depth
// cleared, so they are always on top. Bars are the battle UI's white slider fill tinted; without that texture no bar
// is drawn, and a unit that is not drawn has none.
import * as THREE from 'three';
import { KIND, SKILL_STATE } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';

/** Bar sizes in tiles and their colors (渲染-5; INF-0084). */
export const BAR = Object.freeze({
  width: 0.7, hp: 0.06, sp: 0.04, gap: 0.015, below: 0.08,
  colors: Object.freeze({ ours: 0x2f9fe0, enemy: 0xf0902c, leader: 0xd8382e, sp: 0xb8d84c, ready: 0xb8d84c, running: 0xf2a33a, back: 0x101010 }),
});

/** @typedef {{ ratio: number, color: number, height: number }} Bar */

/**
 * The bars of a unit (渲染-5): its HP; an operator with a skill also its SP — filling while it gathers, full when
 * ready, the time left while it runs (of the longest seen this run).
 * @param {import('@aue/schema').ViewUnit} u @param {boolean} leader @param {number} runFrames the skill run's length so far seen
 * @param {boolean} [foe] a device on the enemies' side (装置-3): the enemies' colour
 * @returns {Bar[]}
 */
export function barsOf(u, leader, runFrames, foe = false) {
  const c = BAR.colors, hpColor = u.kind !== KIND.ENEMY && !foe ? c.ours : leader ? c.leader : c.enemy;
  /** @type {Bar[]} */
  const bars = [{ ratio: u.maxHp > 0 ? Math.max(0, Math.min(1, u.hp / u.maxHp)) : 0, color: hpColor, height: BAR.hp }];
  if (u.kind !== KIND.OPERATOR || u.sp < 0 || u.skill === SKILL_STATE.NONE) return bars;
  if (u.skill === SKILL_STATE.RUNNING && u.skillLeft >= 0) bars.push({ ratio: runFrames > 0 ? Math.min(1, u.skillLeft / runFrames) : 1, color: c.running, height: BAR.sp });
  else if (u.skill === SKILL_STATE.READY) bars.push({ ratio: 1, color: c.ready, height: BAR.sp });
  else bars.push({ ratio: u.spCost > 0 ? Math.max(0, Math.min(1, u.sp / u.spCost)) : 0, color: c.sp, height: BAR.sp });
  return bars;
}

/** A sprite of the bar texture, anchored at its left middle. @param {THREE.Texture} map @param {number} color @param {number} opacity */
function barSprite(map, color, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, opacity, transparent: true, depthTest: false, depthWrite: false }));
  s.center.set(0, 0.5);
  return s;
}

/**
 * @param {Map<string, THREE.Texture>} textures the bar is 'ui:bar' @param {Set<string>} [leaders] content keys of leader enemies
 * @param {Set<string>} [foeDevices] content keys of the devices on the enemies' side (装置-3)
 */
export function createOverlays(textures, leaders = new Set(), foeDevices = new Set()) {
  const scene = new THREE.Scene(), map = textures.get('ui:bar');
  /** @type {Map<number, { at: THREE.Vector3, bars: Bar[], sprites: THREE.Sprite[], run: number }>} */
  const units = new Map();
  /** @type {Map<number, string>} */
  const keys = new Map();
  const right = new THREE.Vector3(), up = new THREE.Vector3();

  /** @param {{ sprites: THREE.Sprite[] }} x @param {number} n */
  const ensure = (x, n) => {
    while (x.sprites.length < n * 2) {
      const s = barSprite(/** @type {THREE.Texture} */ (map), x.sprites.length % 2 === 0 ? BAR.colors.back : 0xffffff, x.sprites.length % 2 === 0 ? 0.6 : 1);
      scene.add(s);
      x.sprites.push(s);
    }
    x.sprites.forEach((s, i) => { s.visible = i < n * 2; });
  };

  return {
    scene,
    /**
     * @param {import('@aue/schema').View} view @param {Record<string, string>} newKeys @param {{ width: number, height: number }} level
     * @param {(id: number) => boolean} [shows] whether a unit is drawn @param {(id: number) => number} [lift] how high over its feet it is drawn (渲染-21)
     */
    update(view, newKeys, level, shows = () => true, lift = () => 0) {
      for (const [id, k] of Object.entries(newKeys)) keys.set(Number(id), k);
      if (!map) return;
      const seen = new Set();
      for (const u of view.units) {
        if (!shows(u.id)) continue;
        seen.add(u.id);
        const x = units.get(u.id) ?? { at: new THREE.Vector3(), bars: [], sprites: [], run: 0 };
        units.set(u.id, x);
        x.run = u.skill === SKILL_STATE.RUNNING ? Math.max(x.run, u.skillLeft) : 0;
        const up = lift(u.id);
        x.at.set(...toThree(tileWorld(level, u.x, u.y, up > 0 ? 0 : u.z))).y += up;
        const key = keys.get(u.id) ?? '';
        x.bars = barsOf(u, leaders.has(key), x.run, foeDevices.has(key));
        ensure(x, x.bars.length);
      }
      for (const [id, x] of units) if (!seen.has(id)) { for (const s of x.sprites) { scene.remove(s); s.material.dispose(); } units.delete(id); }
    },
    /** Lays the bars out under each unit's feet as the camera sees them. @param {THREE.Camera} camera */
    pose(camera) {
      right.setFromMatrixColumn(camera.matrixWorld, 0);
      up.setFromMatrixColumn(camera.matrixWorld, 1);
      for (const x of units.values()) {
        let down = BAR.below;
        x.bars.forEach((b, i) => {
          const [back, fill] = [x.sprites[i * 2], x.sprites[i * 2 + 1]];
          const left = x.at.clone().addScaledVector(right, -BAR.width / 2).addScaledVector(up, -(down + b.height / 2));
          back.position.copy(left);
          back.scale.set(BAR.width, b.height, 1);
          fill.position.copy(left);
          fill.scale.set(Math.max(1e-4, BAR.width * b.ratio), b.height, 1);
          fill.material.color.setHex(b.color);
          down += b.height + BAR.gap;
        });
      }
    },
    count: () => units.size,
    dispose() { for (const x of units.values()) for (const s of x.sprites) s.material.dispose(); units.clear(); },
  };
}
