// The per-kit differential (docs/spec/compat.md 兼容-6, ADR 0058): a kit runs here as it runs in the pinned Stronghold.
// Every enabled kit must match — but for the differences pinned for it, each line exactly, every one owed to registered
// differences. With AUE_KITDIFF_REPORT=<file>: every kit's differences are written there (the evidence for the enabled
// list).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { KIT_FILES, KITS_ENABLED, KIT_DIFFERENCES } from '../src/index.js';
import { kitDiff } from './kitdiff.js';

test('[兼容-6] every enabled kit runs as in the pinned Stronghold: every skill, hit for hit, but for its pinned differences', async () => {
  assert.ok(KITS_ENABLED.includes('char_112_siege'));
  for (const id of KITS_ENABLED) {
    for (const r of await kitDiff(id)) assert.deepEqual(r.diffs, KIT_DIFFERENCES[id]?.skills[`S${r.skill + 1}`] ?? [], `${id} S${r.skill + 1}`);
  }
});

test('[兼容-6] a pinned difference belongs to an enabled kit, names its skills and the registered differences behind it, all in force', () => {
  const reg = JSON.parse(readFileSync(new URL('../../../docs/registry/known-differences.json', import.meta.url), 'utf8'));
  const inForce = new Set(reg.filter((/** @type {any} */ d) => d.status === '有效').map((/** @type {any} */ d) => d.id));
  for (const [id, d] of Object.entries(KIT_DIFFERENCES)) {
    assert.ok(KITS_ENABLED.includes(id), id);
    assert.ok(d.because.length > 0 && d.because.every((x) => inForce.has(x)), `${id}: ${d.because}`);
    assert.ok(Object.keys(d.skills).length > 0 && Object.entries(d.skills).every(([s, lines]) => /^S[1-3]$/.test(s) && lines.length > 0), id);
  }
});

test('[兼容-6] the report of every kit (AUE_KITDIFF_REPORT)', { skip: !process.env.AUE_KITDIFF_REPORT }, async () => {
  /** @type {Record<string, { skill: number, diffs: string[] }[]>} */
  const report = {};
  for (const id of Object.keys(KIT_FILES)) report[id] = await kitDiff(id);
  writeFileSync(/** @type {string} */ (process.env.AUE_KITDIFF_REPORT), `${JSON.stringify(report, null, 1)}\n`);
  assert.ok(Object.keys(report).length === 72);
});
