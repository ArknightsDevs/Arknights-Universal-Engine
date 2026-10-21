#!/usr/bin/env node
// aue: the command line for mod authors (docs/mods.md, ADR 0064).
//   aue mod new <id> [--name <name>] [--in <folder>]   a new mod from the template
//   aue mod check <folder>...                          the mods together, as a host loads them
//   aue mod test <folder>... [--seconds <n>]           headless matches with their content
//   aue mod pack <folder> [--out <file>]               a zip to share
//   aue schemas [--out <folder>]                       write the JSON Schemas of pack.json and data files
// A folder that holds no pack.json but mods in its sub-folders stands for all of them.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isModFolder } from './folders.js';
import { checkMods } from './check.js';
import { playMods } from './play.js';
import { packMod } from './pack.js';
import { newMod } from './new.js';
import { schemaFiles } from './schemas.js';

const USAGE = 'usage: aue mod new <id> [--name <name>] [--in <folder>] | aue mod check <folder>... | aue mod test <folder>... [--seconds <n>] | aue mod pack <folder> [--out <file>] | aue schemas [--out <folder>]';

/** @param {string[]} args @param {string} name @returns {string | undefined} the value after an option */
const option = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
/** @param {string[]} args @returns {string[]} the arguments that are not options or their values */
const plain = (args) => args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));

/** @param {string[]} dirs @returns {string[]} each folder, or the mods in it when it holds no pack.json */
function modDirs(dirs) {
  return dirs.flatMap((d) => (isModFolder(d) ? [d] : readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(d, e.name)).filter(isModFolder).sort()));
}

/** @param {string[]} args @returns {Promise<number>} */
async function check(args) {
  const { lines, ok } = await checkMods(modDirs(plain(args)));
  for (const l of lines) console.log(l);
  return ok ? 0 : 1;
}

/** @param {string[]} args @returns {Promise<number>} */
async function test(args) {
  const { source, lines, ok } = await checkMods(modDirs(plain(args)));
  if (!ok) {
    for (const l of lines) console.log(l);
    return 1;
  }
  const played = await playMods(source, { seconds: Number(option(args, '--seconds') ?? 180) });
  for (const p of played) console.log(`${p.error ? 'FAIL' : 'ok  '} ${p.what} on ${p.level} ${p.difficulty}: ${p.error ?? `${p.seconds} s, ${['lost', 'won'][p.result] ?? 'still going'}`}`);
  console.log(`${played.filter((p) => !p.error).length} of ${played.length} matches ran`);
  return played.some((p) => p.error) ? 1 : 0;
}

/** @type {Record<string, (args: string[]) => number | Promise<number>>} */
const MOD = {
  new: (args) => {
    const [id] = plain(args);
    console.log(`created ${newMod(option(args, '--in') ?? '.', id ?? '', { name: option(args, '--name') ?? id })}`);
    return 0;
  },
  check,
  test,
  pack: (args) => {
    const r = packMod(plain(args)[0] ?? '.', option(args, '--out'));
    console.log(`${r.file}: ${r.files.map((f) => f.path).join(', ')}, SHA256SUMS`);
    return 0;
  },
};

/** @param {string[]} argv @returns {Promise<number>} the exit code */
async function main(argv) {
  const [group, cmd, ...rest] = argv;
  if (group === 'mod' && cmd && Object.hasOwn(MOD, cmd)) return MOD[cmd](rest);
  if (group === 'schemas') {
    const out = option(argv, '--out') ?? 'schemas';
    mkdirSync(out, { recursive: true });
    for (const [name, text] of Object.entries(schemaFiles())) writeFileSync(join(out, name), text);
    console.log(`wrote ${Object.keys(schemaFiles()).join(', ')} to ${out}`);
    return 0;
  }
  console.error(USAGE);
  return 2;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
  console.error(`aue: ${e.message}`);
  process.exitCode = 1;
});
