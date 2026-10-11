// Presentation events, version 4 (ADR 0053; version 2 adds a skill starting or ending, version 3 an element burst, version 4 a heal, version 5 a projectile launched, version 6 a player down and back, version 7 a cost request and its answer): what happened in a frame, for the renderer and the sound. They flow from
// the simulation to the screen only; the simulation never reads them back.

export const EVENTS_VERSION = 7;

/** Each event type and its fields besides `type` (all numbers, except `key`: a content id; `el` is an element id 1…5). */
export const EVENT_FIELDS = Object.freeze({
  spawn: Object.freeze(['id', 'key']),
  deploy: Object.freeze(['id', 'key', 'owner']),
  attack: Object.freeze(['id', 'target']),
  hit: Object.freeze(['id', 'target', 'damage']),
  death: Object.freeze(['id']),
  goal: Object.freeze(['id', 'owner']),
  retreat: Object.freeze(['id']),
  skill: Object.freeze(['id', 'active']),
  burst: Object.freeze(['id', 'el']),
  heal: Object.freeze(['id', 'target', 'amount']),
  shot: Object.freeze(['id', 'target']),
  down: Object.freeze(['owner']),
  revive: Object.freeze(['owner']),
  ask: Object.freeze(['owner']),
  answer: Object.freeze(['owner', 'accept', 'amount']),
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
