// The tests with Node's coverage and its thresholds over the pure mechanics modules (the repository's
// tools/coverage.json, ADR 0042).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** @typedef {{ include: string[], tests?: string[], branches: number, lines: number, functions: number }} CoverageConfig */

const TESTS = ['packages/*/test/**/*.test.js'];

/** @param {CoverageConfig} cfg @returns {string[]} the node arguments */
export function coverageArgs(cfg) {
  return [
    '--test', '--experimental-test-coverage',
    `--test-coverage-branches=${cfg.branches}`, `--test-coverage-lines=${cfg.lines}`, `--test-coverage-functions=${cfg.functions}`,
    ...cfg.include.map((g) => `--test-coverage-include=${g}`),
    ...(cfg.tests ?? TESTS),
  ];
}

/** Runs the tests with coverage in the repository; returns the exit status. @param {string} root */
export function runCoverage(root) {
  /** @type {CoverageConfig} */
  const cfg = JSON.parse(readFileSync(join(root, 'tools', 'coverage.json'), 'utf8'));
  return spawnSync(process.execPath, coverageArgs(cfg), { cwd: root, stdio: 'inherit' }).status ?? 1;
}
