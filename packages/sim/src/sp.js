// SP (docs/spec/skills.md 技能-2): whole points up to the cap (cost × charges); the 技力冷却槽 that gives auto recovery
// its points; nothing while the skill runs (阻回) or the bar is full.
import { FPS } from '@aue/math';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').SkillState} SkillState @typedef {import('./types.js').Unit} Unit */

/** A slot is complete when less than this many seconds of it remain (PRTS 技能). */
export const SLOT_EPSILON = 1e-5;

/**
 * Adds whole points, up to the cap; nothing during the skill (阻回). Returns the points gained.
 * @param {SkillState} st @param {number} n
 */
export function gainSp(st, n) {
  return st.active ? 0 : forceSp(st, n);
}

/**
 * Adds whole points up to the cap even during the skill: SP that ignores 阻回 (技能-2). Returns the points gained.
 * @param {SkillState} st @param {number} n
 */
export function forceSp(st, n) {
  if (!(n > 0) || st.sp >= st.cap) return 0;
  const g = Math.min(n, st.cap - st.sp);
  st.sp += g;
  return g;
}

/**
 * One frame of auto recovery (技能-2): the slot fills by 技力自然回复速度 / FPS; when less than 10⁻⁵ s of it remains it
 * gives a point and keeps what ran over. A full bar or 阻回 keeps the slot as it is.
 * @param {SkillState} st @param {number} rate SP per second
 */
export function timeSp(st, rate) {
  if (st.spType !== 'time' || st.active || st.sp >= st.cap || !(rate > 0)) return;
  st.slot += rate / FPS;
  while (st.sp < st.cap && (1 - st.slot) / rate < SLOT_EPSILON) {
    st.slot -= 1;
    gainSp(st, 1);
  }
}

/** Starting the skill takes its cost; what is left over stays — the charges of a skill that holds more (技能-2, 技能-4). @param {SkillState} st */
export function spendSp(st) {
  st.sp -= st.cost;
}

/** Sets the points, held to [0, the cap] (content that sets SP outright, 技能-2). @param {SkillState} st @param {number} n */
export function setSp(st, n) {
  st.sp = Math.min(st.cap, Math.max(0, Number(n) || 0));
}

/** Loses up to n points (凋亡's 爆发, 元素-3). @param {SkillState} st @param {number} n */
export function loseSp(st, n) {
  st.sp = Math.max(0, st.sp - n);
}

/** A hit on a unit whose skill recovers when hit (受击回复): one point, none under 阻回 (技能-2). @param {Unit} u */
export function hurtSp(u) {
  if (u.skill && u.skill.spType === 'hurt' && !statsOf(u).flags.noSp) gainSp(u.skill, 1);
}
