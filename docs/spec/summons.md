# 召唤物

干员召唤到场上的单位：召唤物、支援装置、陷阱、战术点的援军。数据里它们都是 `token_` 开头、职业为 `TOKEN` 的角色。召唤物的属性、天赋、技能跟随召唤者的练度；能手动部署的召唤物有自己的卡，持有数和场上数量各有上限；召唤者离场时召唤物随之离场；召唤物按 PRTS 页面带着禁疗、无敌等效果。实现见 `packages/data/src/operators.js`（提取）、`packages/content/src/tokens.js`（按召唤者的练度组装）和 `packages/sim/src/summons.js`（部署与离场）。

### 召唤-1 召唤物的数据

召唤物是 character_table 里 id 以 `token_` 开头、职业为 `TOKEN` 的条目，训练数据的结构和干员的一样（干员-1…干员-5），另外：

- 属性关键帧还记录 `maxDeployCount`（场上数量上限的基础值）和 `maxDeckStackCnt`（堆叠数的基础值）；
- 技能槽为空（`skillId` 为 null）时记作 null，不删去，槽的序号和召唤者的技能对应（召唤-2）；
- 技能槽带 `overrideTokenKey` 时，记作这个技能召唤的召唤物（`token`）；
- 召唤物记录说明原文（`description`，例如「不会受到攻击」）。

一名干员的召唤物是：它展示的召唤物（`displayTokenDict` 的键）、它的技能召唤的、它的天赋候选召唤的（`tokenKey`），去重后排序。

- 来源：数据：character_table 中 profession 为 TOKEN 的条目（phases[].attributesKeyFrames[].data.maxDeployCount、maxDeckStackCnt，skills[].skillId，description），干员的 displayTokenDict、skills[].overrideTokenKey、talents[].candidates[].tokenKey

### 召唤-2 召唤物的练度

召唤物按召唤者的练度组装（干员-1…干员-7 的做法），只是：

1. **精英化与等级**：精英化阶段取召唤者的（召唤物没有这一阶段时取它的最后一个阶段），等级取召唤者的，限制在这个阶段的满级以内。
2. **信赖与潜能**：召唤物没有自己的信赖加成和潜能提升；它的天赋候选按召唤者的潜能解锁。
3. **模组**：召唤者装备模组时，模组这一级给这个召唤物的属性（`tokenAttributeBlackboard`）直接加算；模组里标为召唤物的部分（`isToken`）按天赋序号替换召唤物的天赋候选，或加上新的天赋（干员-7 的做法）。
4. **技能**：召唤物带的技能是它和召唤者所带技能同一序号的技能槽，技能等级取召唤者的；这个槽为空时召唤物没有技能。

- 来源：[PRTS「模板:召唤物信息」oldid=434786](https://prts.wiki/index.php?title=%E6%A8%A1%E6%9D%BF%3A%E5%8F%AC%E5%94%A4%E7%89%A9%E4%BF%A1%E6%81%AF&oldid=434786) 等级一栏的说明「对应持有者的等级」，属性按精英 0/1/2 分列；[PRTS「狼群」oldid=406212](https://prts.wiki/index.php?title=%E7%8B%BC%E7%BE%A4&oldid=406212)「第二天赋2条件=精英2 潜能5」；[PRTS「令」oldid=435035](https://prts.wiki/index.php?title=%E4%BB%A4&oldid=435035) 模组「可以使用5个属性更强的召唤物……“清平”：生命上限+150，攻击+45」；数据：召唤物的 potentialRanks 为空、favorKeyFrames 全为 0，天赋候选的 requiredPotentialRank，uniequip 的 tokenAttributeBlackboard 与 isToken；精英化阶段跟随召唤者为推断 INF-0131

### 召唤-3 持有上限与场上数量上限

召唤物在召唤者这一练度下（召唤-2）：

- **场上数量上限** = `maxDeployCount` + 它的天赋（每个天赋取解锁的候选，模组的召唤物部分替换同序号的候选）的 `max_deploy_count` 之和 + 模组属性的 `max_deploy_count`；
- **堆叠数** = `maxDeckStackCnt` + 同样来源的 `max_deck_stack_cnt`；
- **持有上限** = max(场上数量上限, 堆叠数)。

- 来源：[PRTS「稀音」oldid=435196](https://prts.wiki/index.php?title=%E7%A8%80%E9%9F%B3&oldid=435196)「未部署摄影车的持有数量与场上可同时部署摄影车的数量相互独立。两者上限一致」；[PRTS「梅尔」oldid=435058](https://prts.wiki/index.php?title=%E6%A2%85%E5%B0%94&oldid=435058)「梅尔的机械水獭持有上限与天赋补充的持有数不相等，在精英0/精英1/精英2阶段时持有上限分别为4个/5个/6个」；[PRTS「令」oldid=435035](https://prts.wiki/index.php?title=%E4%BB%A4&oldid=435035)「可以使用5个召唤物（最多同时部署3个）」，模组「召唤物持有上限+3」；数据：天赋说明「最多拥有 N 个」「最多部署 N 个」；持有上限取两者较大值为推断 INF-0132

### 召唤-4 召唤物卡

召唤者的天赋给出这个召唤物能用几个时（天赋候选的 `cnt`：候选的 `tokenKey` 就是它；或者召唤者每个技能都召唤召唤物、候选没有 `tokenKey`，这时序号 0 的天赋的 `cnt` 给它所带技能召唤的那个），召唤物在这名玩家的卡组里有一张卡，记录持有数（开始为 0）、可以部署的帧和冷却数。召唤者模组的天赋升级同样替换这个候选（干员-7）。

- **补充**：召唤者部署时，持有数加上 `cnt`，不超过持有上限（召唤-3）。
- **部署条件**：召唤者在场；持有数至少 1；这名玩家场上这个召唤物的数量少于场上数量上限；到了卡可以部署的帧；费用够（召唤物的 `cost`，没有再部署惩罚）；地块符合它的部署位置（部署-1；部署位置为全部位的召唤物近战、远程地块都能部署；PRTS 页面的部署位置和数据不同时以页面为准）；地块上没有干员或召唤物；特性写「只能部署在召唤者攻击范围内」的，地块要在召唤者现在的攻击范围内；部署占用数为 1 的召唤物和干员一起计入部署人数上限（部署-2）。部署用掉 1 个持有数。
- **再部署策略**（PRTS「再部署策略」）：
  - **默认**：部署时卡进入冷却，部署帧 + 再部署时间起可以再部署；召唤物离场时，用掉的持有数不返还；
  - **唯一**：召唤物在场时卡不能部署；召唤物离场时持有数返还 1，卡进入冷却，离场帧 + 再部署时间起可以部署；
  - **队列**：召唤物离场时冷却数加 1（不超过持有上限）；冷却数至少 1 而卡不在冷却中时开始冷却，每次冷却结束把 1 个冷却数转回持有数。
- **离场**：召唤物撤退不返还费用，卡没有再部署惩罚。

部署占用数、再部署策略、部署位置和「只能部署在召唤者攻击范围内」取自各召唤物的 PRTS 页面（`packages/content/data/summons.json`，每条记录页面和版本）。

- 来源：[PRTS「模板:召唤物信息」oldid=434786](https://prts.wiki/index.php?title=%E6%A8%A1%E6%9D%BF%3A%E5%8F%AC%E5%94%A4%E7%89%A9%E4%BF%A1%E6%81%AF&oldid=434786) 部署占用数、再部署策略的说明「默认：部署后，待部署区卡片进入再部署冷却且不可部署，直到冷却结束」「唯一：部署后，待部署区卡片不可部署；自身从战场离开后，待部署区卡片进入再部署冷却，冷却结束后可部署」；[PRTS「中继器」oldid=410601](https://prts.wiki/index.php?title=%E4%B8%AD%E7%BB%A7%E5%99%A8&oldid=410601) 队列的【可用数】与【冷却数】；[PRTS「分支特性信息/data」oldid=427899](https://prts.wiki/index.php?title=%E5%88%86%E6%94%AF%E7%89%B9%E6%80%A7%E4%BF%A1%E6%81%AF/data&oldid=427899) 工匠「干员部署后，按天赋描述数量补充支援装置持有数」；[PRTS「新人入门」oldid=439650](https://prts.wiki/index.php?title=%E6%96%B0%E4%BA%BA%E5%85%A5%E9%97%A8&oldid=439650) 召唤师「召唤物会占用部署人数」；[PRTS「部署费用」oldid=434779](https://prts.wiki/index.php?title=%E9%83%A8%E7%BD%B2%E8%B4%B9%E7%94%A8&oldid=434779)「大部分召唤物、装置、特种-行商分支通常为0%」；补充为加算、默认策略离场不返还、没有 `cnt` 的召唤物没有卡为推断 INF-0133

### 召唤-5 召唤者离场

干员离场（撤退或生命归 0）时，它在场上的召唤物在同一帧随之撤退（召唤-4 的离场）；医疗探机除外。

- 来源：[PRTS「分支特性信息/data」oldid=427899](https://prts.wiki/index.php?title=%E5%88%86%E6%94%AF%E7%89%B9%E6%80%A7%E4%BF%A1%E6%81%AF/data&oldid=427899) 召唤师「干员离场后，附属的召唤物随之消失」、工匠「干员离场后，附属的支援装置随之消失」、战术家「干员离场后，战术点随之消失」；[PRTS「医疗探机」oldid=421855](https://prts.wiki/index.php?title=%E5%8C%BB%E7%96%97%E6%8E%A2%E6%9C%BA&oldid=421855)「已部署的医疗探机不会因赫默退场而退场」；[PRTS「迷迭香的战术装备」oldid=416121](https://prts.wiki/index.php?title=%E8%BF%B7%E8%BF%AD%E9%A6%99%E7%9A%84%E6%88%98%E6%9C%AF%E8%A3%85%E5%A4%87&oldid=416121)「迷迭香退场时强制撤退」；其余分支的召唤者同样处理为推断 INF-0134

### 召唤-6 内容召唤

技能和天赋自己召唤的召唤物（不经玩家部署）由内容在指定地块生成：不花费用，不用卡，不计入部署人数；它仍是召唤者的召唤物（召唤-5），按召唤-2 组装。地块在地图外或已有单位站着时不生成。

- 来源：[PRTS「天赋生效条件一览」oldid=421216](https://prts.wiki/index.php?title=%E5%A4%A9%E8%B5%8B%E7%94%9F%E6%95%88%E6%9D%A1%E4%BB%B6%E4%B8%80%E8%A7%88&oldid=421216) 把「非手动部署的召唤物」列为「部署费用无意义的单位」；生成的地块由各干员的天赋、技能决定（例如 [PRTS「死芒」oldid=435148](https://prts.wiki/index.php?title=%E6%AD%BB%E8%8A%92&oldid=435148)「攻击范围内敌人被击倒时生成一个悲叹的仆役」），接口的形式是设计决定

### 召唤-7 召唤物的异常效果

召唤物按它的 PRTS 页面带着以下效果部署（作为它特性的标记，职业-1）：

- 特性写「不会受到攻击」的，或实体类型为装置的：敌方不能选中它（`untargetable`，索敌-2）；
- 备注写它（常态）持有的异常效果：禁疗（`healFree`）、无敌（`invincible`）、孤立（友方的治疗不选中它，`noAllyHeal`，另记标记 `isolated`）、不可阻挡（`unblockable`）、静默（`mute`）；
- 备注写它免疫的异常效果：晕眩、冻结、沉睡、浮空、沉默、恐惧、麻痹、麻痹震颤（状态-7）。

无法撤退、不死，以及对寒冷、战栗的免疫，引擎还没有对应的标记，暂不生效。

- 来源：[PRTS「模板:召唤物信息」oldid=434786](https://prts.wiki/index.php?title=%E6%A8%A1%E6%9D%BF%3A%E5%8F%AC%E5%94%A4%E7%89%A9%E4%BF%A1%E6%81%AF&oldid=434786) 实体类型的说明「装置类：通常无法被任何常规手段选中，仅可被少数特殊方式选中或被筛选」；各召唤物 PRTS 页面的特性与备注（`packages/content/data/summons.json`，每条记录页面和版本），例如「中继器」备注「持有无敌、禁疗、孤立」；[PRTS「异常效果」oldid=440606](https://prts.wiki/index.php?title=%E5%BC%82%E5%B8%B8%E6%95%88%E6%9E%9C&oldid=440606) 各效果的含义；装置不被敌方选中为推断 INF-0135
