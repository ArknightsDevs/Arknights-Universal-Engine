// The browser side of the cross-engine check (docs/spec/lockstep.md 同步-12): a static server of the repository's files
// with a page that maps the engine's package names to their sources (an import map, no bundling), and each browser
// engine — Chromium, Firefox, WebKit, through Playwright — running the check's matches on that page.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

/** The file types the page loads. */
const TYPES = Object.freeze({ '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8' });
/** The engine's packages the matches import, by name. */
const PACKAGES = Object.freeze(['content', 'sim', 'schema', 'math']);
/** The page's path. */
export const PAGE = '/simcheck.html';

/** The check page: the import map, then the matches' module, its runner on window. */
export function pageHtml() {
  const imports = Object.fromEntries(PACKAGES.map((p) => [`@aue/${p}`, `/packages/${p}/src/index.js`]));
  return `<!doctype html><meta charset="utf-8"><title>simcheck</title>
<script type="importmap">${JSON.stringify({ imports })}</script>
<script type="module">
import { runAll } from '/packages/simcheck/src/scenarios.js';
window.simcheck = (frames) => runAll(frames ?? undefined);
</script>`;
}

/**
 * A static server of the repository on 127.0.0.1 (a free port): the check page, and the .js and .json files under the
 * root; nothing else. @param {string} root @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startServer(root) {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === PAGE) { res.writeHead(200, { 'content-type': TYPES['.html'] }).end(pageHtml()); return; }
    const file = normalize(join(base, path)), type = TYPES[/** @type {keyof typeof TYPES} */ (extname(file))];
    if (!type || type === TYPES['.html'] || !(file.startsWith(base + sep))) { res.writeHead(404).end(); return; }
    const body = await readFile(file).catch(() => null);
    if (body) res.writeHead(200, { 'content-type': type }).end(body); else res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(undefined)));
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  return { url: `http://127.0.0.1:${port}`, close: () => { server.closeAllConnections(); return new Promise((r) => server.close(() => r(undefined))); } };
}

/** The browser engines by name. */
export const ENGINES = Object.freeze({ chromium, firefox, webkit });

/**
 * One browser engine's runs of the matches (同步-12): it opens the check page and runs them there.
 * @param {keyof typeof ENGINES} name @param {string} url the server @param {{ frames?: number, executablePath?: string }} [o]
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
    const runs = await page.evaluate((f) => /** @type {any} */ (globalThis).simcheck(f), o.frames ?? null);
    return { runs, version: browser.version() };
  } finally {
    await browser.close();
  }
}
