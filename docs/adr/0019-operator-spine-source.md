# 0019 干员战斗 Spine 来自 HX0922，固定提交

- 状态：已采纳
- 日期：2026-10-11
- 来源：规划讨论 Q61

## 背景

引擎需要干员战斗用的 Spine 骨骼（正面、背面，含时装）。我们要一个公开、可固定版本、可核对的来源。

## 决定

- 干员战斗 Spine 取自 [HX0922/ArknightsSpine](https://github.com/HX0922/ArknightsSpine)，固定到某个提交（当前 resVersion 26-10-08）。
- 转换后进素材仓库（见 [0018](0018-asset-repository-and-hosting.md)），记录 resVersion，清单列出哈希。
- 用自己的严格解析器读取（见 [0028](0028-own-spine-runtime.md)）。
- 攻击动画时长和攻击时刻与来源的帧数据交叉核对（见 [0014](0014-attack-windup-by-animation.md)）。
- 敌人 Spine 由维护者另行准备，其余缺口从同类公开来源补。

## 理由

固定提交加转换结果存进自己的素材仓库，来源消失或出错时不会影响我们。

## 后果

- 第三方来源可能消失或出错：已固定提交并保存转换结果。
- 要记录并跟进 resVersion。
