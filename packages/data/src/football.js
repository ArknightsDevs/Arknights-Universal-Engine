// 阵地足球's settings (docs/spec/football.md 足球-1, 足球-6): a level whose tiles have both goals is 阵地足球; its kickoff
// tables, teams, players' wait and match time come from the co-op battle table and the level's options, its stamps from
// the missions' texts (「争取N个净胜球」).
import { asArray, asNumber, asObject, asString, field } from './validate.js';

/** The goal tiles that make a level 阵地足球 (足球-1). */
const GOALS = Object.freeze(['tile_allygoal', 'tile_enemygoal']);

/**
 * The teams of the co-op 阵地足球 (足球-6): the four the 促融共竞 page lists. The table's other three (直球队, 门神会,
 * 魔球帮) are new in the 阵地足球锦标 event.
 */
export const COOP_TEAMS = Object.freeze(['normal', 'shooter', 'hurrier', 'kungfuer']);

/** A mission's net goals (足球-6): the number in 「争取N个净胜球」, or null. @param {unknown} m */
function missionGoals(m) {
  const d = typeof m === 'object' && m !== null ? /** @type {Record<string, unknown>} */ (m).description : null;
  const hit = typeof d === 'string' ? /争取(\d+)个净胜球/.exec(d) : null;
  return hit ? Number(hit[1]) : null;
}

/** Whether a level's tiles have both goals (足球-1). @param {{ key: string }[][]} tiles */
export const isFootball = (tiles) => GOALS.every((g) => tiles.some((row) => row.some((t) => t.key === g)));

/**
 * The kickoff level each lead reaches (足球-6): [the lead, the level] by the table's `footballAheadGoalCntFactor`, in
 * its order. @param {Record<string, unknown>} coop
 */
function aheadOf(coop) {
  const p = 'cooperate_battle_table.footballAheadGoalCntFactor';
  return asArray(field(coop, 'footballAheadGoalCntFactor', p), p).map((x, i) => {
    const o = asObject(x, `${p}[${i}]`);
    return [asNumber(field(o, 'aheadCnt', p), `${p}[${i}].aheadCnt`, 0, 1e6), asNumber(field(o, 'level', p), `${p}[${i}].level`, 0, 99)];
  });
}

/**
 * Each kickoff level's weights of the wave tags (足球-6): level → the weight of tag 0, 1, … by the table's
 * `footballLevelOfWaveFactor`. @param {Record<string, unknown>} coop
 */
function weightsOf(coop) {
  const p = 'cooperate_battle_table.footballLevelOfWaveFactor', o = asObject(field(coop, 'footballLevelOfWaveFactor', p), p);
  return Object.fromEntries(Object.entries(o).map(([level, list]) => {
    const ws = asArray(list, `${p}.${level}`).map((x, i) => asObject(x, `${p}.${level}[${i}]`));
    const tags = ws.map((x, i) => asNumber(field(x, 'wave', p), `${p}.${level}[${i}].wave`, 0, 99));
    const out = Array.from({ length: Math.max(...tags) + 1 }, () => 0);
    ws.forEach((x, i) => { out[tags[i]] = asNumber(field(x, 'weight', p), `${p}.${level}[${i}].weight`, 0, 1e6); });
    return [level, out];
  }));
}

/**
 * The co-op teams with their weights and players (足球-6), and each team's elite players: a player's `_2` that the
 * level's enemy references name (`has`). @param {Record<string, unknown>} coop @param {(key: string) => boolean} has
 * @returns {{ name: string, weight: number, players: Record<string, string>, elite?: Record<string, string> }[]}
 */
function teamsOf(coop, has) {
  const p = 'cooperate_battle_table', players = asObject(field(coop, 'footballTeamPlayers', p), `${p}.footballTeamPlayers`);
  const weights = asArray(field(coop, 'footballTeamWeights', p), `${p}.footballTeamWeights`).map((x, i) => asObject(x, `${p}.footballTeamWeights[${i}]`));
  return COOP_TEAMS.map((name) => {
    const w = weights.find((x) => x.teamName === name), roles = asObject(field(players, name, `${p}.footballTeamPlayers`), `${p}.footballTeamPlayers.${name}`);
    if (!w) throw new Error(`${p}.footballTeamWeights has no ${name}`);
    const keys = Object.entries(roles).map(([role, key]) => [role, asString(key, `${p}.footballTeamPlayers.${name}.${role}`)]);
    const elite = keys.filter(([, key]) => has(`${key}_2`)).map(([role, key]) => [role, `${key}_2`]);
    return { name, weight: asNumber(field(w, 'weight', p), `${p}.footballTeamWeights.${name}.weight`, 0, 1e6),
      players: Object.fromEntries(keys), ...(elite.length > 0 ? { elite: Object.fromEntries(elite) } : {}) };
  });
}

/** The global buff that strengthens the players by our lead (足球-17). */
const CATCH_UP = 'cooperate_enemy_catch_up';

/**
 * What each goal of our lead adds to the players (足球-17): the level's `cooperate_enemy_catch_up` global buff — max
 * HP, ATK and move speed as fractions —, none when it adds nothing. A non-zero `attack_speed` is not read yet.
 * @param {unknown} raw level.globalBuffs @returns {{ catchUp?: { maxHp: number, atk: number, moveSpeed: number } }}
 */
function catchUpOf(raw) {
  const buff = asArray(raw ?? [], 'level.globalBuffs').map((x, i) => asObject(x, `level.globalBuffs[${i}]`)).find((x) => x.prefabKey === CATCH_UP);
  if (!buff) return {};
  const p = `level.globalBuffs[${CATCH_UP}]`;
  const bb = Object.fromEntries(asArray(field(buff, 'blackboard', p), `${p}.blackboard`).map((e, i) => {
    const o = asObject(e, `${p}.blackboard[${i}]`);
    return [asString(field(o, 'key', p), `${p}.key`), asNumber(o.value, `${p}.blackboard[${i}].value`, 0, 100)];
  }));
  if (bb.attack_speed) throw new Error(`${p}: attack_speed ${bb.attack_speed} is not read yet`);
  const up = { maxHp: bb.max_hp ?? 0, atk: bb.atk ?? 0, moveSpeed: bb.move_speed ?? 0 };
  return up.maxHp || up.atk || up.moveSpeed ? { catchUp: up } : {};
}

/**
 * A 阵地足球 level's settings (足球-6, 足球-17), none for another level: the match time (`maxPlayTime`), the players'
 * wait at a kickoff, the stamps' net goals, the kickoff tables, the co-op teams with their elite players, the name part
 * of each player role, and what our lead adds to the players.
 * @param {{ key: string }[][]} tiles @param {{ options: unknown, globalBuffs?: unknown }} level the raw level's options and
 * global buffs @param {unknown} coop cooperate_battle_table.json @param {unknown} [missions]
 * @param {(key: string) => boolean} [has] whether the level's enemy references name a key
 * @returns {{ football?: Record<string, unknown> }}
 */
export function footballField(tiles, level, coop, missions, has = () => false) {
  if (!isFootball(tiles) || coop === undefined) return {};
  const c = asObject(coop, 'cooperate_battle_table'), p = 'cooperate_battle_table', options = asObject(level.options, 'level.options');
  const stamps = asArray(missions ?? [], 'missions').map(missionGoals).filter((n) => n !== null);
  const roles = asObject(field(c, 'footballPlayersName', p), `${p}.footballPlayersName`);
  return { football: {
    time: asNumber(field(options, 'maxPlayTime', 'level.options'), 'level.options.maxPlayTime', 1, 1e6),
    wait: asNumber(field(c, 'footballPlayersWaitTimeOnWaveStart', p), `${p}.footballPlayersWaitTimeOnWaveStart`, 0, 1e6),
    stamps, ahead: aheadOf(c), weights: weightsOf(c), teams: teamsOf(c, has),
    roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, asString(v, `${p}.footballPlayersName.${k}`)])),
    ...catchUpOf(level.globalBuffs),
  } };
}

/** The enemy keys a 阵地足球 level's teams field (足球-6), their elite players too, to extract with it. @param {{ football?: any }} f */
export const footballPlayers = (f) => (f.football
  ? /** @type {{ players: Record<string, string>, elite?: Record<string, string> }[]} */ (f.football.teams).flatMap((t) => [...Object.values(t.players), ...Object.values(t.elite ?? {})])
  : []);
