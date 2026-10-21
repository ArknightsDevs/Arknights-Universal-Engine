// Talents on an operator's life (docs/spec/traits.md 职业-27): a heal once its HP is low, 护盾 layers that heal it as
// they break, what keeps it on the field at 0 HP — a last stand that ends in a retreat, a full heal that freezes it and
// the enemies around, a heal bought with cost —, and the true damage it returns for the attacks on its faction.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune, stamp } from './buffs.js';
import { heal, setHp, setShieldHits } from './damage.js';
import { inflict } from './status.js';
import { reachKeys } from './reach.js';
import { inKeys, hostile } from './targeting.js';
import { traitOf, gainCost, creditedDamage } from './traits.js';
import { withdraw } from './deck.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */

/** A heal of an operator by itself, with its event (伤害-11). @param {World} w @param {Unit} op @param {number} amount */
function selfHeal(w, op, amount) {
  w.events.push({ type: 'heal', id: op.id, target: op.id, amount: heal(w, op, op, amount) });
}

/** The flag that keeps the 护盾 buff of a talent's layers while it has none (职业-27). */
const LAYERS_KEEP = 'layersKeep';

/**
 * A deployed operator's talents on its life (职业-27): until its heal once its HP is low, it is 不死 (buff `lowHp`); its
 * 护盾 layers begin with `init` (buff `layers`, kept when they run out) and their wait at the deployment (`layersWait`:
 * `n` the frame the wait began, `value` the layers it saw last).
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function lifeDeploy(w, c, op) {
  const t = traitOf(c, op);
  if (t.lowHp) addBuff(op, makeBuff({ key: 'lowHp', src: op.id, flags: { undying: true } }));
  if (t.layers) {
    addBuff(op, makeBuff({ key: 'layers', src: op.id, shieldHits: t.layers.init, flags: { [LAYERS_KEEP]: true } }));
    addBuff(op, makeBuff({ key: 'layersWait', src: op.id, n: w.frame, value: t.layers.init }));
  }
}

/**
 * An operator's heal once its HP is low, at its turn (职业-27: 隐德来希): below `below` of its maximum HP while it is
 * still 不死 for it, the 不死 goes, it heals `heal` of its maximum HP and keeps `mods` (buff `lowHpAfter`).
 * @param {World} w @param {Content} c @param {Unit} op
 */
function lowHpTurn(w, c, op) {
  const l = traitOf(c, op).lowHp;
  if (!l || !op.buffs.some((b) => b.key === 'lowHp') || op.hp >= l.below * statsOf(op).maxHp) return;
  removeBuff(op, 'lowHp');
  selfHeal(w, op, l.heal * statsOf(op).maxHp);
  addBuff(op, makeBuff({ key: 'lowHpAfter', src: op.id, mods: { ...l.mods } }));
}

/**
 * An operator's 护盾 layers at its turn (职业-27: 泥岩): for each layer that broke since its last turn a heal of `heal` of
 * its maximum HP; every `every` seconds a layer more, at most `max`.
 * @param {World} w @param {Content} c @param {Unit} op
 */
function layersTurn(w, c, op) {
  const l = traitOf(c, op).layers, b = op.buffs.find((x) => x.key === 'layers'), wait = op.buffs.find((x) => x.key === 'layersWait');
  if (!l || !b || !wait) return;
  for (let k = b.shieldHits; k < wait.value; k++) selfHeal(w, op, l.heal * statsOf(op).maxHp);
  if (w.frame - wait.n >= secondsToFrames(l.every)) {
    stamp(wait, w.frame);
    if (b.shieldHits < l.max) setShieldHits(op, b, b.shieldHits + 1);
  }
  if (wait.value !== b.shieldHits) retune(op, wait, b.shieldHits, {});
}

/** An operator's talents on its life at its turn (职业-27): its heal once its HP is low, its 护盾 layers. @param {World} w @param {Content} c @param {Unit} op */
export function lifeTurn(w, c, op) {
  lowHpTurn(w, c, op);
  layersTurn(w, c, op);
}

/**
 * The last stand (职业-27: 史尔特尔): brought to 0 HP, once a deployment, it keeps 1 HP, 不死 and 禁疗 for `seconds`
 * (buff `lastStand`), then retreats (lastStandEnds).
 * @param {Unit} u @param {{ seconds: number }} s
 */
function lastStand(u, s) {
  if (u.buffs.some((b) => b.key === 'lastStand')) return false;
  addBuff(u, makeBuff({ key: 'lastStand', src: u.id, left: secondsToFrames(s.seconds), flags: { undying: true, healFree: true } }));
  setHp(u, 1);
  return true;
}

/**
 * The frozen life (职业-27: 圣聆初雪): brought to 0 HP, once a deployment (buff `frostLife`), it heals to `hp` of its
 * maximum, is 冻结 `self` seconds (an enemy's 冻结: its 法术抗性 stays), and every enemy with a tile in its attack range
 * is 冻结 `foes` seconds.
 * @param {World} w @param {Content} c @param {Unit} u @param {{ hp: number, self: number, foes: number }} f
 */
function frostLife(w, c, u, f) {
  if (u.buffs.some((b) => b.key === 'frostLife')) return false;
  addBuff(u, makeBuff({ key: 'frostLife', src: u.id }));
  setHp(u, statsOf(u).maxHp * f.hp);
  w.events.push({ type: 'heal', id: u.id, target: u.id, amount: u.hp });
  inflict(w, u, 'enemyFreeze', { seconds: f.self });
  const keys = reachKeys(c, u), grid = { rows: c.level.height, cols: c.level.width };
  for (const e of w.units.filter((x) => hostile(x) && x.hp > 0 && !x.hidden && inKeys(x, keys, grid))) inflict(w, e, 'freeze', { seconds: f.foes, src: u });
  return true;
}

/**
 * The heal bought with cost (职业-27: 琳琅诗怀雅): brought to 0 HP, when its owner has the cost — `cost` × `mul` to the
 * power of the times it was bought this deployment (buff `costLife`) — it is paid and the HP set to `hp` of its maximum.
 * @param {World} w @param {Content} c @param {Unit} u @param {{ cost: number, hp: number, mul: number }} k
 */
function costLife(w, c, u, k) {
  const b = u.buffs.find((x) => x.key === 'costLife'), n = b?.value ?? 0;
  let need = k.cost;
  for (let i = 0; i < n; i++) need *= k.mul;
  if (w.players[u.owner].cost < need) return false;
  gainCost(w, c, u.owner, -need);
  if (b) retune(u, b, n + 1, {});
  else addBuff(u, makeBuff({ key: 'costLife', src: u.id, value: 1 }));
  setHp(u, statsOf(u).maxHp * k.hp);
  w.events.push({ type: 'heal', id: u.id, target: u.id, amount: u.hp });
  return true;
}

/**
 * Whether an operator at 0 HP this frame stays by its talents (伤害-9, 职业-27): its last stand, its frozen life, or its
 * heal bought with cost.
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function lifeFatal(w, c, u) {
  if (u.kind !== KIND.OPERATOR) return false;
  const t = traitOf(c, u);
  return (!!t.lastStand && lastStand(u, t.lastStand)) || (!!t.frostLife && frostLife(w, c, u, t.frostLife)) || (!!t.costLife && costLife(w, c, u, t.costLife));
}

/**
 * The engine's behaviours of the talents on life (职业-27): a last stand that runs out retreats the operator (撤退-1),
 * while it is on the field.
 * @param {Content} c
 */
export const lifeBehaviors = (c) => ({
  lastStand: { expire: (/** @type {World} */ w, /** @type {Unit} */ u) => { if (w.units.includes(u) && u.hp > 0) withdraw(w, c, u); } },
});

/**
 * The true damage operators return for an enemy's attack on one of their faction (职业-27: 玛恩纳): each operator on the
 * field whose talent names the faction of the one attacked deals the attacker true damage of `scale` × its own attack.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} attacker @param {string} rider the tag nothing rides on
 */
export function reflectHit(w, c, op, attacker, rider) {
  const powers = c.operators[op.key]?.powers ?? [];
  for (const u of w.units) {
    if (attacker.hp <= 0) return;
    const r = u.kind === KIND.OPERATOR && u.hp > 0 ? traitOf(c, u).reflect : null;
    if (r && powers.includes(r.power)) creditedDamage(w, c, u, attacker, { type: 'true', amount: statsOf(u).atk * r.scale, tags: [rider] });
  }
}

