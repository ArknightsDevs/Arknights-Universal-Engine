// @aue/testkit: development tooling shared by AUE and the projects built on it — the repository checks (package
// dependencies, spec tracing, the registry, coverage); later the Stronghold oracle and the test generators.
export { checkDeps } from './deps.js';
export { traceSpecs } from './spec-trace.js';
export { checkRegistry } from './registry.js';
export { coverageArgs, runCoverage } from './coverage.js';
export { CLAUSE_ID, readClauses, readCitations, readRegistry } from './spec.js';
export { tinyContent, spawnAt, oneWave } from './fixtures.js';
export { loadTimeReads } from './scan.js';
export { STRONGHOLD, oracleDir, fetchOracle, loadOracle } from './oracle.js';
