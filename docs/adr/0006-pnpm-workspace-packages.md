# 0006 工程结构：pnpm 工作区，按功能分包，固定 pnpm 版本

- 状态：已采纳
- 日期：2026-10-11
- 来源：规划讨论 Q29, Q55, Q64

## 背景

引擎有模拟、内容、数据、渲染、网络等不同职责，依赖方向要受控；平台需要只装用到的包。

## 决定

引擎用 pnpm 工作区，`packages/` 下分包：

| 包 | 职责 | 依赖 |
|---|---|---|
| `@aue/math` | 精确运算、确定性数学函数、官方取整规则 | 无 |
| `@aue/sim` | 战斗内核：常量、方向、体积、伤害、状态、索敌、技能、职业、AI、编排、多玩家能力、指令、快照、状态哈希 | math |
| `@aue/content` | 官方内容（注册为内置 mod `official`）、兼容 Stronghold 的内容接口、内容注册表 | sim |
| `@aue/data` | 数据流程与生成的数据 | spine（只用读取部分） |
| `@aue/spine` | Spine 3.8 读取、动画计算、网格生成；不碰 GPU，Node 里也能跑 | math |
| `@aue/render` | three.js 战斗渲染 | spine、three |
| `@aue/ui` | Unity UI 预制件引擎（来自争锋频道），画战斗界面 | 无 |
| `@aue/net` | 帧同步客户端、服务器端、协议 | sim |
| `@aue/worker` | 后台线程入口；构建时按映射表改写导入路径 | sim、net、content |
| `@aue/simcheck` | 跨引擎一致性检查 | sim |
| `@aue/testkit` | Stronghold 对照、fast-check 生成器、规范条款追溯检查 | 无 |

- 平台的 `packages/` 为 `server`、`client`、`mode-regular`；以后再加 `mode-defence`、`mode-football`、`mode-raft`、`accounts`、`mods`。
- pnpm 版本写在 `packageManager` 字段，提交 `pnpm-lock.yaml`。
- pnpm 的安装方式：
  - Node 25 起不再自带 [corepack](https://nodejs.org/dist/latest/docs/api/corepack.html)。开服脚本在有 corepack 时用它，没有时用 `npx --yes pnpm@<固定版本>`；
  - Docker 在构建阶段装 pnpm；
  - CI 用 `pnpm/action-setup`。

## 理由

- 子包让 `sim` 不依赖 `render` 之类的方向约束可以用工具检查（见 [0008](0008-module-boundaries.md)）。
- 固定版本加锁文件让构建可复现。

## 后果

- 开服脚本多一段安装 pnpm 的逻辑。
- 子包之间的接口要维护版本（见 [0046](0046-versioned-interfaces.md)）。

## 备选方案

- 单包：否决，边界无法强制。
- 只依赖 corepack：Node 25 起不再自带，不能只靠它。
