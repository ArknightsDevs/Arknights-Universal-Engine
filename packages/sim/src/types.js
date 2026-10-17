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
 * alias is `key`; STORY tells the story `key` (波次-8); NONE does nothing. Its i-th of `count` times comes `preDelay + i × interval` seconds after its
 * fragment starts (波次-2). `dontBlockWave`: its enemies need not be handled for the wave to end (波次-3); `hidden`:
 * its hidden group (波次-4); `group`, `pack`, `weight`: random alternatives (波次-5); `unharmful`: its enemies cost no life
 * at the goal (目标-1).
 * @typedef {{ type: 'SPAWN' | 'ACTIVATE' | 'WITHDRAW' | 'STORY' | 'NONE', key: string, route: number, count: number, preDelay: number, interval: number,
 *   dontBlockWave?: boolean, hidden?: string, group?: string, pack?: string, weight?: number, unharmful?: boolean }} WaveAction
 */
/** A fragment (波次-1, 波次-2). @typedef {{ preDelay: number, actions: WaveAction[] }} Fragment */
/** A wave (波次-1…波次-3); `maxWait` is maxTimeWaitingForNextWave, −1 for none. @typedef {{ preDelay: number, postDelay: number, maxWait: number, fragments: Fragment[] }} Wave */
/**
 * A level's own cards (关卡-7): its operator cards with their training, its token cards with their count, alias and
 * whether they are hidden at first (波次-9).
 * @typedef {{ operators: { key: string, build: import('@aue/schema').Build }[], tokens: { key: string, alias: string, count: number, hidden: boolean }[] }} LevelCards
 */
/**
 * A predefined unit (波次-6): its tile and facing when the data gives them; a predefined operator's training (波次-7).
 * @typedef {{ alias: string, key: string, hidden: boolean, row?: number, col?: number, dir?: string, build?: import('@aue/schema').Build }} Predefine
 */
/**
 * A device's record (关卡-6, 装置-1): its name, attributes and its talents' blackboard; its side when it is the enemies'
 * (装置-3), the statuses it is immune to, and the modifiers it gives every enemy while on the field (装置-4).
 * @typedef {{ name: string, maxHp: number, atk: number, def: number, res: number, blockCnt: number, baseAttackTime: number, aspd: number, tauntLevel: number,
 *   massLevel: number, talentBb: Record<string, number>, side?: 'ENEMY', immune?: string[], enemyMods?: Record<string, number>, talents?: Record<string, number>[],
 *   cost?: number, facility?: FacilityDef, builder?: BuilderDef, rubble?: RubbleDef, inert?: boolean }} DeviceDef
 */
/**
 * 堡垒守御 (守御-1…守御-6): the level's times in seconds and the life a rest gives; a facility's kind, its modes'
 * blackboards by level and a roadblock's blast; a builder's progress key, hits and seconds on the field; the rubble
 * pile's range cells, its guards' branch and its check times.
 * @typedef {{ rest: number, wave: number, waveLast: number, life: number, restAdd: number }} FortressRules
 * @typedef {{ kind: 'workshop' | 'lounge' | 'platform' | 'roadblock' | 'gym', modes: Record<string, number>[], boom?: number }} FacilityDef
 * @typedef {{ sp: 'sp' | 'sp2', hits: number, life: number }} BuilderDef
 * @typedef {{ range: string, cells: Cell[], branch: string, first: number, every: number }} RubbleDef
 */
/**
 * A co-op stage (合作-6, 合作-7): the alias of its controller, its objective, the minimum and advanced targets (for 突击 as
 * fractions of `hpMax`; for 生存 in seconds), its time limit and the rest before it in seconds, the enemy 渗透 counts; its
 * task's title and texts for the page (关卡-5).
 * @typedef {{ alias: string, objective: 'protect' | 'target' | 'kill' | 'survive' | 'boss' | 'tower' | 'car', goal: number, advanced?: number,
 *   time: number, rest: number, enemy?: string, hpMax?: number, task?: { title: string, basic: string, advanced?: string } }} Stage
 */
/**
 * A level's options; `costTransfer` is the most a cost request moves (合作-5; default 15).
 * @typedef {{ maxLifePoint: number, initialCost: number, maxCost: number, costIncreaseTime: number, characterLimit: number, moveMultiplier: number, costTransfer?: number,
 *   characterLimitAdd?: number[] }} LevelOptions
 */
/**
 * A level: its map, options, routes, waves (波次-1), the hidden groups enabled (波次-4), its predefined units (波次-6) and
 * its co-op stages (合作-6).
 * @typedef {import('./level.js').LevelMap & { id: string, code?: string, name?: string, options: LevelOptions, routes: Route[], waves: Wave[],
 *   hiddenGroups?: string[], predefines?: Predefine[], stages?: Stage[], view?: number[], works?: { dealt: number, taken: number }, cards?: LevelCards,
 *   branches?: Record<string, Fragment[]>, fortress?: FortressRules, uncovered?: string[] }} Level
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
 * What a skill's description adds (技能-9): modifiers while it runs; and for its attacks, every enemy the operator blocks
 * as targets, `more` targets than it would have, `times` hits, the damage type, a status each hit gives.
 * @typedef {{ mods?: Record<string, number>, attack?: { blocked?: boolean, more?: number, times?: number, type?: DamageType,
 *   hitStatus?: { key: import('./status.js').StatusKey, seconds: number } } }} SkillExtra
 */
/**
 * An enemy's skill (敌能-1): its name (prefabKey), first and later cooldowns in seconds, SP cost (spCost; 0 for none),
 * blackboard.
 * @typedef {{ key: string, cooldown: number, initCooldown: number, sp?: number, bb: Record<string, number> }} FoeSkill
 */
/**
 * An enemy: `blockCnt` is how much block it takes (阻挡数消耗, default 1); `rangeRadius` its attack radius in tiles and
 * `applyWay` MELEE, RANGED or ALL (敌人攻击-1); its talents by name and its skills (敌能-1); its tags (关卡-1).
 * @typedef {OptionalStats & { name: string, maxHp: number, atk: number, def: number, res: number, moveSpeed: number, motion?: string,
 *   baseAttackTime?: number, blockCnt?: number, rangeRadius?: number, applyWay?: string, talents?: Record<string, Record<string, number>>,
 *   skills?: FoeSkill[], tags?: string[] }} EnemyDef
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
 * @property {Cell[]} [range] the operator's attack range while it runs (技能-8)
 * @property {SkillExtra} [extra] what its description adds to the blackboard's effects (技能-9)
 * @property {boolean} [rangeAll] while it runs the operator's attack reaches the whole map (技能-8)
 */
/**
 * A 傀儡师's 替身 (职业-15, 职业-16). The fields after `maxHp` may be left out: no range of its own, ground units only, it
 * attacks, no aura.
 * @typedef {object} Doll
 * @property {number} duration the seconds it fights
 * @property {number} switch the seconds of each switch
 * @property {number} atk its attack + this (直接乘算)
 * @property {number} maxHp its maximum HP + this (直接乘算)
 * @property {Cell[] | null} [range] its own range, as offsets facing right, in place of the operator's (职业-16)
 * @property {boolean} [antiAir] its normal attack can select flying units
 * @property {boolean} [attack] false: it makes no normal attack
 * @property {{ moveMul: number, scale: number } | null} [aura] the ground enemies in its range move at × `moveMul` (最终乘算)
 *   and take `scale` × its attack as arts damage each second
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
 * @property {{ key: import('./status.js').StatusKey, seconds: number, value?: number } | null} hitStatus a status each hit gives the target
 *   (with its strength, 状态-5)
 * @property {Splash | null} splash its attack also hits the enemies around the target (职业-8)
 * @property {number} aftershock its attack hits once more at this share of its 倍率 (0: no aftershock; 职业-8)
 * @property {number} unblockedScale its attack's 倍率 against an enemy it does not block is multiplied by this (职业-8)
 * @property {number} selfHeal HP it restores itself for each enemy an attack of its reaches (职业-9)
 * @property {number | 'blockCnt'} selfHealMax at most this many such heals an attack (its 阻挡数, at least 1)
 * @property {'attack' | 'damage'} selfHealOn when it heals itself: for the enemies an attack reaches, or for every hit it
 * deals (职业-9)
 * @property {boolean} rangedTiles a melee operator may also be deployed on ranged tiles (部署-1, 职业-10)
 * @property {boolean} meleeTiles a ranged operator may also be deployed on melee tiles (部署-1, 职业-19)
 * @property {boolean} skillArts its attacks started while its skill runs deal arts damage (职业-10)
 * @property {string[]} immuneBlocking the flags it is immune to while it blocks an enemy (职业-10)
 * @property {number} hpDrain the share of its maximum HP it loses each second, never the last point (职业-10)
 * @property {{ every: number, cost: number } | null} costDrain the cost it consumes every so many seconds on the field (职业-10)
 * @property {{ cells: Cell[], scale: number, outside: boolean } | null} zone its attack's (or heal's) 倍率 × scale for a target
 *   inside these tiles around it, turned with it — or, `outside`, for one outside them (职业-11)
 * @property {Chain | null} chain its attack or heal jumps on from its first target (职业-11)
 * @property {number} healOnHit a hit of its attack that deals damage heals the most wounded operator in its range by this share of it (职业-11)
 * @property {boolean} attackInSkill it makes normal attacks only while its skill runs (职业-12)
 * @property {Record<string, number>} idleMods modifiers while its skill does not run (职业-12)
 * @property {Record<string, boolean>} idleFlags flags while its skill does not run (职业-12)
 * @property {boolean} idleAirOnly while its skill does not run, its normal attack selects only flying enemies and those it
 *   blocks (职业-12)
 * @property {Splash | null} skillSplash its attack's splash while its skill runs (职业-12)
 * @property {number} liftoffBlock its block count while it took off (起飞), 0 for its 阻挡数 (阻挡-2, 职业-12)
 * @property {number} fortress a 要塞's ranged attack's splash radius, 0 for none: a melee attack on the enemies it blocks or
 *   on its tile, a ranged one with that splash on the others (职业-12)
 * @property {{ atk: number, steps: number, init?: number } | null} charge while its skill does not run, a step a second up to
 *   `steps`, each `atk` ÷ `steps` attack (直接乘算), from the steps of `init` attack at deployment; back to 0 after the
 *   skill ran (职业-12)
 * @property {number} skillHeal while its skill runs, its normal attacks heal at this 倍率 (职业-12)
 * @property {{ max: number, scale: number } | null} bullets each attack spends a bullet at this 倍率; it reloads one at a time (职业-12)
 * @property {number} store the most attack energy it stores when it has no target (0: none; 职业-12)
 * @property {number} epHeal its heals also restore each element value by this share of the heal (职业-12)
 * @property {{ out: number, back: number } | null} boomerang its attack throws boomerangs that come back, at these speeds
 *   (tiles per second); it attacks again only when it caught them all (职业-12)
 * @property {{ init: number, delta: number, max: number } | null} funnel its attack's 倍率: `init` on a new target, `delta` more
 *   for each attack on the one it attacked last, at most `max` (职业-12)
 * @property {boolean} noAttack it makes no normal attacks (职业-13)
 * @property {boolean} free it does not count towards the deploy limit (部署-2, 职业-13)
 * @property {number} regenAura the operators in its attack range gain 生命回复速度 of this share of its attack (职业-13)
 * @property {boolean} summonBlocked its normal attack can also select the enemies its own summons block, wherever they
 *   stand (职业-14)
 * @property {number} summonBlockedScale its attack's 倍率 against an enemy one of its own summons blocks is multiplied by
 *   this (职业-14)
 * @property {boolean} trapTiles its summons cannot be deployed on a tile a ground enemy stands on (职业-14)
 * @property {Doll | null} doll brought to 0 HP in its own form it switches (`switch` seconds) to its 替身, which fights
 *   `duration` seconds with attack and maximum HP + `atk`, `maxHp` (直接乘算), then switches back (职业-15)
 * @property {VsScale[]} vs its hits' attack 倍率 or 伤害倍率, or its heals' 倍率, against a target as `when` says (职业-17)
 * @property {{ min: number, max: number, dmg: number } | null} far its hits' 伤害倍率 by the distance to the target: 1 up to
 *   `min` tiles, 1 + `dmg` at `max` and on (职业-17)
 * @property {{ step: number, cap: number } | null} crowd its hits' 伤害倍率: + `step` for each enemy in its attack range, at
 *   most `cap` of them (职业-17)
 * @property {{ cnt: number, atk: number } | null} packed an attack whose splash reaches at least `cnt` enemies, the target's
 *   included, hits at `atk` × its 倍率 (职业-17)
 * @property {WhileMods[]} whiles modifiers it has while a condition on it holds (职业-18)
 * @property {number} extraArts each hit of its attack also deals arts damage of this share of its attack (职业-20)
 * @property {number} counterArts each hit of an enemy's attack on it deals the attacker arts damage of this share of its attack (职业-20)
 * @property {{ el: import('./elements.js').Element, ratio: number, arts: boolean } | null} epRider its damage (arts damage only, `arts`) also deals 元素损伤 of
 *   `el` of `ratio` of the HP it took (职业-20)
 * @property {{ el: import('./elements.js').Element, scale: number } | null} burstHit its damage on a target in a burst of `el` also deals elemental damage of
 *   `scale` of its attack (职业-20)
 * @property {{ on: 'elite' | 'survives' | 'catch', sp: number, every?: number } | null} spOn SP for a hit of its attack on an elite or
 *   leader, on a target it did not bring down, or every `every` boomerangs caught (职业-20)
 * @property {{ atk: number, max: number } | null} payStack each upkeep payment, attack + `atk` (直接乘算), at most `max` steps (职业-20)
 * @property {ModuleAura[]} auras modifiers or flags it gives other units while they are so (职业-20)
 * @property {number} firstCost added to its deploy cost before its first deployment, the cost never below 0 (职业-21)
 * @property {number} firstRetreatRespawn × its 再部署时间 after its first retreat (职业-21)
 * @property {boolean} refundUncapped a retreat's refund is not capped at its initial cost (撤退-1, 职业-21)
 * @property {number} freeSummons this many of its summons on the field take no place in the deploy limit (部署-2, 职业-21)
 * @property {{ prob: number, scale: number } | null} summonBoost a summon deployed from its card deals × `scale` damage at the
 *   chance `prob` (职业-21)
 * @property {Record<string, number>} bb the trait's blackboard, for its behaviour
 */
/**
 * Modifiers or flags an operator's trait gives other units (职业-20): the enemies it blocks (`blocked`), those its own
 * summons block (`summonBlocked`), those with a tile in its attack range (`range`), the operator on the tile in front of
 * it (`frontAlly`), its own summons (`summons`) — a buff on each while they are so; `skill`: only while its skill runs.
 * @typedef {{ to: 'blocked' | 'summonBlocked' | 'range' | 'frontAlly' | 'summons', skill?: boolean, mods?: Record<string, number>, flags?: Record<string, boolean> }} ModuleAura
 */
/**
 * A trait's modifiers while a condition on the operator holds (职业-18): it blocks an enemy (`blocking`) or none
 * (`notBlocking`); its HP is above or below `value` of its maximum (`hpAbove`, `hpBelow`); at least `value` enemies are in
 * its own attack range (`enemies`), or ground ones (`groundEnemies`), or an elite or leader is (`eliteEnemies`), or one in
 * an element burst (`burstEnemies`); at least `value` other operators are in it (`allies`), or a wounded friendly unit
 * (`injuredAllies`), or one with element damage (`epAllies`), or another operator whose skill runs (`skillAllies`); no
 * other operator stands on the 4 tiles next to it (`alone4`) or the 8 around it (`alone8`); it holds stored attack energy
 * (`energy`); its skill runs (`inSkill`); always (`always`). The buff may carry flags too.
 * @typedef {{ when: 'blocking' | 'notBlocking' | 'hpAbove' | 'hpBelow' | 'enemies' | 'groundEnemies' | 'eliteEnemies' | 'burstEnemies'
 *   | 'allies' | 'injuredAllies' | 'epAllies' | 'skillAllies' | 'alone4' | 'alone8' | 'energy' | 'always' | 'inSkill', value?: number,
 *   mods: Record<string, number>, flags?: Record<string, boolean> }} WhileMods
 */
/**
 * A trait's 倍率 against a target (职业-17): × `atk` on a hit's attack 倍率 (before the target's 防御), × `dmg` on its 伤害倍率,
 * × `heal` on a heal, while the target is blocked or blocks a unit (`blocked`), flies (`flying`), is on the ground while
 * the operator's skill runs (`skillGround`), has less than `value` of its maximum HP (`hpBelow`), has a 重量等级 of at least
 * `value` (`heavy`), stands on the line of tiles straight in front of the operator (`front`), on its tile or the 8 around
 * (`near`), is in an element burst (`burst`), stands on a ground tile (`onGround`), or the hit is the skill's (`skill`);
 * `noDodge`: such a physical hit cannot be dodged; × `ep` on the 元素损伤 it deals the target, an elite or leader (`elite`).
 * @typedef {{ when: 'blocked' | 'flying' | 'skillGround' | 'hpBelow' | 'heavy' | 'front' | 'near' | 'burst' | 'onGround' | 'skill' | 'elite',
 *   atk?: number, dmg?: number, heal?: number, ep?: number, value?: number, noDodge?: boolean }} VsScale
 */
/**
 * A chain (职业-11): at most `max` targets in all, each jump at `scale` × the one before; a damage chain jumps to the
 * nearest enemy within `radius`, a heal chain to an operator among `cells` around the current target.
 * @typedef {{ max: number, scale: number, radius: number, cells: Cell[] | null }} Chain
 */
/**
 * A splash (职业-8): every other enemy within `radius` tiles of the target (only those on the ground when `ground`)
 * takes the hit at `scale` of its amount.
 * @typedef {{ radius: number, scale: number, ground: boolean }} Splash
 */
/**
 * An operator: `branch` is its profession branch (subProfessionId), `trait` the branch's trait (职业-1), `respawnTime`
 * its 再部署时间 in seconds (部署-3; default 60), `talentBb` the blackboard of its always-on talents (部署-4),
 * `fieldTalents` its talents for every operator of a profession or faction while it is on the field (部署-5), `powers`
 * its factions, `rangeTalents` its talents for the units in its attack range while it is on the field (部署-6),
 * `critTalents` its chances to strike harder (攻击-4), `timedTalents` its talents in time on the field (部署-7),
 * `deployTalents` what its talents do at its deployment (部署-8); from its seat's runes, `runeMods` its always-on buff
 * (符文-3), `probSp` its chances of SP on dealing damage (符文-4), `rangeSp` the SP it gives in its attack range (符文-5); a
 * carried unit's record (符文-6) what its deployment does (`carried`, 装置-6). A summon's record names its owner's key (`summoner`)
 * and how its card works (`summon`, 召唤-3, 召唤-4); `position` ALL lets it stand on melee and ranged tiles.
 * @typedef {OptionalStats & { name: string, position: string, cost: number, blockCnt: number, baseAttackTime: number, maxHp: number, atk: number, def: number, res: number,
 *   range: Cell[], skill?: SkillDef, branch?: string, profession?: string, trait?: Partial<TraitDef>, respawnTime?: number, char?: string,
 *   talentBb?: Record<string, number>, fieldTalents?: TeamTalent[], powers?: string[], rangeTalents?: RangeTalent[],
 *   critTalents?: CritTalent[], timedTalents?: TimedTalent[], deployTalents?: DeployTalent[], summoner?: string, summon?: SummonDef,
 *   runeMods?: Record<string, number>, probSp?: { prob: number, sp: number }[], rangeSp?: { sp: number, interval: number }, carried?: CarriedEffect, builder?: BuilderDef }} OperatorDef
 */
/**
 * A summon's card rules (召唤-3, 召唤-4): its limits on the field and held, what its owner's deployment adds (0: no card),
 * whether it takes a place in the deploy limit (部署占用数), its 再部署策略, whether it stays when its owner leaves (召唤-5),
 * whether it may only stand in its owner's attack range, the copies its owner's skill gives at its start or end (召唤-8),
 * the seconds it stays (召唤-9), what its owner's skill's end does to it (召唤-10), and for a tactical point the seconds
 * of its point form and its block bonus in its summon form (召唤-11).
 * @typedef {{ deployLimit: number, holdLimit: number, supply: number, occupy: number, respawn: 'default' | 'unique' | 'queue', stays?: boolean,
 *   ownerRange?: boolean, grant?: { n: number, at: 'start' | 'end' }, life?: number, skillEnd?: { recover: boolean, below?: number },
 *   tactical?: { every: number, block: number } }} SummonDef
 */
/**
 * A deployment talent (部署-8): SP between `sp[0]` and below `sp[1]`, a heal of every operator (`value` HP or `scale` × the
 * attack), shield layers.
 * @typedef {{ sp?: [number, number], heal?: { value: number } | { scale: number }, shield?: number }} DeployTalent
 */
/**
 * What a carried unit's deployment does (装置-6): for every operator on the field then, modifiers (`allyMods`) or a
 * barrier for `seconds`; damage to every enemy; every redeploying operator card ready; and a spray of SP — `shots`
 * times, one every `every` seconds, `sp` to each of up to `targets` operators on the field at random.
 * @typedef {{ seconds?: number, allyMods?: Record<string, number>, barrier?: number, enemyDamage?: { type: 'phys' | 'arts', amount: number }, readyCards?: boolean,
 *   spray?: { shots: number, every: number, targets: number, sp: number } }} CarriedEffect
 */
/**
 * A timed talent (部署-7): from deployment, a step of `mods` every `seconds` up to `max` steps ('stack'), the mods once
 * after `seconds` ('after'), or the mods for `seconds` ('during').
 * @typedef {{ kind: 'stack' | 'after' | 'during', seconds: number, max: number, mods: Record<string, number> }} TimedTalent
 */
/**
 * A chance talent (攻击-4): on each attack, with chance `prob`, the attack's 倍率 × `scale`, and maybe a stun of `stun`
 * seconds on each hit and `more` targets.
 * @typedef {{ prob: number, scale: number, stun?: number, more?: number }} CritTalent
 */
/**
 * An in-range talent (部署-6): modifiers for the enemies, or the (ranged) operators, in the holder's attack range.
 * @typedef {{ side: 'enemy' | 'ally', ranged: boolean, mods: Record<string, number> }} RangeTalent
 */
/**
 * A team talent (部署-5): for the operators of a profession, or of a faction, its blackboard.
 * @typedef {({ profession: string } | { power: string }) & { bb: Record<string, number> }} TeamTalent
 */
/**
 * Behaviours by key (ADR 0054, 0055): what a skill or a buff does beyond its data. Content brings them; the default is
 * the generic one (技能-5). `world` sets up a new world's hooks and timers (钩子-4).
 * @typedef {{ skills?: Record<string, import('./skills.js').SkillBehavior>, buffs?: Record<string, import('./buffs.js').Behavior>, traits?: Record<string, import('./traits.js').TraitBehavior>,
 *   foes?: Record<string, import('./foes.js').FoeBehavior>, world?: (w: World, c: Content) => void }} Behaviors
 */
/**
 * The content of a battle: the level, enemies, operators, behaviours, and each seat's deck of operator keys when the
 * match gives them (同步-9; none: every operator for every seat), and the kits it uses (兼容-6).
 * @typedef {{ level: Level, enemies: Record<string, EnemyDef>, operators: Record<string, OperatorDef>, devices?: Record<string, DeviceDef>, behaviors?: Behaviors, decks?: string[][],
 *   kits?: { sha: string, used: string[] } }} Content
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
 * @property {boolean} [hostile] a device on the enemies' side (装置-3)
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
 * @property {string} act the key its behaviour is found by, "" for its own key (状态-1)
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
 * @property {string} [alias] a device's predefined unit (装置-1)
 * @property {Cell[]} [range] an operator's own attack range when content changed it, over its record's (攻击-1)
 * @property {number[]} [reachExtra] extra tile keys content gave an operator's attack (攻击-1)
 * @property {Swing | null} swing the attack it is in the wind-up of, null for none (攻击-2)
 * @property {{ vx: number, vy: number, hard: number }} [slide] its 失衡 slide: speed (tiles/s) and 硬直 frames left (位移-3)
 * @property {number} anim schema ANIM
 * @property {number} [summoner] the id of the unit that summoned it (召唤-4, 召唤-6); left out for others
 * @property {number} [expires] the frame a summon with a time leaves at (召唤-9); left out for others
 * @property {{ level: number, top: number, pts: number }} [fac] a facility's level, highest level reached and progress (守御-3)
 * @property {{ hits: number, next: number, leave: number }} [bld] a builder's hits, the frame of its next and the frame it leaves at (守御-4)
 */

/**
 * An attack under way (攻击-2): frames until it lands, frames since it began, the ids of its locked targets, its mods;
 * a channel's hits still to come (敌能-6).
 * @typedef {{ wind: number, since: number, targets: number[], mods: import('./skills.js').AttackMods, left?: number, now?: boolean, free?: boolean }} Swing
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
 * An enemy another brings in after a delay (敌能-22): its key, where it appears, the route and leg it goes on with, the
 * frame its fragment began, the frames left.
 * @typedef {{ key: string, x: number, y: number, route: number, leg: number, frag: number, left: number }} Brood
 */

/**
 * A projectile in flight (攻击-3): its shooter's and its target's ids, where it is (tile coordinates), its speed in
 * tiles per second, and what it carries — the damage type and amount, hits, 元素损伤 ('' and 0 for none); a boomerang
 * (职业-12) its way back's speed and, on its way back, `ret` 1; `held` 1 while content holds it where it arrived.
 * @typedef {{ src: number, target: number, sx: number, sy: number, speed: number, type: DamageType, amount: number, times: number, element: string, ep: number,
 *   splash?: Splash | null, aftershock?: number, chain?: Chain | null, hitStatus?: { key: import('./status.js').StatusKey, seconds: number } | null,
 *   skill?: boolean, back?: number, ret?: number, held?: number, mark?: number, frozen?: number }} Shot
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
 * again from; `lock`, the enemy that devoured it (吞噬, 敌能-30) — locked while that enemy is on the field.
 * @typedef {{ penalty: number, ready: number, lock?: number, retreated?: boolean }} Card
 */
/**
 * A summon's card in a player's deck (召唤-4): copies held, the frame it may be deployed from, copies cooling (队列).
 * @typedef {{ held: number, ready: number, cooling: number }} SummonCard
 */
/**
 * A player: life, cost and its timer, the operators on the field, the deck's cards; `revive` is the frames left until a
 * down player comes back (−1 when not down), `downs` how often they went down (合作-4); `ask` the frames left of their
 * open cost request (−1 for none), `askCd` the frames until they may ask again (合作-5); its summons' cards, once one
 * has one (召唤-4).
 * @typedef {{ life: number, cost: number, costTimer: number, deployed: string[], cards: Record<string, Card>, revive: number, downs: number,
 *   ask: number, askCd: number, summons?: Record<string, SummonCard> }} Player
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
 * 堡垒守御's progress (守御-1, 守御-2, 守御-4, 守御-6): the phase — `defend`, `rest`, `go` (the rest over, the next wave
 * about to begin), `over` —, its wave (`round`), the frame the defence began and the frame the phase ends at, the last wave that
 * may begin; whether a player fell in this defence, the waves defended, the damage the last wave took; each seat's
 * 「休整完毕」 and builder cards; the rubble piles' guards to come and whether the advanced builder came this defence; the
 * enemies the wave spawns that it waits for and those of them gone from the field.
 * @typedef {{ phase: 'defend' | 'rest' | 'go' | 'over', round: number, start: number, until: number, next: number, fell: boolean, defended: number, damage: number,
 *   ready: boolean[], pools: Record<string, number>[], guards: { at: number, key: string, route: number }[], freed: boolean, total: number, out: number }} FortressState
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
 * @property {Brood[]} [broods] enemies brought in that appear later (敌能-22), once there has been one
 * @property {number} bornThisFrame units created so far in this frame
 * @property {FortressState} [fortress] 堡垒守御's progress (守御-1), only in its levels
 * @property {Shot[]} shots projectiles in flight, in launch order (攻击-3)
 * @property {Record<string, string | number>[]} events this frame's presentation events (not part of the state)
 * @property {import('./bus.js').Bus} [bus] the hook bus and timers (钩子-1, 钩子-2; not part of the state)
 */

export {};
