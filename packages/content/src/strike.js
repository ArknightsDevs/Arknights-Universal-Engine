// What a skill's description says it hits the enemies around its operator with as it starts (docs/spec/skills.md 技能-16):
// 「（部署后）（立即）对周围（所有／最多N名）敌人造成（两次）相当于攻击力{atk_scale}的法术伤害，并令击中目标晕眩{stun}秒」 and its kin —
// pulls, pushes, a timed loss of 防御 or 法术抗性, statuses. One sentence shape each; the blackboard gives the numbers. The
// sim's strike (packages/sim/src/strike.js) works what is read here out.
import { cellsOf } from './skilltext.js';

/** @typedef {import('./skills.js').SkillLevel} SkillLevel */
/** @typedef {import('@aue/sim').SkillDef} SkillDef */
/** @typedef {NonNullable<NonNullable<SkillDef['extra']>['bursts']>[number]} Strike */
/** @typedef {NonNullable<Strike['status']>} Statuses */

const DMG = Object.freeze(/** @type {Record<string, 'phys' | 'arts' | 'true'>} */ ({ 物理: 'phys', 法术: 'arts', 真实: 'true' }));
/** The statuses these sentences give (状态-5), by their words. */
const STATUS = Object.freeze(/** @type {Record<string, 'stun' | 'sluggish' | 'sleep' | 'cold' | 'fear'>} */ ({ 晕眩: 'stun', 停顿: 'sluggish', 沉睡: 'sleep', 寒冷: 'cold', 恐惧: 'fear' }));
/** Chinese numerals of hits and enemies. */
const NUMBER = Object.freeze(/** @type {Record<string, number>} */ ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }));

/**
 * The hit of a strike: 「造成（两次）相当于（干员名）攻击力{atk_scale}的（类型）伤害」, written 「…{atk_scale}攻击力的伤害」 too, with a
 * status before it (灵知 「造成{cold}秒寒冷和相当于…」) or a second type after it (陈 「…的物理和相当于攻击力{atk_scale}的法术伤害」). The
 * key is `atk_scale`, a passive skill's `appear.atk_scale`, or `atk_scale_AOE`.
 */
const HIT = /造成(?:\{[\w.@]+\}秒(?:晕眩|停顿|沉睡|寒冷|恐惧)和)?(?:(一|两|三)次)?(?:相当于)?(?:[^，。；{}]{0,4}?攻击力\{((?:appear\.)?atk_scale(?:_AOE)?)\}|\{((?:appear\.)?atk_scale(?:_AOE)?)\}攻击力)的?(物理|法术|真实)?(?:和相当于[^，。；{}]{0,4}?攻击力\{atk_scale\}的(物理|法术|真实))?(?:的)?(?:群体)?伤害/u;
/** Words of the strike's area. 「攻击范围」 is the attack range; any other is the skill's range, when the level has one. */
const AREA = /攻击范围|周围|前方|远距离|范围内/u;
/** A sentence that is a next attack's, a rain's, a later effect's, a thrown, summoned or exploding thing's, or a pick of one target — not a strike at the start — or centred on a target. */
const LATER = /下一?次|每次攻击|攻击时|攻击使|攻击会|每秒|每\{|每\d|随机(?!施加)|直到|醒来|结束时|结束后|最后一击|目标(?:地点|位置|格|范围|周围)|及其周围|落点|周围\d格|周围[四八]格|发射|射出|射击|扔出|投掷|放置|引爆|爆炸|吟唱|突进|寻找|沿途|贯穿|蓄力|召唤|持续进行/u;
/** Where a sentence stops being the strike's own: what comes 「之后」 or on a condition is another effect. */
const TAIL = /，(?=之后|然后|随后|并在之后|若|如果)/u;
/** How the clause that begins a strike starts, and what may stand before it in the sentence. */
const START = /^(?:部署后|开启技能时|主动开启：|开启：)?(?:并|且)?(?:立即|立刻)?(?:并)?(?:将|对|使)/u;
const LEAD = /^(?:部署后|开启技能时|攻击范围扩大|立即获得\{cost\}点(?:部署)?费用)$/u;
/** A condition on a status a strike gives, as its own sentence: 「若敌人已经处于停顿状态，则额外使敌人晕眩{stun}秒」. */
const IF_HAS = /^若(?:敌人|目标)?(?:已经)?处于(晕眩|停顿|沉睡|寒冷|恐惧)状态，则额外(?:使(?:敌人|目标)|令其)(晕眩|停顿|沉睡|寒冷|恐惧)\{([\w.@]+)\}秒$/u;
/**
 * 缄默德克萨斯's 剑雨: after the strike at the start, `每秒` a volley on the first `max_target` different enemies in the attack range, a hit
 * and 「{stun}秒晕眩」. Its first volley comes after the entrance and the fall (PRTS 缄默德克萨斯 oldid=446519: about 0.67 s).
 */
const RAIN = /，之后每秒(?:释放[^，]{1,4})?攻击范围内最多\{max_target\}个不同的目标，造成攻击力\{atk_scale\}的(物理|法术|真实)伤害(?:和\{stun\}秒晕眩)?$/u;
const RAIN_FIRST = 0.67;
/** A push or pull, as 技能-9 words it. */
const DISPLACE = /(往攻击方向|朝部署方向|向前)?(微小力|小力|中等力度|中力|较大力|大力|特大力)地?(往攻击方向|朝部署方向|向前)?(推开|推动|弹开|击退|拖拽至面前|牵引至面前|拉至面前)/u;
/** Words that say what rides on the hit is for some of the enemies only. */
const SOME = /其中(?!等)|未被阻挡|地面可达|被阻挡的/u;
/** The attributes of an enemy a strike lowers for some seconds, by their words: the blackboard key, and the modifier shown as a share and as a number. */
const LOWERED = Object.freeze([['防御力', 'def', 'defPct', 'defFlat'], ['法术抗性', 'magic_resistance', 'resPct', 'resFlat']]);
/** The operator's own modifier of the blackboard keys above (技能-5), which a strike's key must not give it. */
const OWN_OF = Object.freeze(/** @type {Record<string, string>} */ ({ def: 'defPct', magic_resistance: 'resFlat' }));
/** The one a 防御 shown as a number gives it as well (直接加算, 技能-5): its own flat 防御, not only the share. */
const OWN_FLAT = Object.freeze(/** @type {Record<string, string>} */ ({ def: 'defFlat' }));

/** A blackboard value — the data's keys may differ in case from the description's, `atk_scale_AOE` — above 0, else 0. @param {Record<string, number>} bb @param {string} k */
const pos = (bb, k) => ((bb[k] ?? bb[k.toLowerCase()]) > 0 ? bb[k] ?? bb[k.toLowerCase()] : 0);
/** A strike's optional fields without the empty ones (zero, '', false, null, undefined). @param {Record<string, unknown>} o @returns {Partial<Strike>} */
const keep = (o) => /** @type {Partial<Strike>} */ (Object.fromEntries(Object.entries(o).filter(([, v]) => v)));
/** A count written as digits or a numeral. @param {string} w */
const count = (w) => (/^\d+$/u.test(w) ? Number(w) : NUMBER[w] ?? 0);

/**
 * How many enemies the strike takes (技能-16), or 0 for all of them: 「至多／最多{max_target}（N）个／名」, 「6名敌人」, or 「两个敌人」.
 * @param {string} prefix the sentence before 「造成」 @param {Record<string, number>} bb
 */
function mostOf(prefix, bb) {
  if (/所有/u.test(prefix)) return 0;
  const m = /(?:至多|最多)(\{max_target\}|\d+)(?:个|名)/u.exec(prefix);
  if (m) return m[1].startsWith('{') ? pos(bb, 'max_target') : Number(m[1]);
  const n = /(\d+|[二两三])(?:个|名)(?:敌人|目标)/u.exec(prefix);
  return n ? count(n[1]) : 0;
}

/**
 * The hits of a strike on each enemy (技能-16): 「造成两次…」, 「发动{times}次连续斩击」, 「进行3次攻击」; one otherwise.
 * @param {string} s @param {RegExpExecArray} m the hit @param {Record<string, number>} bb
 */
function timesOf(s, m, bb) {
  if (m[1]) return count(m[1]);
  const t = /(?:进行|发动)(\{times\}|\d+|[二两三四五六七八九十]+)次(?:连续)?(?:攻击|斩击)/u.exec(s);
  return t ? (t[1].startsWith('{') ? pos(bb, 'times') : count(t[1])) : 1;
}

/**
 * The statuses a strike gives (技能-16): 「<状态>{键}秒」 or 「{键}秒（内）<状态>」 for stun, sluggish, sleep, cold and fear, 「失去特殊能力{silence}秒」
 * for silence; the key may carry `appear.`.
 * @param {string} s @param {Record<string, number>} bb @returns {Statuses}
 */
function statusesOf(s, bb) {
  /** @type {Statuses} */
  const out = [];
  const add = (/** @type {Statuses[number]['key']} */ key, /** @type {string} */ k) => { if (pos(bb, k) && !out.some((x) => x.key === key)) out.push({ key, seconds: pos(bb, k) }); };
  for (const m of s.matchAll(/(晕眩|停顿|沉睡|寒冷|恐惧)\{((?:appear\.)?(?:stun|sluggish|sleep|cold|fear))\}秒/gu)) add(STATUS[m[1]], m[2]);
  for (const m of s.matchAll(/\{((?:appear\.)?(?:stun|sluggish|sleep|cold|fear))\}秒(?:内)?(晕眩|停顿|沉睡|寒冷|恐惧)/gu)) add(STATUS[m[2]], m[1]);
  const q = /失去特殊能力\{((?:appear\.)?silence)\}秒/u.exec(s);
  if (q) add('silence', q[1]);
  return out;
}

/**
 * The attributes a strike lowers (技能-16): in 「{…duration}秒内…防御力／法术抗性-{-键}」, the seconds and, by the attribute, the share (shown
 * with a percent) or the number the target's modifier takes; the operator's own modifiers of those keys, which are not its own.
 * @param {string} s the sentence, its placeholders as {key} @param {string} raw the description, with its formats @param {Record<string, number>} bb
 * @returns {{ debuff: NonNullable<Strike['debuff']>, own: string[] } | null}
 */
function debuffOf(s, raw, bb) {
  const d = /\{([\w.@]*duration)\}秒内/u.exec(s), seconds = d ? pos(bb, d[1]) : 0;
  if (!seconds) return null;
  /** @type {Record<string, number>} */
  const mods = {};
  const own = /** @type {string[]} */ ([]);
  for (const [word, key, pct, flat] of LOWERED) {
    if (!new RegExp(`${word}-\\{-${key}\\}`, 'u').test(s) || !Number.isFinite(bb[key])) continue;
    const shown = new RegExp(`\\{-?${key}(?::([^}]*))?\\}`, 'u').exec(raw);
    const share = (shown?.[1] ?? '').includes('%');
    mods[share ? pct : flat] = bb[key];
    own.push(OWN_OF[key], ...(!share && OWN_FLAT[key] ? [OWN_FLAT[key]] : []));
  }
  return Object.keys(mods).length ? { debuff: { seconds, mods }, own } : null;
}

/** The push or pull of a sentence (技能-9's), or null. @param {string} s @param {Record<string, number>} bb */
function displaceOf(s, bb) {
  const m = DISPLACE.exec(s), force = bb.force ?? bb['attack@force'];
  if (!m || !Number.isFinite(force)) return null;
  const pull = /拖拽|牵引|拉至/u.test(m[4]), along = !pull && !!(m[1] || m[3]);
  return { pull, force, ...(along ? { along: true } : {}) };
}

/** The 防御 a strike's hits ignore (技能-16): 「无视目标{def_penetrate}防御力」 a share, 「无视敌人{def_penetrate_fixed}的防御力」 a number. @param {string} s @param {Record<string, number>} bb */
function ignoreOf(s, bb) {
  const pct = /无视(?:目标|敌人)?\{def_penetrate\}/u.test(s) ? pos(bb, 'def_penetrate') : 0, flat = /无视(?:目标|敌人)?\{def_penetrate_fixed\}/u.test(s) ? pos(bb, 'def_penetrate_fixed') : 0;
  return pct || flat ? { ...(pct ? { pct } : {}), ...(flat ? { flat } : {}) } : null;
}

/**
 * Where a strike lands (技能-16): the attack range for 「攻击范围」; else the cells of the level's range for 周围, 前方, 远距离 and
 * 范围内 — the attack range without one.
 * @param {string} prefix @param {string} rangeId @returns {Pick<Strike, 'where' | 'range'> | null}
 */
function whereOf(prefix, rangeId) {
  if (/攻击范围/u.test(prefix)) return { where: 'attack' };
  if (!AREA.test(prefix)) return null;
  const range = rangeId ? cellsOf(rangeId) : undefined;
  return range ? { where: 'cells', range } : { where: 'attack' };
}

/**
 * The clauses of a sentence that are a strike's (技能-16): from the clause that begins it — 「（部署后）（立即）对／将／使…」, after only a
 * start word, a range change or a cost gained — to where another effect begins; null when there is none, or it is not one at the start.
 * @param {string} sentence @returns {string[] | null}
 */
function strikeClauses(sentence) {
  const parts = sentence.split(TAIL)[0].split('，'), at = parts.findIndex((p) => START.test(p));
  return at >= 0 && parts.slice(0, at).every((p) => LEAD.test(p)) && !LATER.test(parts.join('，')) ? parts.slice(at) : null;
}

/**
 * What a clause after the hit says about what rides on it (技能-16): a status, a push or pull, timed modifiers, 防御 ignored — a clause
 * the strike reads, so 技能-9 does not read it again as what every attack does.
 * @param {string} clause @param {Record<string, number>} bb
 */
const rides = (clause, bb) => statusesOf(clause, bb).length > 0 || DISPLACE.test(clause) || ignoreOf(clause, bb) !== null || /\{[\w.@]*duration\}秒内/u.test(clause);

/**
 * What rides on a hit (技能-16): the statuses, a push or pull, timed modifiers, 防御 ignored — read unless the text says it is for some of
 * the enemies only —, the operator's own modifiers of the keys it lowers, and whether it was read.
 * @param {string} text @param {{ bb: Record<string, number>, raw: string }} o
 */
function ridersOf(text, o) {
  if (SOME.test(text)) return { all: false, own: /** @type {string[]} */ ([]), riders: /** @type {Partial<Strike>} */ ({}) };
  const status = statusesOf(text, o.bb), low = debuffOf(text, o.raw, o.bb);
  return { all: true, own: low?.own ?? [], riders: keep({ status: status.length ? status : null, debuff: low?.debuff, displace: displaceOf(text, o.bb), ignoreDef: ignoreOf(text, o.bb) }) };
}

/**
 * The damage type of a strike, and a second one when the hit is two (陈 「物理和…法术伤害」): each enemy takes the 法术 one first (PRTS
 * 陈 revid 392050 二技能备注「先造成法术伤害，后造成物理伤害」), then the other.
 * @param {string | undefined} a the first type written @param {string | undefined} b the second @returns {{ type?: 'phys' | 'arts' | 'true', then?: 'phys' | 'arts' | 'true' }}
 */
function typesOf(a, b) {
  if (!a) return {};
  if (!b) return { type: DMG[a] };
  const [first, second] = b === '法术' ? [b, a] : [a, b];
  return { type: DMG[first], then: DMG[second] };
}

/**
 * The clauses a strike took (技能-16): those up to the end of the hit, and the ones after it that carry what rides on it.
 * @param {string[]} clauses @param {number} until where the hit ends in the clauses joined by 「，」 @param {boolean} all whether what rides on it was read @param {Record<string, number>} bb
 */
function usedOf(clauses, until, all, bb) {
  let from = 0;
  return clauses.filter((c) => { const first = from < until; from += c.length + 1; return first || (all && rides(c, bb)); });
}

/**
 * One sentence's clauses as a strike (技能-16), with the operator's modifiers of the keys it lowers and the clauses it took; null when
 * they are not one.
 * @param {string[]} clauses the strike's clauses @param {{ bb: Record<string, number>, raw: string, rangeId: string }} o
 * @returns {{ strike: Strike, own: string[], claims: boolean, used: string[] } | null}
 */
function strikeOf(clauses, o) {
  const text = clauses.join('，'), m = HIT.exec(text);
  if (!m) return null;
  const key = m[2] ?? m[3], scale = pos(o.bb, key), prefix = text.slice(0, m.index), where = whereOf(prefix, o.rangeId);
  if (!scale || !where) return null;
  const r = ridersOf(text, o), most = mostOf(prefix, o.bb), times = timesOf(text, m, o.bb);
  // statuses the sentence names before the damage (灵知 「造成{cold}秒寒冷和…伤害」, 可颂 「弹开并晕眩{stun}秒，造成…」) are given before it
  const first = !!r.riders.status && (statusesOf(prefix, o.bb).length > 0 || /\{[\w.@]+\}秒(?:晕眩|停顿|沉睡|寒冷|恐惧)和/u.test(m[0]));
  const aim = keep({ most, order: most && r.riders.displace?.pull ? 'farthest' : '', ground: /地面(?:敌人|目标)/u.test(text), times: times > 1 ? times : 0, first });
  return {
    strike: { at: 'start', scale, ...typesOf(m[4], m[5]), ...where, ...aim, ...r.riders },
    own: r.own, claims: key === 'atk_scale', used: usedOf(clauses, m.index + m[0].length, r.all, o.bb),
  };
}

/**
 * 缄默德克萨斯's 剑雨 at the end of a sentence (技能-16), as a strike every second after its first delay; the stun is the plain `stun`.
 * @param {string} sentence @param {Record<string, number>} bb @returns {{ strike: Strike, used: string[] } | null}
 */
function rainOf(sentence, bb) {
  const m = RAIN.exec(sentence), scale = pos(bb, 'atk_scale'), most = pos(bb, 'max_target'), stun = m && m[0].endsWith('晕眩') ? pos(bb, 'stun') : 0;
  if (!m || !scale || !most) return null;
  const strike = { at: /** @type {const} */ ('every'), scale, type: DMG[m[1]], where: /** @type {const} */ ('attack'), most, fly: true, every: { seconds: 1, first: RAIN_FIRST }, ...(stun ? { status: [{ key: /** @type {const} */ ('stun'), seconds: stun }] } : {}) };
  return { strike, used: m[0].slice(1).split('，') };
}

/**
 * Reads one sentence into what the description has so far (技能-16): a condition on a status goes to the strike before it; a strike — one that
 * says 「立即」 in a skill that runs — is kept with the clauses it took.
 * @param {{ strikes: Strike[], own: string[], claims: boolean, used: Set<string> }} found
 * @param {string} sentence @param {{ bb: Record<string, number>, raw: string, rangeId: string }} o @param {boolean} runs
 */
function takeSentence(found, sentence, o, runs) {
  const cond = IF_HAS.exec(sentence), last = found.strikes.at(-1);
  if (cond && last && pos(o.bb, cond[3])) last.status = [...(last.status ?? []), { key: STATUS[cond[2]], seconds: pos(o.bb, cond[3]), ifHas: STATUS[cond[1]] }];
  const clauses = runs && !/立即|立刻|开启技能时/u.test(sentence) ? null : strikeClauses(sentence), r = clauses ? strikeOf(clauses, o) : null;
  if (!r) return;
  found.strikes.push(r.strike);
  found.own.push(...r.own);
  for (const c of r.used) found.used.add(c);
  found.claims ||= r.claims;
  const rain = runs ? rainOf(sentence, o.bb) : null;
  if (rain) {
    found.claims = true;
    found.strikes.push(rain.strike);
    for (const c of rain.used) found.used.add(c);
  }
}

/**
 * The strikes a description reads (技能-16): each sentence (split at 。；, a line break) that is one. A skill that runs (a duration,
 * ammo, a passive one) has the strikes that say 「立即」 — at its start —; the others any. A skill whose `cost` is not a cost it gains
 * (凛御银灰's cuts another operator's) is not read. A sentence that follows one as a condition
 * on a status (「若…已经处于停顿状态，则额外…晕眩」) gives the strike that status for such an enemy; 「对飞行单位的攻击力系数加倍」 doubles
 * it on flying ones. `used` are the clauses the strikes took.
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {string} said the description, tags and closing-skill segments already gone
 * @returns {{ strikes: Strike[], own: string[], claims: boolean, used: Set<string> }}
 */
export function strikesOf(level, bb, said) {
  /** @type {{ strikes: Strike[], own: string[], claims: boolean, used: Set<string> }} */
  const found = { strikes: [], own: [], claims: false, used: new Set() };
  if ('cost' in bb && !/获得\{cost\}点/u.test(said)) return found;
  const runs = level.skillType === 'PASSIVE' || level.durationType === 'AMMO' || level.duration > 0 || /持续时间无限/u.test(level.description ?? '');
  const o = { bb, raw: (level.description ?? '').replace(/<[^>]*>/g, '').replace(/\\n/g, '\n'), rangeId: level.rangeId || '' };
  for (const sentence of said.split(/[。；\n]/u).map((x) => x.trim())) takeSentence(found, sentence, o, runs);
  if (/对飞行单位的攻击力系数加倍/u.test(said)) for (const s of found.strikes) s.air = 2;
  return found;
}

/**
 * What PRTS remarks say of a few skills' strikes and the description does not (技能-16), by the skill's id: 「※不可对空」 under 红 二技能
 * (revid 355503), 槐琥 二技能 (revid 393108) and 傀影 三技能 (revid 393104; its 虚影 has the same skill, `sktok_phatom_3`), so their strike takes
 * ground enemies only; 阿消 二技能「实际表现为向
 * 攻击范围内距离最近的一名地面敌人发射一枚抛射物。溅射半径为1，可以溅射到飞行单位」 (revid 392012), so its strike is a splash of that radius around
 * that enemy; 崖心 二技能 (revid 446671) and 暗索 二技能 (revid 446374) 「拉动弹道最大存在时间5秒；尝试拉动角色类单位时，将强制延续技能
 * 状态（无法回复技力），直至弹道达到最大存在时间」, so the skill stays for those seconds once its strike pulled.
 */
const GROUND_ONLY = new Set(['skchr_red_2', 'skchr_waaifu_2', 'skchr_phatom_3', 'sktok_phatom_3']);
const SPLASH = new Map([['skchr_sqrrel_2', 1]]);
const PULL_HOLD = new Map([['skchr_slchan_2', 5], ['skchr_rope_2', 5]]);

/**
 * A skill's strikes at its start with what the remarks above add (技能-16).
 * @param {string} id @param {{ extra?: NonNullable<SkillDef['extra']> }} found what skills.js read of the skill @returns {{ extra?: NonNullable<SkillDef['extra']> }}
 */
export function strikeNotes(id, found) {
  const bursts = found.extra?.bursts;
  if (!bursts || !(GROUND_ONLY.has(id) || SPLASH.has(id) || PULL_HOLD.has(id))) return found;
  const note = (/** @type {Strike} */ b) => {
    if (b.at !== 'start') return b;
    const { range: _cells, ...plain } = b, splash = SPLASH.get(id), hold = PULL_HOLD.get(id);
    return { ...(splash ? plain : b), ...(GROUND_ONLY.has(id) ? { ground: true } : {}), ...(splash ? { where: /** @type {const} */ ('attack'), around: splash } : {}), ...(hold && b.displace?.pull ? { hold } : {}) };
  };
  return { extra: { ...found.extra, bursts: bursts.map(note) } };
}

/** A description that says the skill has no end of its own (技能-4), as skills.js reads it. */
const FOREVER = /持续时间无限/u;

/**
 * What 技能-16 adds to a skill's extras: its strikes at the start (before the end bursts 技能-14 reads), the operator's own
 * modifiers of the keys a strike lowers — 0, they are not its own —, and `hitScale` when a strike's scale is the plain `atk_scale`.
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {string} said the description, tags and closing-skill segments already gone
 * @param {NonNullable<SkillDef['extra']>} extra what 技能-9, 技能-14 and 技能-15 read
 * @returns {Partial<NonNullable<SkillDef['extra']>>}
 */
export function strikeExtra(level, bb, said, extra) {
  const { strikes, own, claims } = strikesOf(level, bb, said);
  if (!strikes.length) return {};
  return {
    bursts: [...strikes, ...(extra.bursts ?? [])],
    ...(own.length ? { mods: { ...extra.mods, ...Object.fromEntries(own.map((k) => [k, 0])) } } : {}),
    ...(claims ? { hitScale: /** @type {const} */ ('attack') } : {}),
  };
}

/**
 * A description without the clauses a strike took (技能-16), for 技能-9 to read: 「并使命中目标晕眩{stun}秒」 after a strike is what the
 * strike does, not what each of the skill's attacks does.
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {string} said the description, tags and closing-skill segments already gone
 */
export function withoutStrikes(level, bb, said) {
  const { used } = strikesOf(level, bb, said);
  if (used.size === 0) return said;
  return said.split(/([。；\n])/u).map((s) => (s.length === 1 && /[。；\n]/u.test(s) ? s : s.split('，').filter((c) => !used.has(c.trim())).join('，'))).join('');
}

/**
 * Whether a skill acts at once (技能-16): no duration, not passive or ammo, with a strike at its start whose scale is the plain
 * `atk_scale` — its attack keys are that hit's, not a next attack's — and no `attack@` key, which is for attacks.
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {SkillDef['extra']} extra @returns {{ instant?: true }}
 */
export function instantOf(level, bb, extra) {
  const quiet = level.skillType !== 'PASSIVE' && level.durationType !== 'AMMO' && !(level.duration > 0) && !FOREVER.test(level.description ?? '');
  const starts = extra?.hitScale === 'attack' && !!extra.bursts?.some((b) => b.at === 'start');
  return quiet && starts && !Object.keys(bb).some((k) => k.startsWith('attack@')) ? { instant: true } : {};
}
