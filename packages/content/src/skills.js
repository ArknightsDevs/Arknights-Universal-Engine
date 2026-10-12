// Skills of the official content (docs/spec/skills.md 技能-1, 技能-6): one skill_table level as the engine's skill, and
// the behaviours of common skills the generic one does not cover, written against the native interface (ADR 0055) —
// they act only through the context, never on the units directly.
import rangeTable from '../data/ranges.json' with { type: 'json' };

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
 * @property {string | null} [rangeId] the range of the skill's level (技能-8)
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
    stoppable: level.stoppable ?? CLOSABLE.test(level.description ?? ''), ...rangeOf(level), ...extraOf(level),
  };
}

/** Chinese numerals of extra targets and hits (技能-9). */
const COUNT = Object.freeze(/** @type {Record<string, number>} */ ({ 一: 1, 两: 2, 二: 2, 三: 3, 1: 1, 2: 2, 3: 3 }));

/**
 * One sentence of a description as what it adds (技能-9), or null for a sentence it does not read.
 * @param {string} s the sentence, its placeholders as {key} @param {Record<string, number>} bb
 * @returns {{ mods?: Record<string, number>, attack?: NonNullable<SkillDef['extra']>['attack'] } | null}
 */
function phraseOf(s, bb) {
  let m;
  if (s === '同时攻击阻挡的所有敌人') return { attack: { blocked: true } };
  if ((m = /^(?:每次攻击)?额外攻击(一|两|1|2)(?:个|名)(?:目标|敌人)$/.exec(s))) return { attack: { more: COUNT[m[1]] } };
  if ((m = /^攻击变为(二|三|2|3)(?:连击|连射)$/.exec(s))) return { attack: { times: COUNT[m[1]] } };
  if (/^(?:普通攻击造成法术伤害|伤害类型变为法术|(?:每次)?攻击造成相当于攻击力\{(?:attack@)?atk_scale\}的法术伤害)$/.test(s)) return { attack: { type: 'arts' } };
  if ((m = /^(?:且|并)?(?:攻击(?:会)?使|(?:并)?(?:使|令)(?:命中|击中))目标(晕眩|停顿)\{((?:attack@)?(?:stun|sluggish))\}秒$/.exec(s)) && Number.isFinite(bb[m[2]])) {
    return { attack: { hitStatus: { key: m[1] === '晕眩' ? 'stun' : 'sluggish', seconds: bb[m[2]] } } };
  }
  if ((m = /^(?:并)?获得\{prob\}的?物理(和法术)?闪避$/.exec(s)) && Number.isFinite(bb.prob)) return { mods: { dodgePhys: bb.prob, ...(m[1] ? { dodgeArts: bb.prob } : {}) } };
  if (s === '阻挡数变为0') return { mods: { blockCntMul: 0 } };
  if (s === '防御力降至0') return { mods: { defMul: 0 } };
  return null;
}

/**
 * What a skill level's description adds to its blackboard's effects (技能-9): each sentence (split at ，。；, rich-text
 * tags removed, placeholders as {key}) read by phraseOf; none when it reads none.
 * @param {SkillLevel} level @returns {{ extra?: NonNullable<SkillDef['extra']> }}
 */
function extraOf(level) {
  const bb = Object.fromEntries(level.blackboard.map((b) => [b.key, b.value]));
  const parts = (level.description ?? '').replace(/<[^>]*>/g, '').split(/[，。；\n]/)
    .map((raw) => phraseOf(raw.trim().replace(/\{([^}:]*)(?::[^}]*)?\}/g, '{$1}'), bb)).filter((p) => p !== null);
  const mods = Object.assign({}, ...parts.map((p) => p.mods ?? {})), attack = Object.assign({}, ...parts.map((p) => p.attack ?? {}));
  const has = (/** @type {object} */ o) => Object.keys(o).length > 0;
  return has(mods) || has(attack) ? { extra: { ...(has(mods) ? { mods } : {}), ...(has(attack) ? { attack } : {}) } } : {};
}

/** A description that says the attack range changes (技能-8). */
const NEW_RANGE = /攻击范围(?:扩大|改变|缩小)/u;
/** A description that says the attack range reaches the whole map (技能-8). */
const WHOLE_MAP = /攻击范围扩大至整个战场/u;

/**
 * A skill level's attack range while it runs (技能-8): the whole map when its description says so; the level's range
 * (range_table, 干员-8) when the description says the attack range grows, changes or shrinks; else none.
 * @param {SkillLevel} level @returns {{ rangeAll?: true, range?: { row: number, col: number }[] }}
 */
function rangeOf(level) {
  const text = (level.description ?? '').replace(/<[^>]*>/g, '');
  if (WHOLE_MAP.test(text)) return { rangeAll: true };
  if (!NEW_RANGE.test(text) || !level.rangeId) return {};
  const cells = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[level.rangeId];
  if (!cells) throw new RangeError(`no range ${level.rangeId}`);
  return { range: cells };
}

/** 生命回复 (skcom_heal_self): heals the operator for heal_scale of its maximum HP at once. @type {SkillBehavior} */
const healSelf = Object.freeze({
  start(ctx) { ctx.heal(ctx.self, ctx.stats(ctx.self).maxHp * ctx.bb.heal_scale); },
});

/** Behaviours by skill id. @type {Readonly<Record<string, SkillBehavior>>} */
export const skillBehaviors = Object.freeze({
  'skcom_heal_self[1]': healSelf, 'skcom_heal_self[2]': healSelf, 'skcom_heal_self[3]': healSelf,
});
