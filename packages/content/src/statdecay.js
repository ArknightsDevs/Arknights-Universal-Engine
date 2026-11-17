// A bonus that wears off while the skill runs (docs/spec/skills.md 技能-4): 「部署后防御力+{def:0%}，在{duration}秒内持续衰减」 (砾's
// 影袭). The attribute keys written before the words, as a percentage, are the ones that decay, evenly to 0 over the blackboard's
// `duration`; the sim (packages/sim/src/skilltext.js) works out the steps. It decays the share the key becomes (`defPct`), which
// a number written without a percent (a flat bonus) is not.
import { skills } from '@aue/sim';

/** The clause that says the bonus wears off, its placeholders as {key}. */
const DECAY = /^(?:并)?在\{duration\}秒内持续衰减$/u;

/** A text with its placeholders as {key}, their formats gone. @param {string} s */
const bare = (s) => s.replace(/\{([^}:]*)(?::[^}]*)?\}/g, '{$1}');

/**
 * The attribute keys that decay and the seconds they take (技能-4), or none: the sentence's clause before 「在{duration}秒内持续衰减」,
 * its placeholders that are the operator's own attribute keys (技能-5) and are written with a percent (`{def:0%}`).
 * @param {string} text the description, tags removed, its placeholders with their formats @param {Record<string, number>} bb
 * @returns {{ decay?: { seconds: number, keys: string[] } }}
 */
export function statDecayOf(text, bb) {
  if (!(bb.duration > 0)) return {};
  for (const sentence of text.split(/[。；\n]/u)) {
    const clauses = sentence.split('，').map((s) => s.trim()), at = clauses.findIndex((s) => DECAY.test(bare(s)));
    if (at < 1) continue;
    const keys = [...clauses[at - 1].matchAll(/\{([^}:]+)(?::([^}]*))?\}/g)].filter((m) => (m[2] ?? '').includes('%')).map((m) => m[1])
      .filter((k) => k in skills.STAT_KEYS && Number.isFinite(bb[k]));
    if (keys.length) return { decay: { seconds: bb.duration, keys } };
  }
  return {};
}
