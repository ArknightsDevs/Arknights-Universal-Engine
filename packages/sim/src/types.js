// The shapes of the content the simulation reads and of the world it keeps. The world holds plain data only (numbers,
// strings, arrays, plain objects), so a snapshot is a deep copy of it.

/** @typedef {{ row: number, col: number }} Cell */
/** @typedef {{ type: string, row: number, col: number, time: number }} Checkpoint */
/** @typedef {{ start: Cell, end: Cell, checkpoints: Checkpoint[], motion: string }} Route */
/** @typedef {{ at: number, enemy: string, route: number }} Spawn */
/** @typedef {{ maxLifePoint: number, initialCost: number, maxCost: number, costIncreaseTime: number, characterLimit: number, moveMultiplier: number }} LevelOptions */
/** @typedef {import('./level.js').LevelMap & { id: string, options: LevelOptions, routes: Route[], spawns: Spawn[] }} Level */
/** @typedef {{ name: string, maxHp: number, atk: number, def: number, res: number, moveSpeed: number }} EnemyDef */
/** @typedef {{ name: string, position: string, cost: number, blockCnt: number, baseAttackTime: number, maxHp: number, atk: number, def: number, res: number, range: Cell[] }} OperatorDef */
/** @typedef {{ level: Level, enemies: Record<string, EnemyDef>, operators: Record<string, OperatorDef> }} Content */

/**
 * A unit on the field. Operators have `range` and attack; enemies have a route and a leg (the waypoint they head for).
 * @typedef {object} Unit
 * @property {number} id
 * @property {number} kind 0 operator, 1 enemy (schema KIND)
 * @property {string} key the content id
 * @property {number} owner the player index of an operator, −1 for enemies
 * @property {number} x column (tile coordinates)
 * @property {number} y row
 * @property {number} z height level of the tile
 * @property {number} dir operator facing (schema DIR)
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} atk
 * @property {number} def
 * @property {number} atkInterval frames between attacks
 * @property {number} atkCd frames until the next attack may start
 * @property {number} route index into the level's routes, −1 for operators
 * @property {number} leg index of the waypoint the enemy heads for
 * @property {number} speed tiles per frame
 * @property {number} anim schema ANIM
 */

/** @typedef {{ life: number, cost: number, costTimer: number, deployed: string[] }} Player */

/**
 * @typedef {object} World
 * @property {number} frame frames done
 * @property {number} rng uint32 state (rng.js)
 * @property {number} nextId the next unit id
 * @property {Player[]} players
 * @property {Unit[]} units in creation order
 * @property {number} nextSpawn index of the next spawn in the level's list
 * @property {number[]} spawnFrames the frame of each spawn
 * @property {Record<string, string | number>[]} events this frame's presentation events (not part of the state)
 */

export {};
