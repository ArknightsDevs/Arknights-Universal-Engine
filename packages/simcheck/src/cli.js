// The cross-engine check (docs/spec/lockstep.md 同步-12): the matches in Node, then in each browser engine, every hash
// compared with Node's. Exits 1 at the first difference or when an engine cannot run them.
// Usage: node packages/simcheck/src/cli.js [--browsers chromium,firefox,webkit] [--frames <n>]
// SIMCHECK_CHROMIUM, SIMCHECK_FIREFOX, SIMCHECK_WEBKIT: a browser's executable (default: Playwright's own build).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAll, HASH_EVERY } from './scenarios.js';
import { firstDifference } from './compare.js';
import { startServer, runInBrowser, ENGINES } from './browsers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @param {string[]} argv @param {string} name */
const option = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/** @param {import('./scenarios.js').Run[]} runs */
const summary = (runs) => runs.map((r) => `${r.name} ${r.hashes.length} hashes to frame ${r.frame}`).join(', ');

/**
 * Runs the check; the engines that differ or failed. @param {string[]} argv @returns {Promise<string[]>}
 */
export async function check(argv) {
  const names = /** @type {(keyof typeof ENGINES)[]} */ ((option(argv, '--browsers') ?? 'chromium,firefox,webkit').split(',').filter(Boolean));
  const framesText = option(argv, '--frames'), frames = framesText ? Number(framesText) : undefined;
  const want = await runAll(frames);
  console.log(`node ${process.version}: ${summary(want)}`);
  const server = await startServer(ROOT), bad = [];
  try {
    for (const name of names) {
      if (!Object.hasOwn(ENGINES, name)) throw new Error(`unknown browser engine ${name}`);
      try {
        const got = await runInBrowser(name, server.url, { frames, executablePath: process.env[`SIMCHECK_${name.toUpperCase()}`] || undefined });
        const diff = firstDifference(want, got.runs, HASH_EVERY);
        console.log(diff ? `${name} ${got.version}: differs in ${diff.match} at frame ${diff.frame}: ${diff.want} in Node, ${diff.got} here` : `${name} ${got.version}: the same (${summary(got.runs)})`);
        if (diff) bad.push(name);
      } catch (e) {
        console.log(`${name}: could not run: ${/** @type {Error} */ (e).message.split('\n')[0]}`);
        bad.push(name);
      }
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
