// A skill's hit on the enemies around its operator (docs/spec/skills.md 技能-14, 技能-16): who it reaches — those in the cells
// of the skill's range or in the attack range, the first few of them, or those around the nearest one — and what each takes:
// the hits, a push or pull, the timed modifiers, the statuses. Not an attack of the operator's: it gives no attack SP and sets
// off no counter.
import { hypot, secondsToFrames } from '@aue/math';
import { statsOf } from './attrs.js';
import { addBuff, makeBuff, removeBuff } from './buffs.js';
import { displaceOnHit, targetsOf } from './combat.js';
import { reachKeys } from './reach.js';
import { pathDistance } from './routes.js';
import { inflict } from './status.js';
import { hostile, inKeys, rangeKeys, sortEnemies } from './targeting.js';
import { creditedDamage, traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {NonNullable<import('./types.js').SkillDef['extra']>} Extra */
/** @typedef {NonNullable<Extra['bursts']>[number]} Strike */

/**
 * The enemies in an order (技能-16): the farthest from the operator first for a pull, else the order its attack takes them
 * in (索敌-3), by its trait's filters.
 * @param {Content} c @param {Unit} op @param {Unit[]} list @param {Strike['order']} order @returns {Unit[]}
 */
function ordered(c, op, list, order) {
  if (order === 'farthest') return list.map((e) => ({ e, d: hypot(e.x - op.x, e.y - op.y) })).sort((a, b) => b.d - a.d).map((r) => r.e);
  const t = traitOf(c, op);
  return sortEnemies(op, list, { blockedFirst: !!t.blockedFirst, pathDist: (e) => pathDistance(c, e), filter: t.filter, secondary: t.secondary });
}

/**
 * A projectile's splash (技能-16): the ground enemy nearest to the operator in its attack range is hit, and every enemy within
 * `around` tiles of it — flying ones too — with it.
 * @param {World} w @param {Content} c @param {Unit} op @param {number} around @param {(u: Unit) => boolean} fits @returns {Unit[]}
 */
function splashed(w, c, op, around, fits) {
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, op);
  const near = w.units.filter((u) => fits(u) && !statsOf(u).flying && inKeys(u, keys, grid))
    .map((e) => ({ e, d: hypot(e.x - op.x, e.y - op.y) })).sort((a, b) => a.d - b.d)[0]?.e;
  return near ? w.units.filter((u) => fits(u) && hypot(u.x - near.x, u.y - near.y) <= around) : [];
}

/**
 * The enemies a strike reaches (技能-16), fixed before any of them is hit: hostile ones on the field — the units an attack may
 * choose (装置-3), so a hostile device too; not a neutral unit, 合作-9; not a disappeared one, 路线-4 —, the ground ones only for
 * `ground`, in the stored cells or in the attack range now (flying ones too), the first `most` of them in the order. In the attack
 * range, `most` takes the enemies its attack would take (索敌-3), so a flying one only when it may attack it — unless the strike
 * says `fly`. With `around`, a projectile's splash: see `splashed`.
 * @param {World} w @param {Content} c @param {Unit} op @param {Strike} s @returns {Unit[]}
 */
export function strikeFoes(w, c, op, s) {
  const grid = { rows: c.level.height, cols: c.level.width };
  const alive = (/** @type {Unit} */ u) => hostile(u) && u.hp > 0 && !u.hidden, fits = (/** @type {Unit} */ u) => alive(u) && !(s.ground && statsOf(u).flying);
  if (s.around) return splashed(w, c, op, s.around, alive);
  let list;
  if (s.most && s.where === 'attack' && !s.order && !s.fly) list = targetsOf(w, c, op).filter(fits);
  else {
    const keys = s.where === 'cells' && s.range ? rangeKeys(grid, op, s.range) : reachKeys(c, op);
    list = ordered(c, op, w.units.filter((u) => fits(u) && inKeys(u, keys, grid)), s.order);
  }
  return s.most ? list.slice(0, s.most) : list;
}

/**
 * A strike's timed modifiers on an enemy it hit (技能-9's hit debuff): one buff per source, the time starting again at each.
 * @param {Unit} e @param {Unit} op @param {NonNullable<Strike['debuff']>} d
 */
function debuffOn(e, op, d) {
  const key = `hitDebuff:${op.id}`;
  removeBuff(e, key);
  addBuff(e, makeBuff({ key, src: op.id, left: secondsToFrames(d.seconds), mods: d.mods }));
}

/**
 * What a strike is working out: the battle, the operator, the strike, and the damage it deals each time — a type and an amount.
 * @typedef {{ w: World, c: Content, op: Unit, s: Strike, type: import('./types.js').DamageType, amount: number }} Job
 */

/**
 * One enemy's hits (技能-16): `times` of them, each of the strike's type and then of its second type when it has one; an enemy that
 * falls takes no more; a ×`air` on a flying one; some of its 防御 ignored.
 * @param {Job} j @param {Unit} e
 */
function hitsOn(j, e) {
  const { s } = j, air = s.air && statsOf(e).flying ? s.air : 1, types = s.then ? [j.type, s.then] : [j.type];
  for (let k = 0; k < (s.times ?? 1); k++) {
    for (const type of types) {
      if (e.hp <= 0) return;
      creditedDamage(j.w, j.c, j.op, e, {
        type, amount: j.amount * air, isAttack: false, isSkill: true,
        ...(s.ignoreDef?.pct ? { defIgnorePct: s.ignoreDef.pct } : {}), ...(s.ignoreDef?.flat ? { defIgnoreFlat: s.ignoreDef.flat } : {}),
      });
    }
  }
}

/**
 * The statuses a strike gives an enemy (技能-16), whether or not a hit was dodged. A status written 「已经处于…」 asks for what the enemy
 * held before the strike (`had`: the keys of its buffs).
 * @param {Job} j @param {Unit} e @param {Set<string>} had
 */
function statusesOn(j, e, had) {
  for (const st of j.s.status ?? []) if (e.hp > 0 && (!st.ifHas || had.has(st.ifHas))) inflict(j.w, e, st.key, { seconds: st.seconds, src: j.op });
}

/**
 * What a strike gives an enemy it hit and left standing (技能-16): the timed modifiers, the push or pull, then the statuses — unless
 * they came first.
 * @param {Job} j @param {Unit} e @param {Set<string>} had
 */
function ridersOn(j, e, had) {
  const { s, op } = j;
  if (s.debuff) debuffOn(e, op, s.debuff);
  if (s.displace) displaceOnHit(j.w, j.c, op, e, s.displace);
  if (!s.first) statusesOn(j, e, had);
}

/**
 * A strike (技能-16): each enemy it reaches takes it once, the operator's attack × the scale — of the damage type written, else its
 * own — a time for each of its `times`. Returns the seconds its skill stays running for (`hold`) when the strike pulled, else 0: a
 * pull is tried on each enemy left standing, whether it moved or not.
 * @param {World} w @param {Content} c @param {Unit} op @param {Strike} s @returns {number}
 */
export function strikeOn(w, c, op, s) {
  const j = { w, c, op, s, type: s.type ?? op.base.dmgType, amount: statsOf(op).atk * s.scale };
  let pulled = false;
  for (const e of strikeFoes(w, c, op, s)) {
    const had = new Set(s.status?.some((x) => x.ifHas) ? e.buffs.map((b) => b.key) : []);
    if (s.first) statusesOn(j, e, had);
    hitsOn(j, e);
    if (e.hp > 0) { ridersOn(j, e, had); pulled ||= !!s.displace?.pull; }
  }
  return pulled ? s.hold ?? 0 : 0;
}
