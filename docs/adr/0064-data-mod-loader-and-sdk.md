# 0064 数据 mod 加载器和 SDK 第一版

- 状态：已采纳
- 日期：2026-10-20
- 来源：维护者 2026-10-20 决定（v0.1.3 之后开始做 SDK 和 mod 加载器）；落实 [0037](0037-data-mods-first.md)、[0039](0039-mod-assets.md)、[0046](0046-versioned-interfaces.md)、[0055](0055-sdk-prepared-now-built-after-mvp.md)

## 背景

[0037](0037-data-mods-first.md) 定了方向：先做数据 mod，官方内容注册成内置 mod `official`，清单沿用 Stronghold 的包清单，mod 内容加 `modid:` 前缀，以补丁覆盖已有内容。[0055](0055-sdk-prepared-now-built-after-mvp.md) 把 SDK 和加载器放在 MVP 之后。v0.1.3 发布后，这两件事开始做，还有几处细节没定：

- 清单的文件名和字段；
- 补丁怎么写。官方表里大量用数组，比如 blackboard 是 `[{ key, value }]`，技能是 `[{ id, … }]`。JSON Merge Patch（RFC 7386）遇到数组只能整体替换，改一个技能倍率就要抄下整张表；JSON Patch（RFC 6902）按下标定位，又难读、容易错位；
- 哪些表能改，哪些能新增；
- 主机和客户端怎么拿到同一份 mod；
- 新干员没有自己的素材时怎么显示。

Stronghold 的包规范（`docs/PACKS.md`）已经给 `data` 类型定了规矩：只装在服务器上，同房间的玩家用同一份内容；握手比对内容哈希，装了的对局加标记；不带第三方代码；黄金结果只跑原版。

## 决定

### 包和清单

- 一个 mod 是一个文件夹：`<id>/pack.json` 加它列出的文件。清单文件名和字段沿用 Stronghold 的 `pack.json`，`type` 为 `data`；`assets` 类型先能解析、列出，不加载。
- **id**：小写字母、数字、`_`、`-`，1–32 个字符，不能是 `official`；不分大小写也不能重复。文件夹名就是 id。
- **字段**：`type`、`version`（语义化版本）、`app`（适用的引擎版本范围，语法同 Stronghold：`>=0.1.3`、`0.1.x`、`^0.1.3`、`~0.1.3`、`*`、用空格连接的多个条件、`||` 分隔的备选）、`name`、`englishName`、`authors`、`credits`、`license`、`files`。新增：
  - `dependencies`：`{ 别的 mod 的 id: 版本范围 }`。缺少或版本不符时，这个 mod 不加载；
  - `priority`：整数，默认 0。
- `files` 里 `data` 一项是一个或多个 `.json` 文件，按顺序应用。
- **加载顺序**：被依赖的先加载；彼此无依赖的，`priority` 小的先加载，相同时按 id 排。后加载的覆盖先加载的。循环依赖的 mod 都不加载。

### 数据文件

一个数据文件是一个对象，键是表名，值是 `{ 内容 id: 补丁或新记录 }`：

| 表 | 能改官方内容 | 能新增 |
|---|---|---|
| `operators`（干员，记录格式同 `data/operators/<id>.json`） | 能 | 能 |
| `levels`（关卡，同 `data/levels/<id>.json`） | 能 | 能 |
| `enemies`（敌人，改所有关卡里这个敌人） | 能 | 不能 |
| `tokens`（召唤物，同 `data/tokens/<id>.json`） | 能 | 不能 |

- 新增内容的 id 必须带本 mod 的前缀：`<modid>:<名字>`。已有的 id（官方的或先加载的 mod 的）按补丁处理；不存在、又不带本 mod 前缀的 id 是错误。
- **补丁规则**：JSON Merge Patch，加上数组的写法：
  - 补丁里写对象，对象的键按键名合并；写 `null` 删除这个键；写数组或其他值整体替换；
  - 目标是数组、补丁是对象时，按元素定位：键全是十进制数字时按下标；否则元素有 `key` 字段的（blackboard）按 `key`，有 `id` 字段的（技能、模组）按 `id`。元素补丁写 `null` 删除这个元素；找不到这个键时新增一个元素；
  - `{ key, value }` 形式的元素可以直接写值：`"blackboard": { "atk_scale": 6 }` 等于 `{ "atk_scale": { "value": 6 } }`。
- 补丁后的记录用和官方数据同样的结构检查。不通过时，这个 mod 不加载。

### 新干员的外观

新干员可以写 `look: "<官方干员 id>"`，用那名干员的模型、立绘和语音。mod 自带素材（[0039](0039-mod-assets.md)）以后再做。

### 内容来源

- `@aue/content` 新增内容来源：官方内容是第一个来源，叫 `official`；`createSource(mods)` 按加载顺序把 mod 叠上去，给出干员名单、关卡、按 id 取干员、召唤物、攻击范围，以及每个 mod 的问题和冲突警告。
- `matchContent` 改成 `matchContent(match, { source, kits })`，不给 `source` 时用官方内容。
- 装了 mod 时，对局内容带 `mods: [{ id, version }]`，进入内容哈希（同步-9），两端 mod 不同时握手失败。
- 黄金结果、一致性检查、兼容检查只跑官方内容。

### 冲突警告

两个 mod 改了同一个值，而且谁也不依赖谁时，给出警告，写明两者和最后生效的一方。有依赖关系的，后加载的覆盖前者，不算冲突。

### 主机和客户端

- mod 装在主机上，开服时加载一次，不热更新：一局的内容在两端必须一致。
- 主机提供一份列表：每个 mod 的清单、每个文件的大小和 sha256。客户端按列表取文件、逐个核对哈希，用同一个函数叠出同一份内容。
- 主机只提供清单列出的文件。
- 上限：单个数据文件 8 MiB；一个 mod 的数据文件合计 32 MiB；最多 64 个 mod。
- 解析：只用 `JSON.parse`；键名不能是 `__proto__`、`constructor`、`prototype`；嵌套不超过 64 层。数据 mod 不带脚本。

### SDK

- 新包 `@aue/sdk`，命令行 `aue`：
  - `aue mod new <id>`：从模板建一个 mod；
  - `aue mod check <文件夹>…`：检查清单、数据、补丁目标、冲突和结构；
  - `aue mod test <文件夹>…`：用 mod 后的内容跑一局无画面的对局，确认能跑完；
  - `aue mod pack <文件夹>`：打成 zip，附带每个文件的 sha256（`SHA256SUMS`）。
- 清单和数据文件附 JSON Schema，编辑器可以补全、检查；两种文件里都可以写 `$schema`，加载时不看。数据文件的 JSON Schema 由记录的结构检查生成，两者不会不一致。
- 写给 mod 作者的说明在 `docs/mods.md`，模板在 `@aue/sdk` 里。
- `@aue/*` 发布到 npm 仍按 [0055](0055-sdk-prepared-now-built-after-mvp.md)：维护者确认后用自己的账号发。

## 理由

- 清单用 Stronghold 的 `pack.json`，一个包两边都能识别；Stronghold 计划中的 `data` 类型也是这个形状。
- 按 `key`、`id` 定位数组元素，改一个技能倍率只写一行，官方数据增删元素也不会让补丁错位；写数组仍然整体替换，需要时可以整张表重写。
- 新内容带前缀，不会和官方以后的 id 撞车；只允许新增有前缀的 id，拼错的 id 会报错，不会悄悄变成新内容。
- 主机统一提供 mod，客户端只核对，不需要玩家自己装；内容哈希已经在握手里，mod 不一致的两端进不了同一局。
- 新干员先借用官方外观，不做素材也能玩到；素材的格式、上限和解析器等真实需求出现后再定。

## 后果

- `matchContent` 的参数变了，平台要一起改。
- 包的依赖规则（`tools/layers.json`）改动：`@aue/content` 可以依赖 `@aue/schema`；新增只在 Node 里运行的 `@aue/sdk`，可以依赖 `@aue/schema`、`@aue/content`、`@aue/sim`。
- 敌人和召唤物暂时只能改不能加，新敌人需要素材。攻击范围表暂时不能加：新干员用官方的范围 id，或在精英阶段里直接写格子。
- 有专门实现的官方技能和天赋按 id 生效；新干员用官方技能 id 时得到那个技能的行为，用自己的 id 时只有按 blackboard 识别的那部分效果。
- 记录的结构检查要随数据格式一起维护。

## 备选方案

- **JSON Patch（RFC 6902）**：表达力最强，但按下标定位，官方数据一变补丁就改错地方；也难读。
- **纯 JSON Merge Patch**：数组只能整体替换，改一个数要抄一整张技能表。
- **客户端自己装 mod**：两端内容可能不一致，也让玩家运行别人给的内容；Stronghold 的规范也只让服务器装。
