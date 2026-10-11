// Extract the attack timings of the skeleton's units from their Spine skeletons (docs/spec/combat.md 攻击-2).
// Usage: node packages/data/src/cli/timings.js --spine <dir> --operators <source> --enemies <source> [--frames <dir>]
//   <dir> holds <unit key>.skel for each operator and enemy of packages/content/data/skeleton.json; the sources name
//   where the skeletons came from (repository@commit), recorded in the output. With --frames, each operator's OnAttack
//   is checked against <dir>/<key>.json, its source's frame data (ADR 0019); a mismatch fails.
// Writes packages/content/data/timings.json (deterministic: the same input gives byte-identical output).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attackTiming, frameProblem } from '../timings.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/data');

/** @param {string[]} argv @param {string} name */
function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/**
 * The timings of the given units (attackTiming), checked against frame data where given. Units without a skeleton or
 * without an attack clip are listed apart.
 * @param {string} spine @param {string[]} keys @param {string | undefined} frames @param {Set<string>} operators
 */
export function timingsOf(spine, keys, frames, operators) {
  /** @type {Record<string, { clip: string, duration: number, hit: number }>} */
  const units = {};
  /** @type {string[]} */
  const none = [];
  for (const key of keys) {
    const file = join(spine, `${key}.skel`);
    const t = existsSync(file) ? attackTiming(new Uint8Array(readFileSync(file))) : null;
    if (!t) { none.push(key); continue; }
    if (frames && operators.has(key)) {
      const problem = frameProblem(t, JSON.parse(readFileSync(join(frames, `${key}.json`), 'utf8')));
      if (problem) throw new Error(`${key}: ${problem}`);
    }
    units[key] = t;
  }
  return { units, none };
}

/** @param {string[]} argv */
function main(argv) {
  const spine = arg(argv, '--spine'), ops = arg(argv, '--operators'), foes = arg(argv, '--enemies');
  if (!spine || !ops || !foes) {
    console.error('usage: node packages/data/src/cli/timings.js --spine <dir> --operators <source> --enemies <source> [--frames <dir>]');
    process.exitCode = 2;
    return;
  }
  const skeleton = JSON.parse(readFileSync(join(DATA, 'skeleton.json'), 'utf8'));
  const operators = new Set(Object.keys(skeleton.operators)), keys = [...operators, ...Object.keys(skeleton.enemies)];
  const { units, none } = timingsOf(spine, keys, arg(argv, '--frames'), operators);
  const out = { source: { operators: ops, enemies: foes }, units, none };
  writeFileSync(join(DATA, 'timings.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote ${join(DATA, 'timings.json')}: ${Object.keys(units).length} timed, ${none.length} without`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
