// What talents do on events (docs/spec/traits.md 职业-25): steps of modifiers for kills or damage, SP on attacks, kills,
// heals, deaths in range, hits taken and skill ends, 坚忍 by the HP lost, and arts damage over time from hits.
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune, setLeft, count as countUp } from './buffs.js';
import { gainSp } from './sp.js';
import { draw } from './rng.js';
import { dealDamage, heal } from './damage.js';
import { reachKeys } from './reach.js';
import { inKeys } from './targeting.js';
import { tileOf } from './body.js';
import { traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').TalentStack} TalentStack @typedef {import('./types.js').TalentSp} TalentSp */

/** A step's modifiers × n (职业-25): a product's (…Mul) share above 1 × n, the others × n. @param {Record<string, number>} mods @param {number} n */
const stepped = (mods, n) => Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, k.endsWith('Mul') ? 1 + (v - 1) * n : v * n]));

/**
 * One event for a talent's steps (职业-25): the buff `stack:<n>` counts the events (its `n`); its steps are the count
 * over `every`, at most `max`, its modifiers the step's × the steps; with `seconds`, the buff lasts that long from this
 * event.
 * @param {Unit} op @param {TalentStack} s @param {number} i
 */
function stepUp(op, s, i) {
  const key = `stack:${i}`, b = op.buffs.find((x) => x.key === key), count = (b?.n ?? 0) + 1, steps = Math.min(s.max, Math.floor(count / (s.every ?? 1)));
  const left = s.seconds ? secondsToFrames(s.seconds) : -1;
  if (!b) { addBuff(op, makeBuff({ key, src: op.id, n: count, value: steps, left, mods: stepped(s.mods, steps) })); return; }
  countUp(b, 1);
  if (s.seconds) setLeft(b, left);
  if (b.value !== steps) retune(op, b, steps, stepped(s.mods, steps));
}

/**
 * An operator's kill for its talents (职业-25): a step of each kill stack — of its summoner's that count its summons'
 * kills when it is a summon —, the count of kills since its deployment (buff `kills`) and during its skill (buff
 * `skillKills`), each only when a talent asks for it.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function talentKill(w, c, op) {
  const t = traitOf(c, op);
  t.stacks.forEach((s, i) => { if (s.on === 'kill' && !s.summons) stepUp(op, s, i); });
  const owner = op.summoner !== undefined ? w.units.find((u) => u.id === op.summoner && u.hp > 0) : undefined;
  if (owner) traitOf(c, owner).stacks.forEach((s, i) => { if (s.on === 'kill' && s.summons) stepUp(owner, s, i); });
  if (op.summoner === undefined) t.stacks.forEach((s, i) => { if (s.on === 'kill' && s.summons) stepUp(op, s, i); });
  if (t.whiles.some((x) => x.when === 'noKills')) tally(op, 'kills');
  if (op.skill?.active && t.talentSp.some((x) => x.on === 'skillKills')) tally(op, 'skillKills');
  for (const x of t.talentSp) if (x.on === 'kill' && op.skill) gainSp(op.skill, x.sp ?? 0);
}

/** One more in an operator's count buff (its strength), without an end. @param {Unit} op @param {string} key */
function tally(op, key) {
  const b = op.buffs.find((x) => x.key === key);
  if (b) retune(op, b, b.value + 1, b.mods);
  else addBuff(op, makeBuff({ key, src: op.id, value: 1 }));
}

/**
 * An operator's skill started, for its talents (职业-25): the count of its starts since its deployment (buff `starts`),
 * when a condition asks for it.
 * @param {Content} c @param {Unit} op
 */
export function talentSkillStart(c, op) {
  if (traitOf(c, op).whiles.some((x) => x.when === 'fewStarts' || x.when === 'laterSkill')) tally(op, 'starts');
}

/**
 * Damage an operator dealt for its talents' steps (职业-25): a step of each damage stack (physical damage only for those
 * that say so).
 * @param {Content} c @param {Unit} op @param {import('./damage.js').Damage} dmg
 */
export function talentDealt(c, op, dmg) {
  traitOf(c, op).stacks.forEach((s, i) => { if (s.on === 'dealt' && (!s.phys || dmg.type === 'phys')) stepUp(op, s, i); });
}

/**
 * An operator's 坚忍 at its turn (职业-25): its buff `grit` with the modifiers × min(1, the share of its maximum HP lost
 * over `full`), changed when that share is.
 * @param {Content} c @param {Unit} op
 */
export function gritTurn(c, op) {
  const g = traitOf(c, op).grit;
  if (!g) return;
  const lost = 1 - op.hp / statsOf(op).maxHp, k = Math.min(1, Math.max(0, lost / g.full)), b = op.buffs.find((x) => x.key === 'grit');
  const mods = Object.fromEntries(Object.entries(g.mods).map(([key, v]) => [key, v * k]));
  if (!b) addBuff(op, makeBuff({ key: 'grit', src: op.id, value: k, mods }));
  else if (b.value !== k) retune(op, b, k, mods);
}

/** A unit's skill gains SP (技能-2), when it has one. @param {Unit | undefined} u @param {number} n */
const spTo = (u, n) => { if (u?.skill && n > 0) gainSp(u.skill, n); };
/** One of the units at random (随机-1), none when there are none. @param {World} w @param {Unit[]} list */
const anyOf = (w, list) => (list.length ? list[Math.min(list.length - 1, Math.floor(draw(w) * list.length))] : undefined);
/** The friendly units, with HP, on the field (summons too). @param {World} w */
const friends = (w) => w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0);

/**
 * An operator's talents' SP for an event (职业-25): `attack` (its attack reached enemies), `heal` (it healed `target`: the
 * SP is the target's), `attacked` (an enemy's attack took its HP: its own, then a friendly unit at random on its tile or
 * the 4 next to it).
 * @param {World} w @param {Content} c @param {Unit} op @param {'attack' | 'heal' | 'attacked'} on @param {Unit} [target]
 */
export function talentSp(w, c, op, on, target) {
  for (const x of traitOf(c, op).talentSp) {
    if (x.on !== on) continue;
    if (on === 'heal') { spTo(target, x.sp ?? 0); continue; }
    spTo(op, x.sp ?? 0);
    if (on === 'attacked' && x.other) {
      const [r, col] = tileOf(op);
      spTo(anyOf(w, friends(w).filter((u) => { const [ur, uc] = tileOf(u); return Math.abs(ur - r) + Math.abs(uc - col) <= 1; })), x.other);
    }
  }
}

/**
 * An operator's skill ended, for its talents (职业-25): a heal of `heal` of its maximum HP; at a talent's chance (one
 * draw), its `share` of the skill's cost (whole points, down); its kills during the skill × `sp`, at most `max`, and the
 * count gone.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function talentSkillEnd(w, c, op) {
  for (const x of traitOf(c, op).talentSp) {
    if (x.on === 'skillEnd' && x.heal && op.hp > 0) w.events.push({ type: 'heal', id: op.id, target: op.id, amount: heal(w, op, op, x.heal * statsOf(op).maxHp) });
    if (x.on === 'skillEnd' && x.share && op.skill && draw(w) < (x.prob ?? 1)) spTo(op, Math.floor(op.skill.cost * x.share));
    if (x.on === 'skillKills') {
      const b = op.buffs.find((y) => y.key === 'skillKills');
      if (b) { spTo(op, Math.min(x.max ?? Infinity, b.value * (x.sp ?? 0))); removeBuff(op, b); }
    }
  }
}

/**
 * A unit that fell this frame, for the talents of the operators that see it in their attack range (职业-25): an enemy
 * gives `enemyDown` SP — the operator's own, then another friendly unit in its range at random —, an operator (not a
 * summon, not itself) `allyDown` SP.
 * @param {World} w @param {Content} c @param {Unit} dead
 */
export function talentDeaths(w, c, dead) {
  const on = dead.kind === KIND.ENEMY ? 'enemyDown' : dead.kind === KIND.OPERATOR && dead.summoner === undefined ? 'allyDown' : null;
  if (!on) return;
  const grid = { rows: c.level.height, cols: c.level.width };
  for (const op of friends(w)) {
    const list = op === dead ? [] : traitOf(c, op).talentSp.filter((x) => x.on === on);
    if (list.length === 0) continue;
    const keys = reachKeys(c, op);
    if (!inKeys(dead, keys, grid)) continue;
    for (const x of list) {
      spTo(op, x.sp ?? 0);
      if (x.other) spTo(anyOf(w, friends(w).filter((u) => u !== op && inKeys(u, keys, grid))), x.other);
    }
  }
}

/**
 * A talent's arts damage over time on a target its hit reached (职业-25): a buff `dot:<operator id>:<n>` dealing
 * `amount` (or `scale` × the operator's attack, as the hit lands) arts damage each second for its seconds, without a
 * source but credited to the operator; another hit while it lasts starts its time again, the damage as it was.
 * @param {Unit} op @param {Unit} target @param {{ amount?: number, scale?: number, seconds: number }} d @param {number} i
 */
export function dotOnHit(op, target, d, i) {
  const key = `dot:${op.id}:${i}`, b = target.buffs.find((x) => x.key === key), left = secondsToFrames(d.seconds);
  if (b) { setLeft(b, left); return; }
  addBuff(target, makeBuff({ key, src: op.id, left, every: FPS, fixed: true, value: d.amount ?? (d.scale ?? 0) * statsOf(op).atk, act: 'talentDot' }));
}

/** The engine's behaviour of a talent's damage over time (职业-25): each second its arts damage. */
export const TALENT_BEHAVIORS = Object.freeze({
  talentDot: { tick: (/** @type {World} */ w, /** @type {Unit} */ u, /** @type {import('./types.js').Buff} */ b) => {
    const src = w.units.find((x) => x.id === b.src && x.hp > 0) ?? null;
    dealDamage(w, src, u, { type: 'arts', amount: b.value, sourceless: true });
  } },
});
