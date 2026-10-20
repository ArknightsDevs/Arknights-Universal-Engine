// Talents in time (docs/spec/traits.md 职业-26): the frames an operator's talents keep — the end and the start of its
// last attack, the last hit that took its HP, the last hit whose 伤判 began, the dodges not yet spent —, the conditions
// on them, what its next attack gets for them or by the time since its last one, and a 屏障 after a while without
// attacking.
import { FPS, secondsToFrames } from '@aue/math';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, stamp, count } from './buffs.js';
import { traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').TraitDef} TraitDef @typedef {import('./types.js').NextAttack} NextAttack */
/** @typedef {import('./skills.js').AttackMods} AttackMods */

/**
 * The tracker each condition in time keeps its frame on (职业-26, 职业-31): `idle` the end of the last attack, `unhurt`
 * and `neverHurt` the last hit that took HP, `calm` the last hit whose 伤判 began, `skillOrAfter` the last end of its
 * skill.
 */
const KEY_OF = Object.freeze(/** @type {Record<string, string>} */ ({ idle: 'lastAttack', unhurt: 'lastHurt', calm: 'lastJudged', neverHurt: 'lastHurt', skillOrAfter: 'lastSkillEnd' }));

/** An operator's tracker buff, when it has one. @param {Unit} op @param {string} key */
const tracker = (op, key) => op.buffs.find((b) => b.key === key);

/**
 * The trackers a trait asks for (职业-26): those of its conditions in time, `dodges` for a next attack after a dodge,
 * `lastAttack` for its 屏障 after a while without attacking, `lastSwing` for its 倍率 by the time since its last attack.
 * @param {TraitDef} t @returns {string[]}
 */
function trackersOf(t) {
  const keys = new Set(/** @type {string[]} */ ([]));
  for (const x of [...t.whiles, ...t.nextAttack]) {
    if (Object.hasOwn(KEY_OF, x.when)) keys.add(KEY_OF[x.when]);
    if (x.when === 'dodged') keys.add('dodges');
  }
  if (t.idleShield) keys.add('lastAttack');
  if (t.rhythm) keys.add('lastSwing');
  return [...keys];
}

/**
 * A deployed operator's trackers (职业-26): a buff for each its trait asks for, without an end — a frame's `n` −1 (none
 * yet), the dodges' 0; the wait of its 屏障, begun at the deployment.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function trackTime(w, c, op) {
  const t = traitOf(c, op);
  for (const key of trackersOf(t)) addBuff(op, makeBuff({ key, src: op.id, n: key === 'dodges' ? 0 : -1 }));
  if (t.idleShield) addBuff(op, makeBuff({ key: 'shieldWait', src: op.id, n: w.frame }));
}

/** Whether a hit took an operator's HP since its deployment (职业-31), by its tracker. @param {Unit} op */
export const hurtOnce = (op) => (tracker(op, 'lastHurt')?.n ?? -1) >= 0;

/** Whether an operator's skill ended less than `seconds` ago (职业-31), by its tracker. @param {World} w @param {Unit} op @param {number} seconds */
export function afterSkill(w, op, seconds) {
  const n = tracker(op, 'lastSkillEnd')?.n ?? -1;
  return n >= 0 && w.frame - n < secondsToFrames(seconds);
}

/**
 * The frames since a tracked event (职业-26): since the frame its tracker keeps; with none yet, since the deployment —
 * or, `fresh`, as long as can be.
 * @param {World} w @param {Unit} op @param {string} key @param {boolean} fresh
 */
function since(w, op, key, fresh) {
  const n = tracker(op, key)?.n ?? -1;
  return n >= 0 ? w.frame - n : fresh ? Infinity : w.frame - op.born;
}

/**
 * Whether a condition in time holds (职业-26): its event (`idle`, `unhurt`, `calm`) none for `value` seconds.
 * @param {World} w @param {Unit} op @param {{ when: string, value?: number, fresh?: boolean }} x
 */
export const quiet = (w, op, x) => since(w, op, KEY_OF[x.when], !!x.fresh) >= secondsToFrames(x.value ?? 0);

/**
 * The 倍率 of an attack by the time since the last one started (职业-26: 白金): 1 + (`top` − 1) × k, k the frames since
 * then less `min` × 30 + 1, over (`max` − `min`) × 30, held to [0, 1]; the deployment counts as the last start.
 * @param {World} w @param {Unit} op @param {{ min: number, max: number, top: number }} r
 */
function rhythmScale(w, op, r) {
  const k = (since(w, op, 'lastSwing', false) - (r.min * FPS + 1)) / ((r.max - r.min) * FPS);
  return 1 + (r.top - 1) * Math.min(1, Math.max(0, k));
}

/**
 * What a next attack gets (职业-26) on the mods: × `scale` on its 倍率, + `atk` on its attack bonus, its stun of `stun`
 * seconds on each hit, × `times` on its hits, its targets all those it blocks (`blocked`).
 * @param {AttackMods} mods @param {NextAttack} x @returns {AttackMods}
 */
const nextMods = (mods, x) => ({
  ...mods, ...(x.scale ? { scale: mods.scale * x.scale } : {}), ...(x.atk ? { atkPct: (mods.atkPct ?? 0) + x.atk } : {}),
  ...(x.stun ? { hitStatus: { key: /** @type {const} */ ('stun'), seconds: x.stun } } : {}), ...(x.times ? { times: mods.times * x.times } : {}), ...(x.blocked ? { blocked: true } : {}),
});

/**
 * An operator's attack as it starts, by its talents in time (职业-26): what each next attack whose condition holds gives
 * — after a dodge (`dodged`) while it has one not yet spent, one of them spent for the attack —, its 倍率 by the time
 * since its last attack started; then that start's frame on its tracker.
 * @param {World} w @param {Content} c @param {Unit} op @param {AttackMods} mods @returns {AttackMods}
 */
export function timedAttack(w, c, op, mods) {
  const t = traitOf(c, op), d = tracker(op, 'dodges'), charged = !!d && d.n > 0;
  let out = mods;
  for (const x of t.nextAttack) if (x.when === 'dodged' ? charged : quiet(w, op, x)) out = nextMods(out, x);
  if (charged && d) count(d, -1);
  if (t.rhythm) out = { ...out, scale: out.scale * rhythmScale(w, op, t.rhythm) };
  const s = tracker(op, 'lastSwing');
  if (s) stamp(s, w.frame);
  return out;
}

/** An operator's attack ended (职业-26: 攻击-2's landing): its frame on its `lastAttack` tracker. @param {World} w @param {Unit} op */
export function attackEnded(w, op) {
  const t = tracker(op, 'lastAttack');
  if (t) stamp(t, w.frame);
}

/**
 * An operator's 屏障 after a while without attacking, at its turn (职业-26: 信仰搅拌机): while it holds the 屏障 (buff
 * `idleShield`, event priority −1000) its wait begins again; without it, once `value` seconds have passed since the wait
 * began or its last attack ended, whichever is later, it gains the 屏障 — `share` of its maximum HP.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function idleShieldTurn(w, c, op) {
  const s = traitOf(c, op).idleShield, wait = tracker(op, 'shieldWait');
  if (!s || !wait) return;
  if (op.buffs.some((b) => b.key === 'idleShield')) { stamp(wait, w.frame); return; }
  const from = Math.max(wait.n, tracker(op, 'lastAttack')?.n ?? -1);
  if (w.frame - from < secondsToFrames(s.value)) return;
  addBuff(op, makeBuff({ key: 'idleShield', src: op.id, prio: -1000, shield: s.share * statsOf(op).maxHp }));
}
