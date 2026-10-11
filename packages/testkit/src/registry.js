// The registry (docs/registry/README.md, ADR 0043): inferences and known differences have unique well-formed ids, the
// fields their kind needs, a known status, and a clause that exists in docs/spec.
import { readClauses, readRegistry } from './spec.js';

/** @typedef {{ id: RegExp, fields: string[], status: string[] }} Kind */

/** @type {Record<string, Kind>} */
const KINDS = {
  inferences: { id: /^INF-\d{4}$/, fields: ['statement', 'basis'], status: ['待查证', '已证实', '已推翻'] },
  'known-differences': { id: /^DIF-\d{4}$/, fields: ['ours', 'stronghold', 'reason'], status: ['有效', '已消除'] },
};

/** @param {Record<string, string>} r @param {Kind} kind @param {Set<string>} clauses @returns {string[]} */
function entryProblems(r, kind, clauses) {
  const at = r.id ?? '(no id)', out = [];
  if (!kind.id.test(r.id ?? '')) out.push(`${at}: malformed id`);
  for (const f of ['clause', ...kind.fields]) if (!String(r[f] ?? '').trim()) out.push(`${at}: "${f}" is empty`);
  if (r.clause && !clauses.has(r.clause)) out.push(`${at}: clause ${r.clause} is not in docs/spec`);
  if (!kind.status.includes(r.status)) out.push(`${at}: status "${r.status}" is not one of ${kind.status.join(' / ')}`);
  return out;
}

/** @param {string} root the repository @returns {{ problems: string[], entries: number }} */
export function checkRegistry(root) {
  const clauses = new Set(readClauses(root).map((c) => c.id));
  /** @type {string[]} */
  const problems = [];
  let entries = 0;
  for (const [name, kind] of Object.entries(KINDS)) {
    const seen = new Set();
    for (const r of readRegistry(root, name)) {
      entries++;
      if (seen.has(r.id)) problems.push(`${name}: duplicate id ${r.id}`);
      seen.add(r.id);
      problems.push(...entryProblems(r, kind, clauses).map((p) => `${name}: ${p}`));
    }
  }
  return { problems, entries };
}
