# 0041 以固定版本的 Stronghold 做差分对照：行为等价

- 状态：已取代（被 [0058](0058-stronghold-kits-in-matches.md) 取代）
- 日期：2026-10-11
- 来源：规划讨论 Q32, Q35

## 背景

我们重写了机制（见 [0013](0013-rewrite-order-official-semantics.md)），需要一个对照来发现错误。[Stronghold Protocol](https://github.com/sganggs/Stronghold-Protocol) 是现成的、行为大体正确的参考实现，但它和官方有偏差，我们也不想依赖它运行。

## 决定

- 以固定版本的 Stronghold 为对照，它只在开发和测试时使用。
- 行为等价：
  - 纯函数要和 Stronghold 逐位一致；
  - 整场战斗的摘要差异，必须登记原因。
- 差异登记见 [0043](0043-ci-gates-and-registry.md)。

## 理由

差分测试能快速发现实现错误；允许登记差异，是因为我们只实现官方语义，Stronghold 本身有偏差。

## 后果

- 每次 Stronghold 升级都要重跑对照并处理差异。
- 差异多了，登记表会变大，要保持每条有依据。

## 备选方案

- 要求整场战斗也逐位一致：否决，会把 Stronghold 的偏差一并继承。
