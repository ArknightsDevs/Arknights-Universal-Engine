// @aue/lint: one ESLint setup for AUE and the projects built on it, so the limits and rules cannot drift apart.
//
//   import { aueConfig } from '@aue/lint';
//   export default aueConfig({ deterministic: ['packages/sim/**', 'packages/mode-*/**'], exempt: [...] });
import js from '@eslint/js';
import globals from 'globals';
import { SOURCE_LIMITS, TEST_LIMITS, limitRules } from './limits.js';
import { determinismRules } from './determinism.js';
import { packageBoundaries } from './boundaries.js';
import { fieldOwnership } from './field-ownership.js';

export { SOURCE_LIMITS, TEST_LIMITS, limitRules, determinismRules, packageBoundaries, fieldOwnership };

/** The plugin with AUE's own rules. */
export const plugin = { meta: { name: '@aue/lint' }, rules: { 'package-boundaries': packageBoundaries, 'field-ownership': fieldOwnership } };

const TESTS = ['**/test/**/*.js', '**/test/**/*.mjs'];

/**
 * @typedef {object} Options
 * @property {string[]} [ignores] paths ESLint skips
 * @property {string[]} [deterministic] globs of code that must give the same bits on every engine
 * @property {{ files: string[], fields: Record<string, string[]> }} [fieldOwnership] the unit-field ownership table (ADR 0045) for the files it governs; tests are exempt
 * @property {{ files: string[], rules: import('eslint').Linter.RulesRecord, reason: string }[]} [exempt] limit exemptions, each with a reason
 */

/**
 * The flat config.
 * @param {Options} [opts]
 * @returns {import('eslint').Linter.Config[]}
 */
export function aueConfig(opts = {}) {
  const { ignores = [], deterministic = [], exempt = [], fieldOwnership: owned } = opts;
  for (const e of exempt) if (!e.reason?.trim()) throw new Error(`@aue/lint: the exemption for ${e.files.join(', ')} needs a reason`);
  return [
    { ignores: ['**/node_modules/', '**/coverage/', '**/.cache/', ...ignores] },
    js.configs.recommended,
    {
      files: ['**/*.js', '**/*.mjs'],
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
      plugins: { aue: plugin },
      rules: {
        ...limitRules(SOURCE_LIMITS),
        'aue/package-boundaries': 'error',
        'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
        eqeqeq: ['error', 'always', { null: 'ignore' }],
        'no-var': 'error',
        'prefer-const': 'error',
      },
    },
    { files: TESTS, rules: limitRules(TEST_LIMITS) },
    ...(deterministic.length ? [{ files: deterministic, ignores: TESTS, rules: determinismRules() }] : []),
    ...(owned ? [{ files: owned.files, ignores: TESTS, rules: { 'aue/field-ownership': /** @type {['error', object]} */ (['error', { fields: owned.fields }]) } }] : []),
    ...exempt.map(({ files, rules }) => ({ files, rules })),
  ];
}
