# 机制规范

每个机制模块在这里有一份书面规范。规范是代码的依据：先写条款，再写实现和测试。

## 条款格式

```markdown
### 时间-2 秒换算成帧

条款正文：公式、定义域、取整规则、边界情况。

- 来源：<出处>
```

- **编号**：`<领域>-<序号>`，比如 `时间-2`、`伤害-3`。编号一旦发布就不再改动、不再复用；条款作废时，在标题后标注「（已废止）」，不要删除。
- **来源**写在 `- 来源：` 这一行，至少有下面一种：
  - 数据表字段，写成 `数据：<表>.<字段>`；
  - 带 `oldid` 的 PRTS 固定版本链接，这样以后页面改了也能找回当时的原文；
  - 其他公开链接；
  - `推断 INF-xxxx`：官方出处还没找到，先按推断实现，并在 [登记表](../registry/README.md) 里登记依据。
- **测试**：测试名里写上它验证的条款编号，比如 `test('[时间-2] …')`。

## 检查

`aue-check spec`（`@aue/testkit`）检查以下几点，`pnpm run check` 也会跑这些检查：

1. 编号不重复，格式正确；
2. 每一条都写了来源，引用的推断在登记表里存在；
3. 每一条至少有一个测试；
4. 测试引用的编号都存在。

## 目录

- [numbers.md](numbers.md)：数值的表示、确定性数学函数（hypot、整数次幂、sin、cos、atan2）、四舍六入五成双
- [time.md](time.md)：时间与帧
- [battle.md](battle.md)：一帧内的顺序、随机数、状态哈希、快照
- [field.md](field.md)：地图坐标、部署、撤退、费用
- [enemies.md](enemies.md)：出怪、移动、到达目标点、敌人的普通攻击
- [combat.md](combat.md)：干员攻击
- [attributes.md](attributes.md)：属性公式、修饰器、数值范围、攻击间隔
- [status.md](status.md)：Buff、同名规则、衰减率、异常状态
- [damage.md](damage.md)：伤害公式、结算顺序、伤判、生命流失、治疗
- [targeting.md](targeting.md)：攻击范围、可选性、目标顺序、仇恨值
- [blocking.md](blocking.md)：阻挡的条件、阻挡数、解除、被阻挡的敌人
- [paths.md](paths.md)：寻路（流场、平滑）、路线指令、巡逻、消失
- [skills.md](skills.md)：技能的种类、技力、发动、运行与结束、通用效果、行为接口
- [elements.md](elements.md)：元素值、元素损伤、爆发与爆发冷却、各元素的爆发效果、当前损伤元素
- [traits.md](traits.md)：职业与分支特性：按位置的默认值、治疗、目标数与伤害次数、在场修饰器与命中效果、击杀费用、行为接口、官方分支表
- [spine.md](spine.md)：Spine 3.8 二进制骨骼的读取，战斗用的动画时长和攻击时刻
- [compat.md](compat.md)：Stronghold 兼容层：网格尺寸
- [lockstep.md](lockstep.md)：输入延迟、封口、追赶、哈希校验、重连、暂停
- [direction.md](direction.md)：四个方向、偏移旋转、位移的方向、并列先后
- [body.md](body.md)：点单位与巨型单位所在的格、距离
- [constants.md](constants.md)：最低伤害比例、碰撞半径、阻挡半径、攻速上下限、移动倍率
