// Extract the M0.5 walking-skeleton fixture from a local ArknightsGameData checkout.
// Usage: node packages/data/src/cli/skeleton.js --gamedata <dir>      (or set AUE_GAMEDATA; <dir> contains zh_CN/gamedata/...)
// Writes packages/content/data/skeleton.json (deterministic: the same input gives byte-identical output).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSkeleton } from '../skeleton.js';

const LEVEL_FILE = 'level_act1multi_01.json';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/data/skeleton.json');

/**
 * @param {string} file
 * @returns {unknown}
 */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * @param {string} dir
 * @returns {string | null} path of the level file under dir, searched recursively
 */
function findLevel(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === LEVEL_FILE) return p;
    const found = e.isDirectory() ? findLevel(p) : null;
    if (found !== null) return found;
  }
  return null;
}

/**
 * @param {string} dir
 * @returns {string}
 */
function gitCommit(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Read the five source files of a checkout and extract the skeleton.
 * @param {string} root the checkout directory
 * @returns {Record<string, unknown>}
 */
export function extractFromCheckout(root) {
  const data = join(root, 'zh_CN', 'gamedata');
  const direct = join(data, 'levels', 'activities', 'act1multi', LEVEL_FILE);
  const levelFile = existsSync(direct) ? direct : findLevel(join(data, 'levels'));
  if (levelFile === null) throw new Error(`${LEVEL_FILE} not found under ${data}`);
  return extractSkeleton({
    level: readJson(levelFile),
    enemyDb: readJson(join(data, 'levels', 'enemydata', 'enemy_database.json')),
    characters: readJson(join(data, 'excel', 'character_table.json')),
    ranges: readJson(join(data, 'excel', 'range_table.json')),
    skills: readJson(join(data, 'excel', 'skill_table.json')),
    handbook: readJson(join(data, 'excel', 'enemy_handbook_table.json')),
    commit: gitCommit(root),
  });
}

/**
 * @param {string[]} argv
 * @returns {string | undefined}
 */
function gamedataArg(argv) {
  const i = argv.indexOf('--gamedata');
  return i >= 0 ? argv[i + 1] : process.env.AUE_GAMEDATA;
}

/** @param {string[]} argv */
function main(argv) {
  const dir = gamedataArg(argv);
  if (!dir) {
    console.error('usage: node packages/data/src/cli/skeleton.js --gamedata <dir>   (or set AUE_GAMEDATA)');
    process.exitCode = 2;
    return;
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(extractFromCheckout(resolve(dir)), null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
