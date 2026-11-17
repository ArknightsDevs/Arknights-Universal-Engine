// How many times a next attack hits when its description says so (docs/spec/skills.md 技能-9): 「且额外攻击一次」,
// 「并连续攻击两次」, 「下次攻击变为三连击」, 「下次攻击对目标造成两次相当于攻击力{atk_scale}的物理伤害」. One clause each; the plain
// `atk_scale` stays the attack's 倍率 (the sentence names no other key), and a blackboard `times` still wins (技能-5).

const NUMBER = Object.freeze(/** @type {Record<string, number>} */ ({ 一: 1, 二: 2, 两: 2, 三: 3, 1: 1, 2: 2, 3: 3 }));

/** The clause shapes, each with what its number means: the extra hits (the attack itself is one more) or all the hits. @type {[RegExp, number][]} */
const SHAPES = [
  [/^(?:且|并)?额外攻击(一|两|二|1|2)次$/u, 1],
  [/^(?:下一?次攻击)?(?:且|并)?连续攻击(两|二|三|2|3)次$/u, 0],
  [/^下一?次攻击变为(?:攻击力\{atk_scale\}的)?(二|三|2|3)连击$/u, 0],
  [/^下一?次攻击(?:对[^，]*?)?造成(两|三)次相当于攻击力\{(?:attack@)?atk_scale\}的(?:物理|法术|真实)伤害$/u, 0],
];

/**
 * The hits of a next attack one clause gives (技能-9), or 0 for a clause that says none.
 * @param {string} s one clause of a description, its placeholders as {key}
 */
export function repeatOf(s) {
  for (const [re, more] of SHAPES) {
    const m = re.exec(s);
    if (m) return NUMBER[m[1]] + more;
  }
  return 0;
}
