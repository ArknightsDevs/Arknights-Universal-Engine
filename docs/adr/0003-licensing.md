# 0003 许可：引擎 GPL，平台 AGPL，脚本 mod 须兼容 GPL

- 状态：已采纳
- 日期：2026-10-11
- 来源：规划讨论 Q16, Q66

## 背景

引擎是库，平台是网络服务。同时要处理游戏素材的版权、Spine 运行时的许可，以及 mod 的许可。

## 决定

- 引擎：GPL-3.0-or-later。
- 平台（促融共竞）：AGPL-3.0-or-later。
- 脚本 mod 必须与 GPL 兼容。
- NOTICE 写明：游戏素材和数据不在代码许可范围内，版权归鹰角。
- 引擎不使用 Spine 官方运行时，Spine 3.8 运行时自己实现（见 [0028](0028-own-spine-runtime.md)），所以不受 [Spine Runtimes License](https://esotericsoftware.com/licenses/Spine-Runtimes-License-Agreement.txt) 约束。
- 从争锋频道搬来的代码改用 GPL 授权，提交说明里写明出处。

## 理由

- GPL 保证引擎的改进回到社区；AGPL 保证托管服务的改动也要公开。
- Spine 许可要求集成运行时的人持有 Spine 编辑器授权，否则每个用户都要自己买一份；官方运行时也不能以 GPL 发布。自己实现可以避开这个冲突。

## 后果

- 脚本 mod 的作者要接受 GPL 约束。
- 自己实现 Spine 运行时的工作量大（见 [0028](0028-own-spine-runtime.md)）。
- 合规还靠非商用、免责声明、不经手用户凭据（见 [0004](0004-naming-and-disclaimer.md)、[0036](0036-box-entry-and-import.md)）。

## 备选方案

- 宽松许可（MIT 等）：计划未采用，原因是希望改进回流。
- 使用 Spine 官方运行时：否决，见理由。
