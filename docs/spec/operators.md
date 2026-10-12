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

### 干员-6 天赋的练度与常驻部分

每个天赋在一个练度下取它最后一个已解锁的候选，解锁条件同特性（干员-3）；没有已解锁候选的天赋不生效。装备模组时，模组可以把天赋换成它的升级（干员-7）。

天赋的**常驻部分**从部署起一直生效。描述去掉富文本标签和全角括号里的潜能差值、去掉末尾的「。」「；」后，取第一句（到第一个「。」或「；」为止），从第一个分句（以「，」分开）起数连续的**自身属性分句**，至少要有一个：

- 自身属性分句是「（但）（自身/自身的）属性（和/、属性）（各）带符号的数值（%、秒、/秒）」；
- 属性词和 blackboard 键的对应：攻击力 `atk`，防御力 `def`，生命上限、最大生命值、生命值 `max_hp`，攻击速度、攻速 `attack_speed`，法术抗性 `magic_resistance`，技力自然回复速度 `sp_recovery_per_sec`，再部署时间 `respawn_time`，部署费用 `cost`；
- 这些分句提到的键都在 blackboard 里，常驻部分就是这些键和它们的值；
- 描述只有这些分句时，blackboard 里其他键的值都要是 0；后面还有内容时，第一句里剩下的部分不能提到「效果」（它可能改变前面的加成，如「自身受到伤害后失去该效果」「……时效果翻倍」）；
- 隐藏候选（干员-4）没有常驻部分。

例：「攻击速度+6」整句常驻；「攻击力+8%，攻击变为弱点伤害」的攻击力加成常驻，弱点伤害不在这里；「攻击力+6%，生命上限+10%。置入战场后这个效果会同样赋予给一名随机友方单位」的第一句是干员自己的常驻加成；「部署后随机永久获得下列一项增益：……」「攻击速度+10，自身受到伤害后失去该效果」没有常驻部分。

各天赋的常驻部分按键相加（值为 0 的键略去）：`cost` 加到部署费用、`respawn_time` 加到再部署时间（都不低于 0），其余的键作为干员的 `talentBb`，部署时成为 Buff（部署-4）。天赋的其他内容（有条件的、影响别的单位的、带行为的）还没有实现。

- 来源：数据：character_table 的 talents（干员-4）；按描述判定常驻部分、和技能的属性加成同样换算为推断 INF-0088；部署费用的增减在费用倍率之前：[PRTS「部署费用」oldid=434779](https://prts.wiki/index.php?title=%E9%83%A8%E7%BD%B2%E8%B4%B9%E7%94%A8&oldid=434779)「部署费用（属性）=(初始部署费用+基础费用增减)×费用倍率+实时费用增减」

### 干员-7 模组的练度

练度可以带一个模组：`module` 是干员模组列表（干员-5）里的序号（从 0 数，−1 或不写表示不带），`moduleLevel` 是模组等级 1–3（超过模组的等级数时取最后一级，不写为 1）。模组要在它的解锁精英化阶段和等级之后才能带，否则报错。

- **属性**：模组这一级的属性加成 `stats` 和潜能一样加到原始属性上（在潜能之后）。
- **天赋**：这一级里目标为 `TALENT` 或 `TALENT_DATA_ONLY`、不属于召唤物、对所有模式和地图有效（`gameTag`、`mapTag` 为 null）的部件，按顺序取其中已解锁的天赋候选（解锁条件同干员-3）；`index` 不小于 0 的候选替换第 `index` 个天赋的候选，描述用它的升级描述 `upgrade`，再按干员-6 取常驻部分。同一个天赋有几个这样的候选时，最后一个起作用。
- **还没有实现**：模组的特性部件（追加或替换特性）、模组自己带的天赋（`index` 为负）、召唤物的属性加成、只在某些模式或地图有效的部件。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「属性」定义：「信赖、潜能和模组提供数值也会在这一步计（算）入，使得原始属性变为原始属性+」；数据：uniequip_table 的 unlockEvolvePhase、unlockLevel，battle_equip_table 的 phases[]；天赋部件替换天赋的方式为推断 INF-0089

### 干员-8 范围表

range_table 的每个范围按编号记录它的格子（`grids` 的 row、col，原样），按编号排序，写进 `packages/content/data/ranges.json`。特性、天赋按编号引用其中的范围（如 职业-11 的近处范围）；格子相对于干员所在格，随干员朝向转动，和攻击范围相同。

- 来源：数据：range_table 的 grids

### 干员-9 队伍天赋

天赋（含模组的升级，干员-7）的**队伍部分**：描述按 干员-6 去掉标签和潜能差值后，第一句以「编入队伍时」（对卡组）或「在场时」（在场上）开头，接着是「所有（友方）【职业或势力】（职业 / 势力的）干员（的）」（职业为先锋、近卫、重装、狙击、术师、医疗、辅助、特种之一，可以不带【】；势力为 干员-10 的势力名称，如【深海猎人】），然后是开头连续的队伍分句，至少一个：

- 属性（和/、属性）（各）带符号的数值，或「提升」加数值（%、秒、/秒）；属性词同 干员-6，另加 初始技力 `sp`；
- 「每秒回复N点生命」：`hp_recovery_per_sec`。

分句提到的键都要在 blackboard 里，第一句其余部分不能提到「效果」。队伍部分就是 职业或势力 + 这些键和值；在场上的队伍部分只能有 Buff 能带的属性（`atk`、`def`、`max_hp`、`attack_speed`、`magic_resistance`、`sp_recovery_per_sec`、`hp_recovery_per_sec`），否则不算。

- **对卡组**：组装对局（同步-9）时，一名玩家卡组里每个干员的对卡组的队伍部分，作用于同一卡组里这个职业、或有这个势力的每个干员（包括它自己）：`cost` 加到部署费用（不低于 0），`sp` 加到技能的初始技力，其余的键加到 `talentBb`（部署-4）。
- **在场上**：干员数据的 `fieldTalents`（职业或势力，和 blackboard），干员数据带着自己的势力 `powers`，由模拟按 部署-5 生效。

天赋的其余内容（只对自身的额外加成、按分支或稀有度的加成、触发类效果）还没有实现。

- 来源：数据：character_table 的天赋文字与 blackboard，如年「编入队伍时，所有【重装】职业干员的生命上限+20%」、风笛「编入队伍时所有【先锋】干员的初始技力+8」、凛冬「编入队伍时所有【先锋】职业干员的部署费用-1」、艾雅法拉「在场时，所有友方【术师】职业干员的攻击力+16%」、赫默「在场时，所有友方【医疗】职业干员攻速+14」、桃金娘「在场时，所有【先锋】干员每秒回复28点生命」、斯卡蒂「编入队伍时，所有【深海猎人】干员的攻击力+16%」；对卡组的只作用于这名玩家自己的卡组、在场上的作用于所有玩家的干员、属性按 技能-5 换算为推断 INF-0094

### 干员-10 势力

干员的势力 `powers`：主势力（`mainPower`，没有时取干员自身的字段）的国家、组织、队伍 id（`nationId`、`groupId`、`teamId`，为 null 的略去），再依次加上每个副势力（`subPower`）的，去掉重复。势力的名称按 id 记录在 `packages/content/data/powers.json`（handbook_team_table 的 `powerName`，按 id 排序）。天赋按名称引用势力（干员-9）。

- 来源：数据：character_table 的 mainPower、subPower、nationId、groupId、teamId，handbook_team_table 的 powerId、powerName
