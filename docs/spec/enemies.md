# 敌人

### 出怪-1 出怪

关卡的出怪列表给出每个敌人的出现时间（秒）、种类和路线。出现时间按 时间-2 换算成帧，到那一帧时，敌人出现在路线起点格的中心、再加上路线的出生偏移（spawnOffset），生命为满。同一帧出现的按列表顺序。出生的随机范围（spawnRandomRange）还没有实现。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：「敌人在起点坐标出现时，位于方格正中心」；数据：level.waves[].fragments[].actions[]、level.routes[].spawnOffset（时间的展开方式为推断 INF-0007）

### 移动-1 移动

敌人按路线走（路线-1 至 路线-4）。每帧前进 `移动速度 × moveMultiplier ÷ 30` 格：移动速度是属性（属性-1），moveMultiplier 是关卡参数，默认 0.5，即通常实际速度是移动速度的一半。无法移动时（状态-5）不前进，路线上的等待也不计时。

- 来源：速度见 [PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)（每帧移动 移动速度 × m ÷ 帧率 格，「move_multiplier 默认值为0.5」）、数据：level.options.moveMultiplier；被阻挡、攻击当帧、无法移动时路线整体暂停为推断 INF-0030

### 目标-1 到达目标点

敌人到达路线终点后离场（不算阵亡），按 合作-1 至 合作-3 扣生命，产生表现事件 `goal`（owner 为终点所属的第一个座位）。

- 来源：数据：level.routes[].endPosition；扣生命的规则见 coop.md

### 敌人攻击-1 敌人的普通攻击

- **冷却**：能行动时（不处于晕眩、冻结、沉睡、浮空）每帧减少一帧。冷却结束、有目标时，攻击按 索敌-5 排在第一的目标，造成攻击力的一次伤害，类型是敌人的伤害类型（伤害-7）；然后冷却变为攻击间隔（属性-5）。攻击力不大于 0 的敌人不攻击。
- **近战敌人**（攻击方式为 MELEE，或攻击半径为 0）只攻击阻挡它的单位。
- **远程敌人**攻击距离不超过「攻击半径 + 0.25」的可选干员（0.25 是干员的碰撞半径，常量-2）。阻挡它的单位不论距离和可选性，都在候选里。
- 攻击的那一帧敌人不移动。攻击前摇在 M3c 加入，在那之前出手当帧就造成伤害。

- 来源：[PRTS「索敌的概念」oldid=376233](https://prts.wiki/index.php?title=%E7%B4%A2%E6%95%8C%E7%9A%84%E6%A6%82%E5%BF%B5&oldid=376233)：「大部分情况下，只要敌人被阻挡，便可以向阻挡自己的单位发动攻击，无论目标是否处于自身攻击范围半径内」；[PRTS「状态机」oldid=431243](https://prts.wiki/index.php?title=%E7%8A%B6%E6%80%81%E6%9C%BA&oldid=431243)：COMBAT「索敌主目标默认固定为阻挡者」，ATTACK「攻击结束后回退到MOVE状态」；[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：「我方干员碰撞体积基本均为以0.25格为半径的圆形」；数据：enemy_database 的 rangeRadius、applyWay；出手当帧不移动、攻击力为 0 不攻击为推断 INF-0027

