# 0028 Spine 3.8 运行时自己实现

- 状态：已采纳
- 日期：2026-10-11
- 来源：规划讨论 Q66

## 背景

游戏骨骼是 Spine 3.8 格式。现成的运行时都不合适：

- 官方的 spine-threejs 没有 3.8 版本的 npm 包；
- git 里的 3.8 分支是针对 three r111 写的，在当前 three.js 版本上会报错（ES5 类、`updateRange` 已被移除）；
- 4.x 运行时读不了 3.8 数据；
- [Spine Runtimes License](https://esotericsoftware.com/licenses/Spine-Runtimes-License-Agreement.txt) 规定：集成运行时的人要持有 Spine 编辑器授权，否则每个使用者都要自己取得授权；Esoteric 也在[论坛](https://esotericsoftware.com/forum/d/4032)说明运行时不能以 GPL 发布（见 [0003](0003-licensing.md)）。

## 决定

- 自己实现 Spine 3.8 运行时，GPL。
- 照 Esoteric 公开的格式和运行时文档实现，不复制 spine-ts 的代码。维护者读过 spine-ts 的源码，所以不算严格的"净室"实现，但不照抄。
- 先用现有的解析器统计全部游戏骨骼，只实现游戏实际用到的附件、约束、时间轴类型。
- 模块划分：
  - `@aue/spine`：读取、动画计算、网格生成，与 GPU 无关，Node 里也能跑；
  - `@aue/render` 里的批处理：上传缓冲区、按混合模式分材质、处理预乘 alpha，并接上单位的深度规则（见 [0027](0027-occlusion-draw-order.md)）。
- 验证：
  - 写规范，做差分测试：在维护者本机，可选地拿 spine-ts 3.8 对照骨骼姿态和顶点位置。spine-ts 不进仓库，也不随发布分发；
  - 再用原版截图核对。
- 排在渲染那条线的最前面。

## 理由

没有可用的现成运行时，又不能受 Spine 许可约束。只做游戏用到的功能，把工作量压到可控。

## 后果

- 工作量大、容易出错；用规范、差分对照和截图核对来控制。
- 不是严格净室，要避免照抄。
- 争锋频道在这个运行时稳定后，再换掉 pixi-spine（见 [0002](0002-repository-split.md)）。

## 备选方案

- 官方 spine-threejs：没有 3.8 npm 包，旧分支在新 three.js 上报错。
- 4.x 运行时：读不了 3.8 数据。
- 使用官方运行时并取得授权：运行时不能以 GPL 发布，修改运行时的人也都要各自取得授权，与开源协作冲突。
