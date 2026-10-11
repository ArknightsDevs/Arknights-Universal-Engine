// Rounding to an integer, ties to even (spec 数值-6): the official client finds the tile of a position with a round
// function that rounds half to even (四舍六入五成双). Math.round rounds halves up instead (2.5 → 3); here 2.5 → 2,
// 3.5 → 4, −2.5 → −2. Exact for every double; never returns −0.

/** @param {number} x a finite number @returns {number} */
export function roundHalfEven(x) {
  const f = Math.floor(x), frac = x - f;
  if (frac !== 0.5) return Math.round(x) + 0;
  return (f % 2 === 0 ? f : f + 1) + 0;
}
