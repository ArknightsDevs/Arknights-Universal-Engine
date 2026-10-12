# 版权与使用声明（NOTICE）

**明日方舟通用引擎 · Arknights Universal Engine（AUE）** 是源自《明日方舟》的**非官方同人项目**，与上海鹰角网络科技有限公司（Hypergryph）、悠星（Yostar）及其关联方**没有任何关联**，也未获得其授权或认可。

## 1. 代码许可证：GPL-3.0-or-later

Copyright (C) 2026 Arknights Universal Engine contributors

本项目自己编写的源代码与文档文字以 **GNU 通用公共许可证第 3 版或（由你选择）任何更新版本**（GPL-3.0-or-later）发布，全文见 [LICENSE](LICENSE)。

- 范围：`packages/`、`tools/`、`docs/` 下的代码与文字，以及根目录的配置文件。
- 通过 pnpm 安装的第三方库各自保留原许可证。
- 本项目不包含 Spine 官方运行时：Spine 3.8 运行时由本项目自己实现（见 [ADR 0028](docs/adr/0028-own-spine-runtime.md)）。
- 兼容层（`packages/content/src/compat/`）载入 [Stronghold Protocol](https://github.com/sganggs/Stronghold-Protocol)（GPL-3.0-or-later，版权归其作者）一个固定提交里的干员 kit（见 [ADR 0058](docs/adr/0058-stronghold-kits-in-matches.md)）。它们不在本仓库中：差分对照和对局使用时另行取得，原样使用，只改写其中的导入路径。

## 2. 不属于本项目、不受 GPL 约束的内容

《明日方舟》相关的全部**名称、角色、美术、Spine 模型、界面、特效、音乐音效、文本与游戏数据**，版权归上海鹰角网络科技有限公司及其授权方所有。

- 这些素材**不在本仓库中**，放在单独的素材仓库里。
- 将来由官方数据表生成并收录在本仓库的数据，同样不受 GPL 约束。
- `docs/` 里引用的 PRTS 等社区页面的文字，按各自来源的许可使用。

这些内容**不在 GPL-3.0 授权范围内**，本项目也无权就它们向任何人授予任何权利。

## 3. 仅限非商业用途

- 本项目仅供**学习、研究和个人非商业娱乐**。
- 一切包含或依赖游戏素材与数据的使用方式，都**不得用于任何形式的盈利**，包括但不限于：
  - 出售或付费分发；
  - 收费开服；
  - 广告、打赏、赞助；
  - 打包进收费产品或服务。

## 4. 第三方来源

数据流程和渲染会用到以下公开来源，各自适用其许可：

- [ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData)：游戏数据表。
- [ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)（AGPL-3.0）：每关的镜头位置（`map.json`）。
- [Arknights-Tile-Pos](https://github.com/yuanyan3060/Arknights-Tile-Pos)（MIT）：镜头模型。
- [HX0922/ArknightsSpine](https://github.com/HX0922/ArknightsSpine)：干员战斗 Spine。
- [PRTS](https://prts.wiki/)：机制说明，规范条款里注明了每处出处。

## 5. 联系

权利人如认为本项目侵犯其权益，请通过 Issue（选择「权利与法律」）或安全公告私下联系，我们会**立即删除**相关内容。

本项目按「现状」提供，**不提供任何担保**，使用风险自负。
