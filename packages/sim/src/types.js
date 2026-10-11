// The shapes of the content the simulation reads and of the world it keeps. The world holds plain data only (numbers,
// strings, booleans, arrays, plain objects), so a snapshot is a deep copy of it (ADR 0054).

/** @typedef {{ row: number, col: number }} Cell */
/** A route checkpoint; (dx, dy) is its reach offset in tiles (路线-1). @typedef {{ type: string, row: number, col: number, time: number, dx?: number, dy?: number }} Checkpoint */
/**
 * A route: `motion` WALK or FLY; `allowDiagonal` (default true) lets the smoothed path step diagonally (寻路-2);
 * `spawnOffset` moves the spawn point off the start tile's centre (出怪-1).
 * @typedef {{ start: Cell, end: Cell, checkpoints: Checkpoint[], motion: string, allowDiagonal?: boolean, spawnOffset?: { x: number, y: number } }} Route
 */
/**
 * One action of a fragment (波次-1): SPAWN an enemy `key` on `route`; ACTIVATE or WITHDRAW the predefined unit whose
 * alias is `key`; NONE does nothing. Its i-th of `count` times comes `preDelay + i × interval` seconds after its
 * fragment starts (波次-2). `dontBlockWave`: its enemies need not be handled for the wave to end (波次-3); `hidden`:
 * its hidden group (波次-4); `group`, `pack`, `weight`: random alternatives (波次-5); `unharmful`: its enemies cost no life
 * at the goal (目标-1).
 * @typedef {{ type: 'SPAWN' | 'ACTIVATE' | 'WITHDRAW' | 'NONE', key: string, route: number, count: number, preDelay: number, interval: number,
 *   dontBlockWave?: boolean, hidden?: string, group?: string, pack?: string, weight?: number, unharmful?: boolean }} WaveAction
 */
/** A fragment (波次-1, 波次-2). @typedef {{ preDelay: number, actions: WaveAction[] }} Fragment */
/** A wave (波次-1…波次-3); `maxWait` is maxTimeWaitingForNextWave, −1 for none. @typedef {{ preDelay: number, postDelay: number, maxWait: number, fragments: Fragment[] }} Wave */
/** A predefined unit (波次-6). @typedef {{ alias: string, key: string, hidden: boolean }} Predefine */
/**
 * A co-op stage (合作-6, 合作-7): the alias of its controller, its objective, the minimum and advanced targets (for 突击 as
 * fractions of `hpMax`; for 生存 in seconds), its time limit and the rest before it in seconds, the enemy 渗透 counts.
 * @typedef {{ alias: string, objective: 'protect' | 'target' | 'kill' | 'survive' | 'boss' | 'tower' | 'car', goal: number, advanced?: number,
 *   time: number, rest: number, enemy?: string, hpMax?: number }} Stage
 */
/**
 * A level's options; `costTransfer` is the most a cost request moves (合作-5; default 15).
 * @typedef {{ maxLifePoint: number, initialCost: number, maxCost: number, costIncreaseTime: number, characterLimit: number, moveMultiplier: number, costTransfer?: number }} LevelOptions
 */
/**
 * A level: its map, options, routes, waves (波次-1), the hidden groups enabled (波次-4), its predefined units (波次-6) and
 * its co-op stages (合作-6).
 * @typedef {import('./level.js').LevelMap & { id: string, options: LevelOptions, routes: Route[], waves: Wave[], hiddenGroups?: string[],
 *   predefines?: Predefine[], stages?: Stage[], view?: number[] }} Level
 */

/** @typedef {'phys' | 'arts' | 'true' | 'elemental'} DamageType */

/**
 * A unit's attack clip as its Spine skeleton gives it (攻击-2): the clip's length and its OnAttack time, in seconds.
 * @typedef {{ duration: number, hit: number }} AttackTiming
 */

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
 * @property {AttackTiming} [attack] its attack clip's timing (攻击-2); none: the attack lands as it starts
 * @property {boolean} [shared] a 共同敌手: it costs every player a life at any goal (合作-2)
 * @property {boolean} [neutral] a neutral unit (合作-9)
 * @property {number} [deathLife] the lives a neutral unit costs when knocked down (合作-9)
 * @property {number} [lifePointReduce] the lives it costs at the goal (目标-1; default 1)
 */

/**
 * An enemy's skill (敌能-1): its name (prefabKey), first and later cooldowns in seconds, blackboard.
 * @typedef {{ key: string, cooldown: number, initCooldown: number, bb: Record<string, number> }} FoeSkill
 */
/**
 * An enemy: `blockCnt` is how much block it takes (阻挡数消耗, default 1); `rangeRadius` its attack radius in tiles and
 * `applyWay` MELEE, RANGED or ALL (敌人攻击-1); its talents by name and its skills (敌能-1).
 * @typedef {OptionalStats & { name: string, maxHp: number, atk: number, def: number, res: number, moveSpeed: number, motion?: string,
 *   baseAttackTime?: number, blockCnt?: number, rangeRadius?: number, applyWay?: string, talents?: Record<string, Record<string, number>>,
 *   skills?: FoeSkill[] }} EnemyDef
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
 * @property {boolean} [stoppable] the player may close it while it runs (技能-7)
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
 * @property {Splash | null} splash its attack also hits the enemies around the target (职业-8)
 * @property {number} aftershock its attack hits once more at this share of its 倍率 (0: no aftershock; 职业-8)
 * @property {number} unblockedScale its attack's 倍率 against an enemy it does not block is multiplied by this (职业-8)
 * @property {number} selfHeal HP it restores itself for each enemy an attack of its reaches (职业-9)
 * @property {number | 'blockCnt'} selfHealMax at most this many such heals an attack (its 阻挡数, at least 1)
 * @property {Record<string, number>} bb the trait's blackboard, for its behaviour
 */
/**
 * A splash (职业-8): every other enemy within `radius` tiles of the target (only those on the ground when `ground`)
 * takes the hit at `scale` of its amount.
 * @typedef {{ radius: number, scale: number, ground: boolean }} Splash
 */
/**
 * An operator: `branch` is its profession branch (subProfessionId), `trait` the branch's trait (职业-1), `respawnTime`
 * its 再部署时间 in seconds (部署-3; default 60).
 * @typedef {OptionalStats & { name: string, position: string, cost: number, blockCnt: number, baseAttackTime: number, maxHp: number, atk: number, def: number, res: number,
 *   range: Cell[], skill?: SkillDef, branch?: string, profession?: string, trait?: Partial<TraitDef>, respawnTime?: number, char?: string }} OperatorDef
 */
/**
 * Behaviours by key (ADR 0054, 0055): what a skill or a buff does beyond its data. Content brings them; the default is
 * the generic one (技能-5).
 * @typedef {{ skills?: Record<string, import('./skills.js').SkillBehavior>, buffs?: Record<string, import('./buffs.js').Behavior>, traits?: Record<string, import('./traits.js').TraitBehavior>,
 *   foes?: Record<string, import('./foes.js').FoeBehavior> }} Behaviors
 */
/**
 * The content of a battle: the level, enemies, operators, behaviours, and each seat's deck of operator keys when the
 * match gives them (同步-9; none: every operator for every seat).
 * @typedef {{ level: Level, enemies: Record<string, EnemyDef>, operators: Record<string, OperatorDef>, behaviors?: Behaviors, decks?: string[][] }} Content
 */

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
 * @property {boolean} shared a 共同敌手 (合作-2)
 * @property {string} levelType NORMAL, ELITE or BOSS (领袖, 合作-7)
 * @property {boolean} neutral a neutral unit (合作-9)
 * @property {number} deathLife the lives a neutral unit costs when knocked down (合作-9)
 * @property {number} lifeCost the lives an enemy costs at the goal (目标-1: lifePointReduce, default 1)
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
 * @property {number} wave the wave that must wait for it to be handled (波次-3), −1 for none
 * @property {boolean} [unharmful] it costs no life at the goal (目标-1)
 * @property {Record<string, number>} ab an enemy's ability state (敌能-2): cooldowns, marks, what it saw last turn
 * @property {SkillState | null} skill its skill, null when it has none (技能-1)
 * @property {Record<string, number>} ep element values below their maximum, by element (元素-1); none recorded is at its maximum
 * @property {number} paid the cost its deployment took, 0 for enemies (撤退-1)
 * @property {Swing | null} swing the attack it is in the wind-up of, null for none (攻击-2)
 * @property {number} anim schema ANIM
 */

/**
 * An attack under way (攻击-2): frames until it lands, frames since it began, the ids of its locked targets, its mods;
 * a channel's hits still to come (敌能-6).
 * @typedef {{ wind: number, since: number, targets: number[], mods: import('./skills.js').AttackMods, left?: number }} Swing
 */
/**
 * A delayed explosion (敌能-3): where, how far it reaches, frames left, whether it reaches flying units, its source's id
 * (−1 for none), what it does.
 * @typedef {{ x: number, y: number, radius: number, left: number, air: boolean, src: number, type: DamageType, amount: number,
 *   status: { key: string, seconds: number } | null }} Blast
 */
/**
 * A 直击 bolt in flight (敌能-4): its source's id, where it is, its direction, what it does — or the radius of the
 * explosion it sets off (0 for none).
 * @typedef {{ src: number, x: number, y: number, dx: number, dy: number, type: DamageType, amount: number, status: { key: string, seconds: number } | null,
 *   blast: number }} Bolt
 */

/**
 * A projectile in flight (攻击-3): its shooter's and its target's ids, where it is (tile coordinates), its speed in
 * tiles per second, and what it carries — the damage type and amount, hits, 元素损伤 ('' and 0 for none).
 * @typedef {{ src: number, target: number, sx: number, sy: number, speed: number, type: DamageType, amount: number, times: number, element: string, ep: number,
 *   splash?: Splash | null, aftershock?: number }} Shot
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
/**
 * A player: life, cost and its timer, the operators on the field, the deck's cards; `revive` is the frames left until a
 * down player comes back (−1 when not down), `downs` how often they went down (合作-4); `ask` the frames left of their
 * open cost request (−1 for none), `askCd` the frames until they may ask again (合作-5).
 * @typedef {{ life: number, cost: number, costTimer: number, deployed: string[], cards: Record<string, Card>, revive: number, downs: number,
 *   ask: number, askCd: number }} Player
 */

/**
 * The co-op stages' progress (合作-6, 合作-7): the current stage (−1 before the first), the frame its clock starts (after
 * its rest), whether it is running, its count (rescued, knocked down) and whether a leader left the field, the team's
 * stamps and the stages passed.
 * @typedef {{ index: number, start: number, running: boolean, count: number, died: boolean, stamps: number, passed: number }} StageState
 */

/**
 * The waves' progress (波次-2, 波次-3): the current wave (−1 before the first), its step — `pre` its preDelay, `frags`
 * its fragments, `hold` waiting for its enemies, `post` its postDelay, `done` all waves over — and the frame the step's
 * timing counts from; the current fragment, the frame it started (−1 while its preDelay runs) and how often each of its
 * actions has acted; the random alternatives chosen for the wave, as indices into its actions in order (波次-5).
 * @typedef {{ wave: number, step: 'pre' | 'frags' | 'hold' | 'post' | 'done', at: number, frag: number, fragAt: number, fired: number[],
 *   chosen: number[] }} Schedule
 */

/**
 * @typedef {object} World
 * @property {number} frame frames done
 * @property {number} rng uint32 state (rng.js)
 * @property {number} nextId the next unit id
 * @property {Player[]} players
 * @property {Unit[]} units in creation order
 * @property {Schedule} sched where the waves are (波次-2)
 * @property {string[]} predefined the aliases of the predefined units in effect (波次-6)
 * @property {number} result the battle's result (结束-1): −1 going on, 0 lost, 1 won
 * @property {StageState} stage the co-op stages (合作-6)
 * @property {Blast[]} blasts delayed explosions (敌能-3)
 * @property {Bolt[]} bolts 直击 bolts in flight (敌能-4)
 * @property {number} bornThisFrame units created so far in this frame
 * @property {Shot[]} shots projectiles in flight, in launch order (攻击-3)
 * @property {Record<string, string | number>[]} events this frame's presentation events (not part of the state)
 */

export {};
