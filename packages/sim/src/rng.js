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

/**
 * A uniform draw in [0, 1) from the battle's generator (随机-1), advancing it.
 * @param {{ rng: number }} w the world @returns {number}
 */
export function draw(w) {
  const [v, next] = nextUint32(w.rng);
  w.rng = next;
  return v / 4294967296;
}

/**
 * A weighted pick (随机-2): X uniform in [0, total) is reduced by each weight in order until it is at most 0; that one
 * is chosen. A single choice is taken without a draw.
 * @param {{ rng: number }} w the world @param {number[]} weights at least one @returns {number} the index chosen
 */
export function weightedPick(w, weights) {
  if (weights.length === 1) return 0;
  let x = draw(w) * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length - 1; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}
