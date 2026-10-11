// The units system (M0.5): each unit is a card standing at its feet, facing the camera, depth-tested against the
// terrain without writing depth, so cards never cut each other (ADR 0027; the exact depth rule and the Spine models
// come in M6–M7). Cards use the operator's avatar or the enemy's icon; a unit without a texture is not drawn.
import * as THREE from 'three';
import { KIND } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';

const CARD = 0.8;

/** The texture key of a unit. @param {number} kind @param {string} key */
export const unitTextureKey = (kind, key) => (kind === KIND.OPERATOR ? `avatar:${key}` : `enemy:${key}`);

/** @param {Map<string, THREE.Texture>} textures */
export function createUnits(textures) {
  const group = new THREE.Group();
  /** @type {Map<number, THREE.Sprite>} */
  const cards = new Map();
  /** @type {Map<number, string>} unit id → content key, from the worker's frame messages */
  const keys = new Map();

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

  return {
    object: group,
    /** @param {import('@aue/schema').View} view @param {Record<string, string>} newKeys @param {{ width: number, height: number }} level */
    update(view, newKeys, level) {
      for (const [id, key] of Object.entries(newKeys)) keys.set(Number(id), key);
      const seen = new Set();
      for (const u of view.units) {
        seen.add(u.id);
        const s = cards.get(u.id) ?? card(u);
        if (s) s.position.set(...toThree(tileWorld(level, u.x, u.y, u.z)));
      }
      for (const [id, s] of cards) if (!seen.has(id)) { group.remove(s); s.material.dispose(); cards.delete(id); }
    },
    count: () => cards.size,
    dispose() { for (const s of cards.values()) s.material.dispose(); cards.clear(); },
  };
}
