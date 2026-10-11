// The module Worker's entry: wires a BattleSession to WebSocket, postMessage and the clock. Messages from the page:
//   { type: 'start', url, seat, key }   connect and play
//   { type: 'command', cmd }            a player command (validated before it is sent)
//   { type: 'debug' }                   reply with { type: 'debug', frame, hash, sealed, stats }
//   { type: 'stop' }
import { commandProblem } from '@aue/schema';
import { skeletonContent } from '@aue/content';
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
});

scope.onmessage = (/** @type {MessageEvent} */ e) => {
  const m = e.data;
  if (m?.type === 'start') session.start({ url: String(m.url), seat: Number(m.seat), key: String(m.key) });
  else if (m?.type === 'command' && !commandProblem(m.cmd)) session.command(m.cmd);
  else if (m?.type === 'debug') scope.postMessage(session.debug());
  else if (m?.type === 'stop') session.stop();
};
