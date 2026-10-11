// The tests with Node's coverage and its thresholds over the pure mechanics modules (tools/coverage.json, ADR 0042).
//   node tools/coverage.mjs              exit ≠ 0 when a test fails or a threshold is missed
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cfg = JSON.parse(readFileSync(new URL('coverage.json', import.meta.url), 'utf8'));
const args = [
  '--test', '--experimental-test-coverage',
  `--test-coverage-branches=${cfg.branches}`, `--test-coverage-lines=${cfg.lines}`, `--test-coverage-functions=${cfg.functions}`,
  ...cfg.include.map((/** @type {string} */ g) => `--test-coverage-include=${g}`),
  'packages/*/test/**/*.test.js', 'tools/test/**/*.test.js',
];
const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
process.exitCode = r.status ?? 1;
