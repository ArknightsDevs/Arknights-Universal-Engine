// The package-boundary rule on a fixture workspace: relative imports stay in the package, bare imports must be declared,
// Node built-ins only in Node packages and tests, devDependencies only in tests and the root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { violation, packageName } from '../src/boundaries.js';

const root = mkdtempSync(join(tmpdir(), 'aue-lint-'));
/** @param {string} p @param {object} json */
const pkg = (p, json) => { mkdirSync(join(root, p), { recursive: true }); writeFileSync(join(root, p, 'package.json'), JSON.stringify(json)); };
writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: [packages/*]\n');
pkg('.', { name: 'ws', devDependencies: { eslint: '*' } });
pkg('packages/sim', { name: '@aue/sim', dependencies: { '@aue/math': '*' }, devDependencies: { 'fast-check': '*' } });
pkg('packages/data', { name: '@aue/data', aue: { node: true } });
const sim = join(root, 'packages/sim/src/a.js'), simTest = join(root, 'packages/sim/test/a.test.js');
const id = (/** @type {string} */ file, /** @type {string} */ spec) => violation(file, spec)?.id ?? null;

test.after(() => rmSync(root, { recursive: true }));

test('relative imports stay inside the package', () => {
  assert.equal(id(sim, './b.js'), null);
  assert.equal(id(sim, '../src/c/d.js'), null);
  assert.equal(id(sim, '../../math/src/x.js'), 'leavesPackage');
});

test('bare imports must be declared; dev dependencies only from tests', () => {
  assert.equal(id(sim, '@aue/math'), null);
  assert.equal(id(sim, '@aue/math/sub/path.js'), null);
  assert.equal(id(sim, '@aue/sim'), null);
  assert.equal(id(sim, '@aue/render'), 'undeclared');
  assert.equal(id(sim, 'three'), 'undeclared');
  assert.equal(id(sim, 'fast-check'), 'undeclared');
  assert.equal(id(simTest, 'fast-check'), null);
  assert.equal(id(join(root, 'eslint.config.js'), 'eslint'), null);
});

test('Node built-ins only in Node packages, tests and the root', () => {
  assert.equal(id(sim, 'node:fs'), 'nodeBuiltin');
  assert.equal(id(sim, 'fs'), 'nodeBuiltin');
  assert.equal(id(simTest, 'node:test'), null);
  assert.equal(id(join(root, 'packages/data/src/x.js'), 'node:fs'), null);
  assert.equal(id(join(root, 'tools/x.mjs'), 'node:path'), null);
});

test('package names of bare specifiers', () => {
  assert.equal(packageName('@aue/sim/x/y.js'), '@aue/sim');
  assert.equal(packageName('three/addons/x.js'), 'three');
  assert.equal(packageName('three'), 'three');
});
