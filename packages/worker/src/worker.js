// The module Worker's entry: wires a BattleSession to WebSocket, postMessage and the clock. Messages from the page:
//   { type: 'start', url, seat, key }   connect and play
//   { type: 'command', cmd }            a player command (validated before it is sent)
//   { type: 'speed', on } | { type: 'pause' } | { type: 'pauseReply', accept } | { type: 'resume' }   the controls
//   { type: 'debug' }                   reply with { type: 'debug', frame, hash, sealed, stats }
//   { type: 'marks', op, dir, tile }    reply with { type: 'marks', deployable, range } (render spec 渲染-8, 渲染-9)
//   { type: 'stop' }
import { commandProblem } from '@aue/schema';
import { skeletonContent, matchContent } from '@aue/content';
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

const session = new BattleSession(skeletonContent, {
  connect,
  post: (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  now: () => performance.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  content: matchContent,
});

/** What each message from the page does. @type {Record<string, (m: any) => void>} */
const HANDLERS = {
  start: (m) => session.start({ url: String(m.url), seat: Number(m.seat), key: String(m.key) }),
  command: (m) => { if (!commandProblem(m.cmd)) session.command(m.cmd); },
  speed: (m) => session.control({ type: 'speed', on: m.on === true }),
  pauseReply: (m) => session.control({ type: 'pauseReply', accept: m.accept === true }),
  pause: () => session.control({ type: 'pause' }),
  resume: () => session.control({ type: 'resume' }),
  debug: () => scope.postMessage(session.debug()),
  marks: (m) => scope.postMessage(session.marks({ op: typeof m.op === 'string' ? m.op : null, dir: Number(m.dir) || 0,
    tile: m.tile ? { row: Number(m.tile.row), col: Number(m.tile.col) } : null })),
  stop: () => session.stop(),
};

scope.onmessage = (/** @type {MessageEvent} */ e) => {
  const m = e.data, type = m && typeof m.type === 'string' ? m.type : '';
  if (Object.hasOwn(HANDLERS, type)) HANDLERS[type](m);
};
