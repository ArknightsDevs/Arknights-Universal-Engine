// The repository checks beyond lint, types and tests: package dependencies (tools/layers.json), spec tracing, the
// registry. Each prints its problems; exit 1 when any has one.
//   node tools/check.mjs
import { fileURLToPath } from 'node:url';
import { checkDeps } from './deps-check.mjs';
import { traceSpecs } from './spec-trace.mjs';
import { checkRegistry } from './registry-check.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const runs = [['deps-check', () => checkDeps(root)], ['spec-trace', () => traceSpecs(root)], ['registry-check', () => checkRegistry(root)]];
let failed = 0;
for (const [name, run] of /** @type {[string, () => { problems: string[] }][]} */ (runs)) {
  const { problems } = run();
  for (const p of problems) console.error(`${name}: ${p}`);
  console.log(`${name}: ${problems.length ? `${problems.length} problems` : 'ok'}`);
  if (problems.length) failed++;
}
process.exitCode = failed ? 1 : 0;
