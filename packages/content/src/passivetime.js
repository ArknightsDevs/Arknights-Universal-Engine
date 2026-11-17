// How long a passive skill runs when its description says so (docs/spec/skills.md 技能-4): 「部署后{duration}秒内攻击力+{atk}」,
// 「并在{duration}秒内攻击力+{atk}，伤害类型变为法术」, 「部署后{duration}秒内停止攻击」, 「…的屏障，持续{duration}秒」. The data gives such
// a skill no duration (−1), the blackboard's `duration` is its seconds.

/** @typedef {import('./skills.js').SkillLevel} SkillLevel */

/**
 * The clause that says the skill's own span: it starts with 「{duration}秒内」, after 「部署后」「并」「在」「之后」 and nothing else, or is
 * 「持续{duration}秒」. A clause that says it of an effect on the targets (「每次攻击会在{duration}秒内令命中目标移动速度-…」) or of a
 * barrier alone (「该屏障会在{duration}秒内持续衰减」, 技能-14) starts with other words and is not this.
 */
const SPAN = /^(?:(?:部署后|并)?在?(?:之后)?\{duration\}秒内|持续\{duration\}秒$)/u;

/**
 * The seconds a passive skill runs (技能-4), or 0 when it has no span of its own: a passive skill with no duration in the
 * data, a positive `duration` in its blackboard and a clause of its description that gives it (SPAN). It then ends after
 * those seconds, as a timed skill does.
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {string} text the description, tags removed, its placeholders as {key}
 */
export function passiveSeconds(level, bb, text) {
  if (level.skillType !== 'PASSIVE' || level.duration > 0 || !(bb.duration > 0)) return 0;
  return text.split(/[，。；\n]/u).some((s) => SPAN.test(s.trim())) ? bb.duration : 0;
}
