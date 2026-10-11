// The grid size for Stronghold kits (docs/spec/compat.md 兼容-1): COLS and ROWS are live and hold the level's size while
// content code runs; real kit code from the pinned oracle, its constants import redirected by a loader hook, computes
// its tile keys with the size of the battle it runs in; and the oracle's content has exactly one load-time read.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { oracleDir, loadTimeReads } from '@aue/testkit';
import * as grid from '../src/compat/grid.js';

/** @type {any} */
let tier1;
before(async () => {
  const constants = pathToFileURL(join(oracleDir(), 'server', 'sim', 'constants.js')).href;
  const dir = mkdtempSync(join(tmpdir(), 'aue-grid-')), wrapper = pathToFileURL(join(dir, 'constants.mjs')).href;
  const live = new URL('../src/compat/grid.js', import.meta.url).href;
  writeFileSync(new URL(wrapper), `export * from ${JSON.stringify(constants)};\nexport { COLS, ROWS } from ${JSON.stringify(live)};\n`);
  register(new URL('fixtures/grid-hook.mjs', import.meta.url), { data: { constants, wrapper } });
  tier1 = await import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'shared', 'tier1.js')).href);
});

test('[兼容-1] COLS and ROWS hold the level’s size while content code runs, and the ones before afterwards', () => {
  assert.deepEqual([grid.COLS, grid.ROWS], [0, 0]);
  const seen = grid.withGrid({ width: 12, height: 7 }, () => {
    const inner = grid.withGrid({ width: 9, height: 5 }, () => [grid.COLS, grid.ROWS]);
    return [grid.COLS, grid.ROWS, ...inner];
  });
  assert.deepEqual(seen, [12, 7, 9, 5]);
  assert.deepEqual([grid.COLS, grid.ROWS], [0, 0]);
  assert.throws(() => grid.withGrid({ width: 3, height: 3 }, () => { throw new Error('kit'); }), /kit/);
  assert.deepEqual([grid.COLS, grid.ROWS], [0, 0], 'restored after a throw');
});

test('[兼容-1] a real kit (the oracle’s shared tier1 posKey) keys tiles with the size of the battle it runs in', () => {
  const at = { x: 3, y: 2 };
  assert.equal(grid.withGrid({ width: 12, height: 7 }, () => tier1.posKey(at)), 2 * 12 + 3);
  assert.equal(grid.withGrid({ width: 9, height: 5 }, () => tier1.posKey(at)), 2 * 9 + 3);
  const both = grid.withGrid({ width: 12, height: 7 }, () => [tier1.posKey(at), grid.withGrid({ width: 9, height: 5 }, () => tier1.posKey(at)), tier1.posKey(at)]);
  assert.deepEqual(both, [27, 21, 27], 'two battles of different sizes, one inside the other');
});

test('[兼容-1] kits load under a 64 × 64 grid: 远牙’s whole-row range, built as the kit loads, covers any level', async () => {
  assert.deepEqual(grid.LOAD_GRID, { width: 64, height: 64 });
  assert.ok(grid.LOAD_GRID.width > 50 && grid.LOAD_GRID.height > 44, 'the largest map in the data is 50 × 44');
  const url = pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', 'chess_char_4_20-fartth.js')).href;
  /** @type {any} */
  const kit = await grid.loadUnderGrid(() => import(url));
  assert.deepEqual([grid.COLS, grid.ROWS], [0, 0], 'back after the loading');
  /** @type {any[][]} */
  const lines = [];
  /** @param {any} v @param {number} depth */
  const find = (v, depth) => {
    if (depth > 8 || !v || typeof v !== 'object') return;
    if (Array.isArray(v) && v.length > 0 && v.every((x) => Array.isArray(x) && x.length === 2 && x[0] === 0)) { lines.push(v); return; }
    for (const x of Object.values(v)) find(x, depth + 1);
  };
  // the kit is a factory per chess id: its spec, with 光羽箭 (S3) selected, holds the line range
  find(kit.default.chess_char_4_20_a({}, null, { skill: { id: 'skchr_fartth_3' }, talents: [], traitBb: {} }), 0);
  assert.equal(lines.length, 1, 'its S3 range: row 0, every column');
  assert.equal(lines[0].length, 64);
});

test('[兼容-1] the oracle’s content code reads COLS or ROWS at load time in one place only: the LINE of chess_char_4_20-fartth', () => {
  const root = join(oracleDir(), 'server', 'sim', 'content');
  /** @type {string[]} */
  const hits = [];
  /** @param {string} d */
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.js')) for (const r of loadTimeReads(readFileSync(p, 'utf8'), ['COLS', 'ROWS'])) hits.push(`${p.slice(root.length + 1).replaceAll('\\', '/')}:${r.line} ${r.name}`);
    }
  };
  walk(root);
  assert.deepEqual(hits, ['kits/ops/chess_char_4_20-fartth.js:11 COLS']);
  const sample = ["import { COLS } from 'c';", 'const a = COLS;', 'const f = () => COLS;', 'function g() { return COLS; }', 'export { COLS };', 'x.COLS = 1;', '({ COLS: 2 });'].join('\n');
  assert.deepEqual(loadTimeReads(sample, ['COLS']), [{ name: 'COLS', line: 2 }], 'only the read outside every function');
});
