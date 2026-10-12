// The per-kit differential (docs/spec/compat.md 兼容-6, ADR 0058): a kit runs here as it runs in the pinned Stronghold.
// Every enabled kit must match. With AUE_KITDIFF_REPORT=<file>: every kit's differences are written there (the evidence
// for the enabled list).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { KIT_FILES, KITS_ENABLED } from '../src/index.js';
import { kitDiff } from './kitdiff.js';

test('[兼容-6] every enabled kit runs as in the pinned Stronghold: every skill, hit for hit', async () => {
  assert.ok(KITS_ENABLED.includes('char_112_siege'));
  for (const id of KITS_ENABLED) for (const r of await kitDiff(id)) assert.deepEqual(r.diffs, [], `${id} S${r.skill + 1}`);
});

test('[兼容-6] the report of every kit (AUE_KITDIFF_REPORT)', { skip: !process.env.AUE_KITDIFF_REPORT }, async () => {
  /** @type {Record<string, { skill: number, diffs: string[] }[]>} */
  const report = {};
  for (const id of Object.keys(KIT_FILES)) report[id] = await kitDiff(id);
  writeFileSync(/** @type {string} */ (process.env.AUE_KITDIFF_REPORT), `${JSON.stringify(report, null, 1)}\n`);
  assert.ok(Object.keys(report).length === 72);
});
