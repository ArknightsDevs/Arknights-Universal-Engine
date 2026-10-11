# 明日方舟通用引擎 · Arknights Universal Engine

> [!IMPORTANT]
> 非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。游戏素材与数据的版权归原权利人所有，不适用本项目的代码许可证，详见 [NOTICE.md](NOTICE.md)。

![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)
[![CI](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/ci.yml/badge.svg)](https://github.com/Cloudnyco/Arknights-Universal-Engine/actions/workflows/ci.yml)

一个**确定性、帧同步**的《明日方舟》战斗引擎，跑在浏览器和 Node 上。第一个基于它的玩法平台是 [促融共竞（Icebreaker-Games）](https://github.com/Cloudnyco/Icebreaker-Games)：双人实时合作。

**现状**：起步阶段（里程碑 M0）。工程骨架、检查工具和第一条机制规范（时间与帧）已经就位，战斗内核还没开始写。

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
| `@aue/testkit` | 差分对照、测试生成器（仅开发用） |
| `@aue/lint` | 共享的 ESLint 规则 |

其他项目这样引用：`github:Cloudnyco/Arknights-Universal-Engine#<标签>&path:/packages/<包>`，需要用 pnpm 安装。

## 开发

需要 Node.js 22.12 以上和 pnpm（版本由 `package.json` 的 `packageManager` 固定；有 corepack 时会自动使用，没有时运行 `npx pnpm@11.28.0`）。

```sh
pnpm install
pnpm run ci        # lint、类型检查、测试和覆盖率、依赖 / 规范 / 登记表检查
pnpm test          # 只跑测试
```

参与方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

本项目自己编写的代码以 [GPL-3.0-or-later](LICENSE) 发布。游戏素材与数据不在其中，见 [NOTICE.md](NOTICE.md)。
