# 0052 平台以 git 子模块引用引擎

- 状态：已采纳（取代 [0007](0007-engine-consumed-by-git-tag.md)）
- 日期：2026-10-11
- 来源：规划讨论 Q76

## 背景

[0007](0007-engine-consumed-by-git-tag.md) 定下平台按"标签 + 子目录"引用引擎，并要求在起步里程碑实测。用 pnpm 11 实测的结果：

1. 引擎的子包之间用 `workspace:*` 互相依赖。通过 `github:…#标签&path:/packages/<包>` 装进别的项目时，这个写法不会被改写，安装失败（`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`）。
2. 在使用方用 `overrides` 把每个 `@aue/*` 指向同一个标签，可以绕过第 1 点。但 pnpm 从 10.26 起默认开启 [`blockExoticSubdeps`](https://pnpm.io/settings/dependency-resolution#blockexoticsubdeps)：间接依赖不允许从 git 安装（`ERR_PNPM_EXOTIC_SUBDEP`），而且没有按包放行的例外，只能整个关掉。

## 决定

- 平台仓库把引擎作为 **git 子模块**放在 `engine/`，固定在某个发布标签对应的提交上。
- 平台的 pnpm 工作区同时包含 `engine/packages/*` 和自己的 `packages/*`，依赖照常写 `workspace:*`。
- 升级引擎的步骤：子模块切到新标签 → 提交 → 跑 CI。
- 平台不修改子模块里的文件。要改引擎，就在引擎仓库提交，打新标签后再升级。

## 理由

- 不用放松 pnpm 的任何安全设置。
- 一份锁文件管住全部依赖。
- 引擎版本由子模块指向的提交固定，和标签一样不可变。

## 后果

- 克隆平台时要加 `--recurse-submodules`，否则先运行 `git submodule update --init`。
- CI 的 checkout 要打开 `submodules: true`；开服脚本和 Docker 构建要先初始化子模块。
- 平台的 lint 和类型检查跳过 `engine/`，引擎由自己的 CI 把关。

## 备选方案

- 保留"标签 + 子目录"，并关掉 `blockExoticSubdeps`：平台对所有间接依赖都放弃了这道供应链防护，否决。
- 发布到 GitHub Packages：安装公开包也要认证，自己架服务器的人负担重，否决。
- 引擎做成单个包，用子路径导出：规划讨论 Q55 已否决。
