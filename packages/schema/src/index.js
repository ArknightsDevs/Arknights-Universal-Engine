// @aue/schema: the versioned formats between the simulation, the renderer and the network (ADR 0053).
export { VIEW_VERSION, VIEW_HEADER, VIEW_PLAYER, VIEW_UNIT, KIND, ANIM, DIR, SKILL_STATE, STATUS_BIT, ELEMENT, viewLength, writeView, readView } from './view.js';
export { EVENTS_VERSION, EVENT_FIELDS, eventProblems } from './events.js';
export { PROTOCOL_VERSION, MAX_FRAME, MAX_SEAT, SIGNAL_FIELDS, SIGNAL_MAX, commandProblem, signalProblem, clientMessageProblem, serverMessageProblem } from './protocol.js';
export { SNAPSHOT_VERSION, snapshotProblem } from './snapshot.js';
export { MAX_DECK, MAX_RUNES, MAX_BOARD, DIFFICULTIES, matchProblem, buildProblem } from './match.js';
/** @typedef {import('./protocol.js').Match} Match */
/** @typedef {import('./protocol.js').Build} Build */
/** @typedef {import('./protocol.js').DeckEntry} DeckEntry */

/** @typedef {import('./protocol.js').Command} Command */
/** @typedef {import('./protocol.js').DeployCommand} DeployCommand */
/** @typedef {import('./protocol.js').RetreatCommand} RetreatCommand */
/** @typedef {import('./protocol.js').ClientMessage} ClientMessage */
/** @typedef {import('./protocol.js').ServerMessage} ServerMessage */
/** @typedef {import('./protocol.js').ControlMessage} ControlMessage */
/** @typedef {import('./protocol.js').Signal} Signal */
/** @typedef {import('./snapshot.js').Snapshot} Snapshot */
/** @typedef {import('./view.js').View} View */
/** @typedef {import('./view.js').ViewUnit} ViewUnit */
/** @typedef {import('./events.js').PresentationEvent} PresentationEvent */
