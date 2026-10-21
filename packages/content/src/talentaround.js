// Talents on the operators around, in range and on the field (docs/spec/operators.md 干员-31): modifiers by the allies
// or 高台 tiles around, for the blocked enemies beyond the first, on a map with water; auras on the tiles around or
// behind, for those in range with less HP, for the field by rarity, block count, ammo skills, faction and HP; shares of
// a gain with allies chosen at random; a deck part by deploy cost; kill stacks shared with a faction — as additions to
// the trait (职业-32), in-range talents (部署-6) and deck parts (干员-9).
import { whomOf } from './talents.js';
import { plainOf, byEnd, all } from './talentparts.js';

/** @typedef {import('./talents.js').Talent} Talent @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').TeamTalent} TeamTalent */
/** @typedef {import('@aue/sim').RangeTalent} RangeTalent */
/** @typedef {{ trait?: Partial<TraitDef>, range?: RangeTalent[], deck?: TeamTalent[] }} Around */

/** 庇护 of a share: the physical and arts damage taken × (1 − it) (干员-22). @param {number} v */
const shelter = (v) => ({ physTakenMul: 1 - v, artsTakenMul: 1 - v });
/** The tiles around an operator: its own and the 8, or the 4, next to it; without its own. */
const NINE = Object.freeze([-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col }))));
const EIGHT = Object.freeze(NINE.filter((t) => t.row !== 0 || t.col !== 0));
const FOUR = Object.freeze([{ row: 1, col: 0 }, { row: -1, col: 0 }, { row: 0, col: 1 }, { row: 0, col: -1 }]);
/** Star counts in Chinese. */
const STARS = Object.freeze(/** @type {Record<string, number>} */ ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }));
/** A faction's id by its name (干员-10), or null. @param {string} name */
const powerNamed = (name) => { const w = whomOf(name); return w && 'power' in w ? w.power : null; };
/** A profession's id by its name (干员-9), or null. @param {string} name */
const professionNamed = (name) => { const w = whomOf(name); return w && 'profession' in w ? w.profession : null; };

/**
 * The talents of 干员-31, whole descriptions, and what each adds: 浊心斯卡蒂, 维娜·维多利亚, 撷英调香师, 百炼嘉维尔, 暴行,
 * 鞭刃, 杜宾, 桑葚, 新约能天使, 缇缇, 凛御银灰, 拜松, 锡兰, 薄绿, 苍苔, 深律, 万顷, 行箸, 苏苏洛, 乌尔比安, 圣约送葬人, 隐现,
 * 但书, 迷迭香.
 */
const AROUND = Object.freeze(/** @type {[RegExp, (bb: Record<string, number>, m: RegExpExecArray) => Around | null][]} */ ([
  [/^自身或\S+?攻击范围内存在我方干员时[，,]自身攻击力[+＋]\d+(?:\.\d+)?%[；;]存在【([^】]+)】干员时改为攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb, m) => {
    const power = powerNamed(m[1]), one = byEnd(bb, '[1].atk'), two = byEnd(bb, '[2].atk');
    return power && all([one, two]) ? { trait: { whiles: [{ when: 'rangeAllyOnly', power, mods: { atkPct: /** @type {number} */ (one) } },
      { when: 'rangeAlly', power, mods: { atkPct: /** @type {number} */ (two) } }] } } : null;
  }],
  [/^自身与周围8格友方单位受到的物理伤害减少\d+(?:\.\d+)?%[，,]且此范围内每个友方单位使\S+?攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb) => (all([bb.damage_resistance, bb.atk])
    ? { trait: { whiles: [{ when: 'always', mods: { physTakenMul: 1 - bb.damage_resistance } }, { when: 'alliesNear', per: 8, mods: { atkPct: bb.atk } }] },
      range: [{ side: 'ally', ranged: false, area: [...EIGHT], mods: { physTakenMul: 1 - bb.damage_resistance } }] } : null)],
  [/^使攻击范围内除自身外当前生命比例小于等于自身的友军获得\d+(?:\.\d+)?%的庇护$/u, (bb) => (all([bb.damage_resistance])
    ? { range: [{ side: 'ally', ranged: false, others: true, when: { when: 'hpRatioAtMostSrc' }, mods: shelter(bb.damage_resistance) }] } : null)],
  [/^攻击力和防御力提升\d+(?:\.\d+)?%[，,]每再阻挡一个敌人提升\d+(?:\.\d+)?%$/u, (bb) => (all([bb.atk, bb.def, bb.atk_add, bb.def_add])
    ? { trait: { whiles: [{ when: 'always', mods: { atkPct: bb.atk, defPct: bb.def } }, { when: 'blockedExtra', per: 9, mods: { atkPct: bb.atk_add, defPct: bb.def_add } }] } } : null)],
  [/^周围四格中有两格以上的高地地形时攻击力和防御力[+＋]\d+(?:\.\d+)?%$/u, (bb) => (all([bb.cnt, bb.atk, bb.def])
    ? { trait: { whiles: [{ when: 'highAround', value: bb.cnt, mods: { atkPct: bb.atk, defPct: bb.def } }] } } : null)],
  [/^在场时阻挡数大于等于(\d)的友方近战单位攻速[+＋]\d+[，,]防御[+＋]\d+(?:\.\d+)?%$/u, (bb, m) => (all([bb.attack_speed, bb.def])
    ? { trait: { fieldBuffs: [{ melee: true, minBlock: Number(m[1]), mods: { aspd: bb.attack_speed, defPct: bb.def } }] } } : null)],
  [/^在场时[，,]所有([一二三四五六])星干员的攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb, m) => (all([bb.atk]) ? { trait: { fieldBuffs: [{ rarity: STARS[m[1]], mods: { atkPct: bb.atk } }] } } : null)],
  [/^场上存在\S+?和另外至少一名【([^】]+)】干员时[，,]所有【\1】干员的攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb, m) => {
    const profession = professionNamed(m[1]);
    return profession && all([bb.atk]) ? { trait: { fieldBuffs: [{ profession, needOther: true, mods: { atkPct: bb.atk } }] } } : null;
  }],
  [/^在场时[，,]携带弹药类技能的干员攻击力[+＋]\d+(?:\.\d+)?%[，,]对【([^】]+)】干员的效果翻倍$/u, (bb, m) => {
    const power = powerNamed(m[1]);
    return power && all([bb.atk, bb.mult]) ? { trait: { fieldBuffs: [{ ammo: true, mods: { atkPct: bb.atk }, double: { power, mul: bb.mult } }] } } : null;
  }],
  [/^场上的【([^】]+)】或【([^】]+)】干员生命值高于\d+(?:\.\d+)?%时[，,]获得[+＋]\d+攻速的精力充沛$/u, (bb, m) => {
    const powers = [powerNamed(m[1]), powerNamed(m[2])];
    return powers.every((p) => p) && all([bb.attack_speed, bb.hp_ratio])
      ? { trait: { fieldBuffs: [{ powers: /** @type {string[]} */ (powers), hpAbove: bb.hp_ratio, mods: { aspd: bb.attack_speed } }] } } : null;
  }],
  [/^在场时[，,]【([^】]+)】干员免疫冻结[，,]防御力[+＋]\d+且每秒回复\d+(?:\.\d+)?%最大生命值[；;]\S+?在场\d+秒后[，,]防御力和生命回复效果翻倍$/u, (bb, m) => {
    const power = powerNamed(m[1]);
    return power && all([bb.def, bb.hp_recovery_per_sec_by_max_hp_ratio, bb.interval]) ? { trait: { fieldBuffs: [{ power, mods: { defFlat: bb.def, hpRegenRatio: bb.hp_recovery_per_sec_by_max_hp_ratio },
      flags: { 'immune:freeze': true }, after: bb.interval, afterMul: 2 }] } } : null;
  }],
  [/^在场时自身防御力[+＋]\d+[，,]自己身后的如果是【([^】]+)】或【([^】]+)】干员也能享受到相同效果$/u, (bb, m) => {
    const professions = [professionNamed(m[1]), professionNamed(m[2])];
    return professions.every((p) => p) && all([bb.def]) ? { trait: { whiles: [{ when: 'always', mods: { defFlat: bb.def } }] },
      range: [{ side: 'ally', ranged: false, area: [{ row: 0, col: -1 }], rotate: true, professions: /** @type {string[]} */ (professions), mods: { defFlat: bb.def } }] } : null;
  }],
  [/^攻击力[+＋]\d+(?:\.\d+)?%[，,]当场地中存在水地形时改为攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb) => {
    const common = byEnd(bb, '[common].atk'), map = byEnd(bb, '[map].atk');
    return all([common, map]) ? { trait: { whiles: [{ when: 'waterMap', mods: { atkPct: /** @type {number} */ (common) + /** @type {number} */ (map) } },
      { when: 'noWaterMap', mods: { atkPct: /** @type {number} */ (common) } }] } } : null;
  }],
  [/^技能未开启时[，,]周围四格友方单位的防御力[+＋]\d+(?:\.\d+)?%[；;]技能开启时[，,]自身不容易受到敌人攻击$/u, (bb) => (all([bb.def, bb.taunt_level])
    ? { trait: { whiles: [{ when: 'inSkill', mods: { taunt: bb.taunt_level } }] }, range: [{ side: 'ally', ranged: false, area: [...FOUR], srcWhen: 'notInSkill', mods: { defPct: bb.def } }] } : null)],
  [/^未阻挡敌人时使周围8格内近战干员防御力[+＋]\d+(?:\.\d+)?%[，,]阻挡敌人时自身防御力[+＋]\d+(?:\.\d+)?%$/u, (bb) => {
    const ally = byEnd(bb, '_ally.def'), self = byEnd(bb, '_self.def');
    return all([ally, self]) ? { trait: { whiles: [{ when: 'blocking', mods: { defPct: /** @type {number} */ (self) } }] },
      range: [{ side: 'ally', ranged: false, melee: true, area: [...EIGHT], srcWhen: 'notBlocking', mods: { defPct: /** @type {number} */ (ally) } }] } : null;
  }],
  [/^法术抗性[+＋]\d+[，,]周围8格有友方干员时[，,]法术抗性额外[+＋]\d+$/u, (bb) => {
    const self = byEnd(bb, '[self].magic_resistance'), ally = byEnd(bb, '[ally].magic_resistance');
    return all([self, ally]) ? { trait: { whiles: [{ when: 'always', mods: { resFlat: /** @type {number} */ (self) } },
      { when: 'alliesNear', value: 1, mods: { resFlat: /** @type {number} */ (ally) } }] } } : null;
  }],
  [/^周围8格的干员最大生命值[+＋]\d+(?:\.\d+)?%[，,]若部署方向与\S+?相同[，,]改为[+＋]\d+(?:\.\d+)?%$/u, (bb) => {
    const common = byEnd(bb, '[hp_common].max_hp'), extra = byEnd(bb, '[hp_extra].max_hp');
    return all([common, extra]) ? { range: [{ side: 'ally', ranged: false, area: [...NINE], mods: { hpPct: /** @type {number} */ (common) } },
      { side: 'ally', ranged: false, area: [...NINE], when: { when: 'sameDir' }, mods: { hpPct: /** @type {number} */ (extra) } }] } : null;
  }],
  [/^使攻击范围内除自己外(\d)名友军获得\d+(?:\.\d+)?%的庇护$/u, (bb, m) => (all([bb.damage_resistance])
    ? { trait: { shareGain: { inRange: true, count: Number(m[1]), mods: shelter(bb.damage_resistance) } } } : null)],
  [/^编入队伍时[，,]所有初始费用不超过\d+的干员受到的治疗效果提升\d+(?:\.\d+)?%$/u, (bb) => (all([bb.cost, bb.heal_scale])
    ? { deck: [{ when: 'deck', all: true, maxCost: bb.cost, bb: {}, mods: { healingTakenMul: bb.heal_scale } }] } : null)],
  [/^每次击倒一名敌人时[，,]自身的生命上限提高\d+[，,]攻击力提高\d+[，,]最多叠加\d+次[，,]其他【([^】]+)】干员获得\d+%的提高效果$/u, (bb, m) => {
    const power = powerNamed(m[1]), hp = byEnd(bb, '].max_hp'), atk = byEnd(bb, '].atk');
    return power && all([bb.max_stack_cnt, bb.max_hp, bb.atk, hp, atk]) ? { trait: { stacks: [{ on: 'kill', max: bb.max_stack_cnt, shared: true, mods: { hpFlat: bb.max_hp, atkFlat: bb.atk } }],
      stackShare: { power, mods: { hpFlat: /** @type {number} */ (hp), atkFlat: /** @type {number} */ (atk) } } } } : null;
  }],
  [/^每有一个【([^】]+)】干员在场[，,]自身的弹药类技能弹药上限[+＋]\d+$/u, (bb, m) => {
    const power = powerNamed(m[1]);
    return power && all([bb.add_count, bb.add_count_max_stack]) ? { trait: { whiles: [{ when: 'powerOnField', power, per: bb.add_count_max_stack, mods: { ammoFlat: bb.add_count } }] } } : null;
  }],
  [/^在场停留\d+(?:\.\d+)?秒后[，,]自身弹药类技能弹药上限[+＋]\d+[，,]其他随机一名【([^】]+)】干员的弹药类技能弹药上限[+＋]\d+$/u, (bb, m) => {
    const power = powerNamed(m[1]);
    return power && all([bb.self_ammo, bb.duration, bb.ally_ammo]) ? { trait: { whiles: [{ when: 'onFieldFor', value: bb.duration, mods: { ammoFlat: bb.self_ammo } }],
      shareGain: { power, ammo: true, count: 1, after: bb.duration, mods: { ammoFlat: bb.ally_ammo } } } } : null;
  }],
  [/^攻击速度[+＋]\d+[，,]置入战场后这个效果会同样赋予给一名随机【([^】]+)】干员$/u, (bb, m) => {
    const power = powerNamed(m[1]);
    return power && all([bb.attack_speed]) ? { trait: { whiles: [{ when: 'always', mods: { aspd: bb.attack_speed } }], shareGain: { power, count: 1, mods: { aspd: bb.attack_speed } } } } : null;
  }],
  [/^部署后随机选择一名在场的【([^】]+)】干员[，,]自身和其的攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb, m) => {
    const profession = professionNamed(m[1]);
    return profession && all([bb.atk]) ? { trait: { shareGain: { profession, count: 1, self: true, mods: { atkPct: bb.atk } } } } : null;
  }],
]));

/**
 * The parts of a talent of 干员-31: its whole description (plainOf) one of AROUND with the keys it needs; null otherwise,
 * and for hidden talents.
 * @param {Talent} c @returns {Around | null}
 */
export function aroundParts(c) {
  if (c.hidden || !c.description) return null;
  const text = plainOf(c);
  for (const [re, make] of AROUND) {
    const m = re.exec(text);
    if (m) return make(c.bb, m);
  }
  return null;
}
