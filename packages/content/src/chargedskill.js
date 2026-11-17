// The 蓄力 effects of a skill (docs/spec/skills.md 技能-4): 「…；<$ba.charged>蓄力</>额外效果：攻击力+{atk}且停顿变为束缚{attack@root}秒」
// or 「…，蓄力：改为同时攻击3名敌人，持续时间延长至{enhanced_duration}秒」. What is written after the tag, to the end of its line, is
// what the skill does only when it starts with all its SP; the blackboard keys that only that part uses are not the plain
// skill's, so the sim leaves them out unless the skill started charged. The sim (packages/sim/src/chargedskill.js) works it out.

/** @typedef {import('./skills.js').SkillLevel} SkillLevel */
/** @typedef {import('@aue/sim').SkillDef} SkillDef */
/** @typedef {NonNullable<SkillDef['charged']>} Charged */
/** One charged clause's reading: what it adds. @typedef {Omit<Charged, 'keys'>} Patch */

/** The tag the data puts round the word 蓄力. */
const TAG = '<$ba.charged>';
/** The statuses a charged clause gives, by their words (状态-5). */
const STATUS = Object.freeze(/** @type {Record<string, 'stun' | 'sluggish' | 'root' | 'cold' | 'sleep' | 'fear'>} */ ({ 晕眩: 'stun', 停顿: 'sluggish', 束缚: 'root', 寒冷: 'cold', 沉睡: 'sleep', 恐惧: 'fear' }));
/** Chinese numerals of hits. */
const NUMBER = Object.freeze(/** @type {Record<string, number>} */ ({ 二: 2, 两: 2, 三: 3, 2: 2, 3: 3 }));
const WORDS = Object.keys(STATUS).join('|');

/** The placeholders of a text: their keys. @param {string} text */
const keysIn = (text) => [...text.matchAll(/\{([^}:]+)(?::[^}]*)?\}/g)].map((m) => m[1]);
/** A text without tags, its placeholders as {key}. @param {string} text */
const plain = (text) => text.replace(/<[^>]*>/g, '').replace(/\{([^}:]*)(?::[^}]*)?\}/g, '{$1}');

/**
 * The text of a skill level split at its 蓄力 tag: what is said after it to the end of the line, and the rest.
 * @param {SkillLevel} level @returns {{ charged: string, rest: string } | null}
 */
function split(level) {
  const text = (level.description ?? '').replace(/\\n/g, '\n'), at = text.indexOf(TAG);
  if (at < 0) return null;
  const end = text.indexOf('\n', at);
  return { charged: text.slice(at, end < 0 ? text.length : end), rest: text.slice(0, at) + (end < 0 ? '' : text.slice(end)) };
}

/** A status each hit gives, from a status word and the key of its seconds. @param {string} word @param {string} key @param {Record<string, number>} bb @returns {Patch | null} */
const statusOf = (word, key, bb) => (Number.isFinite(bb[key]) ? { attack: { hitStatus: { key: STATUS[word], seconds: bb[key] } } } : null);

/**
 * The shapes of a charged clause (技能-4): a status each hit gives — 「停顿变为束缚{attack@root}秒」, 「并使目标晕眩{stun}秒」 —, the
 * attack's 倍率 (「攻击时攻击力提升至{key}」), its hits (「改为连续攻击三次」), the attack distance (「攻击距离+2」, when the level has no
 * range of its own), the skill's seconds (「持续时间延长至{key}秒」), its ammunition (「改为{key}发弹药」).
 * @type {[RegExp, (m: RegExpExecArray, bb: Record<string, number>, ranged: boolean) => Patch | null][]}
 */
const SHAPES = [
  [new RegExp(`(?:${WORDS})变为(${WORDS})\\{([^}]+)\\}秒`, 'u'), (m, bb) => statusOf(m[1], m[2], bb)],
  [new RegExp(`使(?:目标|其)(${WORDS})\\{([^}]+)\\}秒`, 'u'), (m, bb) => statusOf(m[1], m[2], bb)],
  [/攻击力提升至\{([^}]+)\}/u, (m, bb) => (Number.isFinite(bb[m[1]]) ? { attack: { scale: bb[m[1]] } } : null)],
  [/改为连续攻击(两|二|三|2|3)次/u, (m) => ({ attack: { times: NUMBER[m[1]] } })],
  [/(?:攻击距离|攻击范围)[+＋](\d+)$/u, (m, _bb, ranged) => (ranged ? null : { mods: { rangeExtend: Number(m[1]) } })],
  [/持续时间延长(?:至|为)\{([^}]+)\}秒/u, (m, bb) => (bb[m[1]] > 0 ? { seconds: bb[m[1]] } : null)],
  [/改为\{([^}]+)\}发弹药/u, (m, bb) => (bb[m[1]] > 0 ? { ammo: m[1] } : null)],
];

/**
 * What the clauses of a charged part add (技能-4).
 * @param {string} said the charged part, tags removed, placeholders as {key} @param {Record<string, number>} bb @param {boolean} ranged the level has a range of its own
 * @returns {Patch}
 */
function effectsOf(said, bb, ranged) {
  /** @type {Patch} */
  const out = {};
  for (const clause of said.split(/[，。；\n]/u)) {
    for (const [re, read] of SHAPES) {
      const m = re.exec(clause.trim()), got = m && read(m, bb, ranged);
      if (got) Object.assign(out, got, got.attack ? { attack: { ...out.attack, ...got.attack } } : {});
    }
  }
  return out;
}

/**
 * The 蓄力 part of a skill (技能-4): a level whose description has the tag. `keys` are the blackboard keys written only there,
 * which the plain skill leaves out; the rest is what the charged start adds to its effects — `mods`, `attack` (`scale`, `times`,
 * `hitStatus`, each in place of the plain skill's), `seconds` in place of its duration, `ammo`, the key of the shots in place of
 * its own. A clause of another shape, or one whose key the blackboard does not have, is not read.
 * @param {SkillLevel} level @param {Record<string, number>} bb @returns {{ charged?: Charged }}
 */
export function chargedOf(level, bb) {
  const parts = split(level);
  if (!parts) return {};
  const rest = new Set(keysIn(parts.rest)), keys = [...new Set(keysIn(parts.charged))].filter((k) => !rest.has(k) && Number.isFinite(bb[k]));
  return { charged: { keys, ...effectsOf(plain(parts.charged), bb, !!level.rangeId || Number.isFinite(bb.ability_range_forward_extend)) } };
}
