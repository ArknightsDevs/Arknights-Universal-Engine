# 明日方舟通用引擎 · Arknights Universal Engine

> [!IMPORTANT]
> 非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。游戏素材与数据的版权归原权利人所有，不适用本项目的代码许可证，详见 [NOTICE.md](NOTICE.md)。

![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)
[![CI](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/ci.yml)

一个**确定性、帧同步**的《明日方舟》战斗引擎，跑在浏览器和 Node 上。第一个基于它的玩法平台是 [促融共竞（Icebreaker-Games）](https://github.com/Cloudnyco/Icebreaker-Games)：双人实时合作。

**现状**（2026-10-12，最新标签 v0.0.6）：战斗内核、帧同步和画面已经能在两个浏览器里打完整局合作对局。

- **战斗内核**：属性与 Buff、异常状态、伤害与伤判、索敌、阻挡、官方寻路与路线、波次与关卡、合作规则、技能、元素、职业分支特性（59/72）、天赋、敌人能力、召唤物（跟随召唤者练度、召唤物卡与三种再部署策略、随召唤者离场、PRTS 记载的禁疗/无敌/孤立等效果）；钩子总线与定时器。可玩的合作关卡：act1multi_01、act1multi_06、act2multi_rm01。
- **帧同步**：服务器仲裁、断同步恢复、重连、二倍速与暂停、开局等待协作者；带 kit 的对局从第 0 帧重放（协议第 7 版）。
- **画面**：three.js 真 3D，自己实现的 Spine 3.8，地块套件、部署高亮、攻击范围、攻击与角色特效、部署预览；画面开销由玩家设置（ADR 0059）。
- **战斗界面**：自己的界面引擎，原样式的战斗界面，包括召唤物卡（剩余数量）（素材由维护者另行准备，见 ADR 0018）。
- **干员内容**：兼容层原样运行 Stronghold Protocol 的干员 kit（ADR 0058），逐个 kit 与 Stronghold 对照、所有技能一致后启用；目前启用 72 个中的 49 个。

各项决定见 [docs/adr/](docs/adr/)，机制规范见 [docs/spec/](docs/spec/)。

## 原则

- **确定性**：
  - 每秒 30 帧，时间一律用整数帧；
  - 所有玩家和服务器算出逐位相同的结果，跨浏览器一致性检查进 CI；
  - 随机数只来自对局种子。
- **官方语义，有出处**：
  - 每条机制写成带编号的规范条款（[docs/spec/](docs/spec/)），注明出处；
  - 还没找到出处的先登记为推断（[docs/registry/](docs/registry/)）；
  - 测试名里引用条款编号，CI 检查每一条都有测试。
- **原版样式**：真 3D 画面，原版的镜头、遮挡关系和战斗界面。
- **可维护**：
  - 文件不超过 500 行，函数不超过 60 行，复杂度不超过 15，由 CI 强制；
  - 包之间的依赖由 [tools/layers.json](tools/layers.json) 规定，由 lint 检查；
  - 决定都记录在 [docs/adr/](docs/adr/)。

## 包

| 包 | 职责 |
|---|---|
| `@aue/math` | 精确运算、确定性数学函数、官方取整规则 |
| `@aue/sim` | 战斗内核 |
| `@aue/content` | 官方内容（内置 mod）、兼容 Stronghold Protocol 的内容接口 |
| `@aue/spine` | Spine 3.8：读取、动画、网格（自己实现） |
| `@aue/data` | 数据流程和生成的数据 |
| `@aue/render` | three.js 战斗渲染 |
| `@aue/ui` | 战斗界面 |
| `@aue/net` | 帧同步 |
| `@aue/worker` | 后台线程入口 |
| `@aue/simcheck` | 跨引擎一致性检查 |
| `@aue/testkit` | 差分对照、测试生成器、检查工具（仅开发用） |
| `@aue/lint` | 共享的 ESLint 规则 |

其他项目以 git 子模块引用本仓库的发布标签，用 pnpm 工作区安装（见 [ADR 0052](docs/adr/0052-engine-as-git-submodule.md)）。

## 开发

需要 Node.js 22.12 以上和 pnpm（版本由 `package.json` 的 `packageManager` 固定；有 corepack 时会自动使用，没有时运行 `npx pnpm@11.28.0`）。

```sh
pnpm install
pnpm run ci        # 取差分对照，lint、类型检查、声明文件、测试和覆盖率、依赖 / 规范 / 登记表检查
pnpm test          # 只跑测试
```

`pnpm run ci` 的第一步把固定版本的 Stronghold Protocol 取到 `.cache/oracle/`（或 `AUE_STRONGHOLD_DIR`），供差分对照和 kit 测试使用。

参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

本项目自己编写的代码以 [GPL-3.0-or-later](LICENSE) 发布。游戏素材与数据不在其中，见 [NOTICE.md](NOTICE.md)。
