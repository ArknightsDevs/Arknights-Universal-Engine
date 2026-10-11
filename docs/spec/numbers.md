# 数值

模拟用 64 位浮点数，只做精确运算（加、减、乘、除、开方、取整、比较）。不精确的数学函数由 `@aue/math` 提供确定性实现（见 ADR 0011）。

### 数值-1 数据里的小数按写下的十进制理解

游戏数据里的时长、倍率是十进制小数，比如 0.3、1.2、0.05。64 位浮点只能存最接近的二进制值，直接相乘可能偏离整数或 0.5 一个最小单位。

需要精确结果的换算，先取这个数的**最短十进制表示**，记作 `尾数 × 10^指数`，再用整数运算：

- ECMAScript 规定 `Number::toString` 给出能读回同一个浮点数的最短十进制；有几个同样短的，取最接近的那个。所以所有引擎都会得到同一个十进制。
- 定义域：有限且 ≥ 0 的数。负数、无穷、NaN 一律报错（`RangeError`），不做静默处理。
- 指数形式（如 `1e-7`、`2e21`）按同样方式读取。

- 来源：[ECMAScript 规范：Number::toString](https://tc39.es/ecma262/#sec-numeric-types-number-tostring)

### 数值-2 hypot

`hypot(x, y)` = √(x² + y²)，用 `Math.sqrt(x·x + y·y)` 计算。

- 两个参数中较大的绝对值超过 2^500 时，先乘 2^−600，算完再乘回 2^600；小于 2^−500 且不为 0 时，先乘 2^600 再乘回。这样既不会上溢，也不会丢掉次正规数。乘的都是 2 的整数次幂，结果精确。
- 只用正确舍入的运算，所以所有引擎的结果逐位相同。
- 有一个参数是 ±∞ 时结果是 +∞（即使另一个是 NaN）；否则有 NaN 时结果是 NaN。

- 来源：[ECMAScript 规范：Math.hypot](https://tc39.es/ecma262/#sec-math.hypot)（特殊值；一般情况是"实现近似"，各引擎末位不同）；做法见 ADR 0011

### 数值-3 整数次幂

`powi(x, n)` = xⁿ，n 是整数。

- **算法**：用平方乘算法，在双精度对（Dekker 分裂，不用融合乘加）里计算，最后舍入一次。负指数取 `1 / powi(x, −n)`。
- **底数为 ±0**：按 `Math.pow` 精确规定的结果：0 次方为 1；奇数次方保留符号，比如 (−0)¹ = −0，(−0)⁻¹ = −∞；偶数正次方为 +0；偶数负次方为 +∞。
- **定义域**：整数 n，|n| ≤ 2^31；有限的 x，|x| ≤ 2^500。超出定义域时报错（`RangeError`），不交给 `Math.pow`，因为各引擎的 `Math.pow` 结果不同。

- 来源：[Dekker 1971, *A floating-point technique for extending the available precision*](https://doi.org/10.1007/BF01397083)；[ECMAScript 规范：Number::exponentiate](https://tc39.es/ecma262/#sec-numeric-types-number-exponentiate)（±0 的结果）

### 数值-4 sin 与 cos

`sin(x)`、`cos(x)` 用 fdlibm 5.3 的算法：`__kernel_sin`、`__kernel_cos`，以及 `__ieee754_rem_pio2` 的中等参数路径（把 x 减去 n·π/2，最多三步，精度到 151 位）。

- 只用正确舍入的运算。
- |x| > 2^19·π/2 时，先对最接近 2π 的双精度数取模（精确的 `%`）。这个结果是确定的，但不精确；模拟里不会出现这么大的角度。
- ±0 保留符号（sin(−0) = −0，cos(±0) = 1）；NaN 和 ±∞ 的结果是 NaN。

- 来源：[fdlibm 5.3](https://www.netlib.org/fdlibm/)（k_sin.c、k_cos.c、e_rem_pio2.c）

### 数值-5 atan2

`atan2(y, x)` 是点 (x, y) 的角度，范围 [−π, π]，用 FreeBSD msun 的 fdlibm 算法（s_atan.c、e_atan2.c）。

- 只用正确舍入的运算。
- x 或 y 为 ±0、±∞ 时，结果是 ECMA-262 精确规定的值；有 NaN 时结果是 NaN。

- 来源：[FreeBSD msun e_atan2.c](https://github.com/freebsd/freebsd-src/blob/main/lib/msun/src/e_atan2.c)、[s_atan.c](https://github.com/freebsd/freebsd-src/blob/main/lib/msun/src/s_atan.c)；[ECMAScript 规范：Math.atan2](https://tc39.es/ecma262/#sec-math.atan2)（特殊值）
