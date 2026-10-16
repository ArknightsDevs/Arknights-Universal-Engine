# 音频

战斗的音效和音乐按原版的音效库播放（ADR 0024）：素材里有的照原版用，没有的不播，不拿别的声音顶替。

### 音频-1 音效库

- 素材带一份音频索引：音效库（库名 → 几个音效，各有文件、权重、延迟秒数、音高范围、音量范围；同时播放的上限、满了时是否挤掉最早的一个、是否循环）和音乐库（前奏、循环、音量、交叉淡化秒数）。库名和这些数值取自游戏数据 `audio_data.json` 的 `soundFXBanks`、`bgmBanks`。
- 播一个音效库：按权重随机选一个音效（权重都为 0 时等概率），音高和音量各在范围内均匀随机，延迟之后开始。这个库同时在播的个数已到上限时，挤掉最早的一个（`popOldest`），否则这次不播。
- 素材里没有的库不播。
- 这里的随机数是页面自己的，不进模拟，各座位可以不同。
- 音效和音乐的总音量由玩家设定（页面的画面设置）。

- 来源：数据：audio_data.json `soundFXBanks[]`（name、sounds[].asset、weight、delay、minPitch、maxPitch、minVolume、maxVolume、maxSoundAllowed、popOldest、loop）、`bgmBanks[]`（name、intro、loop、volume、crossfade）；设计决定：[ADR 0024](../adr/0024-audio-sources.md)；权重为 0 时等概率、上限时不挤就不播为推断 INF-0168

### 音频-2 战斗事件的音效

每帧的表现事件对应的音效库如下，按顺序取素材里有的第一个：

| 事件 | 音效库 |
|---|---|
| 干员部署（`deploy`） | `battle.ON_UNIT_BORN.<单位 id>`；召唤物和携带物 `battle.ON_UNIT_BORN.token`；其他 `battle.ON_UNIT_BORN.char` |
| 撤退（`retreat`） | `battle.ON_CHARACTER_WITHDRAW.<单位 id>`；召唤物和携带物 `.token`；其他 `.char` |
| 阵亡（`death`） | 干员：`battle.ON_UNIT_DEAD.<单位 id>`，召唤物和携带物 `.token`，其他 `.char`；敌人：`battle.ON_UNIT_DEAD.<敌人 id>`，其他 `battle.ON_UNIT_DEAD.enemy` |
| 敌人进入目标点（`goal`） | `battle.ON_ENEMY_REACHED_EXIT` |
| 技能开始（`skill`，开启） | `battle.ON_SKILL_START.<技能 id>` |
| 玩家失守（`down`，合作-4） | 自己：`battle.ON_COOPERATE_DYING`；协作者：`battle.ON_COOPERATE_MATE_DYING` |
| 复活（`revive`） | `battle.ON_COOPERATE_REVIVE` |
| 费用请求被拒（`answer`，拒绝，合作-5） | 请求的一方：`battle.ON_COOPERATE_COST_REJECT` |
| 阶段结算（`stage`，结束，合作-6） | `battle.ON_COOPERATE_STAGE_COMPLETE_<阶段序号，从 1 起>`；之后还有阶段时再播 `battle.ON_COOPERATE_REST_START`（中场休整，合作-8） |
| 协作者申请暂停、申请加速（同步-7、同步-8） | `battle.ON_COOPERATE_PAUSE_CONFIRM`、`battle.ON_COOPERATE_SPEED_REQUEST` |

单位 id 是干员、召唤物或携带物的数据 id（内容键「id#座位」去掉座位），敌人 id 是敌人的键。

- 来源：数据：audio_data.json 的库名（`battle.ON_UNIT_BORN.char`「b_char_set」、`battle.ON_UNIT_BORN.token`「b_char_tokenset」、`battle.ON_CHARACTER_WITHDRAW.char`「b_char_escape」、`battle.ON_UNIT_DEAD.char`「b_char_dead」、`battle.ON_UNIT_DEAD.enemy`「b_enemy_dead_n」、`battle.ON_UNIT_DEAD.token`「b_char_tokendead」、`battle.ON_ENEMY_REACHED_EXIT`「b_ui_alarmenter」、`battle.ON_SKILL_START.<技能 id>`、`battle.ON_COOPERATE_DYING`「b_ui_sos」、`battle.ON_COOPERATE_MATE_DYING`「b_ui_teammatelose」、`battle.ON_COOPERATE_REVIVE`「b_ui_reviveol」、`battle.ON_COOPERATE_COST_REJECT`、`battle.ON_COOPERATE_STAGE_COMPLETE_1`/`_2`「b_ui_achievestage」、`battle.ON_COOPERATE_REST_START`「b_ui_halftimerest」、`battle.ON_COOPERATE_PAUSE_CONFIRM`「b_ui_applypause」、`battle.ON_COOPERATE_SPEED_REQUEST`「b_ui_applyspeedup」）；事件与库的对应、携带物用召唤物的库为推断 INF-0169

### 音频-3 战斗音乐

关卡数据带它的 BGM 事件（`bgm`，取自关卡的 `bgmEvent`）。所有座位就绪、战斗开始时播音乐库 `battle.ON_GAME_READY.<bgm>`，素材里没有时播默认的 `battle.ON_GAME_READY`：先播前奏，前奏结束时接上循环段，一直循环。战斗结束时按库的交叉淡化秒数淡出。开服的人可以在素材里换掉这两个文件（ADR 0024）。

- 来源：数据：关卡的 `bgmEvent`（如 act1multi_01「lostmemory」）、audio_data.json `bgmBanks` 的 `battle.ON_GAME_READY`（m_bat_indust_intro、m_bat_indust_loop，crossfade 1.5）与 `battle.ON_GAME_READY.<bgmEvent>`；设计决定：[ADR 0024](../adr/0024-audio-sources.md)、规划问答 Q69（BGM 默认用本地的原版战斗曲，可替换）；开始与淡出的时机为推断 INF-0170
