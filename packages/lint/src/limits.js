// Maintainability limits (ADR: maintainability rules). Errors, not warnings: CI is the gate. Blank lines and comments are
// not counted. Exemptions go in the consuming eslint.config.js with a reason, never in inline comments (noInlineConfig).

/** @typedef {{ fileLines: number, functionLines: number, complexity: number, depth: number, params: number }} Limits */

/** @type {Readonly<Limits>} source code */
export const SOURCE_LIMITS = Object.freeze({ fileLines: 500, functionLines: 60, complexity: 15, depth: 4, params: 5 });

/** @type {Readonly<Limits>} tests: longer files and test bodies, simpler logic */
export const TEST_LIMITS = Object.freeze({ fileLines: 600, functionLines: 100, complexity: 10, depth: 4, params: 5 });

/**
 * The ESLint rules for a set of limits.
 * @param {Limits} l
 * @returns {import('eslint').Linter.RulesRecord}
 */
export function limitRules(l) {
  return {
    'max-lines': ['error', { max: l.fileLines, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['error', { max: l.functionLines, skipBlankLines: true, skipComments: true, IIFEs: true }],
    complexity: ['error', l.complexity],
    'max-depth': ['error', l.depth],
    'max-params': ['error', l.params],
  };
}
