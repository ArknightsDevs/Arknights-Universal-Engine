# 伤害与治疗

实现见 `packages/sim/src/damage.js`。下文 A 是基础伤害（伤害-6），0.05 是最低伤害比例（常量-1）。

### 伤害-1 物理伤害

物理伤害 = max(0.05 × A, A − (1 − I_p) × max(0, D − I_v))

- D：目标的防御力；
- I_p：物理穿透（百分比）；
- I_v：物理穿透（固定值）。

先减固定值，再乘百分比。两种穿透都是来源的属性（属性-3），加上这一击自带的穿透，百分比限制在 0–1，固定值不小于 0。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「伤害公式」：DMG_p = max(0.05A, A − [(1 − I_p)·max(0, D − I_v)])；[PRTS「伤害分类」oldid=433934](https://prts.wiki/index.php?title=%E4%BC%A4%E5%AE%B3%E5%88%86%E7%B1%BB&oldid=433934)

### 伤害-2 最低伤害

物理、法术、元素伤害经过防御、法抗、元素抗性后，至少为 A 的 5%。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)：物理、法术、元素伤害公式都取 max(0.05A, …)（INF-0003 已证实）

### 伤害-3 法术伤害

法术伤害 = max(0.05 × A, A × (1 − R′ / 100))，R′ = (1 − I_p) × max(0, R − I_v)

- R：目标的法术抗性；
- I_p、I_v：法术穿透的百分比和固定值，规则同 伤害-1。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「伤害公式」：DMG_a = max{0.05A, 0.01A·max[0, 100 − (1 − I_p)·max(0, D − I_v)]}（官方 0.01 的定点误差不模拟，见 数值-7）

### 伤害-4 真实伤害

真实伤害 = A，不受防御和法抗影响。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)：DMG_pu = A；[PRTS「伤害分类」oldid=433934](https://prts.wiki/index.php?title=%E4%BC%A4%E5%AE%B3%E5%88%86%E7%B1%BB&oldid=433934)

### 伤害-5 元素伤害

元素伤害 = max(0.05 × A, A × (1 − E / 100))，E 是目标的元素抗性。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)：DMG_e = max[0.05A, 0.01A·max(0, 100 − D)]，D 为「目标的元素抗性最终结果」

### 伤害-6 基础伤害

基础伤害 A = 攻击力 × 攻击力倍率 + 附加攻击力。普通攻击的攻击力倍率为 1、附加攻击力为 0，即 A 等于攻击力；技能给出倍率（M3）。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「伤害公式」：「基本伤害 = 攻击力 × 攻击力倍率 + 附加攻击力」

### 伤害-7 结算顺序

一次伤害按以下顺序结算：

1. 目标生命已为 0：不造成伤害。
2. 生命流失：直接扣除生命（伤害-10）。
3. 目标无敌（无敌、沉睡）：不造成伤害。
4. 按伤害类型和目标的防御、法抗、元素抗性计算（伤害-1 至 伤害-5）。
5. 乘以来源的伤害倍率：`dmgDealtMul` × 物理时 `physDealtMul`、法术时 `artsDealtMul`。无来源的伤害没有这一步。
6. 目标的伤判效果（伤害-8）。
7. 剩下的伤害大于 0 时扣除生命（伤害-9）。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)「伤害及其处理」：先计算伤害（ON_CALCULATE_DAMAGE），来源的伤害倍率在 ON_OUTPUT_DAMAGE，伤判在 ON_TAKE_DAMAGE；[PRTS「伤判效果」oldid=439572](https://prts.wiki/index.php?title=%E4%BC%A4%E5%88%A4%E6%95%88%E6%9E%9C&oldid=439572)：伤判在防御和法抗计算之后；[PRTS「异常效果」oldid=440606](https://prts.wiki/index.php?title=%E5%BC%82%E5%B8%B8%E6%95%88%E6%9E%9C&oldid=440606) 无敌：「受到的伤害与元素值变为0」

### 伤害-8 伤判效果

目标生效的 Buff（状态-2）先按事件优先级从高到低、再按获取顺序，逐个处理。每个 Buff 内依次是：

1. **闪避**：物理伤害看 `dodgePhys`，法术伤害看 `dodgeArts`，概率 p（限制在 0–1；n 层为 1 − (1 − p)ⁿ）。从对局随机数（随机-1）抽一个 [0, 1) 的数，小于这个概率就闪避，伤害取消。不可闪避的伤害、概率为 0 时不抽。
2. **伤害修改**：乘以受到伤害倍率。`dmgTakenMul`（脆弱）作用于物理、法术、真实伤害；`physTakenMul`、`artsTakenMul`、`trueTakenMul`、`elementalTakenMul` 各自作用于对应类型；n 层取 n 次方。
3. **护盾**：有护盾层数且吸收这类伤害时，消耗一层，伤害取消。
4. **屏障**：有屏障量且吸收这类伤害时，吸收 min(屏障量, 伤害)。

规则：

- 护盾、屏障没有指定类型时，吸收所有类型。
- 一个 Buff 取消伤害，或者把伤害降到 0 时，后面的 Buff 不再处理。
- 只有护盾和屏障、没有其他修饰器和标记的 Buff，用完就移除。

- 来源：[PRTS「伤判效果」oldid=439572](https://prts.wiki/index.php?title=%E4%BC%A4%E5%88%A4%E6%95%88%E6%9E%9C&oldid=439572)：处理顺序「事件优先级＞获取顺序」，取消或降为 0 后跳过后续伤判；[PRTS「术语释义」oldid=440223](https://prts.wiki/index.php?title=%E6%9C%AF%E8%AF%AD%E9%87%8A%E4%B9%89&oldid=440223) 护盾「每层护盾可以抵挡一次伤害」、屏障「可以吸收一定数值的伤害」「若无特殊说明，屏障可吸收全种类伤害」；[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「闪避」：多个闪避相乘合并；一个 Buff 内的顺序、用完移除为推断 INF-0022

### 伤害-9 扣除生命与离场

生命减去伤害；减到 0 或以下时生命为 0，单位在这一帧末离场（帧-1）。每次扣除生命产生一个命中事件，伤害数值不取整。

- 来源：[PRTS「生命值」oldid=425018](https://prts.wiki/index.php?title=%E7%94%9F%E5%91%BD%E5%80%BC&oldid=425018)：「当一个单位生命值归零时，若非特殊情况，这个单位将会离场」；[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)：红字「在显示时会就近取整」，「不会影响实际的伤害数值」

### 伤害-10 生命流失

生命流失跳过防御、法抗和所有伤判效果：不能被闪避、护盾、屏障抵挡，不受脆弱影响，直接扣除生命（伤害-9）。它保留伤害类型和来源。无敌也不能阻止生命流失。

- 来源：[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)「伤判效果与生命流失」：生命流失跳过防御、法抗计算和其后所有伤判效果，保留伤害类型和来源，不可被闪避、抵挡、护盾或屏障，不受脆弱、庇护影响；无敌不阻止生命流失为推断 INF-0023

### 伤害-11 治疗

治疗量 = 基本治疗量 × 来源的治疗倍率 `healingDealtMul` × 目标的受到治疗倍率 `healingTakenMul`。

- 目标有禁疗时为 0；目标生命为 0 时不治疗。
- 生命不超过最大生命值，超出的部分不计。

- 来源：[PRTS「游戏数据基础」oldid=440563](https://prts.wiki/index.php?title=%E6%B8%B8%E6%88%8F%E6%95%B0%E6%8D%AE%E5%9F%BA%E7%A1%80&oldid=440563)「治疗量」：「基本治疗量 = 攻击力 × 攻击力倍率」；[PRTS「作战机制」oldid=433935](https://prts.wiki/index.php?title=%E4%BD%9C%E6%88%98%E6%9C%BA%E5%88%B6&oldid=433935)「伤害及其处理」：治疗倍率在 ON_OUTPUT_MODIFIER，受到治疗倍率在 ON_APPLYING_MODIFIER；[PRTS「异常效果」oldid=440606](https://prts.wiki/index.php?title=%E5%BC%82%E5%B8%B8%E6%95%88%E6%9E%9C&oldid=440606) 禁疗；溢出转为额外生命的规则在 M3
