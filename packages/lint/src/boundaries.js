// The package-boundary rule (ADR: packages). A file may import
//   - files of its own package (a relative import never leaves the package directory);
//   - packages its package.json declares (dependencies / peer / optional; devDependencies only from tests and from the
//     repository root package);
//   - Node built-ins only when its package.json says "aue": { "node": true }, or from tests.
// Which @aue package may depend on which is checked separately against tools/layers.json (aue-check deps, @aue/testkit), so the
// package.json files are the single list of what a package uses.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, sep, isAbsolute } from 'node:path';
import { builtinModules } from 'node:module';

/** @typedef {{ dir: string, name: string, root: boolean, node: boolean, deps: Set<string>, dev: Set<string> }} Manifest */

const BUILTINS = new Set(builtinModules);
/** @type {Map<string, Manifest | null>} */
const cache = new Map();

/** @param {string} dir @returns {Manifest | null} */
function readManifest(dir) {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return null;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const names = (/** @type {Record<string, string> | undefined} */ o) => Object.keys(o ?? {});
  return {
    dir, name: pkg.name ?? '', root: existsSync(join(dir, 'pnpm-workspace.yaml')), node: pkg.aue?.node === true,
    deps: new Set([...names(pkg.dependencies), ...names(pkg.peerDependencies), ...names(pkg.optionalDependencies)]),
    dev: new Set(names(pkg.devDependencies)),
  };
}

/** The nearest package.json above a file. @param {string} file @returns {Manifest | null} */
export function manifestOf(file) {
  let dir = dirname(resolve(file));
  for (;;) {
    if (!cache.has(dir)) cache.set(dir, readManifest(dir));
    const m = cache.get(dir);
    if (m) return m;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The package name of a bare specifier ('@aue/sim/x' → '@aue/sim', 'three/addons/x' → 'three'). @param {string} spec */
export function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** @param {string} file */
const isTest = (file) => resolve(file).split(sep).includes('test');

/** @typedef {{ id: string, data: Record<string, string> } | null} Violation */

/** @param {Manifest} m @param {string} file @param {string} spec @returns {Violation} */
function relativeViolation(m, file, spec) {
  const rel = relative(m.dir, resolve(dirname(file), spec));
  return rel.startsWith('..') || isAbsolute(rel) ? { id: 'leavesPackage', data: { spec, pkg: m.name } } : null;
}

/** @param {Manifest} m @param {string} file @param {string} spec @returns {Violation} */
function builtinViolation(m, file, spec) {
  return m.node || m.root || isTest(file) ? null : { id: 'nodeBuiltin', data: { spec, pkg: m.name } };
}

/** @param {Manifest} m @param {string} file @param {string} spec @returns {Violation} */
function bareViolation(m, file, spec) {
  const name = packageName(spec);
  if (name === m.name || m.deps.has(name)) return null;
  if (m.dev.has(name) && (m.root || isTest(file))) return null;
  return { id: 'undeclared', data: { spec, pkg: m.name || '(root)' } };
}

/**
 * Why an import is not allowed, or null.
 * @param {string} file the importing file
 * @param {string} spec the import specifier
 * @returns {Violation}
 */
export function violation(file, spec) {
  const m = manifestOf(file);
  if (!m) return null;
  if (spec.startsWith('.') || isAbsolute(spec)) return relativeViolation(m, file, spec);
  if (spec.startsWith('node:') || BUILTINS.has(packageName(spec))) return builtinViolation(m, file, spec);
  return bareViolation(m, file, spec);
}

/** @type {import('eslint').Rule.RuleModule} */
export const packageBoundaries = {
  meta: {
    type: 'problem',
    docs: { description: 'imports stay inside the package or go to declared dependencies' },
    schema: [],
    messages: {
      leavesPackage: '"{{spec}}" leaves package {{pkg}}: import the other package by name and declare it in package.json',
      nodeBuiltin: '"{{spec}}" is a Node built-in, but {{pkg}} also runs in browsers (set "aue": { "node": true } only for Node-only packages)',
      undeclared: '"{{spec}}" is not declared in the package.json of {{pkg}}',
    },
  },
  create(context) {
    /** @param {any} source */
    const check = (source) => {
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return;
      const v = violation(context.filename, source.value);
      if (v) context.report({ node: source, messageId: v.id, data: v.data });
    };
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
    };
  },
};
