// A Spine 3.8 binary skeleton (docs/spec/spine.md 骨骼-1…骨骼-6), read in the file's order: the header, the string
// table, bones, slots, the three kinds of constraints, skins, events and animations. Positions and lengths are kept as
// written (scale 1). Our own reader of the format; no Spine runtime code.
import { BinaryReader } from './binary.js';
import { readSkin } from './skins.js';
import { readAnimation } from './animation.js';

/** @typedef {import('./skins.js').Skin} Skin @typedef {import('./animation.js').Animation} Animation */

/** The versions this reader accepts: 3.8 (3.8.75 wrote a different layout). */
export const isReadable = (/** @type {string | null} */ v) => v !== null && v.startsWith('3.8.') && v !== '3.8.75';

/**
 * @typedef {object} Bone
 * @property {string} name
 * @property {number} parent −1 for the root
 * @property {number} rotation @property {number} x @property {number} y @property {number} scaleX @property {number} scaleY
 * @property {number} shearX @property {number} shearY @property {number} length
 * @property {number} transform 0 normal, 1 onlyTranslation, 2 noRotationOrReflection, 3 noScale, 4 noScaleOrReflection
 * @property {boolean} skinRequired
 * @property {number} color rgba8888 (nonessential; 0 when absent)
 */

/** @param {BinaryReader} r @param {boolean} nonessential @returns {Bone[]} */
function readBones(r, nonessential) {
  return Array.from({ length: r.varint(true) }, (_, i) => {
    const name = r.string() ?? '', parent = i === 0 ? -1 : r.varint(true);
    const b = { name, parent, rotation: r.float(), x: r.float(), y: r.float(), scaleX: r.float(), scaleY: r.float(), shearX: r.float(), shearY: r.float(), length: r.float() };
    return { ...b, transform: r.varint(true), skinRequired: r.bool(), color: nonessential ? r.int32() : 0 };
  });
}

/** @param {BinaryReader} r */
function readSlots(r) {
  return Array.from({ length: r.varint(true) }, () => {
    const name = r.string() ?? '', bone = r.varint(true), color = r.int32(), dark = r.int32();
    return { name, bone, color, dark, attachment: r.stringRef(), blend: r.varint(true) };
  });
}

/** A constraint's head: its name, order, whether a skin needs it, its bones. @param {BinaryReader} r */
function constraintHead(r) {
  return { name: r.string() ?? '', order: r.varint(true), skinRequired: r.bool(), bones: Array.from({ length: r.varint(true) }, () => r.varint(true)) };
}

/** @param {BinaryReader} r */
function readConstraints(r) {
  const ik = Array.from({ length: r.varint(true) }, () => {
    const h = constraintHead(r);
    return { ...h, target: r.varint(true), mix: r.float(), softness: r.float(), bend: r.byte(), compress: r.bool(), stretch: r.bool(), uniform: r.bool() };
  });
  const transform = Array.from({ length: r.varint(true) }, () => {
    const h = constraintHead(r), t = { target: r.varint(true), local: r.bool(), relative: r.bool() };
    const offsets = { offsetRotation: r.float(), offsetX: r.float(), offsetY: r.float(), offsetScaleX: r.float(), offsetScaleY: r.float(), offsetShearY: r.float() };
    return { ...h, ...t, ...offsets, rotateMix: r.float(), translateMix: r.float(), scaleMix: r.float(), shearMix: r.float() };
  });
  const path = Array.from({ length: r.varint(true) }, () => {
    const h = constraintHead(r), modes = { target: r.varint(true), position: r.varint(true), spacing: r.varint(true), rotate: r.varint(true) };
    return { ...h, ...modes, offsetRotation: r.float(), positionValue: r.float(), spacingValue: r.float(), rotateMix: r.float(), translateMix: r.float() };
  });
  return { ik, transform, path };
}

/** The event definitions (骨骼-5): name, int, float, string, and audio with its volume and balance. @param {BinaryReader} r */
function readEvents(r) {
  return Array.from({ length: r.varint(true) }, () => {
    const name = r.stringRef() ?? '', int = r.varint(false), float = r.float(), string = r.string(), audio = r.string();
    return audio !== null ? { name, int, float, string, audio, volume: r.float(), balance: r.float() } : { name, int, float, string, audio, volume: 1, balance: 0 };
  });
}

/**
 * A skeleton.
 * @typedef {object} Skeleton
 * @property {string} hash @property {string} version
 * @property {number} x @property {number} y @property {number} width @property {number} height
 * @property {{ fps: number, images: string | null, audio: string | null } | null} nonessential
 * @property {Bone[]} bones @property {ReturnType<typeof readSlots>} slots
 * @property {ReturnType<typeof readConstraints>} constraints
 * @property {Skin[]} skins the default skin first, when there is one
 * @property {ReturnType<typeof readEvents>} events
 * @property {Animation[]} animations
 */

/**
 * Reads a binary skeleton (骨骼-1…骨骼-6). Throws on a version it cannot read, an unknown code, or a file that ends
 * early or has bytes left over.
 * @param {Uint8Array} bytes @returns {Skeleton}
 */
export function readSkeleton(bytes) {
  const r = new BinaryReader(bytes);
  const hash = r.string() ?? '', version = r.string();
  if (!isReadable(version)) throw new RangeError(`skeleton: version ${version} is not 3.8`);
  const box = { x: r.float(), y: r.float(), width: r.float(), height: r.float() };
  const nonessential = r.bool() ? { fps: r.float(), images: r.string(), audio: r.string() } : null;
  r.strings = Array.from({ length: r.varint(true) }, () => r.string() ?? '');
  const bones = readBones(r, nonessential !== null), slots = readSlots(r), constraints = readConstraints(r);
  const def = readSkin(r, true, nonessential !== null);
  const skins = [...(def ? [def] : []), ...Array.from({ length: r.varint(true) }, () => /** @type {Skin} */ (readSkin(r, false, nonessential !== null)))];
  const events = readEvents(r);
  const animations = Array.from({ length: r.varint(true) }, () => readAnimation(r, r.string() ?? '', events));
  if (r.pos !== bytes.length) throw new RangeError(`skeleton: ${bytes.length - r.pos} bytes left after the animations`);
  return { hash, version: /** @type {string} */ (version), ...box, nonessential, bones, slots, constraints, skins, events, animations };
}

/**
 * What the battle needs of a skeleton (骨骼-6): each animation's duration and the times of its keys of an event,
 * by animation name, in time order.
 * @param {Skeleton} s @param {RegExp} [event] the event's name (default OnAttack, any case)
 * @returns {Record<string, { duration: number, hits: number[] }>}
 */
export function animationTimes(s, event = /^onattack$/i) {
  /** @type {Record<string, { duration: number, hits: number[] }>} */
  const out = {};
  for (const a of s.animations) {
    const hits = a.events.filter((k) => event.test(s.events[k.event].name)).map((k) => k.time).sort((x, y) => x - y);
    out[a.name] = { duration: a.duration, hits };
  }
  return out;
}
