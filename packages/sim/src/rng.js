// The battle's random numbers (spec 随机-1): mulberry32 on a 32-bit state kept in the world, so a snapshot carries it
// and every engine draws the same sequence (only Math.imul, shifts and xor: exact on every engine).

/**
 * The next 32-bit value and the new state.
 * @param {number} state uint32 @returns {[number, number]} [value uint32, state uint32]
 */
export function nextUint32(state) {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, s];
}

/** The initial state from a seed (any integer). @param {number} seed */
export const seedState = (seed) => seed >>> 0;
