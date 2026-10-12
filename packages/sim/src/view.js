// The world as the renderer sees it (schema render state v2).
import { writeView, SKILL_STATE, STATUS_BIT } from '@aue/schema';
import { codeOfDir } from './dir.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').SkillState} SkillState */

/**
 * A skill's state for the view: none, gathering SP, ready (holds its cost), running (技能-2…技能-4).
 * @param {SkillState | null} st
 */
const skillState = (st) => (!st ? SKILL_STATE.NONE : st.active ? SKILL_STATE.RUNNING : st.sp >= st.cost ? SKILL_STATE.READY : SKILL_STATE.CHARGING);

/**
 * Writes the render state of the world (into `out` when it is long enough).
 * @param {World} w @param {Float64Array} [out] @returns {Float64Array}
 */
export function toView(w, out) {
  return writeView({
    frame: w.frame,
    players: w.players.map((p) => ({ life: p.life, cost: p.cost })),
    units: w.units.map((u) => ({
      id: u.id, kind: u.kind, owner: u.owner, x: u.x, y: u.y, z: u.z, dir: codeOfDir(u.dir), hp: u.hp, maxHp: u.maxHp, anim: u.anim,
      sp: u.skill ? u.skill.sp : -1, spCost: u.skill ? u.skill.cost : 0, skill: skillState(u.skill), skillLeft: u.skill && u.skill.active ? u.skill.dur : -1,
      status: statusBits(u),
    })),
  }, out);
}

/** The view's status bit of each status buff (状态-5); the others show nothing. */
const SHOWN = Object.freeze({
  stun: STATUS_BIT.stun, freeze: STATUS_BIT.freeze, enemyFreeze: STATUS_BIT.freeze, sleep: STATUS_BIT.sleep, cold: STATUS_BIT.cold, enemyCold: STATUS_BIT.cold,
  silence: STATUS_BIT.silence, sluggish: STATUS_BIT.sluggish, fragile: STATUS_BIT.fragile, artsFragile: STATUS_BIT.fragile, elemFragile: STATUS_BIT.fragile,
  weaken: STATUS_BIT.weaken, fear: STATUS_BIT.fear, levitate: STATUS_BIT.levitate, root: STATUS_BIT.root, invincible: STATUS_BIT.invincible,
});

/** The statuses a unit has, as the view's or-ed bits. @param {import('./types.js').Unit} u */
export function statusBits(u) {
  let bits = 0;
  for (const b of u.buffs) bits |= /** @type {Record<string, number>} */ (SHOWN)[b.key] ?? 0;
  return bits;
}

