// Snapshots (spec 同步-2): the whole world as plain data, in the version-1 envelope. Restoring one and running on gives
// the same frames, bit for bit, as never having stopped.
import { SNAPSHOT_VERSION, snapshotProblem } from '@aue/schema';

/** @typedef {import('./types.js').World} World */
/** @typedef {import('@aue/schema').Snapshot} Snapshot */

/** @template T @param {T} x @returns {T} a deep copy of plain data */
const copy = (x) => /** @type {T} */ (JSON.parse(JSON.stringify(x)));

/** @param {World} w @returns {Snapshot} */
export function takeSnapshot(w) {
  const { events: _events, bus: _bus, ...state } = w;
  return { v: SNAPSHOT_VERSION, frame: w.frame, data: copy(state) };
}

/**
 * The world a snapshot holds. Throws when the envelope is malformed or does not match its frame.
 * @param {unknown} s @returns {World}
 */
export function restoreSnapshot(s) {
  const why = snapshotProblem(s);
  if (why) throw new RangeError(`snapshot: ${why}`);
  const snap = /** @type {Snapshot} */ (s), w = /** @type {World} */ (/** @type {unknown} */ (copy(snap.data)));
  if (w.frame !== snap.frame) throw new RangeError('snapshot: the data is not at the envelope\'s frame');
  w.events = [];
  return w;
}
