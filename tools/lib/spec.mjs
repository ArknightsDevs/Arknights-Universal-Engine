// Reading the mechanics specs (docs/spec/*.md), the registry (docs/registry/*.json) and the clause ids cited by tests.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/** A clause id: a domain word, a dash, a number (时间-2, 伤害-13). */
export const CLAUSE_ID = /^[\p{L}][\p{L}\p{N}]*-\d+$/u;
const HEADING = /^### (\S+)\s+(.+)$/;
const SOURCE = /^- 来源：(.+)$/;
const CITED = /\[([\p{L}][\p{L}\p{N}]*-\d+)\]/gu;

/** @typedef {{ id: string, title: string, file: string, line: number, sources: string[] }} Clause */

/** @param {string} dir @param {RegExp} ext @returns {string[]} files under dir, recursively */
export function walk(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return d.name === 'node_modules' ? [] : walk(p, ext);
    return ext.test(d.name) ? [p] : [];
  });
}

/** The clauses of one spec file. @param {string} file @param {string} root @returns {Clause[]} */
export function parseSpec(file, root) {
  /** @type {Clause[]} */
  const out = [];
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((text, i) => {
    const h = HEADING.exec(text);
    if (h) { out.push({ id: h[1], title: h[2], file: relative(root, file), line: i + 1, sources: [] }); return; }
    const s = SOURCE.exec(text);
    if (s && out.length) out[out.length - 1].sources.push(s[1].trim());
  });
  return out;
}

/** @param {string} root @returns {Clause[]} every clause of docs/spec */
export function readClauses(root) {
  return walk(join(root, 'docs', 'spec'), /\.md$/).filter((f) => !f.endsWith('README.md')).flatMap((f) => parseSpec(f, root));
}

/** @param {string} root @returns {Map<string, string[]>} clause id → test files citing it */
export function readCitations(root) {
  /** @type {Map<string, string[]>} */
  const cited = new Map();
  const files = [...walk(join(root, 'packages'), /\.test\.m?js$/), ...walk(join(root, 'tools'), /\.test\.m?js$/)];
  for (const f of files) {
    const rel = relative(root, f);
    for (const m of readFileSync(f, 'utf8').matchAll(CITED)) {
      const list = cited.get(m[1]) ?? [];
      if (!list.includes(rel)) list.push(rel);
      cited.set(m[1], list);
    }
  }
  return cited;
}

/** @param {string} root @param {string} name @returns {Record<string, string>[]} */
export function readRegistry(root, name) {
  const file = join(root, 'docs', 'registry', `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}
