// An attribute key with a namespace (docs/spec/skills.md 技能-5): `reed2_skil_3[switch_mode].atk`, `nian_s_3[self].atk`,
// `makiri_s_2[passive].atk`. A skill whose description writes 「攻击力+{<这个键>:0%}」 as a sentence of its own gives
// the operator that attribute; the blackboard may have no bare `atk` at all.
import { skills } from '@aue/sim';

/** The attributes a description names and the key each is. @type {Record<string, string>} */
const ATTRS = { 攻击力: 'atk', 防御力: 'def', 生命上限: 'max_hp', 最大生命值: 'max_hp', 攻击速度: 'attack_speed', 法术抗性: 'magic_resistance', 阻挡数: 'block_cnt', 移动速度: 'move_speed' };
/** A sentence of the operator's own attribute: a time word at most, then 「<attribute>+{key}」 — not 「周围其他友方干员的防御力+」, 「接下来攻击力+」, 「后续攻击力+」. */
const OWN_CLAUSE = /^(?:技能(?:持续)?(?:期间|时间)内?|持续时间内|开启(?:技能)?时|部署后|并|且|同时)?(攻击力|防御力|生命上限|最大生命值|攻击速度|法术抗性|阻挡数|移动速度)[+＋]\{([^}:]+)(?::([^}]*))?\}/u;
/** Tags of a namespaced key that name something other than the operator's own, always-on attribute: allies, a summon, a debuff, a state it must be in. */
const NOT_OWN = /(?:^|[^a-z_])(?:ally|token|to_token|debuff|rage|extra|peak_performance|respawn_buff|overload_start|stack)(?:[^a-z_]|$)/u;
/** The attributes shown as a share, which a number shown without a percent is not (技能-5). */
const SHARES = new Set(['atk', 'def', 'max_hp']);

/** The attribute a namespaced key ends with: `…[mode].atk` → `atk`. Null for a key with no namespace. @param {string} key */
function statOf(key) {
  if (!/[.[]/u.test(key)) return null;
  const last = key.split(/[.\]]/u).pop() ?? '';
  return Object.values(ATTRS).includes(last) ? last : null;
}

/**
 * The attributes a description gives the operator under a namespaced key (技能-5): each sentence of the form
 * 「<attribute>+{<namespaced key>}」 whose key ends with that attribute — shown with a percent for 攻击力, 防御力 and
 * 生命上限 — as the modifier of the generic effect (`skills.statMods`), over a bare key of the blackboard.
 * @param {string} description the level's description, tags gone, line breaks as such @param {Readonly<Record<string, number>>} bb
 * @returns {Record<string, number>}
 */
export function namedStatMods(description, bb) {
  /** @type {Record<string, number>} */
  const mods = {};
  for (const clause of description.split(/[，。；\n]/u)) {
    const m = OWN_CLAUSE.exec(clause.trim());
    if (!m || NOT_OWN.test(m[2]) || !Number.isFinite(bb[m[2]]) || statOf(m[2]) !== ATTRS[m[1]]) continue;
    if (SHARES.has(ATTRS[m[1]]) && !(m[3] ?? '').includes('%')) continue;
    Object.assign(mods, skills.statMods({ [ATTRS[m[1]]]: bb[m[2]] }));
  }
  return mods;
}
