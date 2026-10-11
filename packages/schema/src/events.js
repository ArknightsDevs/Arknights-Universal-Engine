// Presentation events, version 2 (ADR 0053; version 2 adds a skill starting or ending): what happened in a frame, for the renderer and the sound. They flow from
// the simulation to the screen only; the simulation never reads them back.

export const EVENTS_VERSION = 2;

/** Each event type and its fields besides `type` (all numbers, except `key`: a content id). */
export const EVENT_FIELDS = Object.freeze({
  spawn: Object.freeze(['id', 'key']),
  deploy: Object.freeze(['id', 'key', 'owner']),
  attack: Object.freeze(['id', 'target']),
  hit: Object.freeze(['id', 'target', 'damage']),
  death: Object.freeze(['id']),
  goal: Object.freeze(['id', 'owner']),
  retreat: Object.freeze(['id']),
  skill: Object.freeze(['id', 'active']),
});

/** @typedef {{ type: keyof typeof EVENT_FIELDS, [field: string]: string | number }} PresentationEvent */

/**
 * The problems of an event (empty when it is well formed).
 * @param {unknown} e @returns {string[]}
 */
export function eventProblems(e) {
  if (!e || typeof e !== 'object') return ['not an object'];
  const ev = /** @type {Record<string, unknown>} */ (e);
  const fields = EVENT_FIELDS[/** @type {keyof typeof EVENT_FIELDS} */ (ev.type)];
  if (!fields) return [`unknown event type ${String(ev.type)}`];
  const out = [];
  for (const f of fields) {
    const want = f === 'key' ? 'string' : 'number';
    if (typeof ev[f] !== want) out.push(`${ev.type}.${f} is not a ${want}`);
  }
  for (const k of Object.keys(ev)) if (k !== 'type' && !fields.includes(k)) out.push(`${ev.type} has an unknown field ${k}`);
  return out;
}
