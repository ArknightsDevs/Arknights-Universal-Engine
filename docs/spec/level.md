# 关卡内容

一个关卡的内容怎样从游戏数据整理出来。实现见 `packages/data/src/level.js`（提取）和 `packages/content/src/levels.js`（按难度组装）。

### 关卡-1 敌人数据

关卡用到的每种敌人（所有 SPAWN 动作的 `key`，经过关卡-2 的替换）取自敌人数据库（`enemy_database`）：

1. 先取级别 0 的数据；
2. 关卡的 `enemyDbRefs` 给这种敌人指定了级别时，用那个级别写明（`m_defined` 为 true）的字段覆盖；
3. 再用 `enemyDbRefs` 的 `overwrittenData` 写明的字段覆盖。

敌人的标签 `tags` 取 `enemyTags`（写明且不为空时），如 `machine`。

`useDb` 为 false 时不查数据库，只用 `overwrittenData`。读出的字段：名字、生命、攻击、防御、法术抗性、移动速度、攻击间隔、阻挡数消耗、重量、元素抗性、损伤抵抗、各项免疫、攻击半径、攻击方式、移动方式、地位级别（`levelType`）、到达目标点扣的生命（`lifePointReduce`，目标-1），以及中立单位的 `dead.value`（合作-9）。

- 来源：数据：enemy_database.enemies[].Value[].enemyData（每个字段带 `m_defined`）、level.enemyDbRefs[]（id、level、useDb、overwrittenData）；[PRTS「乌萨斯平民」oldid=436745](https://prts.wiki/index.php?title=%E4%B9%8C%E8%90%A8%E6%96%AF%E5%B9%B3%E6%B0%91&oldid=436745) 按「级别0」「级别1」分列敌人数值；覆盖的顺序为推断 INF-0066

### 关卡-2 难度与符文

关卡按难度组装：普通（`NORMAL`）或突袭（`FOUR_STAR`）。关卡的符文（`runes`）在它的 `difficultyMask` 覆盖这个难度时生效（规则同波次-4）：

| 符文 | 效果 |
|---|---|
| `level_hidden_group_enable` | 启用隐藏组 `key`（波次-4） |
| `level_hidden_group_disable` | 停用隐藏组 `key`，即使另有符文启用它 |
| `global_lifepoint` | 生命上限改为 `value` |
| `enemy_attribute_mul` | 敌人的属性乘以倍率：`atk`、`def`、`max_hp`、`magic_resistance`、`move_speed`、`attack_speed`、`mass_level`；写了 `enemy` 时只对列出的敌人，写了 `enemy_exclude` 时不对列出的敌人（`\|` 分隔） |
| `level_enemy_replace` | 出怪时敌人 `key` 换成 `value` |
| `cooperate_enemy_side_shared`，或 `env_gbuff_new_with_verify`（`key` 为 `cooperate_enemy_side_shared`） | 共同敌手（合作-2） |
| `cbuff_max_cost` | 费用上限改为 `max_cost`（`max_cost_ceil` 暂不使用） |
| `char_blockcnt_add` | 所有干员的阻挡数加 `value`，不低于 0 |

其他符文还不支持：提取时记下它们的名字（`unsupported`），有这些符文的难度拒绝组装。这个难度出场的敌人带着引擎还没有行为的能力（天赋或技能，敌能-5…）时，也拒绝组装，报出这些能力的名字；没有自己的行为但已由别处处理的天赋（中立单位的 `dead`、随掷弹生效的 `Light`、只对装置起作用的 `DmgUp`）不算。

- 来源：[PRTS「FD-7 背离法则」oldid=364740](https://prts.wiki/index.php?title=FD-7%20%E8%83%8C%E7%A6%BB%E6%B3%95%E5%88%99&oldid=364740) 突袭「情报=敌方单位的生命值、攻击力和防御力都提升至120%」与「global_lifepoint: value: 1.0」「enemy_attribute_mul: atk: 1.2, def: 1.2, max_hp: 1.2」；[PRTS「CF-EX-1 山地的震颤」oldid=356910](https://prts.wiki/index.php?title=CF-EX-1%20%E5%B1%B1%E5%9C%B0%E7%9A%84%E9%9C%87%E9%A2%A4&oldid=356910) 突袭「情报=敌方单位的生命值和攻击力提升至120%」与「enemy_attribute_mul: atk: 1.2, max_hp: 1.2」；[PRTS「KR-1 玉门：沙丘狂欢」oldid=312721](https://prts.wiki/index.php?title=KR-1%20%E7%8E%89%E9%97%A8%EF%BC%9A%E6%B2%99%E4%B8%98%E7%8B%82%E6%AC%A2&oldid=312721) 突袭「level_enemy_replace: key: 0.0 (enemy_1039_breakr), value: 0.0 (enemy_1039_breakr_2)」；数据：level.runes；`level_hidden_group_disable`、倍率乘在基础值上、`enemy`/`enemy_exclude` 的含义为推断 INF-0067

### 关卡-3 镜头视向量

关卡数据带镜头的视向量（`view`，三个数），即 ADR 0026 镜头模型里镜头相对关卡的位置。视向量取自按关卡路径（`levels/` 下去掉 `.json` 的相对路径）索引的视向量表中该关卡的第一个向量，并记下表的出处。没有给视向量表时关卡不带视向量，渲染用默认视向量。

- 来源：yuanyan3060/ArknightsGameResource 的 `map.json`（固定提交，见关卡数据的 `source.view`），act1multi_01 为 [0, −6.1, −9.76]；镜头模型见 [ADR 0026](../adr/0026-camera-model.md)

### 关卡-4 关卡代号与名称

关卡数据带关卡的代号（`code`）和名称（`name`），取自关卡表（`excel/stage_table.json`）里以关卡 id 为键的那一项的 `code` 和 `name`。关卡表里没有这一关时不带。界面在开始面板上显示它们（界面-21）。

- 来源：ArknightsGameData 的 `stage_table.json`（固定提交，见关卡数据的 `source`），act1multi_01 为 IG-1「逃离火线」
