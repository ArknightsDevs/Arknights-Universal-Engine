# 0005 语言：JS + JSDoc，tsc --checkJs strict

- 状态：已采纳
- 日期：2026-10-11
- 来源：规划讨论 Q6, Q75

## 背景

引擎同时在浏览器和 Node 里跑，要用 ESM。我们希望有类型检查，又不想要编译步骤：模拟、网络、Worker 的产物都要尽量直接可调试，Node 加载钩子也要直接加载源码。

## 决定

- 技术栈：浏览器 + Node，ESM。
- 用 JavaScript + JSDoc 写；`tsc --checkJs` 打开 `strict`，作为 CI 检查。
- 不需要编译步骤。
- 战斗渲染只用 three.js（见 [0025](0025-true-3d-three-js.md)），Spine 运行时自己写（见 [0028](0028-own-spine-runtime.md)）。

## 理由

- 没有编译步骤，源码就是运行的代码，映射表和加载钩子（见 [0010](0010-import-mapping-table.md)）更简单。
- 与要兼容的 [Stronghold Protocol](https://github.com/sganggs/Stronghold-Protocol) 内容接口同为 JS。

## 后果

- JSDoc 类型比 TypeScript 写起来啰嗦。
- 复杂泛型的表达能力有限。

## 备选方案

- TypeScript：计划选择免编译，未采用。
