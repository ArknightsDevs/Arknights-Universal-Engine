#!/usr/bin/env node
// aue-check: the repository checks of AUE and the projects built on it, run in the current directory.
//   aue-check            dependencies, spec tracing, registry
//   aue-check deps | spec | registry
//   aue-check coverage   the tests with coverage thresholds (tools/coverage.json)
//   aue-check oracle     fetch the pinned Stronghold oracle (the engine's .cache/oracle) if it is missing
import { checkDeps } from './deps.js';
import { traceSpecs } from './spec-trace.js';
import { checkRegistry } from './registry.js';
import { runCoverage } from './coverage.js';
import { fetchOracle, STRONGHOLD } from './oracle.js';

/** @type {Record<string, (root: string) => { problems: string[] }>} */
const CHECKS = { deps: checkDeps, spec: traceSpecs, registry: checkRegistry };

/** @param {string[]} names @param {string} root @returns {number} the exit code */
function runChecks(names, root) {
  let failed = 0;
  for (const name of names) {
    const { problems } = CHECKS[name](root);
    for (const p of problems) console.error(`${name}: ${p}`);
    console.log(`${name}: ${problems.length ? `${problems.length} problems` : 'ok'}`);
    if (problems.length) failed++;
  }
  return failed ? 1 : 0;
}

const [cmd = 'all'] = process.argv.slice(2), root = process.cwd();
if (cmd === 'coverage') process.exitCode = runCoverage(root);
else if (cmd === 'oracle') console.log(`oracle: Stronghold ${STRONGHOLD.tag} at ${fetchOracle()}`);
else if (cmd === 'all') process.exitCode = runChecks(Object.keys(CHECKS), root);
else if (CHECKS[cmd]) process.exitCode = runChecks([cmd], root);
else { console.error(`aue-check: unknown command "${cmd}" (all | deps | spec | registry | coverage | oracle)`); process.exitCode = 2; }
