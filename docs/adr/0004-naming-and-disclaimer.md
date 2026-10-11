# 0004 命名与免责声明

- 状态：已采纳
- 日期：2026-10-11
- 来源：规划讨论 Q45, Q56, Q68

## 背景

同人项目的名字不能让人误以为是官方作品。悠星的[二创指引](https://www.arknights.global/fankit/guidelines)禁止让人误以为是官方作品，并要求注明作品源自《明日方舟》、禁止商用；它没有禁止在名字里使用 "Arknights"。鹰角没有公开的二创指引。

## 决定

- 引擎：Arknights Universal Engine / 明日方舟通用引擎，缩写 AUE，包名空间 `@aue/*`。
- 第一个平台：Icebreaker-Games / 促融共竞。*Icebreaker Games* 是促融共竞在国际服的官方英文名（[arknights.wiki.gg](https://arknights.wiki.gg/wiki/Icebreaker_Games)）。
- README 首段写明："非官方同人项目，与鹰角网络、悠星无关，源自《明日方舟》，禁止商用。"
- NOTICE 写明游戏素材和数据不在代码许可范围内。

## 理由

名字里保留 Arknights，方便玩家找到；免责声明放在首段，满足指引对出处和非商用的要求。

## 后果

- 每个公开仓库的 README 都要有这段声明。
- 若鹰角或悠星以后发布更严的指引，要重新评估名字。

## 备选方案

- 不带 Arknights 的名字：计划没有采用，指引并不禁止。
