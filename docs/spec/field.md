# 地图、部署、费用

### 地图-1 坐标

地块按"路线坐标"存放：第 0 行是离镜头最近的一行，第 0 列是最左一列。关卡文件的 `mapData.map` 从最上一行开始列出，路线的位置（起点、检查点、终点）已经是第 0 行在下。所以：

```
tiles[r] = mapData.map[高 − 1 − r]
```

- 来源：数据：level.mapData.map、level.routes[].startPosition（出怪起点必须落在出怪点地块上，测试据此核对）

### 部署-1 可部署地块

近战干员只能部署在可部署类型为 `MELEE` 的地块上，远程干员只能部署在 `RANGED` 的地块上，两类都可部署在 `ALL` 的地块上。地图外不能部署。

- 来源：数据：level.mapData.tiles[].buildableType、character_table.position

### 部署-2 部署条件

满足以下全部条件才能部署，否则这条指令被忽略，状态不变：

- 干员存在，座位存在；
- 这名玩家场上没有同一名干员；
- 这名玩家已部署的数量小于关卡的 `characterLimit`（每名玩家分别计算）；
- 费用不低于干员的部署费用；
- 地块满足 部署-1，且上面没有任何玩家的干员。

部署后扣除费用，干员面朝指令给出的方向。

- 来源：推断 INF-0009

### 撤退-1 撤退

玩家只能撤退自己的干员。撤退后干员离场，可以再次部署。骨架不返还费用，也没有再部署冷却。

- 来源：推断 INF-0009

### 费用-1 费用

每名玩家各有一份费用。开局为关卡的 `initialCost`，每隔 `costIncreaseTime` 秒（按 时间-2 换算成帧）加 1，不超过 `maxCost`。

- 来源：数据：level.options.initialCost、costIncreaseTime、maxCost；每名玩家分开计算为推断 INF-0008
