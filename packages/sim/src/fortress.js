// 堡垒守御 (docs/spec/fortress.md 守御-1, 守御-2, 守御-4, 守御-6): the defence of each wave and the rest before the next,
// the waves defended, the builders' cards of each seat, the rubble pile's guards — and the hooks that keep a facility on
// the field when it falls (守御-3) and count the damage done to the last wave.
import { secondsToFrames } from '@aue/math';
import { KIND, FORTRESS_PHASE } from '@aue/schema';
import { on } from './bus.js';
import { isDown } from './coop.js';
import { releaseAll } from './blocking.js';
import { spawnEnemy } from './spawn.js';
import { facilityOf, fallBack, setUpFacilities, restoreFacilities, facilitySum, facilityBuffs, tickBuilders, tickRubble } from './facilities.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').FortressState} FortressState */

/** The waves defended for 1, 2 and 3 stamps (守御-1). */
export const STAMP_WAVES = Object.freeze([3, 5, 7]);

/** The builder cards a level gives (守御-4): its token cards whose records are builders, with their counts. @param {Content} c */
const builderCards = (c) => (c.level.cards?.tokens ?? []).filter((t) => c.devices?.[t.key]?.builder);

/** The deck key of a seat's builder of a kind ('sp' the plain one, 'sp2' the advanced), or null. @param {Content} c @param {number} seat @param {'sp' | 'sp2'} kind */
const builderKey = (c, seat, kind) => { const t = builderCards(c).find((x) => c.devices?.[x.key]?.builder?.sp === kind); return t ? `${t.key}#${seat}` : null; };

/**
 * 堡垒守御's state at the start (守御-1): the first wave's defence, no wave defended, each seat's builder cards as the
 * level gives them. @param {Content} c @param {number} players @returns {FortressState}
 */
export function newFortress(c, players) {
  return {
    phase: 'defend', round: 0, start: 0, until: secondsToFrames(/** @type {any} */ (c.level.fortress).wave), next: 0, fell: false, defended: 0, damage: 0,
    ready: Array.from({ length: players }, () => false), pools: Array.from({ length: players }, (_, seat) => Object.fromEntries(builderCards(c).map((t) => [`${t.key}#${seat}`, t.count]))),
    guards: [], freed: false, total: 0, out: 0,
  };
}

/** The stamps of the waves defended (守御-1). @param {number} defended */
export const fortressStamps = (defended) => STAMP_WAVES.filter((n) => defended >= n).length;

/** The owner of 堡垒守御's hooks (钩子-1). */
const OWNER = 'fortress';

/** The battle's 堡垒守御 set up (守御-3, 守御-1): every facility a raw box, and its hooks. @param {World} w @param {Content} c */
export function setUpFortress(w, c) {
  if (!w.fortress) return;
  setUpFacilities(w, c);
  fortressHooks(w, c);
}

/**
 * 堡垒守御's hooks (守御-3, 守御-1), when the world has none yet — hooks are no state (ADR 0057), so a world restored from
 * a snapshot gets them again at its next frame: a facility's lethal hit takes it back to the box; the damage the last
 * wave's enemies take is counted. @param {World} w @param {Content} c
 */
export function fortressHooks(w, c) {
  if (!w.fortress || w.bus?.hooks.get('fatal')?.some((h) => h.owner === OWNER)) return;
  on(w, 'fatal', (ctx) => {
    const f = facilityOf(c, ctx.unit);
    if (!f || !ctx.unit.fac || ctx.unit.fac.level === 0) return;
    ctx.prevented = true;
    fallBack(w, c, ctx.unit, f);
  }, { owner: OWNER });
  const last = c.level.waves.length - 1;
  on(w, 'damaged', (ctx) => { if (ctx.target.kind === KIND.ENEMY && ctx.target.wave === last && w.fortress) w.fortress.damage += ctx.amount; }, { owner: OWNER });
  on(w, 'death', (ctx) => { if (ctx.unit.kind === KIND.ENEMY && w.fortress && ctx.unit.wave === w.fortress.round) w.fortress.out++; }, { owner: OWNER });
}

/**
 * The guards of a defence (守御-6): for each rubble pile's branch, its batch of the wave — the wave's place among its
 * batches, the last for a later wave —, each spawn at its frame. @param {World} w @param {Content} c @param {number} wave
 * @returns {FortressState['guards']}
 */
function guardsOf(w, c, wave) {
  const names = [...new Set(w.units.flatMap((u) => (u.kind === KIND.DEVICE && c.devices?.[u.key]?.rubble ? [/** @type {any} */ (c.devices[u.key].rubble).branch] : [])))];
  /** @type {FortressState['guards']} */
  const out = [];
  for (const name of names) {
    const batches = c.level.branches?.[name] ?? [], frag = batches[Math.min(wave, batches.length - 1)];
    if (!frag) continue;
    const start = w.frame + secondsToFrames(frag.preDelay);
    for (const a of frag.actions.filter((x) => x.type === 'SPAWN')) {
      for (let k = 0; k < a.count; k++) out.push({ at: start + secondsToFrames(a.preDelay + k * a.interval), key: a.key, route: a.route });
    }
  }
  return out;
}

/**
 * A wave begins (守御-1): its defence starts, with its time limit (the last wave's own), and the rubble piles' guards
 * come; `total` enemies of it to handle. @param {World} w @param {Content} c @param {number} wave @param {number} total
 */
export function defendStart(w, c, wave, total) {
  const f = w.fortress;
  if (!f) return;
  const o = /** @type {NonNullable<Content['level']['fortress']>} */ (c.level.fortress), last = wave === c.level.waves.length - 1;
  Object.assign(f, { phase: 'defend', round: wave, start: w.frame, until: w.frame + secondsToFrames(last ? o.waveLast : o.wave), fell: false, freed: false, guards: guardsOf(w, c, wave),
    total, out: 0 });
  w.events.push({ type: 'fortress', wave, phase: FORTRESS_PHASE.defend, until: f.until });
}

/**
 * A rest begins (守御-2): lives up by the level's amount, the facilities back at their highest levels, the builders the
 * workshops give. @param {World} w @param {Content} c
 */
function startRest(w, c) {
  const f = /** @type {FortressState} */ (w.fortress), o = /** @type {NonNullable<Content['level']['fortress']>} */ (c.level.fortress);
  Object.assign(f, { phase: 'rest', until: w.frame + secondsToFrames(o.rest), ready: f.ready.map(() => false), guards: [] });
  for (const p of w.players) if (!isDown(p)) p.life = Math.min(c.level.options.maxLifePoint, p.life + o.life);
  restoreFacilities(w, c);
  const n = facilitySum(w, c, 'workshop', 'cnt');
  f.pools.forEach((pool, seat) => { const k = builderKey(c, seat, 'sp'); if (k && n > 0) pool[k] = (pool[k] ?? 0) + n; });
  w.events.push({ type: 'fortress', wave: f.round + 1, phase: FORTRESS_PHASE.rest, until: f.until });
}

/** The rest is over (守御-2): the next wave may begin. @param {World} w */
function endRest(w) {
  const f = /** @type {FortressState} */ (w.fortress);
  f.phase = 'go';
  f.next = f.round + 1;
}

/**
 * A wave's defence is over (守御-1): defended when nobody went down meanwhile; after the last wave the match is over,
 * else the rest. @param {World} w @param {Content} c
 */
export function defendEnd(w, c) {
  const f = w.fortress;
  if (!f || f.phase !== 'defend') return;
  if (!f.fell) f.defended++;
  if (f.round >= c.level.waves.length - 1) {
    f.phase = 'over';
    w.events.push({ type: 'fortress', wave: f.round, phase: FORTRESS_PHASE.over, until: w.frame });
  } else startRest(w, c);
}

/**
 * The defence's time limit (守御-1): when it is up, the wave's actions stop and its enemies left on the field leave
 * quietly; the defence is over. Whether it cut the wave. @param {World} w @param {Content} c
 */
export function cutDefence(w, c) {
  const f = w.fortress, s = w.sched;
  if (!f || f.phase !== 'defend' || w.frame < f.until || s.step === 'post' || s.step === 'done') return false;
  for (const u of w.units.filter((x) => x.kind === KIND.ENEMY && x.wave === s.wave)) {
    w.units.splice(w.units.indexOf(u), 1);
    releaseAll(w, u.id);
  }
  w.sched = { ...s, step: 'post', at: w.frame };
  defendEnd(w, c);
  return true;
}

/**
 * Whether the scheduler may begin wave `next` (守御-1, 守御-2): only after the rest before it — over at its time.
 * @param {World} w @param {number} next
 */
export function mayBegin(w, next) {
  const f = w.fortress;
  if (!f) return true;
  if (f.phase === 'rest' && w.frame >= f.until) endRest(w);
  return next <= f.next;
}

/** A seat's 「休整完毕」 (守御-2): the rest ends once every seat has said it. @param {World} w @param {number} seat */
export function restReady(w, seat) {
  const f = w.fortress;
  if (!f || f.phase !== 'rest' || seat < 0 || seat >= f.ready.length) return;
  f.ready[seat] = true;
  if (f.ready.every(Boolean)) endRest(w);
}

/** A card of a seat's pool (守御-4): how many it holds, −1 for a card that is no pool card. @param {World} w @param {number} seat @param {string} key */
export const poolCount = (w, seat, key) => (w.fortress && Object.hasOwn(w.fortress.pools[seat] ?? {}, key) ? w.fortress.pools[seat][key] : -1);

/** One of a seat's pool cards is used (守御-4). @param {World} w @param {number} seat @param {string} key */
export function usePool(w, seat, key) {
  const pool = w.fortress?.pools[seat];
  if (pool && (pool[key] ?? 0) > 0) pool[key]--;
}

/** This frame of 堡垒守御: guards due, a fall in the defence, the builders, the rubble pile, the buffs. @param {World} w @param {Content} c */
export function tickFortress(w, c) {
  const f = w.fortress;
  if (!f) return;
  for (const g of f.guards.filter((x) => x.at <= w.frame)) spawnEnemy(w, c, g, f.start, -1);
  f.guards = f.guards.filter((x) => x.at > w.frame);
  if (f.phase === 'defend' && w.players.some(isDown)) f.fell = true;
  tickBuilders(w, c, (seat, key) => { const pool = f.pools[seat]; if (pool && Object.hasOwn(pool, key)) pool[key]++; });
  tickRubble(w, c, (seat) => { const k = builderKey(c, seat, 'sp2'); if (k) f.pools[seat][k] = (f.pools[seat][k] ?? 0) + 1; });
  facilityBuffs(w, c);
}
