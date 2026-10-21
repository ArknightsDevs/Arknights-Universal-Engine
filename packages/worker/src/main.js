// The page's side of the battle worker: start it, send commands, receive render states and events.
import { readView } from '@aue/schema';

/**
 * @typedef {object} BattleOptions
 * @property {string | URL} workerUrl the served URL of this package's src/worker.js
 * @property {string} wsUrl the server's battle socket
 * @property {number} seat
 * @property {string} key the session key (reconnects reuse it)
 * @property {string | URL} [kits] where the server serves the pinned kits (a URL ending in "/"; compat 兼容-6), none: no kits
 * @property {string | URL} [mods] where the server serves its mods' list and files (a URL ending in "/"; mod-10), none: the official content
 * @property {(view: import('@aue/schema').View, events: Record<string, string | number>[], keys: Record<string, string>, status: import('./session.js').Status) => void} onFrame
 *   `keys`: the content key of each unit not seen before; `status`: the match's wave, stage, stamps and result
 * @property {(state: { state: string, reason?: string, match?: import('@aue/schema').Match, frame?: number }) => void} [onNet] the connection;
 *   `match` when a match's content is ready, with the last frame sealed when the page joined (−1 before the battle began, 同步-11)
 * @property {(c: { fast: number[], held: number, asker: number, resuming: number }) => void} [onControl] the speed and pause state (同步-7, 同步-8)
 * @property {(seat: number, s: import('@aue/schema').Signal) => void} [onSignal] a seat's signal, this seat's own too (同步-13)
 */

/** @param {BattleOptions} o */
export function startBattle(o) {
  const worker = new Worker(o.workerUrl, { type: 'module' });
  /** @type {((d: any) => void)[]} */
  const waiting = [], marking = /** @type {((d: any) => void)[]} */ ([]);
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'frame') o.onFrame(readView(m.view), m.events, m.keys, m.status);
    else if (m.type === 'net') o.onNet?.(m);
    else if (m.type === 'control') o.onControl?.(m);
    else if (m.type === 'debug') waiting.shift()?.(m);
    else if (m.type === 'marks') marking.shift()?.(m);
    else if (m.type === 'signal') o.onSignal?.(m.seat, m.s);
  };
  worker.postMessage({ type: 'start', url: o.wsUrl, seat: o.seat, key: o.key, ...(o.kits ? { kits: String(o.kits) } : {}), ...(o.mods ? { mods: String(o.mods) } : {}) });
  return {
    /** @param {import('@aue/schema').Command} cmd */
    command: (cmd) => worker.postMessage({ type: 'command', cmd }),
    /** This seat's 2× switch (同步-7). @param {boolean} on */
    speed: (on) => worker.postMessage({ type: 'speed', on }),
    /** Asks to pause (同步-8). */
    pause: () => worker.postMessage({ type: 'pause' }),
    /** Answers the mate's pause request (同步-8). @param {boolean} accept */
    pauseReply: (accept) => worker.postMessage({ type: 'pauseReply', accept }),
    /** Resumes a pause (同步-8). */
    resume: () => worker.postMessage({ type: 'resume' }),
    /** The page has loaded the battle (同步-11). */
    ready: () => worker.postMessage({ type: 'ready' }),
    /** A signal to the seats: an emote, a mark (同步-13). @param {import('@aue/schema').Signal} s */
    signal: (s) => worker.postMessage({ type: 'signal', s }),
    /** @returns {Promise<{ frame: number, hash: number, sealed: number, stats: object }>} */
    debug: () => new Promise((resolve) => { waiting.push(resolve); worker.postMessage({ type: 'debug' }); }),
    /**
     * The field marks (render spec 渲染-8, 渲染-9) for the selected operator and facing and the pointer's tile: the tiles
     * to highlight and the range to show (tile keys row × width + col).
     * @param {import('./marks.js').MarkQuery} q @returns {Promise<import('./marks.js').Marks>}
     */
    marks: (q) => new Promise((resolve) => { marking.push(resolve); worker.postMessage({ type: 'marks', ...q }); }),
    stop: () => { worker.postMessage({ type: 'stop' }); worker.terminate(); },
  };
}
