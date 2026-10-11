// Where an attachment is (docs/spec/spine.md 骨骼-14): the world positions of a region's four corners and of a vertex
// attachment's vertices (plain, or weighted to bones; deformed), a linked mesh resolved to its parent's vertices, and
// each vertex's place on its atlas page. Our own implementation of the Spine 3.8 semantics; no Spine runtime code.

/** @typedef {import('./skeleton.js').Skeleton} Skeleton @typedef {import('./pose.js').Pose} Pose */
/** @typedef {import('./atlas.js').AtlasRegion} AtlasRegion @typedef {import('./atlas.js').AtlasPage} AtlasPage */
/** @typedef {Record<string, any>} Attachment */
/**
 * An attachment as drawn: its skin, key and data; for a mesh also what it is drawn with — its own or, for a linked
 * mesh, its parent's vertices, UVs and triangles — and the key of the attachment whose deform it takes.
 * @typedef {{ skin: number, key: string, attachment: Attachment, mesh: Attachment | null, deformKey: string }} Found
 */

/** The skin and key a deform timeline is stored under. @param {number} skin @param {string} key */
export const deformKey = (skin, key) => `${skin}/${key}`;

/** An attachment by slot and key in one skin, or null. @param {Skeleton} s @param {number} skin @param {number} slot @param {string} key */
function inSkin(s, skin, slot, key) {
  return /** @type {Attachment | null} */ (s.skins[skin]?.attachments.find((a) => a.slot === slot && a.key === key)?.attachment ?? null);
}

/**
 * The attachment a slot shows under a key (骨骼-14): from the skin in use, else the default skin; a linked mesh
 * resolved to its parent in the skin it names (the default skin when it names none).
 * @param {Skeleton} s @param {number | null} skin the named skin in use @param {number} slot @param {string} key @returns {Found | null}
 */
export function findAttachment(s, skin, slot, key) {
  const def = s.skins.findIndex((k) => k.name === 'default');
  for (const i of [skin, def]) {
    if (i === null || i < 0) continue;
    const a = inSkin(s, i, slot, key);
    if (!a) continue;
    if (a.type === 'mesh') return { skin: i, key, attachment: a, mesh: a, deformKey: deformKey(i, key) };
    if (a.type !== 'linkedmesh') return { skin: i, key, attachment: a, mesh: null, deformKey: deformKey(i, key) };
    const ps = a.skin === null ? def : s.skins.findIndex((k) => k.name === a.skin), parent = inSkin(s, ps, slot, a.parent);
    if (!parent) return null;
    return { skin: i, key, attachment: a, mesh: parent, deformKey: a.inheritDeform ? deformKey(ps, a.parent) : deformKey(i, key) };
  }
  return null;
}

/** The number of vertices of a vertex attachment. @param {Attachment} a */
export function vertexCount(a) {
  if (!a.weighted) return a.vertices.length / 2;
  let n = 0;
  for (let i = 0; i < a.bones.length; i += a.bones[i] + 1) n++;
  return n;
}

/**
 * A vertex attachment shown in a slot of a pose: the attachment (its vertices, weighted, bones) and the slot's deform
 * of it.
 * @typedef {{ p: Pose, s: Skeleton, slot: number, a: Attachment, deform: number[] | undefined }} Shown
 */

/**
 * World positions of the vertices of a vertex attachment from number `start` for `count` numbers (two a vertex)
 * (骨骼-14): a plain vertex by the slot's bone, a weighted one as the weighted sum of its place under each of its
 * bones. A deform replaces plain vertices and is added to each bone's place of weighted ones.
 * @param {Shown} at @param {number} [start] @param {number} [count] @returns {number[]}
 */
export function worldVertices(at, start = 0, count = vertexCount(at.a) * 2 - start) {
  const { p, s, slot, a, deform } = at, out = new Array(count);
  if (!a.weighted) {
    const v = deform && deform.length > 0 ? deform : a.vertices, b = p.bones[s.slots[slot].bone];
    for (let k = 0; k < count; k += 2) {
      const x = v[start + k], y = v[start + k + 1];
      out[k] = x * b.a + y * b.b + b.worldX;
      out[k + 1] = x * b.c + y * b.d + b.worldY;
    }
    return out;
  }
  let v = 0, skip = 0;
  for (let i = 0; i < start; i += 2) { const n = a.bones[v]; v += n + 1; skip += n; }
  const d = deform && deform.length > 0 ? deform : null;
  for (let k = 0, w = skip * 3, f = skip * 2; k < count; k += 2) {
    let wx = 0, wy = 0;
    for (const end = v + 1 + a.bones[v++]; v < end; v++, w += 3, f += 2) {
      const b = p.bones[a.bones[v]], x = a.vertices[w] + (d ? d[f] : 0), y = a.vertices[w + 1] + (d ? d[f + 1] : 0), weight = a.vertices[w + 2];
      wx += (x * b.a + y * b.b + b.worldX) * weight;
      wy += (x * b.c + y * b.d + b.worldY) * weight;
    }
    out[k] = wx;
    out[k + 1] = wy;
  }
  return out;
}

/**
 * The four corners of a region attachment in its bone's space — bottom left, top left, top right, bottom right
 * (骨骼-14): the region placed in the attachment's rectangle by its offset in the image it was cut from, then scaled,
 * turned and moved by the attachment.
 * @param {Attachment} a @param {AtlasRegion} r @returns {number[]}
 */
export function regionCorners(a, r) {
  const rsx = (a.width / r.originalWidth) * a.scaleX, rsy = (a.height / r.originalHeight) * a.scaleY;
  const x1 = (-a.width / 2) * a.scaleX + r.offsetX * rsx, y1 = (-a.height / 2) * a.scaleY + r.offsetY * rsy;
  const x2 = x1 + r.width * rsx, y2 = y1 + r.height * rsy;
  const rad = (a.rotation * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const corner = (/** @type {number} */ x, /** @type {number} */ y) => [x * cos + a.x - y * sin, y * cos + a.y + x * sin];
  return [...corner(x1, y1), ...corner(x1, y2), ...corner(x2, y2), ...corner(x2, y1)];
}

/** Region corners to the world by the slot's bone. @param {Pose} p @param {Skeleton} s @param {number} slot @param {number[]} corners */
export function regionWorld(p, s, slot, corners) {
  const b = p.bones[s.slots[slot].bone], out = new Array(8);
  for (let k = 0; k < 8; k += 2) {
    out[k] = corners[k] * b.a + corners[k + 1] * b.b + b.worldX;
    out[k + 1] = corners[k] * b.c + corners[k + 1] * b.d + b.worldY;
  }
  return out;
}

/**
 * A point of the image a region was cut from — s across, t down, both 0–1 — as u, v on its page (骨骼-10): the
 * region's place on the page, its cut-away border and how it was turned (0, 90, 180 or 270 degrees).
 * @param {AtlasRegion} r @param {AtlasPage} page @param {number} s @param {number} t @returns {number[]}
 */
export function pageUV(r, page, s, t) {
  const px = s * r.originalWidth - r.offsetX, py = t * r.originalHeight - (r.originalHeight - r.offsetY - r.height);
  let x, y;
  if (r.degrees === 90) { x = py; y = r.width - px; }
  else if (r.degrees === 180) { x = r.width - px; y = r.height - py; }
  else if (r.degrees === 270) { x = r.height - py; y = px; }
  else { x = px; y = py; }
  return [(r.x + x) / page.width, (r.y + y) / page.height];
}

/** The UVs of a region attachment's corners, in regionCorners' order (骨骼-10). @param {AtlasRegion} r @param {AtlasPage} page */
export function regionUVs(r, page) {
  const s1 = r.offsetX / r.originalWidth, s2 = (r.offsetX + r.width) / r.originalWidth;
  const t1 = (r.originalHeight - r.offsetY - r.height) / r.originalHeight, t2 = (r.originalHeight - r.offsetY) / r.originalHeight;
  return [...pageUV(r, page, s1, t2), ...pageUV(r, page, s1, t1), ...pageUV(r, page, s2, t1), ...pageUV(r, page, s2, t2)];
}

/** The UVs of a mesh's vertices from its UVs in the region's image (骨骼-10). @param {number[]} uvs @param {AtlasRegion} r @param {AtlasPage} page */
export function meshUVs(uvs, r, page) {
  const out = new Array(uvs.length);
  for (let k = 0; k < uvs.length; k += 2) [out[k], out[k + 1]] = pageUV(r, page, uvs[k], uvs[k + 1]);
  return out;
}
