// The shapes of the content the simulation reads and of the world it keeps. The world holds plain data only (numbers,
// strings, booleans, arrays, plain objects), so a snapshot is a deep copy of it (ADR 0054).

/** @typedef {{ row: number, col: number }} Cell */
/** @typedef {{ type: string, row: number, col: number, time: number }} Checkpoint */
/** @typedef {{ start: Cell, end: Cell, checkpoints: Checkpoint[], motion: string }} Route */
/** @typedef {{ at: number, enemy: string, route: number }} Spawn */
/** @typedef {{ maxLifePoint: number, initialCost: number, maxCost: number, costIncreaseTime: number, characterLimit: number, moveMultiplier: number }} LevelOptions */
/** @typedef {import('./level.js').LevelMap & { id: string, options: LevelOptions, routes: Route[], spawns: Spawn[] }} Level */

/** @typedef {'phys' | 'arts' | 'true' | 'elemental'} DamageType */

/**
 * What enemies and operators may give besides their required stats; each defaults as in attrs.js ATTRS.
 * @typedef {object} OptionalStats
 * @property {number} [aspd] attack speed (default 100)
 * @property {number} [tauntLevel]
 * @property {number} [massLevel] weight
 * @property {number} [epDamageResistance] 元素抗性
 * @property {number} [epResistance] 损伤抵抗
 * @property {string[]} [immune] status flags the unit is immune to (状态-7)
 * @property {DamageType} [dmgType] the type of its normal attack (default phys)
 */

/** @typedef {OptionalStats & { name: string, maxHp: number, atk: number, def: number, res: number, moveSpeed: number, motion?: string, baseAttackTime?: number }} EnemyDef */
/** @typedef {OptionalStats & { name: string, position: string, cost: number, blockCnt: number, baseAttackTime: number, maxHp: number, atk: number, def: number, res: number, range: Cell[] }} OperatorDef */
/** @typedef {{ level: Level, enemies: Record<string, EnemyDef>, operators: Record<string, OperatorDef> }} Content */

/**
 * A unit's base attributes (属性-1): the values its stats start from, with the Stronghold names; anything missing takes
 * the default in attrs.js ATTRS. `motion`, `immune` and `dmgType` are fixed facts of the unit.
 * @typedef {object} Base
 * @property {number} maxHp
 * @property {number} atk
 * @property {number} def
 * @property {number} res
 * @property {number} aspd
 * @property {number} bat attack interval in seconds (baseAttackTime)
 * @property {number} blockCnt
 * @property {number} moveSpeed
 * @property {number} tauntLevel
 * @property {number} massLevel
 * @property {number} epDamageResistance
 * @property {number} epResistance
 * @property {string} motion WALK or FLY
 * @property {string[]} immune
 * @property {DamageType} dmgType
 */

/**
 * A buff (状态-1): plain data. Its behaviour, if any, is looked up by key, never stored.
 * @typedef {object} Buff
 * @property {string} key
 * @property {number} src the id of the unit that gave it, −1 for none
 * @property {'queue' | 'max' | 'stack' | 'extend' | 'independent'} rule how buffs of the same key combine (状态-2)
 * @property {number} value its strength, for rule "max"
 * @property {Record<string, number>} mods
 * @property {Record<string, boolean>} flags
 * @property {number} stacks
 * @property {number} maxStacks
 * @property {number} left frames left, −1 for no end (may be fractional: 状态-3)
 * @property {number} every frames between triggers, 0 for none (状态-4)
 * @property {number} acc progress towards the next trigger
 * @property {boolean} fixed triggers ignore the decay rate
 * @property {boolean} resist a resistible status (可抵抗状态)
 * @property {number} decay its own decay multiplier (2 for 浮空 or 缚地 on a unit heavier than 3)
 * @property {number} prio event priority in the damage step (伤害-8)
 * @property {number} shield barrier (屏障) left
 * @property {number} shieldHits shield (护盾) layers left
 * @property {string} shieldType the damage type it absorbs, "" for every type
 */

/**
 * A unit on the field. Operators have a range and attack; enemies have a route and a leg (the waypoint they head for).
 * @typedef {object} Unit
 * @property {number} id
 * @property {number} kind 0 operator, 1 enemy (schema KIND)
 * @property {string} key the content id
 * @property {number} owner the player index of an operator, −1 for enemies
 * @property {number} x column (tile coordinates)
 * @property {number} y row
 * @property {number} z height level of the tile
 * @property {import('./dir.js').Dir} dir facing (spec 方向-1)
 * @property {Base} base
 * @property {Buff[]} buffs in acquisition order
 * @property {number} hp
 * @property {number} maxHp the maximum HP last computed (属性-4)
 * @property {number} atkCd frames until the next attack may start
 * @property {number} blockedBy the id of the unit blocking this one, −1 for none
 * @property {number} born the frame the unit was created in
 * @property {number} bornN its place among the units created in that frame, from 1 (索敌-5)
 * @property {number} route index into the level's routes, −1 for operators
 * @property {number} leg index of the waypoint the enemy heads for
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
 * @property {number} bornThisFrame units created so far in this frame
 * @property {Record<string, string | number>[]} events this frame's presentation events (not part of the state)
 */

export {};
