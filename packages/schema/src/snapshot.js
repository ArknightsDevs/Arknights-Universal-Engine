// The snapshot envelope, version 7 (ADR 0053): a version, the frame it was taken at, and the simulation's own data.
// The data's inner structure belongs to the simulation and changes together with SNAPSHOT_VERSION (version 2: units
// carry their base attributes, buffs, route state and skill; version 3: their element values, buffs a tag and a counter;
// version 4: units the cost they paid, players their cards; version 5: units their swing, the world its projectiles; version 6: players their revival and downs; version 7: their cost requests).
import { isRecord, isInt, keyProblem } from './checks.js';
import { MAX_FRAME } from './protocol.js';

export const SNAPSHOT_VERSION = 7;

/** @typedef {{ v: number, frame: number, data: Record<string, unknown> }} Snapshot */

/** @param {unknown} s @returns {string | null} why the envelope is malformed, or null */
export function snapshotProblem(s) {
  if (!isRecord(s)) return 'snapshot is not an object';
  return keyProblem(s, ['v', 'frame', 'data'])
    ?? (s.v !== SNAPSHOT_VERSION ? `snapshot version ${String(s.v)}, expected ${SNAPSHOT_VERSION}` : null)
    ?? (!isInt(s.frame, 0, MAX_FRAME) ? 'snapshot.frame out of range' : null)
    ?? (!isRecord(s.data) ? 'snapshot.data is not an object' : null);
}
