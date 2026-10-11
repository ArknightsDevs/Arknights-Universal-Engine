// The repository checks on small fixture trees: each finds what it is meant to find, and passes a clean tree.
// Clause citations in fixtures are built with cite(), so this file never reads as citing a real clause itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { traceSpecs } from '../spec-trace.mjs';
import { checkRegistry } from '../registry-check.mjs';
import { checkDeps } from '../deps-check.mjs';

/** @param {string} id */
const cite = (id) => '[' + id + ']';

/** A temporary tree from { 'path': content }. @param {Record<string, string>} files */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'aue-check-'));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

const SPEC = '# T\n\n### 甲-1 帧率\n\n正文\n\n- 来源：推断 INF-0001\n\n### 甲-2 换算\n\n- 来源：数据：x.y\n';
const INF = JSON.stringify([{ id: 'INF-0001', clause: '甲-1', statement: 's', basis: 'b', status: '待查证' }]);

test('spec-trace: a clean tree passes; missing tests, sources and inferences are reported', () => {
  const ok = tree({ 'docs/spec/t.md': SPEC, 'docs/registry/inferences.json': INF, 'packages/a/test/t.test.js': `test('${cite('甲-1')} ${cite('甲-2')}')` });
  try { assert.deepEqual(traceSpecs(ok).problems, []); } finally { rmSync(ok, { recursive: true }); }
  const bad = tree({
    'docs/spec/t.md': SPEC.replace('- 来源：数据：x.y', '') + '\n### 甲-1 重复\n\n- 来源：推断 INF-0009\n',
    'packages/a/test/t.test.js': `test('${cite('甲-1')} ${cite('甲-9')}')`,
  });
  try {
    const p = traceSpecs(bad).problems.join('\n');
    const wants = ['duplicate clause id 甲-1', 'no "- 来源：" line', 'INF-0001 is not in', 'INF-0009 is not in', `no test cites ${cite('甲-2')}`, `cites ${cite('甲-9')}`];
    for (const want of wants) assert.ok(p.includes(want), want);
  } finally { rmSync(bad, { recursive: true }); }
});

test('registry-check: ids, fields, statuses and clauses', () => {
  const root = tree({
    'docs/spec/t.md': SPEC,
    'docs/registry/inferences.json': JSON.stringify([...JSON.parse(INF), { id: 'INF-1', clause: '甲-7', statement: '', basis: 'b', status: '想当然' }]),
    'docs/registry/known-differences.json': JSON.stringify([{ id: 'DIF-0001', clause: '甲-2', ours: 'a', stronghold: 'b', reason: 'c', status: '有效' }]),
  });
  try {
    const { problems } = checkRegistry(root), p = problems.join('\n');
    for (const want of ['INF-1: malformed id', '"statement" is empty', 'clause 甲-7 is not in docs/spec', 'status "想当然"']) assert.ok(p.includes(want), want);
    assert.equal(problems.length, 4);
  } finally { rmSync(root, { recursive: true }); }
});

test('deps-check: undeclared layers, cycles, names and the node flag', () => {
  const layers = { packages: {
    a: { aue: ['b'], external: [], node: false }, b: { aue: ['a'], external: ['x'], node: true }, c: { aue: [], external: [], node: false },
  } };
  const root = tree({
    'tools/layers.json': JSON.stringify(layers),
    'packages/a/package.json': JSON.stringify({ name: '@aue/a', dependencies: { '@aue/c': '*' } }),
    'packages/b/package.json': JSON.stringify({ name: '@aue/bee', dependencies: { x: '*', y: '*' } }),
    'packages/d/package.json': JSON.stringify({ name: '@aue/d' }),
  });
  try {
    const p = checkDeps(root).problems.join('\n');
    const wants = ['cycle: a → b → a', 'a: depends on @aue/c', 'b: package.json name is "@aue/bee"', 'b: depends on y', 'b: "aue.node" must be true',
      'd: not listed', 'c: listed in tools/layers.json but packages/c is missing'];
    for (const want of wants) assert.ok(p.includes(want), want);
  } finally { rmSync(root, { recursive: true }); }
});
