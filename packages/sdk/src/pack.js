// `aue mod pack` (docs/mods.md): a mod's folder as one zip to share — a folder named by the mod's id with its
// pack.json, its data files, its readme and licence when it has them, and SHA256SUMS listing every other file's sha256.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMod, sha256 } from '@aue/content';
import { readModFolder } from './folders.js';
import { zip } from './zip.js';

/** The files beside the data that go with a mod when it has them. */
const EXTRA = Object.freeze(['README.md', 'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'NOTICE.md']);

/**
 * A mod's folder packed (mod-12) into `out` (default: "<id>-<version>.zip" in the current folder). Throws when the mod
 * does not read cleanly — its manifest and data files; the records are `aue mod check`'s.
 * @param {string} dir @param {string} [out] @returns {{ file: string, files: { path: string, size: number, sha256: string }[] }}
 */
export function packMod(dir, out) {
  const { input, problems } = readModFolder(dir), { mod, report } = readMod(input);
  if (problems.length > 0 || !mod) throw new Error(`${input.id} cannot be packed: ${[...problems, ...report.problems].join('; ')}`);
  const names = ['pack.json', ...mod.manifest.files.data, ...EXTRA.filter((n) => existsSync(join(dir, n)))];
  const files = names.map((path) => {
    const data = readFileSync(join(dir, path));
    return { path, data, size: data.length, sha256: sha256(data) };
  });
  const sums = Buffer.from(files.map((f) => `${f.sha256}  ${f.path}\n`).join(''), 'utf8');
  const file = out ?? `${mod.manifest.id}-${mod.manifest.version}.zip`;
  writeFileSync(file, zip([...files.map((f) => ({ name: `${mod.manifest.id}/${f.path}`, data: f.data })), { name: `${mod.manifest.id}/SHA256SUMS`, data: sums }]));
  return { file, files: files.map(({ path, size, sha256: h }) => ({ path, size, sha256: h })) };
}
