// The cross-engine check (docs/spec/lockstep.md 同步-12): the matches in Node, then in each browser engine, every hash
// compared with Node's. The decks' kits come from the pinned commit (兼容-6): AUE_KITS_DIR or AUE_STRONGHOLD_DIR, else
// the engine's oracle cache (`pnpm run oracle` fetches it). Exits 1 at the first difference or when an engine cannot run them.
// Usage: node packages/simcheck/src/cli.js [--browsers chromium,firefox,webkit] [--frames <n>] [--no-kits]
// SIMCHECK_CHROMIUM, SIMCHECK_FIREFOX, SIMCHECK_WEBKIT: a browser's executable (default: Playwright's own build).
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KIT_SOURCE } from '@aue/content';
import { runAll, HASH_EVERY } from './scenarios.js';
import { firstDifference } from './compare.js';
import { startServer, runInBrowser, ENGINES } from './browsers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @param {string[]} argv @param {string} name */
const option = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/** @param {import('./scenarios.js').Run[]} runs */
const summary = (runs) => runs.map((r) => `${r.name} ${r.hashes.length} hashes to frame ${r.frame}, ${r.kits.length} kits`).join('; ');

/** Where the pinned kits' commit is (the oracle's: ADR 0058). */
export const kitsDir = () => resolve(process.env['AUE_KITS_DIR'] || process.env['AUE_STRONGHOLD_DIR'] || join(ROOT, '.cache', 'oracle', `stronghold-${KIT_SOURCE.sha.slice(0, 12)}`));

/**
 * The pinned kits' directory, with the compat hook registered so Node loads them as the arbiter does; throws when the
 * commit is not there. @returns {string}
 */
export function kitsForNode() {
  const dir = kitsDir();
  if (!existsSync(join(dir, 'server', 'sim', 'content'))) throw new Error(`no kits at ${dir}: run \`pnpm run oracle\` or set AUE_KITS_DIR`);
  const root = `${pathToFileURL(dir).href}/`, compat = new URL('./compat/', import.meta.resolve('@aue/content')).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
  return dir;
}

/**
 * One browser engine against Node's runs: the line it prints, and whether it differed or failed.
 * @param {keyof typeof ENGINES} name @param {string} url @param {import('./scenarios.js').Run[]} want @param {{ frames?: number, kits: boolean }} o
 */
async function oneEngine(name, url, want, o) {
  try {
    const got = await runInBrowser(name, url, { ...o, executablePath: process.env[`SIMCHECK_${name.toUpperCase()}`] || undefined });
    const diff = firstDifference(want, got.runs, HASH_EVERY);
    return { bad: diff !== null, line: diff ? `${name} ${got.version}: differs in ${diff.match} at frame ${diff.frame}: ${diff.want} in Node, ${diff.got} here` : `${name} ${got.version}: the same (${summary(got.runs)})` };
  } catch (e) {
    return { bad: true, line: `${name}: could not run: ${/** @type {Error} */ (e).message.split('\n')[0]}` };
  }
}

/**
 * Runs the check; the engines that differ or failed. @param {string[]} argv @returns {Promise<string[]>}
 */
export async function check(argv) {
  const names = /** @type {(keyof typeof ENGINES)[]} */ ((option(argv, '--browsers') ?? 'chromium,firefox,webkit').split(',').filter(Boolean));
  for (const name of names) if (!Object.hasOwn(ENGINES, name)) throw new Error(`unknown browser engine ${name}`);
  const framesText = option(argv, '--frames'), frames = framesText ? Number(framesText) : undefined, kits = !argv.includes('--no-kits');
  const dir = kits ? kitsForNode() : null;
  const want = await runAll(frames, dir ? `${pathToFileURL(dir).href}/` : null);
  console.log(`node ${process.version}: ${summary(want)}`);
  const server = await startServer(ROOT, dir), bad = [];
  try {
    for (const name of names) {
      const r = await oneEngine(name, server.url, want, { frames, kits });
      console.log(r.line);
      if (r.bad) bad.push(name);
    }
  } finally {
    await server.close();
  }
  return bad;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await check(process.argv.slice(2));
  if (bad.length > 0) process.exitCode = 1;
}
