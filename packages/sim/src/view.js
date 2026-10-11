// The world as the renderer sees it (schema render state v2).
import { writeView, SKILL_STATE } from '@aue/schema';
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
    })),
  }, out);
}
