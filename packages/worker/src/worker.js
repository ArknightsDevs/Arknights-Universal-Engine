// The module Worker's entry: wires a BattleSession to WebSocket, postMessage and the clock. Messages from the page:
//   { type: 'start', url, seat, key, kits?, mods? }   connect and play; `kits`, where the server serves the pinned kits
//                                       (兼容-6); `mods`, where it serves its mods' list and files (mod-10)
//   { type: 'command', cmd }            a player command (validated before it is sent)
//   { type: 'speed', on } | { type: 'pause' } | { type: 'pauseReply', accept } | { type: 'resume' }   the controls
//   { type: 'debug' }                   reply with { type: 'debug', frame, hash, sealed, stats }
//   { type: 'marks', op, dir, tile }    reply with { type: 'marks', deployable, range } (render spec 渲染-8, 渲染-9)
//   { type: 'signal', s }               a signal to the seats (同步-13; validated before it is sent)
//   { type: 'stop' }
// To the page, besides frames and replies: { type: 'signal', seat, s } for a seat's signal.
import { commandProblem, signalProblem } from '@aue/schema';
import { skeletonContent, matchContent, loadKits, hostedSource, OFFICIAL_SOURCE } from '@aue/content';
import { BattleSession } from './session.js';

const scope = /** @type {any} */ (globalThis);

/** @param {string} url @returns {import('./session.js').SocketLike} */
function connect(url) {
  const ws = new WebSocket(url);
  /** @type {import('./session.js').SocketLike} */
  const s = { send: (t) => { if (ws.readyState === WebSocket.OPEN) ws.send(t); }, close: () => ws.close(), onopen: null, onmessage: null, onclose: null };
  ws.onopen = () => s.onopen?.();
  ws.onmessage = (e) => { if (typeof e.data === 'string') s.onmessage?.(e.data); };
  ws.onclose = () => s.onclose?.();
  return s;
}

/** Where the server serves the pinned kits (a URL ending in "/"), or null: none. @type {string | null} */
let kitBase = null;
/** The content source of the server's mods (mod-10), once fetched; the official content when it serves none. @type {Promise<import('@aue/content').ContentSource> | null} */
let mods = null;

/** @param {string} url @returns {Promise<string>} a file's text from the server */
const text = (url) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
});

/**
 * A match's content (同步-9) from the server's mods (mod-10), with the kits of its operators when the server serves them
 * (兼容-6).
 * @param {import('@aue/schema').Match} match
 */
async function contentOf(match) {
  const source = await (mods ?? OFFICIAL_SOURCE);
  if (!kitBase) return matchContent(match, { source });
  const { kits } = await loadKits(kitBase, match.decks.flat().map((e) => e.id));
  return matchContent(match, { source, kits });
}

const session = new BattleSession(skeletonContent, {
  connect,
  post: (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  content: contentOf,
});

/** What each message from the page does. @type {Record<string, (m: any) => void>} */
const HANDLERS = {
  start: (m) => {
    kitBase = typeof m.kits === 'string' && m.kits.endsWith('/') ? new URL(m.kits, scope.location.href).href : null;
    mods = typeof m.mods === 'string' && m.mods.endsWith('/') ? hostedSource(new URL(m.mods, scope.location.href).href, text) : null;
    session.start({ url: String(m.url), seat: Number(m.seat), key: String(m.key) });
  },
  command: (m) => { if (!commandProblem(m.cmd)) session.command(m.cmd); },
  signal: (m) => { if (!signalProblem(m.s)) session.signal(m.s); },
  speed: (m) => session.control({ type: 'speed', on: m.on === true }),
  pauseReply: (m) => session.control({ type: 'pauseReply', accept: m.accept === true }),
  pause: () => session.control({ type: 'pause' }),
  resume: () => session.control({ type: 'resume' }),
  ready: () => session.ready(),
  debug: () => scope.postMessage(session.debug()),
  marks: (m) => scope.postMessage(session.marks({ op: typeof m.op === 'string' ? m.op : null, dir: Number(m.dir) || 0,
    tile: m.tile ? { row: Number(m.tile.row), col: Number(m.tile.col) } : null })),
  stop: () => session.stop(),
};

scope.onmessage = (/** @type {MessageEvent} */ e) => {
  const m = e.data, type = m && typeof m.type === 'string' ? m.type : '';
  if (Object.hasOwn(HANDLERS, type)) HANDLERS[type](m);
};
