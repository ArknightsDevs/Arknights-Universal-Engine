// The units system: each unit is a Spine figure when its model is loaded (docs/spec/render.md 渲染-1 … 渲染-4), else a
// card with the operator's avatar or the enemy's icon standing at its feet; a device with neither is a block in its
// side's colour (渲染-16); any other unit with neither is not drawn. Figures, cards and blocks are depth-tested against
// the terrain without writing depth (ADR 0027). A figure whose unit died stays to play its die clip. Every figure, card
// and block has a shadow (渲染-6) for as long as it is drawn.
import * as THREE from 'three';
import { KIND } from '@aue/schema';
import { toThree, tileWorld } from './camera.js';
import { FPS, newFigure, follow, attacked, dies, deathOver, poseFigure } from './figure.js';
import { createShadows } from './shadows.js';
import { BAR } from './overlays.js';

const CARD = 0.8;
/** A device block (渲染-16): its footprint and height in tiles; its sides are this much of its top's colour. */
export const BLOCK = Object.freeze({ size: 0.7, height: 0.35, shade: 0.7 });

/** A block's geometry standing on its base, its top in the colour and its sides darker (渲染-16). @param {number} hex */
function blockGeometry(hex) {
  const g = new THREE.BoxGeometry(BLOCK.size, BLOCK.height, BLOCK.size).translate(0, BLOCK.height / 2, 0);
  const top = new THREE.Color(hex), side = top.clone().multiplyScalar(BLOCK.shade), n = g.attributes.normal, colors = /** @type {number[]} */ ([]);
  for (let i = 0; i < n.count; i++) (n.getY(i) > 0.5 ? top : side).toArray(colors, i * 3);
  return g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}
const BLOCKS = Object.freeze({ foe: blockGeometry(BAR.colors.enemy), ours: blockGeometry(BAR.colors.ours) });

/** A device's block: the enemies' bar colour for a device on their side, ours otherwise. @param {boolean} foe */
const newBlock = (foe) => new THREE.Mesh(foe ? BLOCKS.foe : BLOCKS.ours, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }));

/** The texture key of a unit. @param {number} kind @param {string} key */
export const unitTextureKey = (kind, key) => (kind === KIND.OPERATOR ? `avatar:${key}` : kind === KIND.DEVICE ? `device:${key}` : `enemy:${key}`);

/** @typedef {Map<string, { front?: import('./spine.js').SpineModel, back?: import('./spine.js').SpineModel }>} Models */
/** @typedef {import('./figure.js').Figure} Figure */
/** @typedef {Record<string, string | number>} Event a presentation event (type and fields) */

/** A card: the texture standing at its bottom centre, not writing depth. @param {THREE.Texture} map */
function newCard(map) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false }));
  s.center.set(0.5, 0);
  s.scale.set(CARD, CARD, 1);
  return s;
}

/** @param {Figure} f */
const disposeFigure = (f) => { for (const x of Object.values(f.sides)) x.dispose(); };

/**
 * The units system; its shadows are a separate object (drawn before every unit).
 * @param {Map<string, THREE.Texture>} textures @param {Models} [models] by content key (operators by character id)
 * @param {Set<string>} [foeDevices] content keys of the devices on the enemies' side (装置-3)
 */
export function createUnits(textures, models = new Map(), foeDevices = new Set()) {
  const group = new THREE.Group(), shadows = createShadows(textures.get('ui:shadow'));
  /** @type {Map<number, THREE.Sprite | THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>} cards and blocks */
  const cards = new Map();
  /** @type {Map<number, Figure>} */
  const figures = new Map();
  /** @type {Map<number, string>} unit id → content key, from the worker's frame messages */
  const keys = new Map();
  const clock = { frame: 0, at: 0 };

  /** @param {import('@aue/schema').ViewUnit} u */
  const card = (u) => {
    const key = keys.get(u.id) ?? '', map = textures.get(unitTextureKey(u.kind, key));
    const s = map ? newCard(map) : u.kind === KIND.DEVICE ? newBlock(foeDevices.has(key)) : null;
    if (s) { group.add(s); cards.set(u.id, s); }
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

  /**
   * Units gone from the view: cards go; a figure that died plays its die clip and goes when it is over.
   * @param {Set<number>} seen @param {Set<number>} died @param {number} frame
   */
  const prune = (seen, died, frame) => {
    for (const [id, s] of cards) if (!seen.has(id)) { group.remove(s); s.material.dispose(); cards.delete(id); shadows.drop(id); }
    for (const [id, f] of figures) {
      if (seen.has(id)) continue;
      if (f.dying ? !deathOver(f, frame) : died.has(id) && dies(f, frame)) continue;
      group.remove(f.group); disposeFigure(f); figures.delete(id); shadows.drop(id);
    }
  };

  return {
    object: group,
    shadows: shadows.object,
    /**
     * @param {import('@aue/schema').View} view @param {Record<string, string>} newKeys @param {{ width: number, height: number }} level
     * @param {number} [now] ms @param {Event[]} [events] the frame's presentation events
     */
    update(view, newKeys, level, now = performance.now(), events = []) {
      for (const [id, key] of Object.entries(newKeys)) keys.set(Number(id), key);
      Object.assign(clock, { frame: view.frame, at: now });
      const seen = new Set();
      for (const u of view.units) {
        seen.add(u.id);
        const at = toThree(tileWorld(level, u.x, u.y, u.z));
        const f = figures.get(u.id) ?? (cards.has(u.id) ? null : figure(u, view.frame));
        if (f) { follow(f, u, view.frame); f.group.position.set(...at); shadows.place(u.id, at); continue; }
        const s = cards.get(u.id) ?? card(u);
        if (s) { s.position.set(...at); shadows.place(u.id, at); }
      }
      for (const e of events) if (e.type === 'attack') { const f = figures.get(Number(e.id)); if (f && !f.dying) attacked(f, Number(e.wind), view.frame); }
      prune(seen, new Set(events.filter((e) => e.type === 'death').map((e) => Number(e.id))), view.frame);
    },
    /** Poses every figure for the moment `now` and turns it to face the camera. @param {THREE.Camera} camera @param {number} [now] ms */
    pose(camera, now = performance.now()) {
      const frame = clock.frame + Math.min(1, Math.max(0, ((now - clock.at) * FPS) / 1000));
      for (const f of figures.values()) poseFigure(f, frame, camera);
    },
    count: () => cards.size + figures.size,
    /** Whether a unit is drawn (as a living figure or a card). @param {number} id */
    shows: (id) => cards.has(id) || (figures.has(id) && !figures.get(id)?.dying),
    dispose() {
      for (const s of cards.values()) s.material.dispose();
      for (const f of figures.values()) disposeFigure(f);
      cards.clear(); figures.clear(); shadows.dispose();
    },
  };
}
