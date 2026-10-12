// The Node loader hook made from the import mapping table (docs/spec/compat.md 兼容-2; ADR 0010): registered with
// `module.register(hookUrl, { data: { root, compat } })` — `root` the Stronghold repository root, `compat` the compat
// directory, both URLs ending in / — it sends a Stronghold file's imports of engine modules to the compat modules.
import { mappedUrl } from './mapping.js';

/** @type {{ root: string, compat: string }} */
let where = { root: '', compat: '' };

/** @param {{ root: string, compat: string }} data */
export function initialize(data) { where = data; }

/**
 * @param {string} specifier @param {{ parentURL?: string }} context
 * @param {(s: string, c: object) => Promise<{ url: string }>} next
 */
export async function resolve(specifier, context, next) {
  const parent = context.parentURL ?? '';
  if (!where.root || !parent.startsWith(where.root) || !(specifier.startsWith('./') || specifier.startsWith('../'))) return next(specifier, context);
  const url = mappedUrl(where.root, new URL(specifier, parent).href, where.compat);
  return url ? { url, shortCircuit: true } : next(specifier, context);
}
