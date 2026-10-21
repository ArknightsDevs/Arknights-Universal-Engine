# 做数据 mod

数据 mod 是一组 JSON 文件，用来改官方的干员、关卡、敌人和召唤物的数值，或者加入新的干员和关卡。mod 装在开服的主机上，玩家进入这台主机的对局时自动拿到同一份 mod，不需要自己安装。

数据 mod 里不能有脚本，也还不能带自己的图片、模型和声音：新干员借用一名官方干员的外观。

## 准备

需要 Node.js 22.12 或更新的版本，以及这个仓库：

```sh
git clone https://github.com/ArknightsDevs/Arknights-Universal-Engine.git
cd Arknights-Universal-Engine
pnpm install
```

命令行是 `pnpm aue`。

## 第一个 mod

```sh
pnpm aue mod new strong-chen --name 更强的陈 --in my-mods
pnpm aue mod check my-mods/strong-chen
pnpm aue mod test my-mods/strong-chen
pnpm aue mod pack my-mods/strong-chen
```

- `new` 建一个文件夹，里面有清单 `pack.json`、数据文件 `data.json` 和说明。模板把陈的二技能 10 级的攻击倍率从 500% 改成 600%。
- `check` 像主机那样加载 mod，列出它改了和加了哪些记录，以及问题和警告。有 mod 没能加载时，命令以错误结束。
- `test` 用改过的内容跑几局无画面的对局：改过或新加的每名干员以最高练度打一局，改过或新加的每个关卡两种难度各跑一次。默认每局最多 180 秒，可以用 `--seconds` 改。
- `pack` 打出一个 zip，里面是 mod 的文件夹和每个文件的 sha256（`SHA256SUMS`）。

`check` 和 `test` 可以同时给几个 mod，看它们放在一起时的顺序和冲突；给一个装着很多 mod 的文件夹，等于给出里面所有的 mod。

## pack.json

```json
{
  "$schema": "https://raw.githubusercontent.com/ArknightsDevs/Arknights-Universal-Engine/main/packages/sdk/schemas/pack.schema.json",
  "type": "data",
  "version": "1.0.0",
  "app": "^0.1.3",
  "name": "更强的陈",
  "authors": ["你的名字"],
  "license": "CC-BY-4.0",
  "files": { "data": "data.json" }
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `type` | 是 | `data` |
| `version` | 是 | mod 自己的版本，如 `1.0.0` |
| `name` | 是 | 名字，1–64 个字 |
| `files.data` | 是 | 数据文件的路径，一个或一组，按顺序应用 |
| `app` | 建议写 | 适用的引擎版本，如 `^0.1.3`（0.1.3 及以上的 0.1.x）、`>=0.1.3 <0.2.0`、`0.1.x`、`*` |
| `dependencies` | 否 | 需要先装的 mod：`{ "其他 mod 的 id": "^1.0.0" }` |
| `priority` | 否 | −1000 到 1000，默认 0；彼此无依赖的 mod，数小的先加载 |
| `englishName`、`authors`、`credits`、`license` | 否 | 英文名、作者、致谢、许可 |

mod 的 id 就是文件夹名：小写字母、数字、`_` 和 `-`，最长 32 个字符。

写上 `$schema`，VS Code 等编辑器就能补全字段、提示写错的地方。

## 数据文件

数据文件按表来写，每张表是「内容 id → 改动」：

```json
{
  "$schema": "https://raw.githubusercontent.com/ArknightsDevs/Arknights-Universal-Engine/main/packages/sdk/schemas/data.schema.json",
  "operators": {},
  "levels": {},
  "enemies": {},
  "tokens": {}
}
```

| 表 | 能改官方内容 | 能新增 |
|---|---|---|
| `operators` 干员 | 能 | 能 |
| `levels` 关卡 | 能 | 能 |
| `enemies` 敌人：改的是所有关卡里的这个敌人 | 能 | 不能 |
| `tokens` 召唤物 | 能 | 不能 |

记录的格式和引擎生成的官方数据一样，参考 `packages/content/data/operators/<id>.json`、`packages/content/data/levels/<id>.json`、`packages/content/data/tokens/<id>.json`。敌人的记录在关卡文件的 `enemies` 里。

### 改已有的记录

只写要改的部分：

```json
{
  "operators": {
    "char_010_chen": {
      "rarity": 6,
      "phases": { "2": { "frames": { "1": { "stats": { "atk": 700 } } } } }
    }
  },
  "enemies": {
    "enemy_1067_snslime": { "maxHp": 5000 }
  }
}
```

规则：

- 对象里写到的键改成新值，没写到的不变。
- 值写 `null` 表示删掉这个键。（所以不能用补丁把一个值改成 `null`。）
- 数组可以整个重写，也可以写成对象只改其中几个元素：
  - 键是数字时按位置，从 0 开始：`"phases": { "2": … }` 是精英二，`"levels": { "9": … }` 是技能 10 级；
  - 技能和模组按 `id`：`"skills": { "skchr_chen_2": … }`；
  - blackboard 按 `key`，可以直接写数值：`"blackboard": { "atk_scale": 6 }`；
  - 元素写 `null` 删掉它；写一个不存在的名字，就在末尾加一个新元素。
- 元素没有 `key`、`id`，或者名字有重复时（比如地块），只能按位置改。

把陈的二技能 10 级改成六倍攻击、多打两个目标：

```json
{
  "operators": {
    "char_010_chen": {
      "skills": { "skchr_chen_2": { "levels": { "9": { "blackboard": { "atk_scale": 6, "max_target": 9 } } } } }
    }
  }
}
```

### 新干员

新干员的 id 以「mod id 加冒号」开头，写完整的记录，并用 `look` 写它借用外观的官方干员：

```json
{
  "operators": {
    "strong-chen:chen_alter": {
      "look": "char_010_chen",
      "name": "陈（另一种）",
      "…": "其余字段照 char_010_chen.json 的格式写全"
    }
  }
}
```

画面、头像、立绘和语音都用 `look` 那名干员的。技能 `id` 用官方技能的 id 时，有专门实现的技能效果也一并生效；用自己的 id 时，只有按 blackboard 识别的那部分效果。分支（`branch`）要用官方已有的分支。

### 新关卡

新关卡同样以「mod id 加冒号」为 id，写完整的关卡文件，其中 `level.id` 与这个 id 相同。敌人要写在关卡的 `enemies` 里，出怪用的路线要存在。

## 顺序和冲突

- 一个 mod 在它依赖的 mod 之后加载；彼此无依赖时，按 `priority` 从小到大，再按 id 排。后加载的覆盖先加载的。
- 要改别的 mod 加的内容，就把它写进 `dependencies`。
- 两个 mod 改了同一个值、又谁也不依赖谁时，`check` 会给出冲突警告，写明哪一个最后生效。
- 一个 mod 要么整个加载，要么完全不加载：有一处写错，这个 mod 的改动都不生效，依赖它的 mod 也不加载。

## 限制

- 单个数据文件最大 8 MiB，一个 mod 的数据文件合计 32 MiB，一台主机最多 64 个 mod。
- 数据文件只能是 JSON，嵌套不超过 64 层，不能用 `__proto__`、`constructor`、`prototype` 作键名。
- 改过或加入的每条记录都要通过和官方数据一样的检查：字段的类型、取值范围、必填字段、不认识的字段。
- 敌人、召唤物和攻击范围还不能新增；mod 还不能带自己的素材。

## 在主机上装 mod

促融共竞的服务器开服时读 `mods` 文件夹（发布包和源代码里都在根目录下，也可以用环境变量 `AUE_MODS_DIR` 或启动参数 `--mods <文件夹>` 指定），每个 mod 一个子文件夹。装好后重启服务器；加了 mod 之后不会热更新。

服务器启动时会列出每个 mod 是否加载，以及问题和冲突。玩家打开页面时从主机取得同一份 mod，逐个核对文件的 sha256。装了 mod 的对局会标出来。双方的 mod 不一致时进不了同一局。
