// The cross-engine check (docs/spec/lockstep.md 同步-12): its matches, its script, the comparison of runs, and the page
// a browser engine runs them on. The browsers themselves run in CI (cli.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchContent, KITS_ENABLED, MAPPING } from '@aue/content';
import { createWorld, step, KIND } from '@aue/sim';
import { SCENARIOS, HASH_EVERY, FRAMES, scriptOf, runScenario, runAll, firstDifference } from '../src/index.js';
import { startServer, pageHtml, PAGE, KITS } from '../src/browsers.js';
import { kitsDir, kitsForNode } from '../src/cli.js';

test('[同步-12] the matches: the three MVP levels, eight elite-2 six-stars a seat, a play style each, all five among them', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.match.level), ['act1multi_01', 'act1multi_06', 'act1multi_hard-02']);
  for (const s of SCENARIOS) {
    assert.deepEqual(s.match.decks.map((d) => d.length), [8, 8]);
    assert.ok(s.match.decks.flat().every((x) => x.build.elite === 2 && x.build.level === 90 && x.build.skill === 2 && x.build.skillLevel === 10));
  }
  const cards = SCENARIOS.flatMap((s) => /** @type {any[][]} */ (s.match.runes)).map((r) => r.find((x) => x.key === 'insert_token_card').board[0][1]);
  assert.deepEqual([...new Set(cards)].sort(), ['trap_197_muulwr', 'trap_198_muulas', 'trap_199_muulrg', 'trap_200_muulcl', 'trap_201_muulco']);
  assert.deepEqual([HASH_EVERY, FRAMES], [30, 3600]);
});

test('[同步-12] the script deploys from the decks and starts skills; a run takes a hash every 30 frames and at the end, the same twice', async () => {
  const s = SCENARIOS[0], c = await matchContent(/** @type {any} */ (s.match)), w = createWorld(c, { seed: s.match.seed, players: 2 });
  /** @type {any[]} */
  const seen = [];
  while (w.frame < 900) {
    const cmds = [0, 1].flatMap((seat) => scriptOf(w, c, seat).map((x) => /** @type {[number, any]} */ ([seat, x])));
    seen.push(...cmds.map(([, x]) => x.type));
    step(w, c, cmds);
  }
  assert.ok(seen.includes('deploy') && seen.includes('skill'), `commands: ${[...new Set(seen)].join(', ')}`);
  assert.ok(w.units.filter((u) => u.kind === KIND.OPERATOR).length >= 4, 'operators on the field');
  const a = await runScenario(SCENARIOS[1], 600), b = await runScenario(SCENARIOS[1], 600);
  assert.deepEqual(a, b);
  assert.equal(a.hashes.length, 600 / HASH_EVERY + 1);
  const all = await runAll(60);
  assert.deepEqual(all.map((r) => [r.name, r.hashes.length, r.frame, r.kits]), [['IG-1', 3, 60, []], ['IG-10', 3, 60, []], ['IG-S-2', 3, 60, []]]);
});

test('[同步-12] with the pinned commit, the decks\' operators that have an enabled kit fight with it; every one loads', { skip: existsSync(kitsDir()) ? false : 'the pinned commit is not here (pnpm run oracle)' }, async () => {
  const dir = kitsForNode(), runs = await runAll(60, `${pathToFileURL(dir).href}/`);
  const want = [...new Set(SCENARIOS.flatMap((s) => s.match.decks.flat().map((x) => x.id)))].filter((id) => KITS_ENABLED.includes(id)).sort();
  assert.ok(want.length >= 10, `${want.length} kitted operators in the decks`);
  for (const r of runs) assert.deepEqual(r.kits, want, r.name);
  const plain = await runAll(60);
  assert.notDeepEqual(runs.map((r) => r.hashes), plain.map((r) => r.hashes), 'the kits change the battles');
});

test('[同步-12] the first difference: the match and the frame of the first hash that differs, the end, or a match missing', () => {
  const run = (/** @type {string} */ name, /** @type {number[]} */ hashes, frame = 61, result = -1) => ({ name, hashes, frame, result, kits: /** @type {string[]} */ ([]) });
  const want = [run('A', [1, 2, 3, 4]), run('B', [5, 6])];
  assert.equal(firstDifference(want, [run('A', [1, 2, 3, 4]), run('B', [5, 6])], 30), null);
  assert.deepEqual(firstDifference(want, [run('A', [1, 9, 3, 4]), run('B', [5, 6])], 30), { match: 'A', frame: 30, want: 2, got: 9 });
  assert.deepEqual(firstDifference(want, [run('A', [1, 2, 3, 7]), run('B', [5, 6])], 30), { match: 'A', frame: 61, want: 4, got: 7 }, 'the end\'s hash');
  assert.deepEqual(firstDifference(want, [run('A', [1, 2, 3, 4]), run('B', [5, 6], 61, 0)], 30), { match: 'B', frame: 61, want: 'end 61, result -1', got: 'end 61, result 0' });
  assert.deepEqual(firstDifference(want, [run('A', [1, 2, 3, 4])], 30), { match: 'B', frame: -1, want: 'B', got: 'none' });
  assert.deepEqual(firstDifference(want, [run('A', [1, 2, 3])], 30), { match: 'A', frame: 61, want: 4, got: 'none' });
  assert.deepEqual(firstDifference([want[0]], want, 30), { match: 'B', frame: -1, want: 'none', got: 'B' });
  const kitted = (/** @type {string[]} */ kits) => [{ ...run('A', [1, 2, 3, 4]), kits }];
  assert.deepEqual(firstDifference(kitted(['char_a', 'char_b']), kitted(['char_a']), 30), { match: 'A', frame: -1, want: 'kits char_a,char_b', got: 'kits char_a' }, 'a kit that did not run');
});

test('[同步-12] the check page maps the engine\'s packages to their sources and the kits\' engine modules to the compat ones; the server gives .js and .json under the root and the kits\' commit only', async () => {
  const html = pageHtml();
  for (const p of ['content', 'sim', 'schema', 'math']) assert.ok(html.includes(`"@aue/${p}":"/packages/${p}/src/index.js"`), p);
  assert.ok(html.includes(`"${KITS}server/sim/constants.js":"/packages/content/src/compat/sh/constants.js"`));
  assert.equal([...html.matchAll(new RegExp(`"${KITS}`, 'g'))].length, Object.keys(MAPPING).length, 'every module of the mapping table');
  const kits = mkdtempSync(join(tmpdir(), 'simcheck-kits-'));
  mkdirSync(join(kits, 'server', 'sim', 'content'), { recursive: true });
  writeFileSync(join(kits, 'server', 'sim', 'content', 'k.js'), 'export default {};');
  const s = await startServer(new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), kits);
  try {
    const k = await fetch(`${s.url}${KITS}server/sim/content/k.js`);
    assert.deepEqual([k.status, k.headers.get('content-type')], [200, 'text/javascript; charset=utf-8'], 'a kit file');
    assert.equal((await fetch(`${s.url}${KITS}%2e%2e/x.js`)).status, 404);
    const get = (/** @type {string} */ path) => fetch(`${s.url}${path}`);
    const page = await get(PAGE);
    assert.deepEqual([page.status, page.headers.get('content-type')], [200, 'text/html; charset=utf-8']);
    const js = await get('/packages/simcheck/src/scenarios.js');
    assert.deepEqual([js.status, js.headers.get('content-type')], [200, 'text/javascript; charset=utf-8']);
    assert.equal((await get('/packages/content/data/levels/act1multi_01.json')).headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await Promise.all(['/package.json/../../x.js', '/%2e%2e/%2e%2e/x.js', '/README.md', '/missing.js'].map(async (p) => (await get(p)).status)), [404, 404, 404, 404]);
  } finally {
    await s.close();
    rmSync(kits, { recursive: true, force: true });
  }
  const bare = await startServer(new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  try {
    assert.equal((await fetch(`${bare.url}${KITS}server/sim/content/k.js`)).status, 404, 'no kits without their commit');
  } finally {
    await bare.close();
  }
});
