// `aue mod check` (docs/mods.md): mods laid over the official content as a host would, and what became of each — loaded
// or not and why, its warnings, the records it adds and changes —, and the conflicts between them.
import { createSource } from '@aue/content';
import { readModFolder } from './folders.js';

/** @typedef {import('@aue/content').ContentSource} ContentSource @typedef {import('@aue/content').ModReport} ModReport */

/**
 * The lines of a mod's report: its name and version, loaded or not, its problems, warnings and records.
 * @param {ModReport} r @param {string[]} reading the problems reading its folder @returns {string[]}
 */
function reportLines(r, reading) {
  const head = `${r.id}${r.version ? ` ${r.version}` : ''}${r.name ? ` (${r.name})` : ''}: ${r.loaded ? 'loaded' : 'not loaded'}`;
  return [
    head,
    ...[...reading, ...r.problems].map((p) => `  problem: ${p}`),
    ...r.warnings.map((w) => `  warning: ${w}`),
    ...(r.added ?? []).map((a) => `  adds ${a}`),
    ...(r.changed ?? []).map((c) => `  changes ${c}`),
  ];
}

/**
 * Mods' folders checked together (mod-1…mod-9): the content source they make, the report's lines, and whether every
 * mod loaded.
 * @param {readonly string[]} dirs @returns {Promise<{ source: ContentSource, lines: string[], ok: boolean }>}
 */
export async function checkMods(dirs) {
  const read = dirs.map(readModFolder);
  const source = await createSource(read.map((r) => r.input));
  const lines = source.reports.flatMap((r, i) => reportLines(r, read[i].problems));
  lines.push(...source.conflicts.map((c) => `conflict: ${c}`));
  const ok = source.reports.every((r) => r.loaded) && read.every((r) => r.problems.length === 0);
  lines.push(`${source.mods.length} of ${dirs.length} mods loaded${source.conflicts.length ? `, ${source.conflicts.length} conflicts` : ''}`);
  return { source, lines, ok };
}
