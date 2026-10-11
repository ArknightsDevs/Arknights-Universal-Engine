// The units system: each unit is a Spine figure when its model is loaded (docs/spec/render.md 渲染-1 … 渲染-4), else a
// card with the operator's avatar or the enemy's icon standing at its feet; a unit with neither is not drawn. Figures
// and cards are depth-tested against the terrain without writing depth (ADR 0027).
import * as THREE from 'three';
import { KIND } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';
import { createFigure } from './spine.js';
import { animationRoles, roleOf, operatorFacing, enemyFacing } from './roles.js';

const CARD = 0.8;
/** Simulation frames per second (the engine's 时间-1). */
const FPS = 30;

/** The texture key of a unit. @param {number} kind @param {string} key */
export const unitTextureKey = (kind, key) => (kind === KIND.OPERATOR ? `avatar:${key}` : `enemy:${key}`);

/** @typedef {Map<string, { front?: import('./spine.js').SpineModel, back?: import('./spine.js').SpineModel }>} Models */
/**
 * A unit drawn as a figure: its figures by side, the role and the frame it began, the facing.
 * @typedef {{ group: THREE.Group, sides: Record<string, ReturnType<typeof createFigure>>, roles: Record<string, import('./roles.js').Roles>,
 *   side: string, flip: boolean, role: string, since: number, x: number }} Figure
 */

/**
 * A figure for a unit from its model's sides (null without a front): each side posed by its own roles.
 * @param {{ front?: import('./spine.js').SpineModel, back?: import('./spine.js').SpineModel } | undefined} m
 * @param {import('@aue/schema').ViewUnit} u @param {number} frame @returns {Figure | null}
 */
function newFigure(m, u, frame) {
  if (!m?.front) return null;
  /** @type {Figure} */
  const f = { group: new THREE.Group(), sides: {}, roles: {}, side: 'front', flip: false, role: '', since: frame, x: u.x };
  for (const side of /** @type {const} */ (['front', 'back'])) {
    const model = m[side];
    if (!model) continue;
    f.sides[side] = createFigure(model);
    f.roles[side] = animationRoles(f.sides[side].animations);
    f.group.add(f.sides[side].object);
  }
  return f;
}

/**
 * A figure following its unit (渲染-3, 渲染-4): a new role starts its animation from this frame; operators face by
 * their direction, enemies by how they moved.
 * @param {Figure} f @param {import('@aue/schema').ViewUnit} u @param {number} frame
 */
function follow(f, u, frame) {
  const role = roleOf(u.anim);
  if (role !== f.role) { f.role = role; f.since = frame; }
  const back = { back: !!f.sides.back, backDies: !!f.roles.back?.die, dying: role === 'die' };
  const facing = u.kind === KIND.OPERATOR ? operatorFacing(u.dir, back) : { side: 'front', flip: enemyFacing(f.flip, u.x - f.x) };
  f.side = facing.side; f.flip = facing.flip; f.x = u.x;
}

/**
 * Poses a figure at a frame (fractional) and turns it to face the camera; only its current side shows.
 * @param {Figure} f @param {number} frame @param {THREE.Camera} camera
 */
function poseFigure(f, frame, camera) {
  for (const [side, x] of Object.entries(f.sides)) x.object.visible = side === f.side;
  const fig = f.sides[f.side], roles = f.roles[f.side], name = roles[/** @type {'idle'} */ (f.role)] ?? roles.idle;
  fig.show(name, (frame - f.since) / FPS, f.role !== 'die', f.flip);
  f.group.quaternion.copy(camera.quaternion);
}

/**
 * @param {Map<string, THREE.Texture>} textures @param {Models} [models] by content key (operators by character id)
 */
export function createUnits(textures, models = new Map()) {
  const group = new THREE.Group();
  /** @type {Map<number, THREE.Sprite>} */
  const cards = new Map();
  /** @type {Map<number, Figure>} */
  const figures = new Map();
  /** @type {Map<number, string>} unit id → content key, from the worker's frame messages */
  const keys = new Map();
  const clock = { frame: 0, at: 0 };

  /** @param {import('@aue/schema').ViewUnit} u */
  const card = (u) => {
    const map = textures.get(unitTextureKey(u.kind, keys.get(u.id) ?? ''));
    if (!map) return null;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false }));
    s.center.set(0.5, 0);
    s.scale.set(CARD, CARD, 1);
    group.add(s);
    cards.set(u.id, s);
    return s;
  };

  /** @param {import('@aue/schema').ViewUnit} u @param {number} frame */
  const figure = (u, frame) => {
    const f = newFigure(models.get(keys.get(u.id) ?? ''), u, frame);
    if (!f) return null;
    group.add(f.group);
    figures.set(u.id, f);
    return f;
  };

  /** @param {Map<number, { group?: THREE.Object3D } | THREE.Sprite>} list @param {Set<number>} seen @param {(x: any) => void} drop */
  const prune = (list, seen, drop) => { for (const [id, x] of list) if (!seen.has(id)) { drop(x); list.delete(id); } };

  return {
    object: group,
    /** @param {import('@aue/schema').View} view @param {Record<string, string>} newKeys @param {{ width: number, height: number }} level @param {number} [now] ms */
    update(view, newKeys, level, now = performance.now()) {
      for (const [id, key] of Object.entries(newKeys)) keys.set(Number(id), key);
      Object.assign(clock, { frame: view.frame, at: now });
      const seen = new Set();
      for (const u of view.units) {
        seen.add(u.id);
        const at = toThree(tileWorld(level, u.x, u.y, u.z));
        const f = figures.get(u.id) ?? (cards.has(u.id) ? null : figure(u, view.frame));
        if (f) { follow(f, u, view.frame); f.group.position.set(...at); continue; }
        const s = cards.get(u.id) ?? card(u);
        if (s) s.position.set(...at);
      }
      prune(cards, seen, (s) => { group.remove(s); s.material.dispose(); });
      prune(figures, seen, (f) => { group.remove(f.group); for (const x of Object.values(f.sides)) x.dispose(); });
    },
    /** Poses every figure for the moment `now` and turns it to face the camera. @param {THREE.Camera} camera @param {number} [now] ms */
    pose(camera, now = performance.now()) {
      const frame = clock.frame + Math.min(1, Math.max(0, ((now - clock.at) * FPS) / 1000));
      for (const f of figures.values()) poseFigure(f, frame, camera);
    },
    count: () => cards.size + figures.size,
    dispose() {
      for (const s of cards.values()) s.material.dispose();
      for (const f of figures.values()) for (const x of Object.values(f.sides)) x.dispose();
      cards.clear(); figures.clear();
    },
  };
}
