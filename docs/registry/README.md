# 登记表

这里登记两类条目。`aue-check registry`（`@aue/testkit`）会检查它们的格式和引用，`pnpm run check` 也会跑这项检查。

- **[inferences.json](inferences.json)：推断**。官方出处还没找到、先按推断实现的规则。每条写明推断的内容、依据和状态。找到出处后，把状态改成「已证实」，同时把规范条款的来源换成真实出处；如果推断被推翻，改成「已推翻」，并修改实现。
- **[known-differences.json](known-differences.json)：已知差异**。我们和 Stronghold Protocol（差分对照用的固定版本）结果不同的地方。每条写明双方的做法和原因。

## 字段

| 字段 | 推断 | 已知差异 | 说明 |
|---|---|---|---|
| `id` | `INF-0001` | `DIF-0001` | 四位序号，不复用 |
| `clause` | ✓ | ✓ | 对应的规范条款编号，必须存在 |
| `statement` | ✓ | — | 推断的内容 |
| `basis` | ✓ | — | 依据：已有的线索、旁证 |
| `ours` / `stronghold` | — | ✓ | 双方的做法 |
| `reason` | — | ✓ | 为什么不同 |
| `status` | 待查证 / 已证实 / 已推翻 | 有效 / 已消除 | |
