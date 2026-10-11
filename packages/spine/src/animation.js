// Animations of a Spine 3.8 binary skeleton (docs/spec/spine.md 骨骼-5): slot, bone, constraint, deform, draw order
// and event timelines, in the order the file writes them. Each timeline keeps its frames as plain data; an animation's
// duration is the latest frame time of all its timelines.

/** @typedef {import('./binary.js').BinaryReader} BinaryReader */

/** A frame's curve to the next one: linear, stepped, or a Bézier with two control points (cx1, cy1, cx2, cy2). */
export const CURVE = Object.freeze({ LINEAR: 0, STEPPED: 1, BEZIER: 2 });

/** @typedef {{ type: number, c?: number[] }} Curve */
/**
 * A timeline: its kind, what it acts on, and its frames — each a time and the values of the kind, with the curve to
 * the next frame (none on the last).
 * @typedef {{ kind: string, target: number, attachment?: string, skin?: number, frames: { time: number, values: (number | string | boolean | null)[], curve?: Curve }[] }} Timeline
 */
/** @typedef {{ time: number, event: number, int: number, float: number, string: string | null, volume?: number, balance?: number }} EventKey */
/** @typedef {{ name: string, duration: number, timelines: Timeline[], events: EventKey[], drawOrder: { time: number, offsets: number[][] }[] }} Animation */

/** @param {BinaryReader} r @returns {Curve} */
function readCurve(r) {
  const type = r.byte();
  return type === CURVE.BEZIER ? { type, c: [r.float(), r.float(), r.float(), r.float()] } : { type };
}

/**
 * Reads `count` frames of a curved timeline: each a time and its values, then a curve unless it is the last.
 * @param {BinaryReader} r @param {number} count @param {(r: BinaryReader) => Timeline['frames'][number]['values']} values
 */
function curvedFrames(r, count, values) {
  /** @type {Timeline['frames']} */
  const frames = [];
  for (let i = 0; i < count; i++) {
    const f = { time: r.float(), values: values(r) };
    frames.push(i < count - 1 ? { ...f, curve: readCurve(r) } : f);
  }
  return frames;
}

/** Slot timeline kinds by code, with the values of a frame. @type {[string, (r: BinaryReader) => (number | string | null)[]][]} */
const SLOT_KINDS = [
  ['attachment', (r) => [r.stringRef()]],
  ['color', (r) => [r.int32()]],
  ['twoColor', (r) => [r.int32(), r.int32()]],
];
/** Bone timeline kinds by code. @type {[string, (r: BinaryReader) => number[]][]} */
const BONE_KINDS = [
  ['rotate', (r) => [r.float()]],
  ['translate', (r) => [r.float(), r.float()]],
  ['scale', (r) => [r.float(), r.float()]],
  ['shear', (r) => [r.float(), r.float()]],
];
/** Path constraint timeline kinds by code. @type {[string, (r: BinaryReader) => number[]][]} */
const PATH_KINDS = [
  ['pathPosition', (r) => [r.float()]],
  ['pathSpacing', (r) => [r.float()]],
  ['pathMix', (r) => [r.float(), r.float()]],
];

/** @param {BinaryReader} r @param {Timeline[]} out */
function readSlotTimelines(r, out) {
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const target = r.varint(true);
    for (let k = 0, m = r.varint(true); k < m; k++) {
      const code = r.byte(), count = r.varint(true), kind = SLOT_KINDS[code];
      if (!kind) throw new RangeError(`skeleton: unknown slot timeline ${code}`);
      // an attachment timeline has no curves
      const frames = code === 0 ? Array.from({ length: count }, () => ({ time: r.float(), values: kind[1](r) })) : curvedFrames(r, count, kind[1]);
      out.push({ kind: kind[0], target, frames });
    }
  }
}

/** @param {BinaryReader} r @param {Timeline[]} out @param {[string, (r: BinaryReader) => number[]][]} kinds @param {string} what */
function readKindedTimelines(r, out, kinds, what) {
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const target = r.varint(true);
    for (let k = 0, m = r.varint(true); k < m; k++) {
      const code = r.byte(), count = r.varint(true), kind = kinds[code];
      if (!kind) throw new RangeError(`skeleton: unknown ${what} timeline ${code}`);
      out.push({ kind: kind[0], target, frames: curvedFrames(r, count, kind[1]) });
    }
  }
}

/** @param {BinaryReader} r @param {Timeline[]} out */
function readConstraintTimelines(r, out) {
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const target = r.varint(true), count = r.varint(true);
    out.push({ kind: 'ik', target, frames: curvedFrames(r, count, (x) => [x.float(), x.float(), x.byte(), x.bool(), x.bool()]) });
  }
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const target = r.varint(true), count = r.varint(true);
    out.push({ kind: 'transform', target, frames: curvedFrames(r, count, (x) => [x.float(), x.float(), x.float(), x.float()]) });
  }
  readKindedTimelines(r, out, PATH_KINDS, 'path constraint');
}

/**
 * A deform frame's values: the first changed vertex value and the changed values (none: back to the setup pose).
 * @param {BinaryReader} r @returns {number[]}
 */
function deformValues(r) {
  const end = r.varint(true);
  if (end === 0) return [];
  return [r.varint(true), ...r.floats(end)];
}

/** @param {BinaryReader} r @param {Timeline[]} out */
function readDeformTimelines(r, out) {
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const skin = r.varint(true);
    for (let k = 0, m = r.varint(true); k < m; k++) {
      const target = r.varint(true);
      for (let j = 0, p = r.varint(true); j < p; j++) {
        const attachment = r.stringRef() ?? '', count = r.varint(true);
        out.push({ kind: 'deform', target, skin, attachment, frames: curvedFrames(r, count, deformValues) });
      }
    }
  }
}

/** @param {BinaryReader} r */
function readDrawOrder(r) {
  return Array.from({ length: r.varint(true) }, () => ({ time: r.float(), offsets: Array.from({ length: r.varint(true) }, () => [r.varint(true), r.varint(true)]) }));
}

/**
 * The event keys (骨骼-5): a time, the event, its int, float and string (the event's own when none is written), and
 * the volume and balance when the event has audio.
 * @param {BinaryReader} r @param {{ audio: string | null, string: string | null }[]} events @returns {EventKey[]}
 */
function readEventKeys(r, events) {
  return Array.from({ length: r.varint(true) }, () => {
    const time = r.float(), event = r.varint(true), def = events[event];
    if (!def) throw new RangeError(`skeleton: unknown event ${event}`);
    const key = { time, event, int: r.varint(false), float: r.float(), string: r.bool() ? r.string() : def.string };
    return def.audio !== null ? { ...key, volume: r.float(), balance: r.float() } : key;
  });
}

/** The latest frame time of an animation. @param {Timeline[]} timelines @param {EventKey[]} events @param {{ time: number }[]} drawOrder */
function durationOf(timelines, events, drawOrder) {
  let d = 0;
  for (const t of timelines) if (t.frames.length > 0) d = Math.max(d, t.frames[t.frames.length - 1].time);
  if (events.length > 0) d = Math.max(d, events[events.length - 1].time);
  if (drawOrder.length > 0) d = Math.max(d, drawOrder[drawOrder.length - 1].time);
  return d;
}

/**
 * One animation (骨骼-5): its timelines in the file's order, its draw order and event keys, and its duration.
 * @param {BinaryReader} r @param {string} name @param {{ audio: string | null, string: string | null }[]} events @returns {Animation}
 */
export function readAnimation(r, name, events) {
  /** @type {Timeline[]} */
  const timelines = [];
  readSlotTimelines(r, timelines);
  readKindedTimelines(r, timelines, BONE_KINDS, 'bone');
  readConstraintTimelines(r, timelines);
  readDeformTimelines(r, timelines);
  const drawOrder = readDrawOrder(r), keys = readEventKeys(r, events);
  return { name, duration: durationOf(timelines, keys, drawOrder), timelines, events: keys, drawOrder };
}
