// Talents on the operators around and on the field (docs/spec/traits.md 职业-32): buffs for the field by what an
// operator is — rarity, block count, ammo skill, faction, HP —, a holder's kill stacks shared with a faction, a gain
// shared with allies chosen at random (now, later or as they arrive), and what goes when the holder leaves.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { draw } from './rng.js';
import { reachKeys } from './reach.js';
import { inKeys } from './targeting.js';
import { traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').FieldBuff} FieldBuff @typedef {import('./types.js').ShareGain} ShareGain */
/** @typedef {{ src: number, value: number, mods: Record<string, number>, flags?: Record<string, boolean> }} Want */

/** Modifiers × k. @param {Record<string, number>} mods @param {number} k */
const times = (mods, k) => (k === 1 ? mods : Object.fromEntries(Object.entries(mods).map(([key, v]) => [key, v * k])));

/** Whether an operator (not a summon) of a profession other than `src` stands on the field. @param {World} w @param {Content} c @param {Unit} src @param {string} profession */
const another = (w, c, src, profession) => w.units.some((u) => u !== src && u.kind === KIND.OPERATOR && u.hp > 0 && u.summoner === undefined && c.operators[u.key].profession === profession);

/**
 * Whether a field buff is for a unit (职业-32): a record of the position for melee (近战位 or both), a block count of at
 * least `minBlock`, of the rarity, an ammo skill, of the profession, of the faction or of one of `powers`, above `hpAbove`
 * of its maximum HP.
 * @param {Content} c @param {Unit} u @param {FieldBuff} x
 */
function buffFits(c, u, x) {
  const d = c.operators[u.key];
  return recordFits(d, x) && (x.minBlock === undefined || statsOf(u).blockCnt >= x.minBlock) && (x.hpAbove === undefined || u.hp > x.hpAbove * statsOf(u).maxHp);
}

/** What buffFits asks of a record. @param {import('./types.js').OperatorDef} d @param {FieldBuff} x */
function recordFits(d, x) {
  const powers = d.powers ?? [];
  return (!x.melee || d.position === 'MELEE' || d.position === 'ALL') && (x.rarity === undefined || d.rarity === x.rarity) && (!x.ammo || !!d.skill?.ammo)
    && (!x.profession || d.profession === x.profession) && (!x.power || powers.includes(x.power)) && (!x.powers || x.powers.some((p) => powers.includes(p)));
}

/**
 * Whether a field buff holds now (职业-32, 职业-35): with `needOther`, another operator of its profession is on the field;
 * with `during`, the source has been on the field less than that many seconds. @param {World} w @param {Content} c @param {Unit} src @param {FieldBuff} x
 */
const buffOn = (w, c, src, x) => !(x.needOther && x.profession && !another(w, c, src, x.profession)) && !(x.during !== undefined && w.frame - src.born >= secondsToFrames(x.during));

/**
 * A source's buffs for the field (职业-32: `fieldBuffs`): every friendly unit, any player's, it is for (buffFits) — with
 * `needOther`, only while another operator of its profession is on the field — gets the buff `fieldBuff:<source id>:<n>`
 * with its modifiers and flags, × `afterMul` once the source has been on the field `after` seconds, × the `double`'s
 * `mul` for a unit of its faction.
 * @param {World} w @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
export function fieldBuffs(w, c, src, ops, want) {
  traitOf(c, src).fieldBuffs.forEach((x, i) => {
    if (!buffOn(w, c, src, x)) return;
    const k = x.after !== undefined && w.frame - src.born >= secondsToFrames(x.after) ? x.afterMul ?? 1 : 1;
    for (const u of ops) {
      if (!buffFits(c, u, x)) continue;
      const mul = k * (x.double && (c.operators[u.key].powers ?? []).includes(x.double.power) ? x.double.mul : 1);
      want.get(u)?.set(`fieldBuff:${src.id}:${i}`, { src: src.id, value: mul, mods: times(x.mods, mul), ...(x.flags ? { flags: x.flags } : {}) });
    }
  });
}

/**
 * A source's kill stacks shared with a faction (职业-32: `stackShare`): each other unit of the faction gets the buff
 * `stackShare:<source id>` with the modifiers × the steps of the source's stack marked `shared`, none at 0.
 * @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
export function stackShare(c, src, ops, want) {
  const t = traitOf(c, src), x = t.stackShare;
  if (!x) return;
  const i = t.stacks.findIndex((s) => s.shared), n = src.buffs.find((b) => b.key === `stack:${i}`)?.value ?? 0;
  if (n <= 0) return;
  for (const u of ops) if (u !== src && (c.operators[u.key].powers ?? []).includes(x.power)) want.get(u)?.set(`stackShare:${src.id}`, { src: src.id, value: n, mods: times(x.mods, n) });
}

/**
 * Whether a share is for a unit (职业-32): an operator (not a summon) on the field other than the holder, of the
 * profession or faction, with an ammo skill when it asks, in the holder's attack range when it asks.
 * @param {Content} c @param {Unit} h @param {Unit} u @param {ShareGain} x
 */
function shareFits(c, h, u, x) {
  if (u === h || u.kind !== KIND.OPERATOR || u.hp <= 0 || u.summoner !== undefined) return false;
  const d = c.operators[u.key];
  return (!x.profession || d.profession === x.profession) && (!x.power || (d.powers ?? []).includes(x.power)) && (!x.ammo || !!d.skill?.ammo)
    && (!x.inRange || inKeys(u, reachKeys(c, h), { rows: c.level.height, cols: c.level.width }));
}

/** Gives a holder's share to a unit: the buff `share:<holder id>` without an end; the holder's own (`shareSelf`) with `self`. @param {Unit} h @param {Unit} u @param {ShareGain} x */
function give(h, u, x) {
  addBuff(u, makeBuff({ key: `share:${h.id}`, src: h.id, mods: { ...x.mods } }));
  if (x.self && !h.buffs.some((b) => b.key === 'shareSelf')) addBuff(h, makeBuff({ key: 'shareSelf', src: h.id, mods: { ...x.mods } }));
}

/**
 * A holder shares its gain (职业-32: `shareGain`): with `count` units it is for (shareFits) on the field, each drawn at
 * random (随机-1); the ones left wait for operators that arrive later (the buff `shareLeft`, its value the count).
 * @param {World} w @param {Content} c @param {Unit} h
 */
function share(w, c, h) {
  const x = /** @type {ShareGain} */ (traitOf(c, h).shareGain);
  let left = x.count;
  const pool = w.units.filter((u) => shareFits(c, h, u, x));
  while (left > 0 && pool.length) {
    const u = pool.splice(Math.min(pool.length - 1, Math.floor(draw(w) * pool.length)), 1)[0];
    give(h, u, x);
    left--;
  }
  if (left > 0) addBuff(h, makeBuff({ key: 'shareLeft', src: h.id, value: left }));
}

/**
 * An operator's deployment for the shares (职业-32): its own share at once (one without `after`); then each holder on
 * the field with some left gives one to it when it is for it.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function shareArrive(w, c, op) {
  const x = traitOf(c, op).shareGain;
  if (x && x.after === undefined) share(w, c, op);
  for (const h of w.units) {
    const b = h.buffs.find((y) => y.key === 'shareLeft'), hx = b ? traitOf(c, h).shareGain : null;
    if (!b || !hx || !shareFits(c, h, op, hx)) continue;
    give(h, op, hx);
    if (b.value <= 1) removeBuff(h, b);
    else retune(h, b, b.value - 1, b.mods);
  }
}

/** At the start of a holder's turn (职业-32): a share with `after` once it has been on the field that many seconds. @param {World} w @param {Content} c @param {Unit} op */
export function shareTurn(w, c, op) {
  const x = traitOf(c, op).shareGain;
  if (x?.after !== undefined && w.frame - op.born === secondsToFrames(x.after)) share(w, c, op);
}

/** A holder leaves the field (职业-32): its shares go from every unit. @param {World} w @param {Unit} h */
export function shareLeave(w, h) {
  for (const u of w.units) removeBuff(u, `share:${h.id}`);
}
