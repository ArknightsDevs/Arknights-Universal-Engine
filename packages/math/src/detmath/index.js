// Math that gives the same bits on every conforming JavaScript engine (ADR 0011, spec 数值-2…数值-5).
//
// ECMA-262 lets Math.hypot, sin, cos, atan2 and pow (and **) return implementation-approximated values, and engines
// differ in the last bits. + − × ÷ and Math.sqrt are correctly rounded IEEE 754 operations, and JavaScript fuses
// nothing (no FMA, no extended precision), so code built only from them is reproducible bit for bit. The simulation
// may not call the approximated functions (the determinism lint rules); it calls these.
export { hypot } from './hypot.js';
export { powi } from './powi.js';
export { sin, cos } from './trig.js';
export { atan2 } from './atan.js';
