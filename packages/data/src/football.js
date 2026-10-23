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
 * The co-op teams with their weights and players (足球-6). @param {Record<string, unknown>} coop
 * @returns {{ name: string, weight: number, players: Record<string, string> }[]}
 */
function teamsOf(coop) {
  const p = 'cooperate_battle_table', players = asObject(field(coop, 'footballTeamPlayers', p), `${p}.footballTeamPlayers`);
  const weights = asArray(field(coop, 'footballTeamWeights', p), `${p}.footballTeamWeights`).map((x, i) => asObject(x, `${p}.footballTeamWeights[${i}]`));
  return COOP_TEAMS.map((name) => {
    const w = weights.find((x) => x.teamName === name), roles = asObject(field(players, name, `${p}.footballTeamPlayers`), `${p}.footballTeamPlayers.${name}`);
    if (!w) throw new Error(`${p}.footballTeamWeights has no ${name}`);
    return { name, weight: asNumber(field(w, 'weight', p), `${p}.footballTeamWeights.${name}.weight`, 0, 1e6),
      players: Object.fromEntries(Object.entries(roles).map(([role, key]) => [role, asString(key, `${p}.footballTeamPlayers.${name}.${role}`)])) };
  });
}

/**
 * A 阵地足球 level's settings (足球-6), none for another level: the match time (`maxPlayTime`), the players' wait at a
 * kickoff, the stamps' net goals, the kickoff tables, the co-op teams and the name part of each player role.
 * @param {{ key: string }[][]} tiles @param {Record<string, unknown>} options the raw level.options @param {unknown} coop
 * cooperate_battle_table.json @param {unknown} [missions] @returns {{ football?: Record<string, unknown> }}
 */
export function footballField(tiles, options, coop, missions) {
  if (!isFootball(tiles) || coop === undefined) return {};
  const c = asObject(coop, 'cooperate_battle_table'), p = 'cooperate_battle_table';
  const stamps = asArray(missions ?? [], 'missions').map(missionGoals).filter((n) => n !== null);
  const roles = asObject(field(c, 'footballPlayersName', p), `${p}.footballPlayersName`);
  return { football: {
    time: asNumber(field(options, 'maxPlayTime', 'level.options'), 'level.options.maxPlayTime', 1, 1e6),
    wait: asNumber(field(c, 'footballPlayersWaitTimeOnWaveStart', p), `${p}.footballPlayersWaitTimeOnWaveStart`, 0, 1e6),
    stamps, ahead: aheadOf(c), weights: weightsOf(c), teams: teamsOf(c),
    roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, asString(v, `${p}.footballPlayersName.${k}`)])),
  } };
}

/** The enemy keys a 阵地足球 level's teams field (足球-6), to extract with it. @param {{ football?: any }} f */
export const footballPlayers = (f) => (f.football ? /** @type {{ players: Record<string, string> }[]} */ (f.football.teams).flatMap((t) => Object.values(t.players)) : []);
