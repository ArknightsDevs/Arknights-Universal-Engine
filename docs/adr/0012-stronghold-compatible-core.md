# 0012 新内核，兼容 Stronghold 的内容接口

- 状态：已采纳
- 日期：2026-10-11
- 来源：规划讨论 Q14, Q15, Q34

## 背景

[Stronghold Protocol](https://github.com/sganggs/Stronghold-Protocol) 已经有大量干员 kit。我们要复用这些内容，同时需要自己的确定性内核、多玩家能力和整数帧（见 [0011](0011-numerics-integer-frames.md)），这些在 Stronghold 里没有。

## 决定

- 写新内核，不 fork Stronghold 的模拟。
- 兼容它的内容接口：
  - 约 70 个引擎导出：索敌 10、常量 17、体积 7、伤害 7、detmath 5、方向 10、AI 5、状态 2、召唤物 14；
  - 71 个战斗方法；
  - 129 个单位字段，名字照搬（Q34）；
  - 约 30 个钩子事件。
- 兼容代码只放在 `@aue/content/compat/`（见 [0045](0045-unit-field-ownership-compat-isolation.md)）。
- 通过导入路径映射表加载 Stronghold 的 kit（见 [0010](0010-import-mapping-table.md)）。

## 理由

- 复用现成的 kit，MVP 能直接带上 72 个六星干员。
- 字段名照搬，kit 不用改。

## 后果

- Stronghold 的接口在变，要固定版本，适配层集中在映射表。
- 某些 kit 写死了练度，需要适配（见 [0016](0016-arbitrary-operator-levels.md)）。
- 内核的字段设计受 129 个字段名约束，但内核自己的单位字段另有分组和归属表。

## 备选方案

- fork Stronghold 的模拟内核：否决，需要整数帧、多玩家能力和更严的可维护性门槛。
- 完全不兼容、重写所有内容：成本过高。
