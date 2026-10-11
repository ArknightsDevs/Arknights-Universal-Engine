# 波次与战斗结束

关卡的出怪和关卡事件按波次编排。实现见 `packages/sim/src/waves.js`。

### 波次-1 结构与动作

关卡的 `waves` 是若干**波次**，每个波次是若干**片段**（PRTS 称「兵团」），每个片段是若干**动作**（「小队」）。一个动作执行 `count` 次。

数据里的动作类型按下表处理：

| 数据 `actionType` | 引擎 | 做什么 |
|---|---|---|
| `SPAWN` | `SPAWN` | 出怪（出怪-1） |
| `ACTIVATE_PREDEFINED`、`TRIGGER_PREDEFINED` | `ACTIVATE` | 让隐藏的预部署单位生效（波次-6） |
| `WITHDRAW_PREDEFINED` | `WITHDRAW` | 让在场的预部署单位撤回（波次-6） |
| 其他（`PREVIEW_CURSOR`、`STORY`、`TUTORIAL`、`PLAY_BGM`、`DISPLAY_ENEMY_INFO`、`PLAY_OPERA`、`BATTLE_EVENTS`、`DIALOG`、`SHOW_ALL_HIDDEN_CARDS`、`EMPTY` 等） | `NONE` | 只用于表现，模拟里什么也不做，但照常占用时间 |

`isValid` 为 false 的动作不进入内容。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)「扩展阅读：波次」：「所有的敌人被划分为许多"波次"（Wave），每个波次由许多"兵团"（Fragment）组成，兵团再细化成"小队"（Action）」，以及「小队动作指令」表（SPAWN 召唤；ACTIVATE_PREDEFINED「使预部署但隐藏的单位立刻部署」；TRIGGER_PREDEFINED「使预部署但隐藏的装置立刻部署」；WITHDRAW_PREDEFINED「使在场特定预部署单位立刻撤退」；EMPTY「不执行任何动作的占位符」）；数据：level.waves[].fragments[].actions[]；`isValid` 为 false 表示停用、表现类动作不影响模拟为推断 INF-0057

### 波次-2 时间

时间都按秒给出，用 时间-2 换算成帧；下面的「t 秒后」都指 t 秒换算成的帧数之后。

- **波次依次进行**：第一个波次在战斗开始时开始；每个波次结束（波次-3）后再过它的 `postDelay` 秒，下一个波次开始。
- **片段依次进行**：波次开始 `preDelay` 秒后，第一个片段开始的计时起步；每个片段在计时起步后再过它自己的 `preDelay` 秒开始。一个片段结束后，下一个片段的计时立即起步。
- **动作同时进行**：片段开始后，每个动作的第 i 次（从 0 数）在 `preDelay + i × interval` 秒后执行；同一帧到期的按动作在片段里的顺序、同一动作按次序执行。
- **片段结束**：它所有动作的最后一次都执行过时结束；不执行的动作（波次-4、波次-5）不占时间。

敌人记住它所在片段的开始帧（路线-1 的 `WAIT_CURRENT_FRAGMENT_TIME` 从这一帧起算）。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：小队「可通过参数每隔一段时间才开始行动」，「兵团是若干小队的集合，代表一定时间内的出兵」，「波次是若干兵团的集合，代表较长一段时间内的出兵」，路线指令 WAIT_CURRENT_FRAGMENT_TIME「当前兵团开始后时间达到一定值后执行下一步」；数据：preDelay、postDelay、interval、count；片段依次进行与各项延迟的起算点为推断 INF-0007

### 波次-3 波次的结束

一个波次的片段全部结束后，它在下面两件事之一发生时结束：

- 这个波次出的敌人（`dontBlockWave` 的动作出的除外）都已处理：被击倒，或走到终点离场；
- 波次的 `maxTimeWaitingForNextWave` 不小于 0，并且从片段全部结束起已经过了这么多秒。

最后一个波次结束（含它的 `postDelay`）后，所有波次完成。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：「过早击杀关键节点的敌人（BOSS一阶段、剿灭节点敌人）导致下一波次提前来临」，敌人完成全部行动后「视为已处理」；数据：dontBlockWave、maxTimeWaitingForNextWave；具体条件为推断 INF-0058

### 波次-4 隐藏组

带 `hiddenGroup` 的动作只在这个组被启用时执行，否则跳过。启用的组由关卡的符文 `level_hidden_group_enable` 给出：它的 `key` 是组名，`difficultyMask` 决定在哪种难度下生效（`NORMAL` 普通、`FOUR_STAR` 突袭、`ALL` 都生效）。内容按选定的难度算好启用的组（`hiddenGroups`）。

- 来源：[PRTS「FD-7 背离法则」oldid=364740](https://prts.wiki/index.php?title=FD-7%20%E8%83%8C%E7%A6%BB%E6%B3%95%E5%88%99&oldid=364740)（普通「level_hidden_group_enable: key: 0.0 (normal)」，突袭「(raid)」，「关卡难度=FOUR_STAR」）；[PRTS「CF-EX-1 山地的震颤」oldid=356910](https://prts.wiki/index.php?title=CF-EX-1%20%E5%B1%B1%E5%9C%B0%E7%9A%84%E9%9C%87%E9%A2%A4&oldid=356910)（「普通难度 level_hidden_group_enable: key: 0.0 (g1)」，突袭「(g2)」）；数据：level.runes；`ALL` 的含义为推断 INF-0059

### 波次-5 随机组

有些动作是几选一的：

- 带 `randomSpawnGroupKey`（组）的动作是一个候选，它的 `randomSpawnGroupPackKey`（包）是这个候选带的一包动作；没有组、但包名是某个候选的包的动作，是这一包的成员。
- 每个波次开始时，按组在波次里第一次出现的顺序，每个组从它（未被隐藏组跳过的）候选里按权重（`weight`）随机选一个（随机-2）。
- 选中的候选和它那一包的成员执行，其余候选和成员跳过（被隐藏组跳过的候选，它那一包的成员也跳过）。没有组、包名也不属于任何候选的动作照常执行。

- 来源：[PRTS「随机数」oldid=422383](https://prts.wiki/index.php?title=%E9%9A%8F%E6%9C%BA%E6%95%B0&oldid=422383) 举例「敌人从随机兔子洞出口钻出」属于权重随机；[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839)「即使是同一项目，敌人的配置也会出现随机性」；数据：randomSpawnGroupKey、randomSpawnGroupPackKey、weight；组与包的含义、在波次开始时抽取为推断 INF-0060

### 波次-6 预部署单位

关卡的预部署单位（`predefines`）各有别名（`alias`）。不隐藏的从战斗开始就生效；隐藏的在 `ACTIVATE` 动作执行时生效，`WITHDRAW` 动作执行时撤回。生效和撤回各产生表现事件 `predefine`（事件第 8 版，`key` 为别名，`on` 为 1 或 0）。已经生效的再生效、没有生效的撤回，什么也不做。预部署单位在场上做什么由它的种类决定（如合作的阶段控制）；内容还没有给出的种类只记录生效状态。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935) 小队动作指令表（见波次-1）；数据：level.predefines（characterInsts、tokenInsts 的 alias、hidden）

### 结束-1 战斗结束

- **胜利**：关卡有波次，并且所有波次已完成（波次-3）。
- **失败**：所有玩家同时失守（合作-4）。单人时就是生命降到 0。
- 先判失败。结束时产生表现事件 `end`（事件第 8 版，`result` 为 1 胜利、0 失败），世界记下结果（`result`，进行中为 −1），之后不再判定。模拟本身不停止，由帧同步的服务器停止封口。

- 来源：[PRTS「新人入门」oldid=439650](https://prts.wiki/index.php?title=%E6%96%B0%E4%BA%BA%E5%85%A5%E9%97%A8&oldid=439650)「目标生命值降至0，则行动失败」「歼灭关卡内所有目标敌人且未损失目标生命值即获得3星评价」；[PRTS「促融共竞」oldid=377839](https://prts.wiki/index.php?title=%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E&oldid=377839)「双方玩家将被立即扣除所有生命值，比赛将提前结束」；双方同时失守即失败为推断 INF-0061
