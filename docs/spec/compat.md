# Stronghold 兼容层

兼容层只在 `packages/content/src/compat/` 里（ADR 0045）。kit 的源码不改，只由导入路径映射表把它们的导入指向我们的模块（ADR 0010）。

### 兼容-1 网格尺寸

Stronghold 的常量模块把网格的列数 `COLS`、行数 `ROWS` 给成固定的数；我们的地图大小每关不同。

- 映射表把 kit 对常量模块的导入指向兼容层，其中 `COLS`、`ROWS` 是活的绑定：运行一场战斗的内容代码时（`withGrid`），它们是这一关的宽和高；之后恢复成之前的值，内容代码抛出异常或两场战斗的代码嵌套时也一样。
- kit 在函数里读 `COLS`、`ROWS`（编码、解码格子键，边界检查，遍历网格），每次调用读到的是当时这一关的尺寸。
- 在模块加载时就读的，值固定在加载那一刻。固定提交的 Stronghold 内容代码里只有一处：`kits/ops/chess_char_4_20-fartth.js` 第 11 行的 `LINE`。这个 kit 暂不加载，修复回馈上游。

- 来源：设计决定，见 [ADR 0010](../adr/0010-import-mapping-table.md)（只改写导入路径，不改 kit 源码）、[ADR 0012](../adr/0012-stronghold-compatible-core.md)、[ADR 0045](../adr/0045-unit-field-ownership-compat-isolation.md)；用法统计：固定的 Stronghold 提交中 83 个文件引用 `COLS` / `ROWS`（内容代码 66 个），按语法树分析，内容代码在加载时读取的只有上面一处（`packages/content/test/compat-grid.test.js`，ADR 0056）
