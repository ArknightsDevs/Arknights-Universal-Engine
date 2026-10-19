# 0007 平台通过 git 标签 + 子目录引用引擎

- 状态：已取代（由 [0052](0052-engine-as-git-submodule.md) 取代：实测不可行）
- 日期：2026-10-11
- 来源：规划讨论 Q9, Q55, Q64

## 背景

平台要固定使用某个引擎版本，同时不想先发布到 npm。npm 的 git 依赖不能指定子目录；pnpm 有 `path:` 参数（见 [pnpm package sources](https://pnpm.io/package-sources) 与 [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)）。

## 决定

平台按 `github:ArknightsDevs/Arknights-Universal-Engine#vX.Y.Z&path:/packages/<包>` 引用引擎。这种"标签 + 子目录"的写法要先用一个小仓库实测可行，再采用；实测放在起步里程碑，完成标准是平台能从 git 标签装上引擎的子包。

## 理由

不需要发布流程就能按版本固定，且标签不可变。

## 后果

- 依赖 pnpm 的这个特性，不能换回 npm。
- 若实测不可行，改为发布到 GitHub Packages，或使用 git 子模块，届时再由维护者确认。

## 备选方案

- npm 的 git 依赖：不能指定子目录，否决。
- 发布到 GitHub Packages、git 子模块：作为实测失败时的后备。
