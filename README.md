# 明日方舟通用引擎 · Arknights Universal Engine

> [!IMPORTANT]
> 非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。游戏素材与数据的版权归原权利人所有，不适用本项目的代码许可证，详见 [NOTICE.md](NOTICE.md)。

![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)
[![CI](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/ci.yml)
[![跨引擎一致](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/simcheck.yml/badge.svg)](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/simcheck.yml)

一个**确定性、帧同步**的《明日方舟》战斗引擎，跑在浏览器和 Node 上。第一个基于它的玩法平台是 [促融共竞（Icebreaker-Games）](https://github.com/Cloudnyco/Icebreaker-Games)：双人实时合作。

**现状**（2026-10-16，v0.1.0）：战斗内核、帧同步、画面和声音已经能在两个浏览器里打完整局合作对局，促融共竞用它发布了第一个可玩版本。

- **战斗内核**：属性与 Buff、异常状态、伤害与伤判、索敌、阻挡、官方寻路与路线、波次与关卡、合作规则、技能、元素、职业分支特性（全部 72 个分支，含塑灵术师、陷阱师、战术家的战术点与傀儡师的替身）、天赋、敌人能力、召唤物（跟随召唤者练度、召唤物卡与三种再部署策略、随召唤者离场、PRTS 记载的禁疗/无敌/孤立/不死等效果、战术家援军的战术点形态）；关卡装置（阵营、免疫、在场效果、敌人放置）；地形（封闭的格边、玉门天灾工事、地穴）；比赛风格的座位符文与携带物；钩子总线与定时器。可玩的合作关卡：act1multi_01、act1multi_06、act1multi_hard-02、act2multi_rm01。
- **帧同步**：服务器仲裁、断同步恢复、重连、二倍速与暂停、开局等待协作者；带 kit 的对局从第 0 帧重放（协议第 8 版）；Node 与 Chromium、Firefox、WebKit 算出逐帧相同的状态哈希，CI 在 ubuntu 和 macOS 上检查（同步-12）。
- **画面**：three.js 真 3D，自己实现的 Spine 3.8，地块套件、部署高亮、攻击范围、攻击与角色特效、部署预览、关卡装置（有模型画模型，没有素材时画成按阵营着色的方块）；画面开销由玩家设置（ADR 0059）。
- **界面**：自己的界面引擎，原样式的战斗界面，包括召唤物卡（剩余数量）；也画促融共竞的战斗外界面（滚动列表、嵌套预制件、输入框、自适应字号、片段事件与界面音效，界面-24…35），界面里的 3D 场景和粒子特效（渲染-17、渲染-18）。素材由维护者另行准备（ADR 0018、0062）。
- **地图**：按关卡数据生成，用地图主题的地块拼件；合作关卡用各自场景的拼件，四周带场景里的装饰（渲染-7）。
- **声音**：按游戏数据的音效库播放音效，关卡用自己的战斗曲；干员战斗语音按游戏数据选配音，部署、接敌、技能、选中时说话，一次说一句，优先级、冷却和交叉淡化照数据（音频-1…6，ADR 0061）。
- **干员内容**：兼容层原样运行 Stronghold Protocol 的干员 kit（ADR 0058），逐个 kit 与 Stronghold 对照、所有技能一致（或只差已登记的差异）后启用；72 个全部启用。没有 kit 的干员按引擎自己的实现作战，全部 461 名干员都能上场。

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
