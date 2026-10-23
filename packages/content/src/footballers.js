// 阵地足球's players (docs/spec/football.md 足球-9…足球-11): a forward or a goalkeeper (talent `football`) chases a free
// ball within its `searchBall` radius, and one within its reach it stops, holds and — at its skill's hit — kicks: the
// forward shoots at our goal or passes to the player nearest it, the goalkeeper clears to the middle column. The
// muscleman (`searchtarget`) chases the nearest of our units that can block. Each is revived at full HP, any number of
// times (`Reborn` with a `duration` only). The skills `slapshot`, `passtheball` and `clearance` are read here.
import { beginRevival, endRebirth, avengerBehaviors } from './avenger.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** A forward's reach for a ball (足球-10: 「半径0.2范围内」); a goalkeeper's is its `football.defence`. */
const FORWARD_REACH = 0.2;

/** The skills this file reads, by role: the forward's pass and shot, the goalkeeper's clearance (足球-10). */
export const KICK_SKILLS = Object.freeze(['passtheball', 'slapshot', 'clearance']);

/**
 * Each player's kicks (足球-10): the hit and the end of the skill, seconds from its start — the OnAttack event and the
 * length of its clip in the player's model (PRTS's copy, torappu.prts.wiki/assets/enemy_spine/<key>/): a forward's
 * pass is Skill1 and its shot Skill2, in the order of its skills; a goalkeeper, with no skill clip, clears with Attack.
 * @type {Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>>}
 */
export const KICK_TIMES = Object.freeze({
  enemy_4012_mumssi: { passtheball: [1.033, 1.467], slapshot: [1.433, 2.033] },
  enemy_4022_mushtm: { passtheball: [0.8, 1.5], slapshot: [0.767, 1.5] },
  enemy_4025_muhrym: { passtheball: [0.8, 1.5], slapshot: [1.3, 2.033] },
  enemy_4028_mukfum: { passtheball: [0.8, 1.5], slapshot: [1.3, 2.033] },
  enemy_4013_mubufn: { clearance: [0.367, 1.333] },
  enemy_4023_mushtb: { clearance: [0.367, 1.333] },
  enemy_4026_muhryb: { clearance: [0.367, 1.333] },
  enemy_4029_mukfub: { clearance: [0.367, 1.333] },
});

/** @param {Unit} a @param {{ x: number, y: number }} b */
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** Whether an enemy is a player (足球-9): it has `football` or `searchtarget`. @param {FoeContext} ctx @param {Unit} u */
const isPlayer = (ctx, u) => !!(ctx.talentOf(u, 'football') || ctx.talentOf(u, 'searchtarget'));

/**
 * Whether a player moves on its own this frame (足球-9): not waiting for the kickoff, not reviving, not blocked, not
 * in a swing, able to move. @param {FoeContext} ctx
 */
function onItsOwn(ctx) {
  const s = ctx.stats(ctx.self);
  return !ctx.blocked && !ctx.self.swing && !s.immobile && !s.flags.kickoff && !s.flags.sidelined;
}

/**
 * The players on the field, itself too (足球-10). @param {FoeContext} ctx
 */
const players = (ctx) => ctx.enemies().filter((u) => isPlayer(ctx, u) && !ctx.stats(u).flags.sidelined);

/** A goal's nearest distance from a point, squared (足球-10). @param {FoeContext} ctx @param {{ x: number, y: number }} p */
const toOurGoal = (ctx, p) => Math.min(...ctx.goalTiles('ours').map((g) => dist2(/** @type {Unit} */ (/** @type {unknown} */ (p)), g)));

/**
 * A forward's choice (足球-10): it shoots when it is the player nearest our goal or the only player; otherwise it shoots
 * by a chance of 1 in (the players + 1), and passes to the player nearest our goal.
 * @param {FoeContext} ctx @returns {{ skill: 'slapshot' | 'passtheball', to: Unit | null }}
 */
function forwardChoice(ctx) {
  const all = players(ctx), others = all.filter((u) => u !== ctx.self);
  const nearest = all.toSorted((a, b) => toOurGoal(ctx, a) - toOurGoal(ctx, b) || a.id - b.id)[0];
  if (others.length === 0 || nearest === ctx.self) return { skill: 'slapshot', to: null };
  if (ctx.draw() < 1 / (all.length + 1)) return { skill: 'slapshot', to: null };
  return { skill: 'passtheball', to: others.toSorted((a, b) => toOurGoal(ctx, a) - toOurGoal(ctx, b) || a.id - b.id)[0] };
}

/**
 * Where a kick goes (足球-10): a shot at the centre of a random tile of our goal, a pass at the player chosen, a
 * clearance at a random passable tile of the middle column. @param {FoeContext} ctx @param {string} skill @param {Unit | null} to
 * @returns {{ x: number, y: number }}
 */
function kickTarget(ctx, skill, to) {
  if (skill === 'passtheball' && to) return { x: to.x, y: to.y };
  if (skill === 'clearance') {
    const mid = ctx.goalTiles('theirs')[0]?.x ?? 12, col = Math.floor(mid / 2), rows = ctx.goalTiles('ours').map((g) => g.y);
    return { x: col, y: rows[Math.floor(ctx.draw() * rows.length)] ?? ctx.self.y };
  }
  const goal = ctx.goalTiles('ours');
  return goal[Math.floor(ctx.draw() * goal.length)] ?? { x: 0, y: ctx.self.y };
}

/** The ball a player kicks, by id from its state, or null. @param {FoeContext} ctx */
const heldBall = (ctx) => ctx.balls().find((b) => b.id === ctx.state.get('ball')) ?? null;

/**
 * The kick under way (足球-10): at its hit the ball still within reach is kicked at its force × the skill's scale toward
 * the target noted at the start; until the skill's end the player stays. Whether it is under way.
 * @param {FoeContext} ctx
 */
function kickUnderWay(ctx) {
  const st = ctx.state, hit = st.get('hit'), end = st.get('end');
  if (!(end > ctx.frame)) return false;
  if (hit === ctx.frame) {
    const b = heldBall(ctx), reach = st.get('reach'), to = { x: st.get('tx'), y: st.get('ty') };
    if (b && dist2(ctx.self, b) <= reach * reach) {
      const dx = to.x - b.x, dy = to.y - b.y, d = Math.sqrt(dx * dx + dy * dy), scale = st.get('scale');
      ctx.holdBall(b, 1);
      if (d > 0) ctx.kickBall(b, dx / d, dy / d, scale);
    }
  }
  ctx.chase(ctx.self.x, ctx.self.y);
  return true;
}

/**
 * Starts a kick (足球-10): the ball within reach stops and is held; the skill, its target and its scale are noted, its
 * hit and end by KICK_TIMES (none listed: at once).
 * @param {FoeContext} ctx @param {Unit} b @param {Record<string, number>} bb @param {number} reach
 */
function startKick(ctx, b, bb, reach) {
  const goalkeeper = typeof bb.clearance_force === 'number';
  const { skill, to } = goalkeeper ? { skill: 'clearance', to: null } : forwardChoice(ctx);
  const [h, e] = KICK_TIMES[ctx.self.key]?.[skill] ?? [0, 0], hit = ctx.frames(h), end = Math.max(hit + 1, ctx.frames(e));
  const t = kickTarget(ctx, skill, to), st = ctx.state;
  ctx.holdBall(b, hit + 1);
  st.set('ball', b.id); st.set('hit', ctx.frame + hit); st.set('end', ctx.frame + end); st.set('reach', reach);
  st.set('tx', t.x); st.set('ty', t.y);
  st.set('scale', skill === 'clearance' ? bb.clearance_force : skill === 'slapshot' ? bb.slapshot_force : bb.passing_force);
  if (hit === 0) kickUnderWay(ctx);
}

/**
 * Whether a goalkeeper may go for a ball (足球-9): its `tile_col_end` is the last column toward our goal it goes to.
 * @param {Record<string, number>} bb @param {{ x: number }} b
 */
const inArea = (bb, b) => typeof bb.tile_col_end !== 'number' || Math.round(b.x) >= bb.tile_col_end;

/**
 * `football` (足球-9, 足球-10): on its own, a free ball within its reach is kicked; else it goes for the nearest free
 * ball within its `searchBall` radius. A goalkeeper's reach is its `defence`, a forward's 0.2.
 * @type {FoeBehavior}
 */
const football = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb;
    if (kickUnderWay(ctx) || !onItsOwn(ctx)) return;
    const reach = typeof bb.defence === 'number' ? bb.defence : FORWARD_REACH, radius = ctx.talent('searchBall')?.range_radius ?? 0;
    const free = ctx.balls().filter((b) => ctx.freeBall(b) && inArea(bb, b)).toSorted((a, b) => dist2(ctx.self, a) - dist2(ctx.self, b) || a.id - b.id);
    const near = free[0];
    if (!near || dist2(ctx.self, near) > radius * radius) return;
    if (dist2(ctx.self, near) <= reach * reach) { startKick(ctx, near, bb, reach); return; }
    ctx.chase(near.x, near.y);
  },
});

/**
 * `searchtarget` (足球-11): on its own, the muscleman goes for the nearest of our units within `range_radius` that can
 * block (a block count above 0).
 * @type {FoeBehavior}
 */
const searchtarget = Object.freeze({
  tick: (ctx) => {
    const r = ctx.bb.range_radius;
    if (typeof r !== 'number' || !onItsOwn(ctx)) return;
    const near = ctx.ours().filter((u) => ctx.stats(u).blockCnt > 0 && dist2(ctx.self, u) <= r * r).toSorted((a, b) => dist2(ctx.self, a) - dist2(ctx.self, b) || a.id - b.id)[0];
    if (near) ctx.chase(near.x, near.y);
  },
});

/** Whether a `Reborn` is a player's (足球-9): a `duration` and no `hp_ratio`. @param {Record<string, unknown>} bb */
export const playerReborn = (bb) => typeof bb.duration === 'number' && !('hp_ratio' in bb);

/**
 * `Reborn` by its shape (敌能-18, 足球-9): a player's — a `duration` only — every knockdown, its HP back to the maximum
 * and `duration` seconds of 敌能-18's reviving; another the avenger's, once, at `hp_ratio`.
 * @type {FoeBehavior}
 */
const Reborn = Object.freeze({
  fatal: (ctx) => (playerReborn(ctx.bb) ? beginRevival(ctx, 1) : avengerBehaviors.Reborn.fatal?.(ctx) ?? false),
  tick: (ctx) => { endRebirth(ctx); },
});

/** Whether a `Reborn` has a shape it understands (敌能-18, 足球-9): the avenger's `hp_ratio`, or a player's. @param {string} k @param {Record<string, unknown>} bb */
export const rebornShape = (k, bb) => k !== 'Reborn' || typeof bb.hp_ratio === 'number' || playerReborn(bb);

/** `periodic_damage` of 0 does nothing (足球-11: the muscleman's). @param {string} k @param {Record<string, unknown>} bb */
export const noPeriodic = (k, bb) => k === 'periodic_damage' && bb.damage === 0 && !('self' in bb);

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const footballerBehaviors = Object.freeze({ football, searchtarget, Reborn });

