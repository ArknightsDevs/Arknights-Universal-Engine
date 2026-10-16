// Seat runes in battle (docs/spec/runes.md 符文-5): every interval from the start, the operators in the attack range of
// an operator whose runes say so gain SP — each of them once, however many such ranges hold it. The other runes are the
// content's changes to the records (符文-2, 符文-3) and the SP on dealing damage (damage.js, 符文-4).
import { KIND } from '@aue/schema';
import { secondsToFrames } from '@aue/math';
import { inKeys } from './targeting.js';
import { reachKeys } from './reach.js';
import { gainSp } from './sp.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/**
 * This frame's SP from the operators whose runes give it in their attack range (符文-5): on a frame that is a whole
 * number of their interval after frame 0, each operator on the field in such a range gains the SP once (阻回 aside).
 * @param {World} w @param {Content} c
 */
export function runeRangeSp(w, c) {
  if (w.frame === 0) return;
  const grid = { rows: c.level.height, cols: c.level.width }, ops = w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0);
  /** @type {Set<number> | null} */
  let given = null;
  for (const src of ops) {
    const r = c.operators[src.key]?.rangeSp;
    if (!r || w.frame % Math.max(1, secondsToFrames(r.interval)) !== 0) continue;
    const keys = reachKeys(c, src);
    given ??= new Set();
    for (const u of ops) {
      if (given.has(u.id) || !u.skill || !inKeys(u, keys, grid)) continue;
      given.add(u.id);
      gainSp(u.skill, r.sp);
    }
  }
}
