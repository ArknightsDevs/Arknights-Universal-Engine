# 干员的练度

玩家的干员带着练度出战：精英化阶段、等级、潜能、信赖、技能和技能等级。实现见 `packages/data/src/operators.js`（提取）和 `packages/content/src/operators.js`（按练度组装）。

### 干员-1 属性

按练度算干员的基础属性（属性-1 的基础值）：

1. **精英化与等级**：取精英化阶段的属性关键帧（数据里每个阶段是 1 级和满级两帧），在两帧之间按等级线性插值，不取整。等级限制在 1 到这个阶段的满级之间。
2. **信赖**：信赖加成的关键帧是信赖等级 0 和 50（信赖 100%），信赖 0%–100% 之间线性插值，超过 100% 按 100% 算，加到上一步的结果上。
3. **潜能**：潜能 n（1–6）应用前 n − 1 个潜能提升里的属性修正，都是直接加算：`COST` 部署费用、`RESPAWN_TIME` 再部署时间、`ATK` 攻击、`DEF` 防御、`MAX_HP` 生命、`ATTACK_SPEED` 攻击速度、`MAGIC_RESISTANCE` 法术抗性。

攻击范围取这个精英化阶段的范围。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563) 页面注释中的属性计算器说明：「影响属性计算器运算结果的因素有：精英化阶段、等级、潜能等级和信赖值」「根据精英化阶段和等级两个属性计算出第二步运算所需的属性数值」「通过信赖表格获得信赖值所对应的信赖等级，按照该干员定义的信赖加成数值和上一步运算的结果，计算出第三步运算所需的属性数值」「附加上潜能给予的属性（通常为直接加算）」；[PRTS「信赖值」oldid=430483](https://prts.wiki/index.php?title=%E4%BF%A1%E8%B5%96%E5%80%BC&oldid=430483)「干员信赖值达到100%后，属性加成达到上限」；数据：character_table 的 phases[].attributesKeyFrames、favorKeyFrames、potentialRanks；线性插值不取整、信赖等级 50 即 100% 为推断 INF-0078

### 干员-2 技能与技能等级

干员带一个技能（第几个技能，从 0 数）出战，技能等级 1–7，专精 1–3 记作 8–10，取 skill_table 中这个技能的第（等级 − 1）级数据（技能-1）。精英化阶段低于技能的解锁阶段时不能带这个技能；技能没有那么多级时取最后一级。技能能否主动关闭（技能-7）也按这一级的说明判断。

- 来源：数据：character_table 的 skills[]（skillId、unlockCond.phase）、skill_table[].levels[]；[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「专精3等级的推进之王碎颅击」等写法；专精记作 8–10 是设计决定

### 干员-3 特性的练度

分支特性的 blackboard（职业-7）取特性候选中已经解锁的最后一个：解锁阶段不高于干员的精英化阶段（同一阶段时解锁等级不高于干员等级），需要的潜能不高于干员的潜能。没有特性记录的干员 blackboard 为空。

- 来源：数据：character_table 的 trait.candidates[]（unlockCondition.phase、unlockCondition.level、requiredPotentialRank、blackboard）；取最后一个已解锁的候选为推断 INF-0079

### 干员-4 天赋

干员的天赋按 character_table 里 talents 的顺序记录，每个天赋是它的候选列表（talents 为空，或某个天赋没有候选时，对应为空列表）。每个候选记录：解锁的精英化阶段（`PHASE_n` 记作 n）和等级，需要的潜能（0–5），名称、描述（原文，富文本标签保留）、范围编号 `rangeId`（没有为 null），以及 blackboard。候选的解锁条件和特性候选一样（干员-3）。

blackboard 里的数值条目记作 `{ 键: 值 }`；带 `valueStr` 的条目是文本（它的值只是占位），另记作 `text: { 键: 文本 }`，没有文本条目时不写 `text`。同一个候选里键重复时报错。

`isHideTalent` 为真的候选是不在干员信息里展示的天赋（名称和描述为空，多半带着召唤物或模组用的数据，`token` 记 `tokenKey`），也照样保留，用 `hidden: true` 标明，由使用方决定是否展示。

- 来源：数据：character_table 的 talents[].candidates[]（unlockCondition.phase、unlockCondition.level、requiredPotentialRank、name、description、rangeId、blackboard[].key/value/valueStr、isHideTalent、tokenKey）；保留隐藏天赋、文本条目另记是设计决定

### 干员-5 模组

干员的模组取 uniequip_table 的 `charEquip[干员 id]` 里列出的、在 battle_equip_table 里有战斗数据的那些，按 charEquip 的顺序；初始的「证章」没有战斗数据，不记录。模组的 `charId` 必须是这个干员，否则报错。每个模组记录：编号、名称（uniEquipName）、类型（`typeName1` 和 `typeName2` 以 `-` 连接，如 `SUM-X`，没有 typeName2 时只有 typeName1）、解锁的精英化阶段（unlockEvolvePhase）和等级（unlockLevel），以及每一级（battle_equip_table 的 phases[]，`equipLevel`）的内容：

1. **属性加成** `stats`：attributeBlackboard 里每个键加到干员属性上，用引擎的属性名（属性-1）：`max_hp`→`maxHp`、`atk`→`atk`、`def`→`def`、`attack_speed`→`aspd`、`magic_resistance`→`res`、`cost`→`cost`、`respawn_time`→`respawnTime`、`block_cnt`→`blockCnt`、`base_attack_time`→`baseAttackTime`。不在这个表里的键报错，不丢弃。
2. **召唤物的属性加成** `tokens`：tokenAttributeBlackboard 按召唤物 id 分开记录，键用同一张表，再加 `max_deck_stack_cnt`→`maxDeckStackCnt`、`max_deploy_count`→`maxDeployCount`（可同时部署的数量，引擎还没有对应的属性）。
3. **部件** `parts`：每个部件记录目标 `target`（`TRAIT`、`TRAIT_DATA_ONLY`、`DISPLAY`、`OVERWRITE_BATTLE_DATA`、`TALENT`、`TALENT_DATA_ONLY`，其他值报错）、是否属于召唤物 `token`（isToken）、只在哪种游戏模式和地图标签下有效（`gameTag`、`mapTag`，没有限制为 null）。部件的特性候选 `trait` 记：解锁阶段、等级、潜能、追加描述 `add`（additionalDescription）、替换描述 `override`（overrideDescripton，数据里就这样拼）、`rangeId`、blackboard（写法同干员-4）。部件的天赋候选 `talents` 记：`index`（talentIndex：加到第几个天赋上，从 0 数；−1、−2 是模组自己带的天赋）、解锁阶段、等级、潜能、名称、升级描述 `upgrade`（upgradeDescription）、`rangeId`、blackboard、`hidden`、`modes`（validModeIndices，没有为 null）。描述都是原文。

这里只记录数据，模组怎样改变干员由使用方决定。`DISPLAY` 部件只有展示用的特性说明，`TRAIT` 和 `TRAIT_DATA_ONLY` 覆盖特性数据，`TALENT` 和 `TALENT_DATA_ONLY` 增加或覆盖天赋数据，`OVERWRITE_BATTLE_DATA` 的 blackboard 全是文本条目；这些含义是按目标名字做的推断，没有逐一核对。阿米娅的转职形态（char_1001_amiya2、char_1037_amiya3）不在 character_table 的干员里，它们的模组不记录。

- 来源：数据：uniequip_table 的 charEquip、equipDict[]（uniEquipName、typeName1、typeName2、unlockEvolvePhase、unlockLevel、charId）；battle_equip_table[].phases[]（equipLevel、attributeBlackboard、tokenAttributeBlackboard、parts[].target/isToken/validInGameTag/validInMapTag/overrideTraitDataBundle.candidates[]/addOrOverrideTalentDataBundle.candidates[]）；键的对应关系和 `maxDeckStackCnt`、`maxDeployCount` 两个名字是设计决定
