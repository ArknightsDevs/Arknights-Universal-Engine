// The page's side of the battle worker: start it, send commands, receive render states and events.
import { readView } from '@aue/schema';

/**
 * @typedef {object} BattleOptions
 * @property {string | URL} workerUrl the served URL of this package's src/worker.js
 * @property {string} wsUrl the server's battle socket
 * @property {number} seat
 * @property {string} key the session key (reconnects reuse it)
 * @property {(view: import('@aue/schema').View, events: Record<string, string | number>[], keys: Record<string, string>) => void} onFrame `keys`: the content key of each unit not seen before
 * @property {(state: { state: string, reason?: string }) => void} [onNet]
 */

/** @param {BattleOptions} o */
export function startBattle(o) {
  const worker = new Worker(o.workerUrl, { type: 'module' });
  /** @type {((d: any) => void)[]} */
  const waiting = [];
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'frame') o.onFrame(readView(m.view), m.events, m.keys);
    else if (m.type === 'net') o.onNet?.(m);
    else if (m.type === 'debug') waiting.shift()?.(m);
  };
  worker.postMessage({ type: 'start', url: o.wsUrl, seat: o.seat, key: o.key });
  return {
    /** @param {import('@aue/schema').Command} cmd */
    command: (cmd) => worker.postMessage({ type: 'command', cmd }),
    /** @returns {Promise<{ frame: number, hash: number, sealed: number, stats: object }>} */
    debug: () => new Promise((resolve) => { waiting.push(resolve); worker.postMessage({ type: 'debug' }); }),
    stop: () => { worker.postMessage({ type: 'stop' }); worker.terminate(); },
  };
}
