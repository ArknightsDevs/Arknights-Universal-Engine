// Extract every operator's training data from a local ArknightsGameData checkout (docs/spec/operators.md).
// Usage: node packages/data/src/cli/operators.js --gamedata <dir>   (or set AUE_GAMEDATA)
// Writes packages/content/data/operators/<id>.json for each operator and index.json listing them, with the source
// (deterministic: the same input gives byte-identical output).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRoster } from '../operators.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/data/operators');

/** @param {string} file @returns {unknown} */
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** @param {string} dir @returns {string} */
function gitCommit(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Every operator of a checkout, with the source. @param {string} root @returns {Record<string, unknown>} */
export function extractRosterFromCheckout(root) {
  const data = join(root, 'zh_CN', 'gamedata', 'excel');
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit: gitCommit(root), server: 'zh_CN' },
    operators: extractRoster(readJson(join(data, 'character_table.json')), readJson(join(data, 'range_table.json')), readJson(join(data, 'skill_table.json'))),
  };
}

/** @param {string[]} argv */
function main(argv) {
  const dir = argv.includes('--gamedata') ? argv[argv.indexOf('--gamedata') + 1] : process.env.AUE_GAMEDATA;
  if (!dir) {
    console.error('usage: node packages/data/src/cli/operators.js --gamedata <dir>   (or set AUE_GAMEDATA)');
    process.exitCode = 2;
    return;
  }
  const { source, operators } = /** @type {{ source: unknown, operators: Record<string, any> }} */ (extractRosterFromCheckout(resolve(dir)));
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.json')) rmSync(join(OUT, f));
  for (const [id, o] of Object.entries(operators)) writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(o)}\n`);
  const index = Object.fromEntries(Object.entries(operators).map(([id, o]) => [id, { name: o.name, rarity: o.rarity, profession: o.profession, branch: o.branch }]));
  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ source, operators: index }, null, 1)}\n`);
  console.log(`wrote ${Object.keys(operators).length} operators to ${OUT}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
