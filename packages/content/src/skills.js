// Skills of the official content (docs/spec/skills.md 技能-1, 技能-6): one skill_table level as the engine's skill, and
// the behaviours of common skills the generic one does not cover, written against the native interface (ADR 0055) —
// they act only through the context, never on the units directly.

/** @typedef {import('@aue/sim').SkillDef} SkillDef @typedef {import('@aue/sim').SkillBehavior} SkillBehavior */

/** skill_table's spType → how the skill recovers SP (技能-2). */
const SP_TYPES = Object.freeze({ INCREASE_WITH_TIME: 'time', INCREASE_WHEN_ATTACK: 'attack', INCREASE_WHEN_TAKEN_DAMAGE: 'hurt' });

/**
 * @typedef {object} SkillLevel one entry of skill_table[id].levels
 * @property {string} skillType AUTO, MANUAL or PASSIVE
 * @property {string} durationType NONE or AMMO
 * @property {number} duration
 * @property {{ spType: string | number, spCost: number, initSp: number, maxChargeTime: number }} spData
 * @property {{ key: string, value: number }[]} blackboard
 * @property {string} [description]
 * @property {boolean} [stoppable] whether the player may close it, when the data says so already (技能-7)
 */

/** The description of a skill the player may close (技能-7): 「可随时停止技能」「可随时主动关闭」「手动停止」…. */
const CLOSABLE = /(随时|主动|手动)[^，。；\n<]*(停止|关闭)/u;

/**
 * A skill_table level as the engine's skill (技能-1).
 * @param {string} id @param {SkillLevel} level @returns {SkillDef}
 */
export function skillDefOf(id, level) {
  const type = level.skillType;
  if (type !== 'AUTO' && type !== 'MANUAL' && type !== 'PASSIVE') throw new RangeError(`skill ${id}: unknown skillType ${type}`);
  const sp = /** @type {Record<string, 'time' | 'attack' | 'hurt'>} */ (SP_TYPES)[String(level.spData.spType)] ?? 'none';
  return {
    id, type, sp, cost: level.spData.spCost, init: level.spData.initSp, charges: Math.max(1, level.spData.maxChargeTime),
    duration: level.duration, ammo: level.durationType === 'AMMO', bb: Object.fromEntries(level.blackboard.map((b) => [b.key, b.value])),
    stoppable: level.stoppable ?? CLOSABLE.test(level.description ?? ''),
  };
}

/** 生命回复 (skcom_heal_self): heals the operator for heal_scale of its maximum HP at once. @type {SkillBehavior} */
const healSelf = Object.freeze({
  start(ctx) { ctx.heal(ctx.self, ctx.stats(ctx.self).maxHp * ctx.bb.heal_scale); },
});

/** Behaviours by skill id. @type {Readonly<Record<string, SkillBehavior>>} */
export const skillBehaviors = Object.freeze({
  'skcom_heal_self[1]': healSelf, 'skcom_heal_self[2]': healSelf, 'skcom_heal_self[3]': healSelf,
});
