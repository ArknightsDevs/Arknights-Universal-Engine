// 阵地足球锦标's stadiums (docs/spec/cup.md 锦标-2): each level's, as its stage page names it, and what each does in the
// simulation — the hidden group of the level's waves it enables (龙卷风, 智能裁判官), 冻人冬日's ice on every field tile
// and its enemies' move speed, 超强对流's lightning at its level. PF-S-1 and PF-S-2 draw one of the five at the start.

/** @typedef {import('@aue/sim').Stadium} Stadium @typedef {import('@aue/sim').ThunderDef} ThunderDef */

/** 北境意志球's ice (足球-16): the friction change 冻人冬日 lays on every field tile (锦标-2). */
export const WINTER_ICE = -0.3;

/**
 * 超强对流's lightning at its three levels (锦标-2): a warning on each ball every 20 s, the bolt 2 s later — radius 1.0,
 * physical damage to ours and to the enemies, a stun —, then 10 s of burning, radius 1.5, arts damage each second.
 * Which level a level has is INF-0666.
 * @param {number} hit ours' bolt damage @param {number} enemy the enemies' @param {number} stun @returns {ThunderDef}
 */
const lightning = (hit, enemy, stun) => ({ every: 20, warn: 2, radius: 1, ally: hit, enemy, stun, burn: { radius: 1.5, ally: hit / 10, enemy: enemy / 10, seconds: 10 } });
/** Lv1, Lv2, Lv3 (锦标-2). @type {readonly ThunderDef[]} */
export const THUNDER = Object.freeze([lightning(800, 5000, 5), lightning(1000, 6000, 6), lightning(1200, 7000, 6)]);
/** The level of 超强对流 a level has (INF-0666): 晋级赛 Lv1, 淘汰赛 Lv2, 特训赛 Lv3. */
const THUNDER_LEVEL = Object.freeze({ act1football_03: 0, act1football_ex02: 1, 'act1football_sub-1-1': 2, 'act1football_sub-1-2': 2 });

/**
 * The five stadiums (锦标-2): 常规球场, 旋旋风暴球场 (the waves' `whirlwind` group: 龙卷风), 超强对流球场 (lightning at
 * a level), 冻人冬日球场 (ice everywhere, the enemies faster by the manager's `move_speed`), 智能时代球场 (the waves'
 * `catchball` group: 智能裁判官). @param {number} moveSpeed the manager's `move_speed` (锦标-1) @param {number} [level]
 * 超强对流's, 0…2 @returns {Readonly<Record<string, Stadium>>}
 */
export const stadiums = (moveSpeed, level = 0) => Object.freeze({
  plain: { name: 'plain' },
  whirlwind: { name: 'whirlwind', group: 'whirlwind' },
  thunder: { name: 'thunder', thunder: THUNDER[level] },
  winter: { name: 'winter', ice: WINTER_ICE, moveMul: moveSpeed },
  smart: { name: 'smart', group: 'catchball' },
});

/** Each level's stadium by its stage page (锦标-2); `random` for the two that draw one. */
export const STADIUM_OF = Object.freeze({
  act1football_tr01: 'plain', act1football_01: 'plain', act1football_02: 'whirlwind', act1football_03: 'thunder', act1football_04: 'winter',
  act1football_05: 'plain', act1football_06: 'winter', act1football_07: 'smart', act1football_ex01: 'plain', act1football_ex02: 'thunder',
  act1football_ex03: 'whirlwind', act1football_ex04: 'plain', 'act1football_sub-1-1': 'random', 'act1football_sub-1-2': 'random',
});

/**
 * A 锦标 level's 阵地足球 settings with its stadium (锦标-2): fixed, or the five to draw from; other levels as they are.
 * @param {string} id @param {import('@aue/sim').FootballRules | undefined} f
 * @returns {import('@aue/sim').FootballRules | undefined}
 */
export function withStadium(id, f) {
  if (!f?.cup || !Object.hasOwn(STADIUM_OF, id)) return f;
  const all = stadiums(f.cup.moveSpeed, THUNDER_LEVEL[/** @type {keyof typeof THUNDER_LEVEL} */ (id)] ?? 0), name = STADIUM_OF[/** @type {keyof typeof STADIUM_OF} */ (id)];
  return { ...f, cup: { ...f.cup, ...(name === 'random' ? { stadiums: Object.values(all) } : { stadium: all[name] }) } };
}

/** The hidden group a level's fixed stadium enables (锦标-2), or null. @param {import('@aue/sim').FootballRules | undefined} f */
export const stadiumGroup = (f) => f?.cup?.stadium?.group ?? null;
