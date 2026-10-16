// The browser side of the cross-engine check (docs/spec/lockstep.md 同步-12): a static server of the repository's files
// and of the pinned kits' commit, with a page that maps the engine's package names to their sources and the kits'
// imports of Stronghold engine modules to the compat modules (one import map made from the mapping table, 兼容-2; no
// bundling, no rewriting), and each browser engine — Chromium, Firefox, WebKit, through Playwright — running the
// check's matches on that page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import { MAPPING } from '@aue/content';

/** The file types the page loads. */
const TYPES = Object.freeze({ '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8' });
/** The engine's packages the matches import, by name. */
const PACKAGES = Object.freeze(['content', 'sim', 'schema', 'math']);
/** The page's path; where the kits' commit is served. */
export const PAGE = '/simcheck.html', KITS = '/kits/';
/** Where the compat modules are served (the mapping table's targets are relative to this directory). */
const COMPAT = '/packages/content/src/compat/';

/**
 * The check page: the import map — the engine's packages, and each Stronghold engine module the kits import as its
 * compat module — then the matches' module, its runner on window.
 */
export function pageHtml() {
  const imports = {
    ...Object.fromEntries(PACKAGES.map((p) => [`@aue/${p}`, `/packages/${p}/src/index.js`])),
    ...Object.fromEntries(Object.entries(MAPPING).map(([from, to]) => [`${KITS}${from}`, new URL(to, `http://x${COMPAT}`).pathname])),
  };
  return `<!doctype html><meta charset="utf-8"><title>simcheck</title>
<script type="importmap">${JSON.stringify({ imports })}</script>
<script type="module">
import { runAll } from '/packages/simcheck/src/scenarios.js';
window.simcheck = (frames, kits) => runAll(frames ?? undefined, kits ? new URL('${KITS}', location.href).href : null);
</script>`;
}

/** A .js or .json file under a directory, or null. @param {string} base @param {string} path */
async function fileUnder(base, path) {
  const file = normalize(join(base, path)), type = TYPES[/** @type {keyof typeof TYPES} */ (extname(file))];
  if (!type || type === TYPES['.html'] || !file.startsWith(base + sep)) return null;
  const body = await readFile(file).catch(() => null);
  return body ? { type, body } : null;
}

/**
 * A static server on 127.0.0.1 (a free port): the check page, the .js and .json files under the root, and those of the
 * kits' commit under /kits/ when given; nothing else. @param {string} root @param {string | null} [kitsDir]
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startServer(root, kitsDir = null) {
  const base = resolve(root), kits = kitsDir ? resolve(kitsDir) : null;
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === PAGE) { res.writeHead(200, { 'content-type': TYPES['.html'] }).end(pageHtml()); return; }
    const inKits = path.startsWith(KITS);
    const found = inKits ? (kits ? await fileUnder(kits, path.slice(KITS.length - 1)) : null) : await fileUnder(base, path);
    if (found) res.writeHead(200, { 'content-type': found.type }).end(found.body); else res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  return { url: `http://127.0.0.1:${port}`, close: () => { server.closeAllConnections(); return new Promise((r) => server.close(() => r(undefined))); } };
}

/** The browser engines by name. */
export const ENGINES = Object.freeze({ chromium, firefox, webkit });

/**
 * One browser engine's runs of the matches (同步-12): it opens the check page and runs them there, with the kits
 * the server serves when `kits` is set.
 * @param {keyof typeof ENGINES} name @param {string} url the server @param {{ frames?: number, kits?: boolean, executablePath?: string }} [o]
 * @returns {Promise<{ runs: import('./scenarios.js').Run[], version: string }>}
 */
export async function runInBrowser(name, url, o = {}) {
  const browser = await ENGINES[name].launch(o.executablePath ? { executablePath: o.executablePath } : {});
  try {
    const page = await browser.newPage();
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}${PAGE}`);
    await page.waitForFunction(() => 'simcheck' in globalThis, null, { timeout: 60000 }).catch(() => { throw new Error(`${name}: the check page did not load: ${errors.join('; ')}`); });
    const runs = await page.evaluate(([f, k]) => /** @type {any} */ (globalThis).simcheck(f, k), /** @type {const} */ ([o.frames ?? null, o.kits ?? false]));
    return { runs, version: browser.version() };
  } finally {
    await browser.close();
  }
}
