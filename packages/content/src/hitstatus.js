// The status each hit of a skill's attacks gives its target, read from the description (docs/spec/skills.md 技能-9): a
// status after the attack, at a chance, inside the damage clause, on the main target and the others, for the seconds a
// placeholder or the text gives; the 隐匿失效 that comes with a 寒冷. Each shape is one clause of one sentence; the
// blackboard only gives its numbers. Sentences about a trap, a mine, a bomb, the end of the skill or a talent are not
// the attacks' and are left unread.
import { clauses } from './skilltext.js';

/** @typedef {NonNullable<import('@aue/sim').SkillDef['extra']>['attack']} Attack @typedef {NonNullable<NonNullable<Attack>['hitStatus']>} HitStatus */
/** What a description is read against: the blackboard, the skill's kind, whether the blackboard has `attack@` keys (then only those are the attacks'). @typedef {{ bb: Record<string, number>, kind: 'passive' | 'ammo' | 'duration' | 'next' | 'instant', own: boolean }} Skill */
/** A status a clause gives: its key, seconds, chance, whether its words say the hit itself (「命中」), 隐匿失效 with it, whether the main target only. @typedef {{ key: HitStatus['key'], seconds: number, hits: boolean, prob?: number, reveal?: boolean, first?: boolean }} Given */

/** The status of a sentence and whether 隐匿失效 comes with it. @typedef {{ hit: HitStatus, reveal: boolean }} Found */

/** A status's word in a description (技能-9) and the engine's status (状态-5). @type {Record<string, HitStatus['key']>} */
const STATUS_WORD = { 晕眩: 'stun', 停顿: 'sluggish', 沉睡: 'sleep', 寒冷: 'cold', 恐惧: 'fear', 束缚: 'root', 浮空: 'levitate' };
const WORD = '晕眩|停顿|沉睡|寒冷|恐惧|束缚|浮空';
/** The target of a hit: 目标, 敌人 or 其, with the words for the ones the hit reached. */
const TARGET = '(?:所有命中的|所有命中|命中的|击中的|命中|击中|所有)?(?:目标|敌人|其)';
/** Seconds: a placeholder or a number, then 秒. */
const SECS = '(\\{[^}]+\\}|\\d+(?:\\.\\d+)?)秒';

/** 「使目标停顿{k}秒」, 「令命中目标晕眩」, 「使目标陷入沉睡」: the verb, the target, the status, the seconds. */
const MAKE = new RegExp(`(?:使|令)(${TARGET})(?:陷入)?(${WORD})${SECS}`, 'u');
/** 「造成{k}秒停顿」, 「对敌人造成{k}秒的寒冷」, 「攻击附带{k}秒停顿」. */
const CAUSE = new RegExp(`(?:造成|附带)${SECS}(?:的)?(${WORD})`, 'u');
/** 「晕眩敌人{k}秒」, 「恐惧敌人{k}秒」, 「晕眩其{k}秒」. */
const DIRECT = new RegExp(`(${WORD})(${TARGET})${SECS}`, 'u');
/** 「晕眩{k}秒」 right after a chance (「有{prob}的几率晕眩{k}秒」): the target is the one hit. */
const BARE = new RegExp(`^(${WORD})${SECS}`, 'u');
/** 「使命中的第一个目标浮空{k}秒」: the main target only. */
const FIRST = new RegExp(`(?:使|令)(?:命中的)?第一个目标(?:陷入)?(${WORD})${SECS}`, 'u');
/** 「使其{k}秒内寒冷且隐匿失效」 (凛御银灰 S2). */
const COLD_REVEAL = new RegExp(`(?:使|令)(${TARGET})${SECS}内(寒冷)且隐匿失效`, 'u');
/** 「使命中目标失去特殊能力{k}秒」, 「攻击目标失去特殊能力」: 沉默. */
const SILENCE = new RegExp(`(?:使|令)?(${TARGET})失去特殊能力${SECS}`, 'u');
/** The chance in front of a status: 「有{prob}的概率」, 「有{buff_prob}几率」 — any key that ends in prob. */
const CHANCE = /有\{([^}]*prob)\}的?(?:概率|几率)/u;
/** The main target's own seconds, in the clause after the one that gives the status (佩佩 S3). */
const MAIN = /^对主目标提升至\{([^}]+)\}秒$/u;
/** The 沉睡 a hit gives only a target that is not asleep (缇缇 S3). */
const NOT_ASLEEP = /攻击非沉睡目标时/u;
/** Where a clause stops being the attack's own and starts a new part: 「并」, 「且」, but not the 「且」 of 「且隐匿失效」. */
const JOIN = /并且|并|且(?!隐匿失效)/u;

/** An attack as an action: 「攻击」 not followed by a word that makes it a stat or a range, not 停止攻击 or 受到攻击. */
const ATTACK = /(?<!停止|受到|不)攻击(?![力范距间速装前])/u;
/** A hit that reached its target: 「击中」, 「命中」 (not 命中率), and the 余震 that follows one. */
const HIT = /(?:击中|命中)(?!率)|余震/u;
/** Whom the sentence is about when it names no attack: 「受到攻击和余震的目标有…」. */
const STRUCK = /受到攻击(?:和余震)?的(?:目标|敌人)/u;
/** The damage of a next-attack skill's own attack: its `atk_scale`. */
const DAMAGE = /\{(?:attack@)?atk_scale\}/u;
/** A clause whose status is not on every hit: a condition, the last hit, a chance among effects, a periodic effect, a weight, a flying target or the one time a floating unit catches its target (「追上时」). */
const SKIPPED = /^(?:若|如果|当)|则额外|额外使|仅|第二次|最后一|蓄力|随机触发|随机施加|依次|循环|飞行敌人|溅射到|重量|追上|每\{[^}]+\}秒|每\d+(?:\.\d+)?秒/u;
/** A clause about the end of the skill or a talent: its status is not the attacks'. */
const ENDS = /天赋|技能结束|结束后|结束时|关闭技能/u;
/** A sentence about what is not the skill's own attacks: a trap, a mine, a bomb, a summon's, a passive effect. */
const OTHERS = /陷阱|地雷|炸弹|引爆|踏垫|矿石|军旗|船锚|方尖塔|中继器|发条羽兽|微尘|雷电球|摄影车|被动效果/u;

/**
 * The value of a placeholder or a number written in the text (技能-9); none for a placeholder the blackboard has not, one
 * of a group (`attack@extrabomb.stun`, `tomimi_s_2.stun`: the keys of another effect of the skill), or — when the
 * blackboard has `attack@` keys — one that is not an `attack@` one (`liskam`'s plain `stun` is the operator's own, after
 * the skill).
 * @param {string} token @param {Skill} s @returns {number | undefined}
 */
function valueOf(token, s) {
  const key = token.startsWith('{') ? token.slice(1, -1) : '';
  if (key && (/[.[]/u.test(key) || (s.own && !key.startsWith('attack@')))) return undefined;
  const n = key ? s.bb[key] : Number(token);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The status a part of a clause gives, in the shape of the first of these that it has (技能-9): 寒冷 and 隐匿失效; 使/令 the
 * first target <status>; 使/令 the target <status>; 造成/附带 <seconds> <status>; <status> the target; 失去特殊能力.
 * `bare`: a status with no target, as after a chance.
 * @param {string} part @param {Skill} s @param {boolean} bare @returns {Given | null}
 */
function statusIn(part, s, bare) {
  const shapes = /** @type {[RegExp | null, number, number, number, ('reveal' | 'first')?][]} */ ([
    [COLD_REVEAL, 1, 3, 2, 'reveal'], [FIRST, 0, 1, 2, 'first'], [MAKE, 1, 2, 3], [CAUSE, 0, 2, 1], [DIRECT, 2, 1, 3], [bare ? BARE : null, 0, 1, 2],
  ]);
  for (const [re, target, word, secs, flag] of shapes) {
    const m = re?.exec(part), seconds = m ? valueOf(m[secs], s) : undefined;
    if (m && seconds !== undefined) return { key: STATUS_WORD[m[word]], seconds, hits: target > 0 && HIT.test(m[target]), ...(flag ? { [flag]: true } : {}) };
  }
  const m = SILENCE.exec(part), seconds = m ? valueOf(m[2], s) : undefined;
  return m && seconds !== undefined ? { key: 'silence', seconds, hits: HIT.test(m[1]) } : null;
}

/**
 * Whether a clause makes the sentence the attacks' (技能-9): it names an attack or a hit; for a next-attack skill also
 * the damage of the skill's own attack (`atk_scale`), whose clause or later ones then give the status. In any other
 * skill the damage a sentence names is an opening, a counter or a burst, not its attacks: only a named attack or hit counts.
 * @param {string} clause @param {Skill} s
 */
const anchors = (clause, s) => ATTACK.test(clause) || HIT.test(clause) || STRUCK.test(clause) || (s.kind === 'next' && DAMAGE.test(clause));

/**
 * What one part of a clause gives (技能-9): the chance in front of it, its status; null for a part that gives none.
 * @param {string} part @param {Skill} s @returns {Given | null}
 */
function partOf(part, s) {
  const chance = CHANCE.exec(part), prob = chance ? valueOf(`{${chance[1]}}`, s) : undefined;
  if (chance && !(prob !== undefined && prob > 0 && prob <= 1)) return null;
  const st = statusIn(chance ? part.slice(chance.index + chance[0].length) : part, s, !!chance);
  return st ? { ...st, ...(prob === undefined ? {} : { prob }) } : null;
}

/** The status as the engine's, with its chance and the 沉睡 that waits for a target not asleep. @param {Given} g @param {string} sentence @returns {HitStatus} */
const hitOf = (g, sentence) => ({ key: g.key, seconds: g.first ? 0 : g.seconds, ...(g.first ? { main: g.seconds } : {}), ...(g.prob === undefined ? {} : { prob: g.prob }),
  ...(g.key === 'sleep' && NOT_ASLEEP.test(sentence) ? { unless: /** @type {const} */ ('sleep') } : {}) });

/**
 * The status a sentence gives each hit (技能-9), from its clauses in order: a clause is read once the sentence has named an
 * attack, a hit or (next-attack skills) the attack's damage — or when its own words say 「命中」 —, and when it is not
 * a condition or about the skill's end; a part after 「并」 or 「且」 is read by itself. 「对主目标提升至{k}秒」 after it
 * sets the seconds on the main target. The last status of the sentence is the one.
 * @param {string} sentence @param {Skill} s @returns {Found | null}
 */
function sentenceOf(sentence, s) {
  const traps = OTHERS.test(sentence);
  let out = /** @type {Found | null} */ (null);
  let named = false;
  for (const clause of clauses(sentence)) {
    named ||= anchors(clause, s);
    const main = MAIN.exec(clause), seconds = main ? valueOf(`{${main[1]}}`, s) : undefined;
    if (out && seconds !== undefined) { out = { ...out, hit: { ...out.hit, main: seconds } }; continue; }
    if (traps || SKIPPED.test(clause) || ENDS.test(clause)) continue;
    for (const part of clause.split(JOIN)) {
      const g = partOf(part, s);
      if (g && (g.hits || named)) out = { hit: hitOf(g, sentence), reveal: !!g.reveal };
    }
  }
  return out;
}

/**
 * The status each hit of a skill's attacks gives (技能-9), and the 隐匿失效 that comes with a 寒冷: of the description's
 * sentences, the last one that gives one.
 * @param {string} said the description, tags and closing-skill segments already gone, placeholders as {key}
 * @param {Record<string, number>} bb @param {Skill['kind']} kind @returns {Attack | null}
 */
export function hitStatusOf(said, bb, kind) {
  const s = { bb, kind, own: Object.keys(bb).some((k) => k.startsWith('attack@')) };
  /** @type {ReturnType<typeof sentenceOf>} */
  let last = null;
  for (const sentence of said.split(/[。；\n]/u)) last = sentenceOf(sentence, s) ?? last;
  if (!last) return null;
  const { hit, reveal } = last;
  return { hitStatus: hit, ...(reveal ? { hitDebuff: { seconds: hit.seconds, mods: {}, flags: { unstealth: true } } } : {}) };
}
