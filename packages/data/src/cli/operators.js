// Extract every operator's training data from a local ArknightsGameData checkout (docs/spec/operators.md).
// Usage: node packages/data/src/cli/operators.js --gamedata <dir>   (or set AUE_GAMEDATA)
// Writes packages/content/data/operators/<id>.json for each operator and index.json listing them, and
// packages/content/data/ranges.json with every range (干员-8), with the source (deterministic: the same input gives
// byte-identical output).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRoster, extractRanges } from '../operators.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/data/operators');
const RANGES = resolve(OUT, '../ranges.json');

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

/** Every operator and every range of a checkout, with the source. @param {string} root @returns {Record<string, unknown>} */
export function extractRosterFromCheckout(root) {
  const data = join(root, 'zh_CN', 'gamedata', 'excel'), ranges = readJson(join(data, 'range_table.json'));
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit: gitCommit(root), server: 'zh_CN' },
    operators: extractRoster(readJson(join(data, 'character_table.json')), ranges, readJson(join(data, 'skill_table.json')),
      { uniequip: readJson(join(data, 'uniequip_table.json')), battle: readJson(join(data, 'battle_equip_table.json')) }),
    ranges: extractRanges(ranges),
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
  const { source, operators, ranges } = /** @type {{ source: unknown, operators: Record<string, any>, ranges: unknown }} */ (extractRosterFromCheckout(resolve(dir)));
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (f.endsWith('.json')) rmSync(join(OUT, f));
  for (const [id, o] of Object.entries(operators)) writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(o)}\n`);
  const index = Object.fromEntries(Object.entries(operators).map(([id, o]) => [id, { name: o.name, rarity: o.rarity, profession: o.profession, branch: o.branch }]));
  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ source, operators: index }, null, 1)}\n`);
  writeFileSync(RANGES, `${JSON.stringify({ source, ranges })}\n`);
  console.log(`wrote ${Object.keys(operators).length} operators to ${OUT}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
