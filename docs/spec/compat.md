# Stronghold 兼容层

兼容层只在 `packages/content/src/compat/` 里（ADR 0045）。kit 的源码不改，只由导入路径映射表把它们的导入指向我们的模块（ADR 0010）。

### 兼容-1 网格尺寸

Stronghold 的常量模块把网格的列数 `COLS`、行数 `ROWS` 给成固定的数；我们的地图大小每关不同。

- 映射表把 kit 对常量模块的导入指向兼容层，其中 `COLS`、`ROWS` 是活的绑定：运行一场战斗的内容代码时（`withGrid`），它们是这一关的宽和高；之后恢复成之前的值，内容代码抛出异常或两场战斗的代码嵌套时也一样。
- kit 在函数里读 `COLS`、`ROWS`（编码、解码格子键，边界检查，遍历网格），每次调用读到的是当时这一关的尺寸。
- 在模块加载时就读的，值固定在加载那一刻。所以兼容层加载 kit 时，`COLS`、`ROWS` 都是 64（`LOAD_GRID`），大于任何关卡（数据里最大 50 × 44）：按地图大小生成的「整行」「整图」列表覆盖每一关，地图外的格子在算攻击范围时去掉（索敌-1）。固定提交的 Stronghold 内容代码里只有一处这样取值：`kits/ops/chess_char_4_20-fartth.js` 第 11 行的 `LINE`（远牙三技能的无限直线范围）。

- 来源：设计决定，见 [ADR 0010](../adr/0010-import-mapping-table.md)（只改写导入路径，不改 kit 源码）、[ADR 0012](../adr/0012-stronghold-compatible-core.md)、[ADR 0045](../adr/0045-unit-field-ownership-compat-isolation.md)；用法统计：ArknightsGameData 的 3943 个关卡中地图最宽 50、最高 44；固定的 Stronghold 提交中 83 个文件引用 `COLS` / `ROWS`（内容代码 66 个），按语法树分析，内容代码在加载时读取的只有上面一处（`packages/content/test/compat-grid.test.js`，ADR 0056）

### 兼容-2 映射表与 kit 的载入

- **映射表**：Stronghold 的 kit 所及的每个引擎模块（按它在 Stronghold 仓库里的路径）对应兼容层里的一个替身模块：`server/sim/` 下的 constants、detmath、dir、targeting、body、damage、buffs、ai、professions、simdata，以及 `server/data.js`、`shared/constants.js`、`shared/potential.js`，共 13 个。内容文件（`server/sim/content/` 下：kit、它们共用的帮手、召唤物与道具模块）原样载入，只把它们对引擎模块的导入换成替身。映射表里没有的引擎模块被导入时报错，kit 新增的依赖立刻显出来。
- **加载钩子**：Node 的加载钩子由映射表生成，给出 Stronghold 仓库的根和兼容层的目录，就按表改写 Stronghold 文件里的相对导入。
- **替身**：
  - 纯函数直接给出：方向（按名字的四个朝向，朝右写的偏移每步转四分之一：右 (dr, dc)、上 (dc, −dr)、左 (−dr, −dc)、下 (−dc, dr)；第 0 行在最下，上为行号增大，与 方向-1 一致；不出现 −0）用 Stronghold 的写法移植；确定性数学用引擎自己的（与它逐位一致，数值-2…数值-5）；常量中 `COLS`、`ROWS` 按 兼容-1，`TICK` 为一帧（时间-1），其余先取 Stronghold v0.2.4 的值，用到它们的 kit 与对照比较时逐个核对。
  - 还没有提供的名字以「缺口」存在：kit 载入时它在，被调用时报错并写明模块和名字，不会悄悄做别的事。
- 固定版本的对照（Stronghold v0.2.4）里 72 个干员 kit（`kits/ops/op-*.js`）都原样载入。

- 来源：设计决定，见 [ADR 0010](../adr/0010-import-mapping-table.md)、[ADR 0012](../adr/0012-stronghold-compatible-core.md)；方向的写法取自 Stronghold 的 `server/sim/dir.js`（GPL-3.0-or-later）；kit 的导入闭包按语法统计：72 个 kit 和 9 个共用内容文件，引擎模块 13 个、61 个名字

### 兼容-3 kit 的输入：记录与定义

kit 的工厂收到 `(bb, chess, def)`：所选技能的 blackboard、这名干员的记录、规范化后的定义。兼容层用引擎自己的练度数据（干员-1…干员-7）造出它们，形状同 Stronghold 的「自选」记录，但练度任意：

- **身份**：干员 id；所在的「槽位」写作 `aue_<干员 id>`。
- **属性**：这一练度下干员自己的属性（精英化与等级、信赖、潜能、模组的加值），不含天赋的效果——天赋由 kit 自己施加。部署费用、阻挡数、攻击间隔、再部署时间等照搬；技力回复为每秒 1。
- **范围**：这一精英阶段的攻击范围；**特性**：已解锁的最后一个特性 blackboard，模组改写特性时用模组的值覆盖。
- **天赋**：每个天赋已解锁的最后一项；模组改写天赋时，模组的值覆盖、天赋原有的其余键保留，改写不属于任何天赋的（序号 −1，如攻击范围）另加一条。
- **技能**：这一精英阶段已解锁的每个技能在所选技能等级上的数据；所选的那个作为 `skill`。
- **模组**：所选模组及等级；没有时为未装备。
- **定义**：记录按 Stronghold 的规则规范化，再带上所选技能、模组与潜能。

- 来源：设计决定，见 [ADR 0016](../adr/0016-arbitrary-operator-levels.md)（任意练度在数据层计算）；记录的形状与规范化、天赋的合并规则取自 Stronghold 的 `server/sim/simdata.js`、`shared/loadoutRecord.js`（GPL-3.0-or-later）；72 个 kit 在每个技能（精英二满级、最后一个模组 3 级）与精英零、精英一 1 级下都能由这些输入造出 kit

