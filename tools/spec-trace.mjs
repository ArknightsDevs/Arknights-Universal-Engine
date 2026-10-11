// Spec tracing (docs/spec/README.md, ADR 0040): every clause has a well-formed unique id and a source, every inference
// it cites is registered, every clause is verified by at least one test, and every clause a test cites exists.
//   node tools/spec-trace.mjs            exit 1 on any problem
import { fileURLToPath } from 'node:url';
import { CLAUSE_ID, readClauses, readCitations, readRegistry } from './lib/spec.mjs';

const INFERENCE = /推断 (INF-\d{4})/g;

/** @param {import('./lib/spec.mjs').Clause} c @param {Set<string>} inferences @returns {string[]} */
function clauseProblems(c, inferences) {
  const at = `${c.file}:${c.line} ${c.id}`, out = [];
  if (!CLAUSE_ID.test(c.id)) out.push(`${at}: the id is not <领域>-<序号>`);
  if (!c.sources.length) out.push(`${at}: no "- 来源：" line`);
  for (const s of c.sources) {
    for (const m of s.matchAll(INFERENCE)) if (!inferences.has(m[1])) out.push(`${at}: ${m[1]} is not in docs/registry/inferences.json`);
  }
  return out;
}

/** @param {string} root @returns {{ problems: string[], clauses: number, cited: number }} */
export function traceSpecs(root) {
  const clauses = readClauses(root), cited = readCitations(root);
  const inferences = new Set(readRegistry(root, 'inferences').map((r) => r.id));
  const problems = [], seen = new Set();
  for (const c of clauses) {
    if (seen.has(c.id)) problems.push(`${c.file}:${c.line}: duplicate clause id ${c.id}`);
    seen.add(c.id);
    problems.push(...clauseProblems(c, inferences));
    if (!c.title.includes('（已废止）') && !cited.has(c.id)) problems.push(`${c.file}:${c.line} ${c.id}: no test cites [${c.id}]`);
  }
  for (const [id, files] of cited) if (!seen.has(id)) problems.push(`${files.join(', ')}: cites [${id}], which no spec defines`);
  return { problems, clauses: clauses.length, cited: [...cited.keys()].filter((id) => seen.has(id)).length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, clauses, cited } = traceSpecs(fileURLToPath(new URL('..', import.meta.url)));
  for (const p of problems) console.error(p);
  console.log(`spec-trace: ${clauses} clauses, ${cited} cited by tests, ${problems.length} problems`);
  process.exitCode = problems.length ? 1 : 0;
}
