// The map of a level (spec 地图-1): tiles in route coordinates, row 0 the nearest row, col 0 the left column.

/** @typedef {{ key: string, height: string, buildable: string, passable: string, side: string }} Tile */
/** @typedef {{ width: number, height: number, tiles: Tile[][] }} LevelMap */

/** @param {LevelMap} map @param {number} row @param {number} col @returns {Tile | null} */
export function tileAt(map, row, col) {
  return row >= 0 && row < map.height && col >= 0 && col < map.width ? map.tiles[row][col] : null;
}

/**
 * Whether an operator of a deploy position may stand on a tile (spec 部署-1): melee operators on MELEE tiles, ranged
 * operators on RANGED tiles, both on ALL tiles.
 * @param {Tile | null} tile @param {string} position 'MELEE' | 'RANGED'
 */
export function buildableFor(tile, position) {
  if (!tile) return false;
  return tile.buildable === 'ALL' || tile.buildable === position;
}
