// The level part of the skeleton: tiles, routes and spawns. Row convention of the output: row 0 is the BOTTOM row.
import { asArray, asInt, asNumber, asObject, asPos, asString, field } from './validate.js';

/** @typedef {{ row: number, col: number }} Pos */
/** @typedef {{ key: string, height: string, buildable: string, passable: string, side: string }} Tile */
/** @typedef {{ type: string, row: number, col: number, time: number }} Checkpoint */
/** @typedef {{ start: Pos, end: Pos, checkpoints: Checkpoint[], motion: string }} Route */
/** @typedef {{ at: number, enemy: string, route: number }} Spawn */
/** @typedef {{ key: string, count: number, interval: number, preDelay: number, routeIndex: number, start: number }} SpawnAction */

/**
 * @param {unknown} raw
 * @param {string} p
 * @returns {Tile}
 */
function readTileDef(raw, p) {
  const t = asObject(raw, p);
  return {
    key: asString(field(t, 'tileKey', p), `${p}.tileKey`),
    height: asString(field(t, 'heightType', p), `${p}.heightType`),
    buildable: asString(field(t, 'buildableType', p), `${p}.buildableType`),
    passable: asString(field(t, 'passableMask', p), `${p}.passableMask`),
    side: asString(field(t, 'playerSideMask', p), `${p}.playerSideMask`),
  };
}

/**
 * The tile grid, rows from the bottom: tiles[r] = mapData.map[height - 1 - r] (the file lists rows from the top).
 * @param {unknown} mapDataRaw
 * @returns {{ width: number, height: number, tiles: Tile[][] }}
 */
export function extractTiles(mapDataRaw) {
  const mapData = asObject(mapDataRaw, 'level.mapData');
  const defs = asArray(field(mapData, 'tiles', 'level.mapData'), 'level.mapData.tiles').map((raw, i) =>
    readTileDef(raw, `level.mapData.tiles[${i}]`),
  );
  const rows = asArray(field(mapData, 'map', 'level.mapData'), 'level.mapData.map');
  if (rows.length === 0) throw new Error('level.mapData.map: empty');
  const grid = rows.map((row, r) =>
    asArray(row, `level.mapData.map[${r}]`).map((c, k) => defs[asInt(c, `level.mapData.map[${r}][${k}]`, 0, defs.length - 1)]),
  );
  const width = grid[0].length;
  if (width === 0 || grid.some((r) => r.length !== width)) throw new Error('level.mapData.map: rows must be non-empty and of equal length');
  return { width, height: grid.length, tiles: grid.reverse() };
}

/**
 * @param {unknown} raw
 * @param {string} p
 * @returns {Checkpoint}
 */
function readCheckpoint(raw, p) {
  const c = asObject(raw, p);
  const time = c.time === undefined ? 0 : asNumber(c.time, `${p}.time`, 0, 1e6);
  const { row, col } = asPos(field(c, 'position', p), `${p}.position`);
  return { type: asString(field(c, 'type', p), `${p}.type`), row, col, time };
}

/**
 * @param {unknown} raw
 * @param {string} p
 * @returns {Route}
 */
function readRoute(raw, p) {
  const r = asObject(raw, p);
  const cps = r.checkpoints === null || r.checkpoints === undefined ? [] : asArray(r.checkpoints, `${p}.checkpoints`);
  return {
    start: asPos(field(r, 'startPosition', p), `${p}.startPosition`),
    end: asPos(field(r, 'endPosition', p), `${p}.endPosition`),
    checkpoints: cps.map((c, i) => readCheckpoint(c, `${p}.checkpoints[${i}]`)),
    motion: asString(field(r, 'motionMode', p), `${p}.motionMode`),
  };
}

/**
 * @param {Record<string, unknown>} a
 * @param {string} p
 * @param {number} start
 * @returns {SpawnAction}
 */
function readSpawnAction(a, p, start) {
  return {
    key: asString(field(a, 'key', p), `${p}.key`),
    count: asInt(field(a, 'count', p), `${p}.count`, 1, 1000),
    interval: asNumber(field(a, 'interval', p), `${p}.interval`, 0, 1e6),
    preDelay: asNumber(field(a, 'preDelay', p), `${p}.preDelay`, 0, 1e6),
    routeIndex: asInt(field(a, 'routeIndex', p), `${p}.routeIndex`, 0, 100000),
    start,
  };
}

/**
 * The first 6 SPAWN actions of the first fragment holding at least 4 of them.
 * Skeleton simplification: earlier waves are assumed to take no time, so a fragment starts at its wave's preDelay plus
 * the preDelays of the wave's fragments up to and including it. The simulation spec owns the real wave rules.
 * @param {unknown} wavesRaw
 * @returns {SpawnAction[]}
 */
export function pickSpawnActions(wavesRaw) {
  for (const [wi, wRaw] of asArray(wavesRaw, 'level.waves').entries()) {
    const wp = `level.waves[${wi}]`;
    const wave = asObject(wRaw, wp);
    let start = asNumber(field(wave, 'preDelay', wp), `${wp}.preDelay`, 0, 1e6);
    for (const [fi, fRaw] of asArray(field(wave, 'fragments', wp), `${wp}.fragments`).entries()) {
      const fp = `${wp}.fragments[${fi}]`;
      const frag = asObject(fRaw, fp);
      start += asNumber(field(frag, 'preDelay', fp), `${fp}.preDelay`, 0, 1e6);
      const spawns = asArray(field(frag, 'actions', fp), `${fp}.actions`)
        .map((a, ai) => ({ a: asObject(a, `${fp}.actions[${ai}]`), p: `${fp}.actions[${ai}]` }))
        .filter(({ a }) => a.actionType === 'SPAWN');
      if (spawns.length >= 4) return spawns.slice(0, 6).map(({ a, p }) => readSpawnAction(a, p, start));
    }
  }
  throw new Error('level.waves: no fragment with at least 4 SPAWN actions');
}

/**
 * Spawns (sorted by time, then action order) and the routes they use, renumbered in first-use order.
 * @param {unknown} wavesRaw
 * @param {unknown} routesRaw
 * @returns {{ routes: Route[], spawns: Spawn[] }}
 */
export function extractRoutesAndSpawns(wavesRaw, routesRaw) {
  const all = asArray(routesRaw, 'level.routes');
  /** @type {Map<number, number>} */
  const renumber = new Map();
  /** @type {Route[]} */
  const routes = [];
  const spawns = pickSpawnActions(wavesRaw).flatMap((act, order) => {
    if (act.routeIndex >= all.length) throw new Error(`spawn of ${act.key}: route ${act.routeIndex} does not exist`);
    let route = renumber.get(act.routeIndex);
    if (route === undefined) {
      route = routes.length;
      renumber.set(act.routeIndex, route);
      routes.push(readRoute(all[act.routeIndex], `level.routes[${act.routeIndex}]`));
    }
    const r = route;
    return Array.from({ length: act.count }, (_, k) => ({ at: act.start + act.preDelay + k * act.interval, enemy: act.key, route: r, order }));
  });
  spawns.sort((x, y) => x.at - y.at || x.order - y.order);
  return { routes, spawns: spawns.map(({ at, enemy, route }) => ({ at, enemy, route })) };
}
