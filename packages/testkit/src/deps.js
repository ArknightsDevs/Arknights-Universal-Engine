// Package dependencies against the repository's tools/layers.json (ADR 0006, 0008):
//   - every package in packages/ is listed there and its package.json name is <scope>/<dir>;
//   - its dependencies (also peer / optional) are only those its line allows;
//   - devDependencies on workspace packages only name the layers file's devPackages (test and lint tooling);
//   - it says "aue": { "node": true } exactly when its line does;
//   - the allowed graph between this repository's packages has no cycle.
// Which files import what is checked by ESLint (@aue/lint package-boundaries); this checks what package.json declares.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** @typedef {{ allow: string[], node?: boolean, role?: string }} Line */
/** @typedef {{ scope: string, devPackages?: string[], packages: Record<string, Line> }} Layers */

/** @param {string} root @returns {Map<string, any>} directory name → package.json */
function readPackages(root) {
  const dir = join(root, 'packages'), out = new Map();
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, d.name, 'package.json');
    if (d.isDirectory() && existsSync(file)) out.set(d.name, JSON.parse(readFileSync(file, 'utf8')));
  }
  return out;
}

/** @param {string} name @param {any} pkg @param {Line} line @param {Layers} layers @returns {string[]} */
function packageProblems(name, pkg, line, layers) {
  /** @type {string[]} */
  const out = [];
  const full = `${layers.scope}/${name}`, dev = new Set(layers.devPackages ?? []);
  if (pkg.name !== full) out.push(`${name}: package.json name is "${pkg.name}", expected "${full}"`);
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies })) {
    if (!line.allow.includes(dep)) out.push(`${name}: depends on ${dep}, which tools/layers.json does not allow`);
  }
  for (const dep of Object.keys(pkg.devDependencies ?? {})) {
    if (dep.startsWith(`${layers.scope}/`) && !dev.has(dep)) out.push(`${name}: ${dep} is a devDependency but not one of the devPackages`);
  }
  if ((pkg.aue?.node === true) !== (line.node === true)) out.push(`${name}: "aue.node" must be ${line.node === true} as in tools/layers.json`);
  return out;
}

/** @param {Layers} layers @returns {string[]} cycles between this repository's packages */
function cycles(layers) {
  /** @type {string[]} */
  const out = [];
  const state = new Map(), prefix = `${layers.scope}/`;
  /** @param {string} n @param {string[]} path */
  const visit = (n, path) => {
    if (state.get(n) === 'done') return;
    if (state.get(n) === 'open') { out.push(`cycle: ${[...path, n].join(' → ')}`); return; }
    state.set(n, 'open');
    for (const dep of layers.packages[n]?.allow ?? []) if (dep.startsWith(prefix)) visit(dep.slice(prefix.length), [...path, n]);
    state.set(n, 'done');
  };
  for (const n of Object.keys(layers.packages)) visit(n, []);
  return out;
}

/** @param {string} root the repository @returns {{ problems: string[], packages: number }} */
export function checkDeps(root) {
  /** @type {Layers} */
  const layers = JSON.parse(readFileSync(join(root, 'tools', 'layers.json'), 'utf8'));
  const pkgs = readPackages(root), problems = cycles(layers);
  for (const [name, pkg] of pkgs) {
    const line = layers.packages[name];
    if (!line) { problems.push(`${name}: not listed in tools/layers.json`); continue; }
    problems.push(...packageProblems(name, pkg, line, layers));
  }
  for (const name of Object.keys(layers.packages)) if (!pkgs.has(name)) problems.push(`${name}: listed in tools/layers.json but packages/${name} is missing`);
  return { problems, packages: pkgs.size };
}
