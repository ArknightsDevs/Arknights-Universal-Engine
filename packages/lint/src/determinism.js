// Determinism rules for the code every peer and the server run to the same bits (ADR: numerics). Engines differ in the
// last bits of Math.sin / cos / atan2 / hypot / pow / exp / log …; `**` is pow. Math.sqrt, abs, floor, round, min, max,
// imul and + − × ÷ are exact. Time is integer frames, never the wall clock, and randomness comes from the battle's seed.

const INEXACT_MATH = ['hypot', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh',
  'atanh', 'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'cbrt', 'random'];

const WALL_CLOCK = ['Date', 'performance', 'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'queueMicrotask'];

/** @returns {import('eslint').Linter.RulesRecord} the rules for deterministic code */
export function determinismRules() {
  return {
    'no-restricted-properties': ['error', ...INEXACT_MATH.map((property) => ({
      object: 'Math', property, message: 'not bit-identical across engines (or not seeded): use @aue/math',
    }))],
    'no-restricted-globals': ['error', ...WALL_CLOCK.map((name) => ({
      name, message: 'the simulation runs on frames, not on the wall clock',
    }))],
    'no-restricted-syntax': ['error',
      { selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']", message: '** is Math.pow: not bit-identical across engines' },
      { selector: "CallExpression[callee.property.name='sort'][arguments.length=0]", message: 'sort() without a comparator compares strings: pass a comparator' },
      { selector: "CallExpression[callee.property.name='toSorted'][arguments.length=0]", message: 'toSorted() without a comparator compares strings: pass a comparator' },
    ],
  };
}
