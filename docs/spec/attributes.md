# 属性

单位的属性由基础值和生效 Buff 的修饰器算出（ADR 0054）。实现见 `packages/sim/src/attrs.js`。

### 属性-1 属性公式

每项属性 = clamp(F_t × [(A + D_p) × max(0, 1 + D_t) + F_p], 下限, 上限)

- A：基础值；
- D_p：直接加算之和；
- D_t：直接乘算之和；
- F_p：最终加算之和；
- F_t：最终乘算之积，没有时为 1。

计算顺序：先算方括号内，再乘 F_t，最后按 属性-3 限制范围。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「属性基本公式」：A_f = F_t[(A + D_p)(1 + D_t) + F_p]；1 + D_t < 0 时取 0；结果受数值范围限制

### 属性-2 修饰器叠加

- **同类相加**：直接加算、直接乘算、最终加算相加；最终乘算相乘。
- **顺序**：Buff 按获取顺序处理，每个 Buff 内按修饰器的书写顺序处理。浮点加法和乘法的结果与顺序有关，所以顺序是规范的一部分。
- **层数**：有 n 层的 Buff，加算类修饰器贡献 n × v，最终乘算贡献 vⁿ（vⁿ 用 数值-3 的整数次幂）。
- **范围**：只计入生效的 Buff（状态-2）。伤判类修饰器（受到伤害倍率、闪避）不在这里汇总，而是在结算时逐个处理（伤害-8）。
- **键名**：每项属性的四类修饰器的键名见下表，沿用 Stronghold 内容接口的名字。没有对应名字的属性，四个键是 `<前缀>Flat`、`<前缀>Pct`、`<前缀>Final`、`<前缀>Mul`。
  - 表外以 `Mul` 结尾的键按最终乘算相乘，其余的键相加。
  - 其中这几个乘区由伤害和治疗读取（伤害-7、伤害-11）：伤害倍率 `dmgDealtMul`、`physDealtMul`、`artsDealtMul`，治疗倍率 `healingDealtMul`，受到治疗倍率 `healingTakenMul`；元素损伤读取受到元素损伤倍率 `epTakenMul`（元素-2），干员造成的元素损伤再乘它的元素损伤倍率 `epDealtMul`（职业-17）；攻击读取攻击力倍率乘区 `atkScaleMul`（伤害-6）。

| 属性 | 基础字段 | 直接加算 | 直接乘算 | 最终加算 | 最终乘算 |
|---|---|---|---|---|---|
| 最大生命值 | `maxHp` | `hpFlat` | `hpPct` | `hpFinal` | `hpMul` |
| 攻击力 | `atk` | `atkFlat` | `atkPct` | `atkFinal` | `atkMul` |
| 防御力 | `def` | `defFlat` | `defPct` | `defFinal` | `defMul` |
| 法术抗性 | `res` | `resFlat` | `resPct` | `resFinal` | `resMul` |
| 攻击速度 | `aspd` | `aspd` | `aspdPct` | `aspdFinal` | `aspdMul` |
| 攻击间隔 | `bat` | `batFlat` | `batPct` | `batFinal` | `batMul` |
| 阻挡数 | `blockCnt` | `blockCnt` | `blockCntPct` | `blockCntFinal` | `blockCntMul` |
| 移动速度 | `moveSpeed` | `moveFlat` | `movePct` | `moveFinal` | `moveMul` |
| 嘲讽等级 | `tauntLevel` | `taunt` | `tauntPct` | `tauntFinal` | `tauntMul` |

其余属性的前缀：重量 `mass`、技力自然回复速度 `spRecovery`、生命回复速度 `hpRegen`（直接加算键为 `hpRegen`）、攻击距离 `rangeExtend`（直接加算键为 `rangeExtend`）、四种穿透（直接加算键就是属性名，如 `defIgnorePct`）、一减状态抵抗率 `statusRes`、元素抗性 `epDmgRes`、损伤抵抗 `epRes`、最大元素值 `maxEp`。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「修饰器叠加」：「除最终乘算为变化数值之间相乘外，其余均为相加」；层数的计法为推断 INF-0015

### 属性-3 数值范围

| 属性 | 下限 | 上限 | 未给出时 |
|---|---|---|---|
| 最大生命值 | 1 | — | 1 |
| 攻击力、防御力 | 0 | — | 0 |
| 法术抗性 | 0 | 100 | 0 |
| 攻击速度 | 20 | — | 100 |
| 攻击间隔 | 0 | — | 1 |
| 阻挡数 | 0 | — | 0 |
| 移动速度 | 0.1 | — | 1 |
| 嘲讽等级 | −2 | 2 | 0 |
| 重量、攻击距离 | — | — | 0 |
| 技力自然回复速度 | 0 | — | 1 |
| 生命回复速度 | 0 | — | 0 |
| 物理穿透（百分比）、法术穿透（百分比） | 0 | 1 | 0 |
| 物理穿透（固定值）、法术穿透（固定值） | 0 | — | 0 |
| 一减状态抵抗率 | 0.001 | 1000 | 1 |
| 元素抗性、损伤抵抗 | 0 | 100 | 0 |
| 最大元素值 | 0 | — | 按 元素-1：领袖 2000，其余 1000 |

「—」表示不限。攻击速度只在计算攻击间隔时另外限定在 10–600（属性-5）。

- 来源：[PRTS「数值范围」oldid=439605](https://prts.wiki/index.php?title=%E6%95%B0%E5%80%BC%E8%8C%83%E5%9B%B4&oldid=439605)；「未给出时」一列是内容没有写这一项时的默认值，攻击速度 100、技力自然回复 1、移动速度 1、一减状态抵抗率 1 为数据表的通常值（数据：character_table / enemy_database 的属性）

### 属性-4 最大生命值变化

最大生命值变化时，当前生命按比例变化，生命值比例不变：生命 × (新上限 / 旧上限)。生命已为 0 的单位不变。

- 来源：[PRTS「生命值」oldid=425018](https://prts.wiki/index.php?title=%E7%94%9F%E5%91%BD%E5%80%BC&oldid=425018)：「当最大生命值发生变化时，生命值将同时变化，使得生命值比例不变」

### 属性-5 攻击间隔

实际攻击间隔 T = T₀ / (clamp(S, 10, 600) / 100)，T₀ 是攻击间隔属性，S 是攻击速度属性。

- 以秒表示时按 T₀ × 100 / clamp(S, 10, 600) 计算。
- 换成整数帧时，按 时间-2 取最近的帧，正好一半时进位。用 T₀ 和 S 的十进制表示（数值-1）做整数运算，结果精确。
- 比如 T₀ = 1.6、S = 130：T = 1.2307… 秒，36.92 帧，取 37 帧。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「攻速公式」；帧的取整见 时间-2（INF-0002 已证实）

### 属性-6 生命回复

每帧的 Buff 阶段之后（帧-1 第 5 步），每个在场、生命低于最大生命值的单位回复（生命回复速度 + 生命回复速度（百分比）× 最大生命值）÷ 30 点生命，不超过最大生命值。生命回复速度（百分比）是 Buff 修饰器 `hpRegenRatio` 之和，限在 0 到 1 之间（干员-16）。生命回复不是治疗：不产生表现事件，不受治疗倍率影响，禁疗不阻止它。

- 来源：[PRTS「数值范围」oldid=439605](https://prts.wiki/index.php?title=%E6%95%B0%E5%80%BC%E8%8C%83%E5%9B%B4&oldid=439605)：HP_RECOVERY_PER_SEC 生命回复速度，下限 0，未给出时 0；HP_RECOVERY_PER_SEC_BY_MAX_HP_RATIO 生命回复速度（百分比），0 到 1，未给出时 0，「基于最大生命值的百分比的生命回复」；[PRTS「异常效果」oldid=440606](https://prts.wiki/index.php?title=%E5%BC%82%E5%B8%B8%E6%95%88%E6%9E%9C&oldid=440606) 禁疗：「增减生命回复速度或生命回复速度（百分比）属性的效果不会被识别为治疗类能力」；[PRTS「术语释义」oldid=440223](https://prts.wiki/index.php?title=%E6%9C%AF%E8%AF%AD%E9%87%8A%E4%B9%89&oldid=440223) 重伤在禁疗之外另把生命回复速度归零；每帧按 1/30 回复、禁疗不阻止为推断 INF-0093
