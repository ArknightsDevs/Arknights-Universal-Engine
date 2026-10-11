// The shapes of the content the simulation reads and of the world it keeps. The world holds plain data only (numbers,
// strings, booleans, arrays, plain objects), so a snapshot is a deep copy of it (ADR 0054).

/** @typedef {{ row: number, col: number }} Cell */
/** A route checkpoint; (dx, dy) is its reach offset in tiles (路线-1). @typedef {{ type: string, row: number, col: number, time: number, dx?: number, dy?: number }} Checkpoint */
/**
 * A route: `motion` WALK or FLY; `allowDiagonal` (default true) lets the smoothed path step diagonally (寻路-2);
 * `spawnOffset` moves the spawn point off the start tile's centre (出怪-1).
 * @typedef {{ start: Cell, end: Cell, checkpoints: Checkpoint[], motion: string, allowDiagonal?: boolean, spawnOffset?: { x: number, y: number } }} Route
 */
/** A spawn; `fragment` is when its fragment began, in seconds (路线-1; default: its own time). @typedef {{ at: number, enemy: string, route: number, fragment?: number }} Spawn */
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
 * @property {number} [maxEp] maximum element value (default by 元素-1)
 * @property {string} [levelType] NORMAL, ELITE or BOSS (领袖)
 */

/**
 * An enemy: `blockCnt` is how much block it takes (阻挡数消耗, default 1); `rangeRadius` its attack radius in tiles and
 * `applyWay` MELEE or RANGED (敌人攻击-1).
 * @typedef {OptionalStats & { name: string, maxHp: number, atk: number, def: number, res: number, moveSpeed: number, motion?: string,
 *   baseAttackTime?: number, blockCnt?: number, rangeRadius?: number, applyWay?: string }} EnemyDef
 */
/**
 * A skill as the content gives it (技能-1): one level of a skill_table entry.
 * @typedef {object} SkillDef
 * @property {string} id
 * @property {'AUTO' | 'MANUAL' | 'PASSIVE'} type
 * @property {'time' | 'attack' | 'hurt' | 'none'} sp how it recovers SP
 * @property {number} cost spCost
 * @property {number} init initSp
 * @property {number} charges maxChargeTime, at least 1
 * @property {number} duration seconds; 0 or less: none
 * @property {boolean} ammo durationType AMMO
 * @property {Record<string, number>} bb the blackboard
 */
/**
 * A branch trait as the simulation reads it (职业-1…职业-6): anything left out takes the default of the operator's
 * position (traits.js defaultTrait).
 * @typedef {object} TraitDef
 * @property {boolean} antiAir its normal attack can select flying units
 * @property {boolean} blockedFirst it can and prefers to attack the units it blocks (even flying or out of range)
 * @property {'HATRED_DES' | 'DEF_ASC' | 'MASS_DES' | 'ALL'} filter its 仇恨过滤器 (索敌-3)
 * @property {'' | 'FLY_FIRST'} secondary its 二次过滤器 (索敌-3)
 * @property {number | 'blockCnt' | 'all'} targets a normal attack's maximum number of targets
 * @property {boolean} heal its normal attack heals allies instead (职业-2)
 * @property {number} hits hits per target of each attack
 * @property {Record<string, number>} mods lasting modifiers while deployed
 * @property {Record<string, boolean>} flags lasting flags while deployed
 * @property {number} killCost cost gained when its attack or skill kills an enemy
 * @property {number} refund the share of the paid cost a retreat returns (返还倍率)
 * @property {{ key: import('./status.js').StatusKey, seconds: number } | null} hitStatus a status each hit gives the target
 * @property {Record<string, number>} bb the trait's blackboard, for its behaviour
 */
/**
 * An operator: `branch` is its profession branch (subProfessionId), `trait` the branch's trait (职业-1), `respawnTime`
 * its 再部署时间 in seconds (部署-3; default 60).
 * @typedef {OptionalStats & { name: string, position: string, cost: number, blockCnt: number, baseAttackTime: number, maxHp: number, atk: number, def: number, res: number,
 *   range: Cell[], skill?: SkillDef, branch?: string, profession?: string, trait?: Partial<TraitDef>, respawnTime?: number }} OperatorDef
 */
/**
 * Behaviours by key (ADR 0054, 0055): what a skill or a buff does beyond its data. Content brings them; the default is
 * the generic one (技能-5).
 * @typedef {{ skills?: Record<string, import('./skills.js').SkillBehavior>, buffs?: Record<string, import('./buffs.js').Behavior>, traits?: Record<string, import('./traits.js').TraitBehavior> }} Behaviors
 */
/** @typedef {{ level: Level, enemies: Record<string, EnemyDef>, operators: Record<string, OperatorDef>, behaviors?: Behaviors }} Content */

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
 * @property {number} rangeRadius an enemy's attack radius in tiles, 0 for melee
 * @property {string} applyWay MELEE or RANGED
 * @property {number} maxEp maximum element value (元素-1)
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
 * @property {number} n a counter its behaviour keeps (麻痹's decay, 狂躁's damage)
 * @property {string} tag marks a buff a behaviour made, to find it again ("" for none)
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
 * @property {number} blockedAt the frame it was blocked in, −1 when not blocked
 * @property {number} born the frame the unit was created in
 * @property {number} bornN its place among the units created in that frame, from 1 (索敌-5)
 * @property {number} route index into the level's routes, −1 for operators
 * @property {number} leg index of the enemy's current leg of its route (路线-1)
 * @property {number[]} path the planned points of its current move leg, flat [x, y, …]; empty until planned (路线-2)
 * @property {number} pt index of the point of `path` it heads for
 * @property {number} wait frames left in its current wait, −1 when not waiting
 * @property {boolean} hidden it has disappeared (路线-4)
 * @property {number} frag the frame its spawn's fragment began
 * @property {SkillState | null} skill its skill, null when it has none (技能-1)
 * @property {Record<string, number>} ep element values below their maximum, by element (元素-1); none recorded is at its maximum
 * @property {number} paid the cost its deployment took, 0 for enemies (撤退-1)
 * @property {number} anim schema ANIM
 */

/**
 * A unit's skill as it runs (技能-2…技能-4).
 * @typedef {object} SkillState
 * @property {string} id
 * @property {string} spType time, attack, hurt or none
 * @property {number} cost SP one use takes
 * @property {number} cap the most SP it holds: cost × charges
 * @property {number} sp whole points
 * @property {number} slot the 技力冷却槽's progress, in points
 * @property {boolean} active it is running (and blocks SP: 阻回)
 * @property {boolean} armed a next-attack skill waiting for its attack
 * @property {number} dur frames left of its duration, −1 for none
 * @property {number} ammo shots left of an ammo skill
 * @property {number} at the frame it started
 */

/**
 * An operator's card in a player's deck (部署-3): the 再部署惩罚 layers it has (0–2) and the frame it may be deployed
 * again from.
 * @typedef {{ penalty: number, ready: number }} Card
 */
/** @typedef {{ life: number, cost: number, costTimer: number, deployed: string[], cards: Record<string, Card> }} Player */

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
