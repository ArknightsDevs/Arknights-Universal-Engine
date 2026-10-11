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
