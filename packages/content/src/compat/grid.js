// The grid size Stronghold kits read (docs/spec/compat.md 兼容-1; ADR 0010, 0012, 0045). Their constants module gives
// COLS and ROWS as fixed numbers; ours are the level's, and change from battle to battle. The import mapping table
// points the kits' constants import here, and these are live bindings: while a battle's content code runs (withGrid),
// they hold that level's size, so a kit that reads them when it runs — nearly every use — gets the right one.

/**
 * The grid the kits load under (兼容-1): larger than any level (the largest in the data is 50 × 44), so what a kit builds
 * from COLS or ROWS as it loads — a whole row, the whole map — covers every level; tiles off the map drop out of ranges.
 */
export const LOAD_GRID = Object.freeze({ width: 64, height: 64 });

/** The level's width while content code runs, 0 outside. */
export let COLS = 0;
/** The level's height while content code runs, 0 outside. */
export let ROWS = 0;

/**
 * Runs content code with COLS and ROWS set to a level's size, and restores the ones before afterwards — also when it
 * throws, and when such calls nest (one battle's code reaching another's).
 * @template T @param {{ width: number, height: number }} level @param {() => T} fn @returns {T}
 */
export function withGrid(level, fn) {
  const cols = COLS, rows = ROWS;
  COLS = level.width;
  ROWS = level.height;
  try {
    return fn();
  } finally {
    COLS = cols;
    ROWS = rows;
  }
}

/**
 * Loads kits under LOAD_GRID (兼容-1): COLS and ROWS stay at 64 until the loading — which is asynchronous — is done,
 * then come back. Kits load before any battle runs, so no battle's code runs in between.
 * @template T @param {() => Promise<T>} load @returns {Promise<T>}
 */
export async function loadUnderGrid(load) {
  const cols = COLS, rows = ROWS;
  COLS = LOAD_GRID.width;
  ROWS = LOAD_GRID.height;
  try {
    return await load();
  } finally {
    COLS = cols;
    ROWS = rows;
  }
}
