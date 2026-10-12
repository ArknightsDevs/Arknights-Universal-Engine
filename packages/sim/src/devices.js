// Devices (docs/spec/devices.md 装置-1…装置-5): a level's predefined unit that has a device record (关卡-6) stands on the
// field while it is in effect (波次-6) — at its tile, facing its way, with its record's attributes — and leaves when it
// is withdrawn or its HP runs out; an enemy ability may place one too. Our side's devices block ground enemies as
// operators do and the enemies attack them.
import { KIND } from '@aue/schema';
import { makeDevice } from './units.js';
import { releaseAll } from './blocking.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/** The device on the field of a predefined unit, or null. @param {World} w @param {string} alias */
export const deviceOf = (w, alias) => w.units.find((u) => u.kind === KIND.DEVICE && u.alias === alias) ?? null;

/**
 * A predefined unit comes into effect (装置-1): when it has a device record and a tile and is not on the field yet, its
 * device stands there.
 * @param {World} w @param {Content} c @param {string} alias
 */
export function placeDevice(w, c, alias) {
  const p = (c.level.predefines ?? []).find((x) => x.alias === alias);
  if (!p || p.row === undefined || p.col === undefined || !c.devices || !Object.hasOwn(c.devices, p.key) || deviceOf(w, alias)) return;
  w.units.push(makeDevice(w, c, p));
}

/**
 * An ability places a device (装置-5): with the level's record of `key` and no operator or device on tile (row, col), one
 * stands there, facing up, on no predefined unit (its alias `key@id`). Whether it was placed.
 * @param {World} w @param {Content} c @param {string} key @param {number} row @param {number} col
 */
export function spawnDevice(w, c, key, row, col) {
  if (!c.devices || !Object.hasOwn(c.devices, key)) return false;
  if (w.units.some((u) => (u.kind === KIND.OPERATOR || u.kind === KIND.DEVICE) && u.hp > 0 && Math.round(u.x) === col && Math.round(u.y) === row)) return false;
  w.units.push(makeDevice(w, c, { alias: `${key}@${w.nextId}`, key, hidden: false, row, col, dir: 'UP' }));
  return true;
}

/** A predefined unit is withdrawn (装置-1): its device leaves the field and lets go of what it blocks. @param {World} w @param {string} alias */
export function withdrawDevice(w, alias) {
  const u = deviceOf(w, alias);
  if (!u) return;
  w.units.splice(w.units.indexOf(u), 1);
  releaseAll(w, u.id);
}
