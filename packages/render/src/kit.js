// The terrain from a map theme's tile kit (docs/spec/render.md 渲染-7): each tile gets the kit's piece for its key (or
// an alias, or its class) and for which of its four neighbours are high ground; the pieces are merged into one mesh per
// material, lit by an ambient and a directional light. Start and end tiles carry their marker texture on top; an
// invisible quad per tile at its height answers picking.
import * as THREE from 'three';
import { toThree, tileWorld } from './camera.js';

/**
 * A map theme's tile kit (渲染-7): the highland height, materials, pieces (tile-local: x east, y north, z down, from the
 * tile centre on the ground) and, per tile key, the piece for each pattern of high-ground neighbours (N E S W, '1' for
 * high ground); a level's own kit also its scenery, a piece in the map's coordinates (from the map's centre).
 * @typedef {{ name: string, map: string, color: number[], cutout: number | null, emissiveMap: string | null, emissive: number[], blend?: boolean, opacity?: number }} KitMaterial
 * @typedef {{ material: number, position: number[], normal: number[], uv: number[], index: number[] }} KitGroup
 * @typedef {{ version: number, theme: string, highland: number, materials: KitMaterial[], pieces: { groups: KitGroup[] }[],
 *   tiles: Record<string, Record<string, number>>, scenery?: number }} TileKit
 * @typedef {{ kit: TileKit, textures: Map<string, THREE.Texture> }} LoadedKit a kit with its textures by file name
 */

/** Tile keys drawn as another key's pieces when the kit has none of their own (渲染-7). */
export const KIT_ALIAS = Object.freeze({ tile_start_cooperate: 'tile_start', tile_end_cooperate: 'tile_end' });
/** Tile keys that carry their marker texture ('tile:<key>') on top of their piece. */
const MARKED = /^tile_(start|end)/u;
/** How far above the tile the marker lies, in tiles. */
const MARKER_LIFT = 0.005;
/** The lights (渲染-7): ambient and directional intensities, and where the directional light comes from (three.js). */
export const KIT_LIGHT = Object.freeze({ ambient: 2.2, directional: 1.4, from: /** @type {[number, number, number]} */ ([-0.4, 1, 0.6]) });

/** @typedef {{ key: string, height: string, buildable?: string }} KitTile */
/** @typedef {{ width: number, height: number, tiles: KitTile[][] }} KitLevel */

/**
 * The key whose pieces a tile is drawn with (渲染-7): its own, its alias, else by class — high ground for ranged
 * operators as tile_wall, other high ground as tile_forbidden, ground as tile_road; null when the kit has none of them.
 * @param {TileKit} kit @param {KitTile} t @returns {string | null}
 */
export function kitKey(kit, t) {
  const alias = /** @type {Record<string, string>} */ (KIT_ALIAS)[t.key];
  const byClass = t.height === 'HIGHLAND' ? (t.buildable === 'RANGED' ? 'tile_wall' : 'tile_forbidden') : 'tile_road';
  return [t.key, alias, byClass].find((k) => k !== undefined && kit.tiles[k]) ?? null;
}

/**
 * Which of a tile's neighbours — north, east, south, west — are high ground: '1' each, '0' else (outside the map too).
 * @param {KitLevel} level @param {number} col @param {number} row
 */
export function kitPattern(level, col, row) {
  return [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dx, dy]) => level.tiles[row + dy]?.[col + dx]?.height === 'HIGHLAND' ? '1' : '0').join('');
}

/** @param {LoadedKit} lk @param {KitMaterial} m */
function kitMaterial(lk, m) {
  const tex = (/** @type {string | null} */ f) => (f ? lk.textures.get(f) ?? null : null);
  const srgb = (/** @type {number[]} */ c) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  return new THREE.MeshLambertMaterial({ map: tex(m.map), color: srgb(m.color), alphaTest: m.cutout ?? 0,
    emissiveMap: tex(m.emissiveMap), emissive: srgb(m.emissive), ...(m.blend ? { transparent: true, opacity: m.opacity ?? 1, depthWrite: false } : {}) });
}

/**
 * Merged geometry per material: the pieces at their tiles, in three.js coordinates.
 * @param {KitLevel} level @param {TileKit} kit
 */
function mergePieces(level, kit) {
  const out = merged(kit);
  level.tiles.forEach((cols, row) => cols.forEach((t, col) => {
    const key = kitKey(kit, t);
    if (key === null) return;
    const [ox, oy] = tileWorld(level, col, row, 0);
    addPiece(out, kit.pieces[kit.tiles[key][kitPattern(level, col, row)]], ox, oy);
  }));
  return out;
}

/** Empty merged geometry, one per material. @param {TileKit} kit @returns {{ position: number[], normal: number[], uv: number[], index: number[] }[]} */
const merged = (kit) => kit.materials.map(() => ({ position: [], normal: [], uv: [], index: [] }));

/**
 * A piece's groups added to the merged geometry, moved by (ox, oy) and turned into three.js coordinates.
 * @param {ReturnType<typeof merged>} out @param {{ groups: KitGroup[] }} piece @param {number} ox @param {number} oy
 */
function addPiece(out, piece, ox, oy) {
  for (const g of piece.groups) {
    const o = out[g.material], base = o.position.length / 3;
    for (let i = 0; i < g.position.length; i += 3) {
      o.position.push(...toThree([g.position[i] + ox, g.position[i + 1] + oy, g.position[i + 2]]));
      o.normal.push(...toThree([g.normal[i], g.normal[i + 1], g.normal[i + 2]]));
    }
    o.uv.push(...g.uv);
    // the turn into three.js coordinates mirrors, so each triangle's corners go the other way round
    for (let i = 0; i < g.index.length; i += 3) o.index.push(g.index[i] + base, g.index[i + 2] + base, g.index[i + 1] + base);
  }
}

/** @param {{ position: number[], normal: number[], uv: number[], index: number[] }} a */
function geometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(a.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
  g.setIndex(a.index);
  return g;
}

/**
 * The kit terrain (渲染-7): merged pieces, the lights, start and end markers, and pick quads.
 * @param {KitLevel} level @param {LoadedKit} lk @param {Map<string, THREE.Texture>} textures markers are 'tile:<key>'
 * @param {(m: THREE.Material) => void} [patch] applied to the pieces' materials (the tile highlight, 渲染-8)
 * @returns {{ object: THREE.Group, dispose(): void }}
 */
export function createKitTerrain(level, lk, textures, patch = () => {}) {
  const group = new THREE.Group(), disposables = /** @type {{ dispose(): void }[]} */ ([]);
  const keep = (/** @type {any} */ x) => { disposables.push(x); return x; };
  mergePieces(level, lk.kit).forEach((a, m) => {
    if (!a.index.length) return;
    const mat = keep(kitMaterial(lk, lk.kit.materials[m]));
    patch(mat);
    group.add(new THREE.Mesh(keep(geometry(a)), mat));
  });
  // the scenery around the map (a level's own kit): not part of the tiles, so not highlighted
  const scenery = lk.kit.scenery === undefined ? null : lk.kit.pieces[lk.kit.scenery];
  if (scenery) {
    const out = merged(lk.kit);
    addPiece(out, scenery, 0, 0);
    out.forEach((a, m) => { if (a.index.length) group.add(new THREE.Mesh(keep(geometry(a)), keep(kitMaterial(lk, lk.kit.materials[m])))); });
  }
  const sun = new THREE.DirectionalLight(0xffffff, KIT_LIGHT.directional);
  sun.position.set(...KIT_LIGHT.from);
  group.add(new THREE.AmbientLight(0xffffff, KIT_LIGHT.ambient), sun);
  const quad = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), hidden = keep(new THREE.MeshBasicMaterial());
  /** @type {Map<string, THREE.Material>} */
  const marks = new Map();
  const step = { width: level.width, height: level.height, highland: lk.kit.highland };
  level.tiles.forEach((cols, row) => cols.forEach((t, col) => {
    const at = toThree(tileWorld(step, col, row, t.height === 'HIGHLAND' ? 1 : 0));
    const pick = new THREE.Mesh(quad, hidden);
    pick.visible = false;
    pick.position.set(...at);
    pick.userData = { col, row };
    group.add(pick);
    const map = MARKED.test(t.key) ? textures.get(`tile:${t.key}`) : undefined;
    if (!map) return;
    if (!marks.has(t.key)) marks.set(t.key, keep(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false })));
    const mark = new THREE.Mesh(quad, marks.get(t.key));
    mark.position.set(at[0], at[1] + MARKER_LIFT, at[2]);
    mark.renderOrder = -3; // before the range (渲染-9) and the shadows (渲染-6)
    group.add(mark);
  }));
  return { object: group, dispose() { for (const d of disposables) d.dispose(); } };
}
