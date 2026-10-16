// Extract every operator's training data from a local ArknightsGameData checkout (docs/spec/operators.md).
// Usage: node packages/data/src/cli/operators.js --gamedata <dir>   (or set AUE_GAMEDATA)
// Writes packages/content/data/operators/<id>.json for each operator and index.json listing them, the summons' the same
// way in packages/content/data/tokens/, the units runes put into decks (符文-6) in packages/content/data/carried/, and
// packages/content/data/ranges.json with every range (干员-8) and powers.json with the factions' names (干员-10), with the source (deterministic: the same input gives
// byte-identical output).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRoster, extractRanges, extractPowers, extractTokens, carriedIds, extractCarried } from '../operators.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/data/operators');
const RANGES = resolve(OUT, '../ranges.json'), POWERS = resolve(OUT, '../powers.json'), TOKENS = resolve(OUT, '../tokens'), CARRIED = resolve(OUT, '../carried');

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
  const chars = readJson(join(data, 'character_table.json')), skills = readJson(join(data, 'skill_table.json'));
  const equipment = { uniequip: readJson(join(data, 'uniequip_table.json')), battle: readJson(join(data, 'battle_equip_table.json')) };
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit: gitCommit(root), server: 'zh_CN' },
    operators: extractRoster(chars, ranges, skills, equipment),
    tokens: extractTokens(chars, ranges, skills, equipment),
    carried: extractCarried(chars, carriedIds(readJson(join(data, 'activity_table.json'))), ranges, skills, equipment),
    ranges: extractRanges(ranges),
    powers: extractPowers(readJson(join(data, 'handbook_team_table.json'))),
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
  const { source, operators, tokens, carried, ranges, powers } = /** @type {{ source: unknown, operators: Record<string, any>, tokens: Record<string, any>, carried: Record<string, any>, ranges: unknown, powers: unknown }} */ (extractRosterFromCheckout(resolve(dir)));
  for (const [out, list] of /** @type {[string, Record<string, any>][]} */ ([[OUT, operators], [TOKENS, tokens], [CARRIED, carried]])) {
    mkdirSync(out, { recursive: true });
    for (const f of readdirSync(out)) if (f.endsWith('.json')) rmSync(join(out, f));
    for (const [id, o] of Object.entries(list)) writeFileSync(join(out, `${id}.json`), `${JSON.stringify(o)}\n`);
  }
  const tokenIndex = Object.fromEntries(Object.entries(tokens).map(([id, o]) => [id, { name: o.name, position: o.position }]));
  writeFileSync(join(TOKENS, 'index.json'), `${JSON.stringify({ source, tokens: tokenIndex }, null, 1)}\n`);
  const carriedIndex = Object.fromEntries(Object.entries(carried).map(([id, o]) => [id, { name: o.name }]));
  writeFileSync(join(CARRIED, 'index.json'), `${JSON.stringify({ source, carried: carriedIndex }, null, 1)}\n`);
  const index = Object.fromEntries(Object.entries(operators).map(([id, o]) => [id, { name: o.name, rarity: o.rarity, profession: o.profession, branch: o.branch }]));
  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify({ source, operators: index }, null, 1)}\n`);
  writeFileSync(RANGES, `${JSON.stringify({ source, ranges })}\n`);
  writeFileSync(POWERS, `${JSON.stringify({ source, powers }, null, 1)}\n`);
  console.log(`wrote ${Object.keys(operators).length} operators to ${OUT}, ${Object.keys(tokens).length} summons to ${TOKENS} and ${Object.keys(carried).length} carried units to ${CARRIED}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
