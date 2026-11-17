// Which blackboard key is the attack's multiplier (docs/spec/skills.md 技能-5): the sentence that holds a `…atk_scale`
// placeholder says whether it is about the operator's attacks. A running skill's attacks take their 攻击力倍率 from
// the key of such a sentence; a key that sits in a sentence about something else — damage every second, an extra hit, a
// counter, an end burst — belongs to that effect and is not the attack's.
import { skills } from '@aue/sim';
import { clauses } from './skilltext.js';

/** @typedef {NonNullable<NonNullable<import('@aue/sim').SkillDef['extra']>['attack']>} Attack */

/** The words after which 「攻击」 is no action: the stat, a range, a distance, a speed, an interval, a target count. */
const NOT_ACTION = /攻击力|攻击范围|攻击距离|攻击速度|攻击间隔|攻击目标|攻击次数/gu;
/** A sentence about damage over time: 「每秒」「每{interval}秒」「每0.5秒」「每隔」. */
const PERIODIC = /每(?:\{[^}]+\}|[\d.]+)?秒|每隔/u;
/** A second hit or a rider of the attack: 「额外造成」「额外对」「额外附带」「附加」「追加」 — 「额外攻击一个目标」 is a target count. */
const EXTRA = /额外(?:造成|对|附带|附加|再|发动|释放|进行|受到|提升|提高)|附加|附带|追加/u;
/** What happens when the operator is hit, not when it hits: 「受到…攻击时」「被攻击时」「反击」. */
const COUNTER = /受到[^，]*攻击|被攻击|反击|受击/u;
/** A damage that is one event of the skill, not its attacks: the end, the start, a landing, a blast, a summon. */
const EVENT = /技能结束|持续时间结束|结束时|结束后|出现时|落地|爆炸|撞击|碰到|碰撞|召唤|放置|部署后|立即|开启时|开启技能/u;
/** 「攻击力提升至{key}」: the attack's own strength raised to a multiple. */
const RAISED = /攻击力(?:提升|提高|变为)至$/u;
/** A clause that makes the attacks something else: the sentence's later clauses say what that attack does. */
const BECOMES = /^(?:每次)?攻击(?:变为|改为|变成)/u;
/** The skill's own run of hits — 「N次斩击」「N连击」 — or its pieces: a 「每次造成」 after it is one hit of the run. */
const SEQUENCE = /连击|斩击|棋子/u;
/** A clause that goes on with the one before it, with no subject of its own. */
const CONTINUES = /^(?:造成|并|且|同时|使|对|则|将|把|之后|随后|再)/u;

/** Whether the words have 「攻击」 or 「射击」 as an action. @param {string} s */
const acts = (s) => /攻击|射击/u.test(s.replace(NOT_ACTION, ''));

/**
 * Whether a clause is about the attack: `'attack'`, `'other'`, or `'unknown'` when the sentence says neither. The
 * words that lead up to what is asked after (`lead`: the placeholder, a push; with the clause before, when this one goes on with it) are read: the cues of
 * another effect first; then the attack as an action, 「攻击力提升至」, a run of hits, an earlier clause that turns the
 * attack into something else, and the key's own `attack@` namespace. A skill that runs has to say so (`other`
 * otherwise); a next-attack skill is only taken from the attack by the cues of another effect.
 * @param {string[]} list the sentence's clauses @param {number} i the clause @param {string} lead the clause up to the thing asked after
 * @param {string} key the blackboard key asked after, `''` for none @param {boolean} runs
 * @returns {'attack' | 'other' | 'unknown'}
 */
function verdictOf(list, i, lead, key, runs) {
  const words = CONTINUES.test(list[i]) && i > 0 ? `${list[i - 1]}，${lead}` : lead;
  // These come before BECOMES on purpose: 「攻击变为投掷回旋的大飞镖，…并每秒受到相当于攻击力{key}的法术伤害」 (白雪 S2) says what
  // the target suffers every second, a damage over time, not what one hit of the changed attack does. The boomerang's own
  // hit keeps 倍率 1 (INF-1415).
  if (PERIODIC.test(words) || EXTRA.test(words) || COUNTER.test(words)) return 'other';
  // 「攻击变为从天空召唤陨石」: what lands, bursts or arrives is the attack's own
  if (list.slice(0, i).some((c) => BECOMES.test(c))) return 'attack';
  if (runs && EVENT.test(words)) return 'other';
  if (acts(words) || RAISED.test(lead) || SEQUENCE.test(lead) || list.slice(0, i).some((c) => SEQUENCE.test(c)) || key.startsWith('attack@')) return 'attack';
  return runs ? 'other' : 'unknown';
}

/**
 * A key that can be an attack's multiplier: `atk_scale`, in the attack's namespace or not, with at most the skill's slot or
 * a number around it (`atk_scale_s2`, `atk_scale_3`, `s2_atk_scale`, `s2.atk_scale`), or `damage_scale` (安洁莉娜 S2:
 * 「每次攻击只能造成相当于攻击力{damage_scale}」). A word for another effect —
 * `extra_`, `aoe_`, `kill_`, `splash_`, `_current`, `_heavy` — makes it that effect's key.
 */
const SCALE_KEY = /^(?:attack@)?(?:(?:s\d+[._])?atk_scale(?:_s\d+|_\d+)?|damage_scale)$/u;

/**
 * The numeric multiplier placeholders of a clause; a `damage_scale` only straight after 「攻击力」 (not 「伤害提高至{damage_scale}」).
 * @param {string} s @param {Record<string, number>} bb
 */
const keysIn = (s, bb) => [...s.matchAll(/\{([^}]*(?:atk_scale|damage_scale)[^}]*)\}/gu)]
  .filter((m) => SCALE_KEY.test(m[1]) && Number.isFinite(bb[m[1]]) && (!m[1].endsWith('damage_scale') || s.slice(0, m.index).endsWith('攻击力'))).map((m) => m[1]);

/**
 * The sentences of a description (a full stop or a line ends one; 「；」 does not: 「攻击变为…召唤陨石；陨石…落地后…造成」), without the
 * parts that say what closing the skill does (「关闭技能时」), which are not what its attacks do.
 * @param {string} plain the description, tags gone, placeholders as {key} @returns {string[]}
 */
const sentencesOf = (plain) => plain.split(/[。\n]/u).map((s) => s.split('；').filter((p) => !/关闭技能时/u.test(p)).join('；')).filter(Boolean);

/**
 * Every multiplier key of the description with what its clauses say about it.
 * @param {string} plain @param {Record<string, number>} bb @param {boolean} runs
 * @returns {Map<string, ('attack' | 'other' | 'unknown')[]>}
 */
function verdictsOf(plain, bb, runs) {
  /** @type {Map<string, ('attack' | 'other' | 'unknown')[]>} */
  const out = new Map();
  for (const sentence of sentencesOf(plain)) {
    const list = clauses(sentence);
    list.forEach((s, i) => {
      for (const key of keysIn(s, bb)) out.set(key, [...(out.get(key) ?? []), verdictOf(list, i, s.slice(0, s.indexOf(`{${key}}`)), key, runs)]);
    });
  }
  return out;
}

/** The key the sim reads when the description names none (技能-5): `attack@atk_scale`, else the plain one a claim did not take. @param {Record<string, number>} bb @param {boolean} claimed */
const defaultKey = (bb, claimed) => (Number.isFinite(bb['attack@atk_scale']) ? 'attack@atk_scale' : !claimed && Number.isFinite(bb.atk_scale) ? 'atk_scale' : '');

/**
 * The attack key among those a sentence about the attack names: `attack@atk_scale`, then `atk_scale`, then the only other
 * one; none when two others compete (a heavy and a light hit, a loop and an end) — they are not told apart here.
 * @param {string[]} keys @returns {string | undefined}
 */
function chosenOf(keys) {
  const exact = ['attack@atk_scale', 'atk_scale'].find((k) => keys.includes(k));
  return exact ?? (keys.length === 1 ? keys[0] : undefined);
}

/**
 * The blackboard key that is a running (or next-attack) skill's attack multiplier, when it is not the one the sim takes
 * without being told (技能-5): the key of the sentence about the attack; `''` when the description puts every
 * `atk_scale` of the skill in a sentence about something else, so the attacks keep their multiplier 1.
 * A plain `atk_scale` that 技能-14 or 技能-15 claimed (`claimed`) is not looked at.
 * @param {string} plain the description, tags gone, placeholders as {key}
 * @param {Record<string, number>} bb @param {{ runs: boolean, claimed: boolean }} o
 * @returns {{ scaleKey?: string }}
 */
export function attackScaleOf(plain, bb, { runs, claimed }) {
  const was = defaultKey(bb, claimed), found = verdictsOf(plain, bb, runs);
  if (claimed) found.delete('atk_scale');
  const attack = [...found].filter(([, v]) => v.includes('attack')).map(([k]) => k);
  const key = chosenOf(attack);
  if (key !== undefined) return key === was ? {} : { scaleKey: key };
  if (attack.length > 0) return {};
  const all = [...found.values()].flat();
  // the key is only in the part about closing the skill, which is not read (琳琅诗怀雅 S3); a key the description never writes is left alone
  const closing = was !== '' && !found.has(was) && plain.includes(`{${was}}`);
  // every clause that holds one says it is about something else, or a running skill's only one is the closing part's
  if (was !== '' && bb[was] !== 1 && ((all.length > 0 && all.every((v) => v === 'other')) || (runs && closing))) return { scaleKey: '' };
  return {};
}

/** A level's description for these readers: no tags, line breaks as such, placeholders as {key}. @param {import('./skills.js').SkillLevel} level */
const plainOf = (level) => (level.description ?? '').replace(/<[^>]*>/g, '').replace(/\\n/g, '\n').replace(/\{([^}:]*)(?::[^}]*)?\}/g, '{$1}');

/** Whether a skill level runs — a duration, ammo, or 「持续时间无限」 — and is not a passive one (技能-4). @param {import('./skills.js').SkillLevel} level */
const runsOf = (level) => level.skillType !== 'PASSIVE' && (level.durationType === 'AMMO' || level.duration > 0 || /持续时间无限/u.test(level.description ?? ''));

/**
 * What a skill level's description says of its attack multiplier (技能-5), for a skill whose attacks the multiplier
 * changes: one that runs or waits for its next attack. A passive skill's attacks keep theirs, and an instant skill has none.
 * @param {import('./skills.js').SkillLevel} level @param {Record<string, number>} bb @param {boolean} claimed 技能-14 or 技能-15 took the plain `atk_scale`
 * @returns {{ scaleKey?: string }}
 */
export function scaleKeyOf(level, bb, claimed) {
  const runs = runsOf(level);
  // a 炼金单元 skill is an instant one (技能-13): its keys are the unit's
  if (level.skillType === 'PASSIVE' || (!runs && !skills.ATTACK_KEYS.some((k) => k in bb)) || /投掷一个炼金单元/u.test(level.description ?? '')) return {};
  return attackScaleOf(plainOf(level), bb, { runs, claimed });
}

/**
 * The push or pull a skill's description gives its attacks (技能-9), without one that is not about them: in a running
 * skill, a clause with `pattern` counts only when it is about the attack (「每次攻击把目标小力地拖拽至面前」), not
 * 「技能结束时把…拖拽至面前」 or 「每1.5秒…并将其…拖拽至面前」. A next-attack skill keeps what it reads.
 * @param {import('./skills.js').SkillLevel} level @param {RegExp} pattern
 * @param {Attack} attack what the skill's sentences gave the attacks @returns {Attack}
 */
export function pushOnAttack(level, pattern, attack) {
  if (!attack.displace || !runsOf(level)) return attack;
  const keep = sentencesOf(plainOf(level)).some((sentence) => {
    const list = clauses(sentence);
    return list.some((s, i) => {
      const m = pattern.exec(s);
      return m !== null && verdictOf(list, i, s.slice(0, m.index), '', true) === 'attack';
    });
  });
  if (keep) return attack;
  const { displace: _off, ...rest } = attack;
  return rest;
}
