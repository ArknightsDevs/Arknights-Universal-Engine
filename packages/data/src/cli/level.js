// Extract a whole level from a local ArknightsGameData checkout (docs/spec/level.md).
// Usage: node packages/data/src/cli/level.js --gamedata <dir> --level act1multi_01 [--map <map.json> --map-source <repo@commit>]
//   (or set AUE_GAMEDATA). --map takes the camera view vectors by level path (关卡-3), e.g. ArknightsGameResource's map.json.
// Writes packages/content/data/levels/<id>.json (deterministic: the same input gives byte-identical output).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLevel } from '../level.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/data/levels');

/** @param {string} file @returns {unknown} */
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The level file level_<id>.json anywhere under dir, or null. @param {string} dir @param {string} name @returns {string | null} */
function findLevel(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    const found = e.isDirectory() ? findLevel(p, name) : null;
    if (found !== null) return found;
  }
  return null;
}

/** @param {string} dir @returns {string} */
function gitCommit(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Extract level `id` from a checkout, with its camera view from a map file when given (the first vector of its path).
 * @param {string} root the checkout directory @param {string} id @param {{ file: string, source: string }} [map]
 * @returns {Record<string, unknown>}
 */
export function extractLevelFromCheckout(root, id, map) {
  const data = join(root, 'zh_CN', 'gamedata');
  const file = findLevel(join(data, 'levels'), `level_${id}.json`);
  if (file === null) throw new Error(`level_${id}.json not found under ${data}`);
  const path = relative(join(data, 'levels'), file).replaceAll('\\', '/').replace(/\.json$/, '');
  const vectors = map ? /** @type {Record<string, unknown[]>} */ (readJson(map.file))[path] : undefined;
  if (map && !vectors) throw new Error(`no camera view for ${path} in ${map.file}`);
  return extractLevel({
    id, level: readJson(file), enemyDb: readJson(join(data, 'levels', 'enemydata', 'enemy_database.json')),
    handbook: readJson(join(data, 'excel', 'enemy_handbook_table.json')), commit: gitCommit(root),
    view: map && vectors ? { vector: vectors[0], source: map.source } : undefined,
  });
}

/** @param {string[]} argv @param {string} name @returns {string | undefined} */
const arg = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/** @param {string[]} argv */
function main(argv) {
  const dir = arg(argv, '--gamedata') ?? process.env.AUE_GAMEDATA, id = arg(argv, '--level'), mapFile = arg(argv, '--map'), mapSource = arg(argv, '--map-source');
  if (!dir || !id) {
    console.error('usage: node packages/data/src/cli/level.js --gamedata <dir> --level <id>   (or set AUE_GAMEDATA)');
    process.exitCode = 2;
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `${id}.json`);
  const map = mapFile ? { file: resolve(mapFile), source: mapSource ?? 'unknown' } : undefined;
  writeFileSync(out, `${JSON.stringify(extractLevelFromCheckout(resolve(dir), id, map), null, 2)}\n`);
  console.log(`wrote ${out}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
