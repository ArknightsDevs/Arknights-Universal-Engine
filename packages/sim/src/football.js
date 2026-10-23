// 阵地足球 (docs/spec/football.md): the ball's hook — a hit on a ball deals it nothing and adds to its kick (足球-3) —,
// the abilities' way to make an enemy a ball (足球-2), and the match (足球-6, 足球-7): the team drawn for it, each
// kickoff's layout by the lead, the players' wait, a goal scored — the field cleared, our operators retreat — and the
// time up with its stamps.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { on } from './bus.js';
import { makeBall, ballHit, FORCE_TO_SPEED } from './ball.js';
import { kickSlide } from './displacement.js';
import { addBuff, makeBuff } from './buffs.js';
import { releaseAll } from './blocking.js';
import { weightedPick, draw } from './rng.js';
import { withdraw } from './deck.js';
import { withdrawDevice } from './devices.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').FootballState} FootballState @typedef {import('./types.js').FootballRules} FootballRules */

/** The owner of the ball's hook (钩子-1). */
const OWNER = 'ball';

/**
 * The ball's hook (足球-2, 足球-3, 钩子-3), once per world while it has a ball — hooks are no state (ADR 0057): a hit on a
 * ball deals it nothing; what it adds may kick the ball at its force.
 * @param {World} w
 */
export function ballHooks(w) {
  if (!w.units.some((u) => u.ball) || w.bus?.hooks.get('hpDamage')?.some((h) => h.owner === OWNER)) return;
  on(w, 'hpDamage', (ctx) => {
    const b = ctx.target;
    if (!b.ball) return;
    const dir = ballHit(b, ctx.source, ctx.amount);
    ctx.amount = 0;
    if (dir) kickSlide(b, dir[0], dir[1], b.ball.force * FORCE_TO_SPEED);
  }, { owner: OWNER });
}

/**
 * The context's ball member (足球-2): makes the enemy a ball, its hook on at once.
 * @param {World} w @param {Unit} e @returns {Pick<import('./foes.js').FoeContext, 'ball'>}
 */
export function ballContext(w, e) {
  return { ball: (p) => { makeBall(e, p); ballHooks(w); } };
}

/**
 * 阵地足球's state at the start (足球-6): the team drawn by its weight (随机-1), no goals, the match's end; the first
 * kickoff comes with the first wave.
 * @param {World} w @param {Content} c @returns {FootballState}
 */
export function newFootball(w, c) {
  const f = /** @type {FootballRules} */ (c.level.football);
  return { team: weightedPick(w, f.teams.map((t) => t.weight)), home: 0, away: 0, kick: 0, until: secondsToFrames(f.time) };
}

/**
 * The kickoff level of a lead (足球-6): the level of the last entry of the table whose lead it reaches, in the table's
 * order; a lead below 0 counts as 0. @param {FootballRules} f @param {number} lead
 */
export function kickoffLevel(f, lead) {
  let level = 0;
  for (const [cnt, lv] of f.ahead) if (Math.max(0, lead) >= cnt) level = lv;
  return level;
}

/**
 * The wave of the next kickoff (足球-6): the level by our lead; a tag by that level's weights (随机-2); one of the
 * waves of that tag, each as likely (随机-1). The kickoff's frame is noted.
 * @param {World} w @param {Content} c @param {number} at the frame it begins
 */
export function kickoffWave(w, c, at) {
  const f = /** @type {FootballRules} */ (c.level.football), st = /** @type {FootballState} */ (w.football);
  const weights = f.weights[String(kickoffLevel(f, st.home - st.away))] ?? f.weights['0'];
  const tag = weightedPick(w, weights);
  const of = c.level.waves.flatMap((x, i) => (x.tag === tag ? [i] : []));
  st.kick = at;
  return of.length > 0 ? of[Math.floor(draw(w) * of.length)] : 0;
}

/**
 * The player role of an enemy key (足球-6): the role whose name part it carries (`mumssi` the forward …), or null.
 * @param {FootballRules} f @param {string} key
 */
const roleOf = (f, key) => Object.entries(f.roles).find(([part]) => key.includes(`_${part}`))?.[1] ?? null;

/**
 * The enemy a wave's SPAWN brings in (足球-6): a player of the level's standard team is the drawn team's player of the
 * same role; anything else as it is. @param {World} w @param {Content} c @param {string} key
 */
export function teamKey(w, c, key) {
  const f = c.level.football, st = w.football;
  if (!f || !st) return key;
  const role = roleOf(f, key), team = f.teams[st.team];
  return role && team?.players[role] ? team.players[role] : key;
}

/**
 * A player brought in by a kickoff waits until the players' wait after it is over (足球-6): it does not walk, attack or
 * use its abilities (the buff `kickoff`) before the frame kickoff + wait. @param {World} w @param {Content} c @param {Unit} u
 */
export function kickoffWait(w, c, u) {
  const f = c.level.football, st = w.football;
  if (!f || !st || u.ball || !Object.values(f.teams[st.team]?.players ?? {}).includes(u.key)) return;
  // it ticks this frame too (状态-3): free on the frame the wait is over
  const left = st.kick + secondsToFrames(f.wait) - w.frame + 1;
  if (left > 0) addBuff(u, makeBuff({ key: 'kickoff', src: u.id, left, flags: { kickoff: true, root: true, noAttack: true } }));
}

/** A unit leaves the field quietly: no knockdown, no life lost (足球-5, 足球-7). @param {World} w @param {Unit} u */
function leave(w, u) {
  w.units.splice(w.units.indexOf(u), 1);
  releaseAll(w, u.id);
}

/**
 * After a goal (足球-7): every enemy leaves the field quietly, the predefined units in effect leave, and every operator
 * of ours retreats (撤退-1) — its redeploy time starts.
 * @param {World} w @param {Content} c
 */
function clearField(w, c) {
  for (const u of w.units.filter((x) => x.kind === KIND.ENEMY)) leave(w, u);
  for (const alias of [...w.predefined]) {
    w.predefined = w.predefined.filter((k) => k !== alias);
    w.events.push({ type: 'predefine', key: alias, on: 0 });
    withdrawDevice(w, alias);
  }
  for (const op of w.units.filter((x) => x.kind === KIND.OPERATOR && x.hp > 0)) withdraw(w, c, op);
}

/** The stamps of a match (足球-7): the stamps' net goals it reached. @param {FootballRules} f @param {FootballState} st */
export const footballStamps = (f, st) => f.stamps.filter((n) => st.home - st.away >= n).length;

/**
 * The end of a frame of 阵地足球 (足球-5, 足球-7): a ball that went into a goal leaves — in a match its points go to the
 * side that scored and the field is cleared for the next kickoff —; at the match's end the battle is over.
 * @param {World} w @param {Content} c
 */
export function tickFootball(w, c) {
  const balls = w.units.filter((u) => u.ball?.goal !== undefined);
  for (const b of balls) leave(w, b);
  const st = w.football;
  if (!st) return;
  for (const b of balls) {
    const points = b.ball?.points ?? 1;
    if (b.ball?.goal === 1) st.home += points; else st.away += points;
  }
  if (balls.length > 0) clearField(w, c);
  if (w.result < 0 && w.frame + 1 >= st.until) {
    w.result = 1;
    w.events.push({ type: 'end', result: 1 });
  }
}
