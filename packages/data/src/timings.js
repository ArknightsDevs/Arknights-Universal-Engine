// Attack timings from Spine skeletons (docs/spec/combat.md 攻击-2, docs/spec/spine.md 骨骼-6): which clip is a unit's
// attack, its length, and its first OnAttack time — what the battle needs, written to the content data.
import { readSkeleton, animationTimes } from '@aue/spine';

/**
 * The attack clip among a skeleton's animations (攻击-2): `Attack` when there is one, else `Attack_Loop`, else the
 * first whose name starts with "attack" (any case), else `Combat`; null when none is.
 * @param {string[]} names in the skeleton's order @returns {string | null}
 */
export function attackClip(names) {
  for (const n of ['Attack', 'Attack_Loop']) if (names.includes(n)) return n;
  return names.find((n) => /^attack/i.test(n)) ?? (names.includes('Combat') ? 'Combat' : null);
}

/**
 * A unit's attack timing from its skeleton's bytes (攻击-2): the attack clip, its length and its first OnAttack, in
 * seconds as the file writes them; null when it has no attack clip or the clip has no OnAttack.
 * @param {Uint8Array} bytes @returns {{ clip: string, duration: number, hit: number } | null}
 */
export function attackTiming(bytes) {
  const times = animationTimes(readSkeleton(bytes)), clip = attackClip(Object.keys(times));
  if (clip === null || times[clip].hits.length === 0) return null;
  return { clip, duration: times[clip].duration, hit: times[clip].hits[0] };
}

/**
 * Checks an operator's timing against its source's frame data (ADR 0014, 0019): the source's OnAttack time for the clip
 * (seconds, rounded to 5 places), which must be within 10⁻⁵ s of ours. Returns the problem, or null.
 * @param {{ clip: string, hit: number }} timing @param {unknown} frames the source's frame data of the operator
 * @returns {string | null}
 */
export function frameProblem(timing, frames) {
  const front = /** @type {any} */ (frames)?.BattleFront?.base?.animations?.[timing.clip]?.events?.OnAttack;
  if (!front || typeof front.time !== 'number') return `no OnAttack for ${timing.clip} in the frame data`;
  return Math.abs(front.time - timing.hit) <= 1e-5 ? null : `${timing.clip}: OnAttack ${timing.hit} here, ${front.time} in the frame data`;
}
