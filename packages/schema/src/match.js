// The match settings (docs/spec/lockstep.md 同步-9): the level, its difficulty, the seed, and every seat's deck of
// operators with their trainings (docs/spec/operators.md). From the network they are untrusted: matchProblem checks
// them — exact fields, integers in range, short ids.
import { isRecord, isInt, isId, keyProblem } from './checks.js';
import { MAX_SEAT } from './protocol.js';

/** The most operators a deck holds. */
export const MAX_DECK = 12;
/** The difficulties a level is played at (关卡-2). */
export const DIFFICULTIES = Object.freeze(['NORMAL', 'FOUR_STAR']);

/** @typedef {import('./protocol.js').Build} Build @typedef {import('./protocol.js').Match} Match */

/** Each training field and its range. @type {Readonly<Record<keyof Build, [number, number]>>} */
const BUILD = Object.freeze({ elite: [0, 2], level: [1, 90], potential: [1, 6], trust: [0, 200], skill: [-1, 2], skillLevel: [1, 10] });

/** @param {unknown} b @returns {string | null} why a training is malformed, or null */
export function buildProblem(b) {
  if (!isRecord(b)) return 'build is not an object';
  const keys = /** @type {(keyof Build)[]} */ (Object.keys(BUILD));
  const why = keyProblem(b, keys);
  if (why) return why;
  const bad = keys.find((k) => !isInt(b[k], BUILD[k][0], BUILD[k][1]));
  return bad ? `build.${bad} out of range` : null;
}

/** @param {unknown} deck @returns {string | null} */
function deckProblem(deck) {
  if (!Array.isArray(deck) || deck.length > MAX_DECK) return `a deck is not a list of at most ${MAX_DECK}`;
  const ids = new Set();
  for (const e of deck) {
    if (!isRecord(e)) return 'a deck entry is not an object';
    const why = keyProblem(e, ['id', 'build']) ?? (!isId(e.id) ? 'deck entry id is not an id' : null) ?? buildProblem(e.build);
    if (why) return why;
    if (ids.has(e.id)) return `${String(e.id)} twice in one deck`;
    ids.add(e.id);
  }
  return null;
}

/**
 * Why a match's settings are rejected, or null when they are well formed (同步-9).
 * @param {unknown} m @returns {string | null}
 */
export function matchProblem(m) {
  if (!isRecord(m)) return 'match is not an object';
  const why = keyProblem(m, ['level', 'difficulty', 'seed', 'decks'])
    ?? (!isId(m.level) ? 'match.level is not an id' : null)
    ?? (!DIFFICULTIES.includes(/** @type {string} */ (m.difficulty)) ? 'match.difficulty is not NORMAL or FOUR_STAR' : null)
    ?? (!isInt(m.seed, 0, 0xffffffff) ? 'match.seed is not a uint32' : null)
    ?? (!Array.isArray(m.decks) || m.decks.length < 1 || m.decks.length > MAX_SEAT + 1 ? 'match.decks is not one deck per seat' : null);
  if (why) return why;
  for (const d of /** @type {unknown[]} */ (m.decks)) { const w = deckProblem(d); if (w) return w; }
  return null;
}
