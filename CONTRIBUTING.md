# 参与贡献

感谢你愿意参与。提交前请读完本页：Issue 和 Pull Request 都有固定的格式，不符合的可能会被要求修改或直接关闭。参与讨论和贡献请遵守 [行为准则](CODE_OF_CONDUCT.md)。

本项目是非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。

## 在哪里说

| 你想… | 去哪里 |
|---|---|
| 报告 Bug（模拟、渲染、数据、构建） | [Issue →「Bug 反馈」](../../issues/new?template=bug_report.yml) |
| 指出规则或数值和官方不一致 | [Issue →「规则与官方不一致」](../../issues/new?template=mechanics.yml) |
| 提出新功能或改进 | [Issue →「功能建议」](../../issues/new?template=feature_request.yml) |
| 问怎么使用、接入、构建 | [Discussions → Q&A](../../discussions/categories/q-a) |
| 聊还不成熟的想法 | [Discussions → Ideas](../../discussions/categories/ideas) |
| 分享你的作品、截图、改造 | [Discussions → Show and tell](../../discussions/categories/show-and-tell) |
| 报告安全漏洞 | [私下报告](../../security/advisories/new)（见 [SECURITY.md](SECURITY.md)），不要公开发 issue |
| 权利人要求删除内容 | [Issue →「权利人通知」](../../issues/new?template=rights.yml) |

## Issue 标准

- **一个 issue 只说一件事。** 多个问题请分开提。
- **先搜索**已有的 issue 和 Discussions，避免重复。
- **标题说清楚是什么**，例如「近战单位被阻挡时撤退会重复结算一次」，不要只写「出 bug 了」。
- **Bug 要能复现**：写明步骤、期望与实际结果、环境（提交号、系统、浏览器、Node 与 pnpm 版本），附上控制台错误或日志。模拟问题请附上能重放的输入（关卡、阵容、种子、操作序列）和出问题的帧号。
- **规则问题要有官方依据**：PRTS 页面（带 oldid 的永久链接）、游戏数据表的文件与字段、实机录像的链接与时间点。凭印象的描述很难核对。
- 不需要附带游戏素材文件。截图和录屏可以。
- 不接受以盈利为目的的功能。

使用方法、接入求助请发到 Discussions，不要开 issue。

### 标签

| 标签 | 含义 |
|---|---|
| `bug` | 程序错误 |
| `mechanics` | 规则 / 数值与官方不一致 |
| `enhancement` | 新功能或改进 |
| `documentation` | 文档 |
| `ci` | CI、构建、发布 |
| `dependencies` | 依赖更新（Dependabot） |
| `legal` | 权利人通知 |
| `question` | 求助（Discussions） |
| `good first issue` | 适合第一次贡献 |
| `help wanted` | 欢迎有人认领 |
| `wontfix` / `duplicate` / `invalid` | 不处理 / 重复 / 无效 |

## Pull Request 标准

- **一个 PR 只做一件事**，改动尽量小。大的改动请先开 issue 或在 Discussions 里商量。
- **从最新的 `main` 拉分支**，分支名说明用途，例如 `fix/block-retreat`、`feat/spine-mix`、`docs/spec-skill`。
- **标题说明做了什么**（中文即可），例如「模拟：阻挡单位撤退时先释放阻挡再结算」。
- **按 PR 模板填写**：改动与原因、类型、验证方式。修复 issue 时写 `Closes #编号`。
- **界面或渲染改动附截图**，改动前后各一张；动效可以附录屏。
- **只用 pnpm**：用 `pnpm install` 安装依赖，不要用 npm 或 yarn，也不要提交别的包管理器的锁文件。pnpm 版本固定在根 `package.json` 的 `packageManager` 字段。
- **提交前运行 `pnpm run ci`**，它包含 lint、类型检查、测试与覆盖率、依赖 / 规范追溯 / 登记表检查。CI 跑同一条命令，是硬性门槛，全部通过才会合并。
- **提交信息**：第一行说明做了什么（中文即可，50 字以内），空一行后写原因和细节。合并时会压缩为一个提交。

### 规则与数值的改动

- 必须有官方来源：PRTS 页面链接（带 oldid）或游戏数据表的文件与字段。没有来源的改动不会合并。
- 每条规则在 `docs/spec/` 里有带编号的条款，并写明来源。改规则先改条款，再改代码。
- 测试要在名称里写出它验证的条款编号。新增或修改的行为，对应条款必须有测试覆盖。
- 按推断实现的部分要在条款里明确标出。

### 架构决策

架构决策记录在 `docs/adr/`。要改变已有的决定，请新增一份 ADR 说明理由并替代旧的，不要直接修改旧 ADR。

## 代码风格

- 语言是 JavaScript + JSDoc，`tsc --checkJs` 严格模式必须通过。
- 可维护性上限由 ESLint 作为**错误**强制执行：
  - 文件不超过 500 行；
  - 函数不超过 60 行（空行和注释不计）；
  - 圈复杂度不超过 15；
  - 嵌套不超过 4 层；
  - 参数不超过 5 个。
- **不允许行内 `eslint-disable` 注释。** 确有必要的豁免只能写在 `eslint.config.js` 里，并写明理由。超限时请拆分代码，而不是放宽限制。
- 注释说明「为什么」和官方来源，不复述代码。

### 确定性（模拟代码）

`@aue/sim` 要在浏览器和 Node 里逐帧得到完全相同的结果（锁步联机依赖这一点）：

- 不使用 `Math.random`、`Date.now`、`new Date()`；随机数用模拟内置的带种子随机数。
- 不使用结果不保证跨引擎一致的 `Math` 函数（如 `Math.hypot`、三角函数、`Math.pow`）和 `**`。只用 IEEE 精确的运算：加减乘除与 `Math.sqrt`、`Math.floor` 等。
- 时间一律是整数帧，30 帧 / 秒，不用浮点秒。

### 包边界

- 一个包只能导入它在 `package.json` 里声明的 `@aue/*` 包，检查会拦截越界导入。
- `@aue/sim` 不得导入 `@aue/render`、`@aue/ui`、`@aue/net`。

## 许可

提交即表示你同意以 GPL-3.0-or-later 发布你的贡献（见 [LICENSE](LICENSE)）。
