// Package dependencies against tools/layers.json (ADR 0006, 0008): every package in packages/ is listed there, declares
// only the @aue packages and the third-party packages its line allows, says "aue": { "node": true } exactly when its
// line does, and the @aue dependency graph has no cycle. Which files import what is checked by ESLint
// (@aue/lint package-boundaries); this checks what the package.json files declare.
//   node tools/deps-check.mjs            exit 1 on any problem
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {{ aue: string[], external: string[], node: boolean }} Layer */

/** @param {string} root @returns {Map<string, any>} short name → package.json */
function readPackages(root) {
  const dir = join(root, 'packages'), out = new Map();
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, d.name, 'package.json');
    if (d.isDirectory() && existsSync(file)) out.set(d.name, JSON.parse(readFileSync(file, 'utf8')));
  }
  return out;
}

/** @param {string} name @param {any} pkg @param {Layer} layer @returns {string[]} */
function packageProblems(name, pkg, layer) {
  const out = [], declared = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies });
  if (pkg.name !== `@aue/${name}`) out.push(`${name}: package.json name is "${pkg.name}", expected "@aue/${name}"`);
  for (const dep of declared) {
    const ok = dep.startsWith('@aue/') ? layer.aue.includes(dep.slice(5)) : layer.external.includes(dep);
    if (!ok) out.push(`${name}: depends on ${dep}, which tools/layers.json does not allow`);
  }
  for (const dep of Object.keys(pkg.devDependencies ?? {})) {
    if (dep.startsWith('@aue/')) out.push(`${name}: @aue packages are real dependencies, not devDependencies (${dep})`);
  }
  if ((pkg.aue?.node === true) !== layer.node) out.push(`${name}: "aue.node" must be ${layer.node} as in tools/layers.json`);
  return out;
}

/** @param {Record<string, Layer>} layers @returns {string[]} cycles in the allowed graph */
function cycles(layers) {
  /** @type {string[]} */
  const out = [];
  const state = new Map();
  /** @param {string} n @param {string[]} path */
  const visit = (n, path) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'open') { out.push(`cycle: ${[...path, n].join(' → ')}`); return; }
    state.set(n, 'open');
    for (const m of layers[n]?.aue ?? []) visit(m, [...path, n]);
    state.set(n, 'done');
  };
  for (const n of Object.keys(layers)) visit(n, []);
  return out;
}

/** @param {string} root @returns {{ problems: string[], packages: number }} */
export function checkDeps(root) {
  const { packages: layers } = JSON.parse(readFileSync(join(root, 'tools', 'layers.json'), 'utf8'));
  const pkgs = readPackages(root), problems = [...cycles(layers)];
  for (const [name, pkg] of pkgs) {
    if (!layers[name]) { problems.push(`${name}: not listed in tools/layers.json`); continue; }
    problems.push(...packageProblems(name, pkg, layers[name]));
  }
  for (const name of Object.keys(layers)) if (!pkgs.has(name)) problems.push(`${name}: listed in tools/layers.json but packages/${name} is missing`);
  return { problems, packages: pkgs.size };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems, packages } = checkDeps(fileURLToPath(new URL('..', import.meta.url)));
  for (const p of problems) console.error(p);
  console.log(`deps-check: ${packages} packages, ${problems.length} problems`);
  process.exitCode = problems.length ? 1 : 0;
}
