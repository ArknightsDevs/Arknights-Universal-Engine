// Stands in for Stronghold's server/sim/body.js (兼容-2): the engine's own hit areas (体积-1…体积-4), which keep its
// names, on the level's grid (兼容-1).
import { body } from '@aue/sim';
import { COLS, ROWS } from '../grid.js';

/** The level's grid while content code runs. */
const grid = () => ({ rows: ROWS, cols: COLS });

/** @typedef {import('@aue/sim').body.Body} Body */

export const { bodyDist, bodyInRadius, bodyOnTile, hitRect } = body;
/** The tile keys a unit occupies. @param {Body} u */
export const bodyKeys = (u) => body.bodyKeys(u, grid());
/** Whether a unit is on any of the tiles. @param {Body} u @param {{ has(k: number): boolean } | number[]} keys */
export const bodyInKeys = (u, keys) => body.bodyInKeys(u, keys, grid());
/** The Chebyshev reach from a tile to a unit's body. @param {Body} u @param {number} r @param {number} c */
export const bodyTileReach = (u, r, c) => body.bodyTileReach(u, r, c, grid());
