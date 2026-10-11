// What a pose draws (docs/spec/spine.md 骨骼-16, 骨骼-17): each slot's region or mesh in draw order, as triangles with
// world positions, page UVs and two colors, merged into batches of one page and one blend mode; clipping attachments
// cut what follows them. Our own implementation of the Spine 3.8 semantics; no Spine runtime code.
import { rgba } from './pose.js';
import { regionOf } from './atlas.js';
import { findAttachment, worldVertices, regionCorners, regionWorld, regionUVs, meshUVs } from './vertices.js';
import { triangulate, cutConvex } from './clip.js';

/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./pose.js').Pose} Pose @typedef {import('./atlas.js').Atlas} Atlas */
/**
 * A batch: triangles of one atlas page and one blend mode (0 normal, 1 additive, 2 multiply, 3 screen) — positions
 * (x, y), UVs (u, v), light and dark colors (r, g, b, a) per vertex, and the triangles' vertex indices.
 * @typedef {{ page: number, blend: number, positions: number[], uvs: number[], light: number[], dark: number[], indices: number[] }} Batch
 */
/** @typedef {{ positions: number[], uvs: number[], triangles: number[], page: number, color: number }} Part */

const QUAD = Object.freeze([0, 1, 2, 2, 3, 0]);

/**
 * The triangles of the attachment a slot shows (骨骼-16): a region's two, or a mesh's (a linked mesh's parent's
 * vertices and triangles, its own region); null when it draws nothing or its region is not in the atlas.
 * @param {Pose} p @param {Skeleton} s @param {number} i @param {import('./vertices.js').Found} f @param {Atlas} atlas @returns {Part | null}
 */
function partOf(p, s, i, f, atlas) {
  const a = f.attachment, region = a.type === 'region' || f.mesh ? regionOf(atlas, a.path ?? a.name) : null;
  if (!region) return null;
  const page = atlas.pages[region.page];
  if (a.type === 'region') {
    return { positions: regionWorld(p, s, i, regionCorners(a, region)), uvs: regionUVs(region, page), triangles: [...QUAD], page: region.page, color: a.color };
  }
  const mesh = /** @type {Record<string, any>} */ (f.mesh);
  const positions = worldVertices({ p, s, slot: i, a: mesh, deform: p.slots[i].deform[f.deformKey] });
  return { positions, uvs: meshUVs(mesh.uvs, region, page), triangles: mesh.triangles, page: region.page, color: a.color };
}

/**
 * The light and dark colors of a slot's attachment (骨骼-16): light is the slot's color times the attachment's,
 * its r, g, b times its alpha for premultiplied textures; dark is the slot's dark color (times the light's alpha when
 * premultiplied) with alpha 1 when premultiplied, else 0; black when the slot has none.
 * @param {import('./pose.js').PoseSlot} slot @param {number} color the attachment's rgba8888 @param {boolean} pma
 */
export function colorsOf(slot, color, pma) {
  const c = rgba(color), a = slot.color[3] * c[3];
  const light = [slot.color[0] * c[0], slot.color[1] * c[1], slot.color[2] * c[2], a];
  if (pma) for (let k = 0; k < 3; k++) light[k] *= a;
  if (!slot.dark) return { light, dark: [0, 0, 0, 1] };
  const d = slot.dark;
  return { light, dark: pma ? [d[0] * a, d[1] * a, d[2] * a, 1] : [d[0], d[1], d[2], 0] };
}

/**
 * A part's triangles cut to the clipping triangles (骨骼-17): each cut piece fanned into triangles, its UVs taken by
 * the barycentric weights within the triangle it came from.
 * @param {Part} part @param {number[][]} clip @returns {Part}
 */
function clipPart(part, clip) {
  const positions = [], uvs = [], triangles = [], { positions: x, uvs: u } = part;
  for (let t = 0; t < part.triangles.length; t += 3) {
    const [i, j, k] = [part.triangles[t], part.triangles[t + 1], part.triangles[t + 2]];
    const tri = [[x[i * 2], x[i * 2 + 1], 1, 0, 0], [x[j * 2], x[j * 2 + 1], 0, 1, 0], [x[k * 2], x[k * 2 + 1], 0, 0, 1]];
    for (const piece of clip) {
      const cut = cutConvex(tri, piece), base = positions.length / 2;
      if (cut.length < 3) continue;
      for (const q of cut) {
        positions.push(q[0], q[1]);
        uvs.push(u[i * 2] * q[2] + u[j * 2] * q[3] + u[k * 2] * q[4], u[i * 2 + 1] * q[2] + u[j * 2 + 1] * q[3] + u[k * 2 + 1] * q[4]);
      }
      for (let n = 1; n < cut.length - 1; n++) triangles.push(base, base + n, base + n + 1);
    }
  }
  return { ...part, positions, uvs, triangles };
}

/** Adds a part to the batches, starting a new batch when the page or the blend mode changes. @param {Batch[]} out @param {Part} part @param {number} blend @param {{ light: number[], dark: number[] }} c */
function addPart(out, part, blend, c) {
  let b = out[out.length - 1];
  if (!b || b.page !== part.page || b.blend !== blend) {
    b = { page: part.page, blend, positions: [], uvs: [], light: [], dark: [], indices: [] };
    out.push(b);
  }
  const base = b.positions.length / 2;
  b.positions.push(...part.positions);
  b.uvs.push(...part.uvs);
  for (let v = 0; v < part.positions.length / 2; v++) { b.light.push(...c.light); b.dark.push(...c.dark); }
  for (const t of part.triangles) b.indices.push(base + t);
}

/**
 * What a pose draws, in draw order (骨骼-16, 骨骼-17). A slot on an inactive bone draws nothing; a clipping
 * attachment cuts every slot after it up to and including its end slot (not its own slot).
 * @param {Pose} p @param {Skeleton} s @param {Atlas} atlas
 * @param {{ active: boolean[], skin?: number | null, pma: boolean }} o the bones that are active (the update order's), the named skin in use, premultiplied textures
 * @returns {Batch[]}
 */
export function drawList(p, s, atlas, o) {
  /** @type {Batch[]} */
  const out = [];
  /** @type {{ end: number, pieces: number[][] } | null} */
  let clip = null;
  for (const i of p.drawOrder) {
    const key = p.slots[i].attachment, active = o.active[s.slots[i].bone];
    const f = !active || key === null ? null : findAttachment(s, o.skin ?? null, i, key);
    if (f && f.attachment.type === 'clipping') {
      clip ??= { end: f.attachment.end, pieces: triangulate(worldVertices({ p, s, slot: i, a: f.attachment, deform: p.slots[i].deform[f.deformKey] })) };
      continue;
    }
    const part = f ? partOf(p, s, i, f, atlas) : null;
    if (part) addPart(out, clip ? clipPart(part, clip.pieces) : part, s.slots[i].blend, colorsOf(p.slots[i], part.color, o.pma));
    if (clip && clip.end === i) clip = null;
  }
  return out;
}
