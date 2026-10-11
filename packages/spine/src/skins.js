// Skins and attachments of a Spine 3.8 binary skeleton (docs/spec/spine.md 骨骼-4): the default skin and the named
// ones, each slot's attachments by name, and the seven attachment types with their vertices (plain, or weighted to
// bones).

/** @typedef {import('./binary.js').BinaryReader} BinaryReader */

/** The attachment types, by their code in the file. */
export const ATTACHMENT_TYPES = Object.freeze(['region', 'boundingbox', 'mesh', 'linkedmesh', 'path', 'point', 'clipping']);

/**
 * Vertices: plain x, y pairs, or for each vertex its bone count, then per bone the bone's index, x, y and weight.
 * @typedef {{ weighted: boolean, vertices: number[], bones: number[] }} Vertices
 */

/**
 * @param {BinaryReader} r @param {number} count
 * @returns {Vertices}
 */
function readVertices(r, count) {
  if (!r.bool()) return { weighted: false, vertices: r.floats(count * 2), bones: [] };
  /** @type {number[]} */
  const vertices = [], bones = [];
  for (let i = 0; i < count; i++) {
    const n = r.varint(true);
    bones.push(n);
    for (let k = 0; k < n; k++) {
      bones.push(r.varint(true));
      vertices.push(r.float(), r.float(), r.float());
    }
  }
  return { weighted: true, vertices, bones };
}

/** A color the file writes only with nonessential data; 0 otherwise. @param {BinaryReader} r @param {boolean} nonessential */
const optionalColor = (r, nonessential) => (nonessential ? r.int32() : 0);

/** @param {BinaryReader} r @param {Record<string, unknown>} a */
function readRegion(r, a) {
  return { ...a, path: r.stringRef(), rotation: r.float(), x: r.float(), y: r.float(), scaleX: r.float(), scaleY: r.float(), width: r.float(), height: r.float(), color: r.int32() };
}

/** @param {BinaryReader} r @param {Record<string, unknown>} a @param {boolean} nonessential */
function readMesh(r, a, nonessential) {
  const path = r.stringRef(), color = r.int32(), count = r.varint(true);
  const uvs = r.floats(count * 2), triangles = r.shorts(), vertices = readVertices(r, count), hull = r.varint(true);
  const extra = nonessential ? { edges: r.shorts(), width: r.float(), height: r.float() } : { edges: [], width: 0, height: 0 };
  return { ...a, path, color, uvs, triangles, ...vertices, hull, ...extra };
}

/** @param {BinaryReader} r @param {Record<string, unknown>} a @param {boolean} nonessential */
function readLinkedMesh(r, a, nonessential) {
  const path = r.stringRef(), color = r.int32(), skin = r.stringRef(), parent = r.stringRef(), inheritDeform = r.bool();
  const size = nonessential ? { width: r.float(), height: r.float() } : { width: 0, height: 0 };
  return { ...a, path, color, skin, parent, inheritDeform, ...size };
}

/** @param {BinaryReader} r @param {Record<string, unknown>} a @param {boolean} nonessential */
function readPath(r, a, nonessential) {
  const closed = r.bool(), constantSpeed = r.bool(), count = r.varint(true), vertices = readVertices(r, count);
  return { ...a, closed, constantSpeed, ...vertices, lengths: r.floats(Math.floor(count / 3)), color: optionalColor(r, nonessential) };
}

/**
 * One attachment (骨骼-4): its name (the key's when none is written), its type code, then the type's fields.
 * @param {BinaryReader} r @param {string} key @param {boolean} nonessential
 * @returns {Record<string, unknown>}
 */
export function readAttachment(r, key, nonessential) {
  const name = r.stringRef() ?? key, code = r.byte(), type = ATTACHMENT_TYPES[code];
  const a = { name, type };
  switch (type) {
    case 'region': return readRegion(r, a);
    case 'boundingbox': { const v = readVertices(r, r.varint(true)); return { ...a, ...v, color: optionalColor(r, nonessential) }; }
    case 'mesh': return readMesh(r, a, nonessential);
    case 'linkedmesh': return readLinkedMesh(r, a, nonessential);
    case 'path': return readPath(r, a, nonessential);
    case 'point': return { ...a, rotation: r.float(), x: r.float(), y: r.float(), color: optionalColor(r, nonessential) };
    case 'clipping': { const end = r.varint(true), v = readVertices(r, r.varint(true)); return { ...a, end, ...v, color: optionalColor(r, nonessential) }; }
    default: throw new RangeError(`skeleton: unknown attachment type ${code} at byte ${r.pos}`);
  }
}

/** n indices, each a positive varint. @param {BinaryReader} r */
const indices = (r) => Array.from({ length: r.varint(true) }, () => r.varint(true));

/**
 * @typedef {object} Skin
 * @property {string} name
 * @property {number[]} bones the bones it needs (skinRequired)
 * @property {number[]} ik @property {number[]} transform @property {number[]} path the constraints it needs
 * @property {{ slot: number, key: string, attachment: Record<string, unknown> }[]} attachments
 */

/**
 * A skin (骨骼-4). The default skin has no name, bones or constraints in the file, and no slots means no default skin.
 * @param {BinaryReader} r @param {boolean} isDefault @param {boolean} nonessential @returns {Skin | null}
 */
export function readSkin(r, isDefault, nonessential) {
  /** @type {Skin} */
  let skin;
  if (isDefault) {
    skin = { name: 'default', bones: [], ik: [], transform: [], path: [], attachments: [] };
  } else {
    const name = r.stringRef() ?? '';
    skin = { name, bones: indices(r), ik: indices(r), transform: indices(r), path: indices(r), attachments: [] };
  }
  const slots = r.varint(true);
  if (isDefault && slots === 0) return null;
  for (let i = 0; i < slots; i++) {
    const slot = r.varint(true), n = r.varint(true);
    for (let k = 0; k < n; k++) {
      const key = r.stringRef() ?? '';
      skin.attachments.push({ slot, key, attachment: readAttachment(r, key, nonessential) });
    }
  }
  return skin;
}
