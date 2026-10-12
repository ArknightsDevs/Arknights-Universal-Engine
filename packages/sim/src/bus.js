// The hook bus and timers (docs/spec/hooks.md 钩子-1, 钩子-2; ADR 0057): code outside the engine's own rules — the
// Stronghold compat layer, later native behaviours — registers handlers for events the engine emits at fixed points
// of a frame, and timers that run after or every so many frames. Handlers run by descending priority, then in the order
// they were registered; a context's `stopPropagation` ends the dispatch; dispatches nested deeper than MAX_DEPTH skip
// their handlers. The handlers and timers are not state: the hash and snapshots leave them out (ADR 0057).

/** @typedef {import('./types.js').World} World */
/**
 * @typedef {{ name: string, fn: (ctx: any, w: World) => void, priority: number, owner: unknown, seq: number, removed: boolean, once: boolean }} Hook
 * @typedef {{ due: number, interval: number, fn: (w: World, t: Timer) => void, owner: unknown, seq: number, cancelled: boolean, cancel: () => void }} Timer
 * @typedef {{ hooks: Map<string, Hook[]>, timers: Timer[], seq: number, depth: number, skipped: number }} Bus
 * @typedef {{ priority?: number, owner?: unknown, once?: boolean }} HookOptions
 */

/** Dispatches nested deeper than this skip their handlers (钩子-1; Stronghold's MAX_HOOK_DEPTH). */
export const MAX_DEPTH = 32;

/** A world's bus, made on first use. @param {World} w @returns {Bus} */
export function busOf(w) {
  w.bus ??= { hooks: new Map(), timers: [], seq: 0, depth: 0, skipped: 0 };
  return w.bus;
}

/**
 * Registers a handler (钩子-1): after the handlers of a higher or equal priority already there, before those of a lower.
 * @param {World} w @param {string} name @param {(ctx: any, w: World) => void} fn @param {HookOptions} [o] @returns {Hook}
 */
export function on(w, name, fn, o = {}) {
  const bus = busOf(w), h = { name, fn, priority: o.priority ?? 0, owner: o.owner ?? null, seq: ++bus.seq, removed: false, once: !!o.once };
  const list = bus.hooks.get(name) ?? [];
  let i = list.length;
  while (i > 0 && list[i - 1].priority < h.priority) i--;
  list.splice(i, 0, h);
  bus.hooks.set(name, list);
  return h;
}

/** Removes a handler. @param {World} w @param {Hook} h */
export function off(w, h) {
  h.removed = true;
  const list = busOf(w).hooks.get(h.name), i = list ? list.indexOf(h) : -1;
  if (list && i >= 0) list.splice(i, 1);
}

/** Removes every handler and cancels every timer of an owner (钩子-1, 钩子-2). @param {World} w @param {unknown} owner */
export function offOwner(w, owner) {
  const bus = busOf(w);
  for (const list of bus.hooks.values()) for (const h of list.filter((x) => x.owner === owner)) off(w, h);
  for (const t of bus.timers) if (t.owner === owner) t.cancelled = true;
}

/** Whether an event has a handler. @param {World} w @param {string} name */
export const hasHook = (w, name) => (w.bus?.hooks.get(name)?.length ?? 0) > 0;

/**
 * Emits an event (钩子-1): each handler in order gets the context and the world; one registered `once` is removed after
 * it runs; `ctx.stopPropagation` ends the dispatch. Handlers added meanwhile wait for the next emit, removed ones are
 * skipped. Deeper than MAX_DEPTH nested emits run no handler. Returns the context.
 * @template {object} T @param {World} w @param {string} name @param {T} ctx @returns {T}
 */
export function emit(w, name, ctx) {
  const bus = w.bus, list = bus?.hooks.get(name);
  if (!bus || !list || list.length === 0) return ctx;
  if (bus.depth >= MAX_DEPTH) { bus.skipped++; return ctx; }
  bus.depth++;
  try {
    for (const h of list.slice()) {
      if (h.removed) continue;
      h.fn(ctx, w);
      if (h.once) off(w, h);
      if (/** @type {any} */ (ctx).stopPropagation) break;
    }
  } finally {
    bus.depth--;
  }
  return ctx;
}

/**
 * Schedules a call `frames` frames from now (钩子-2): it runs at the start of that frame (0: the next frame's start).
 * @param {World} w @param {number} frames @param {(w: World, t: Timer) => void} fn @param {{ owner?: unknown }} [o] @returns {Timer}
 */
export function after(w, frames, fn, o = {}) {
  return addTimer(w, w.frame + Math.max(1, Math.trunc(frames)), 0, fn, o.owner);
}

/**
 * Schedules a call every `frames` frames (at least 1) (钩子-2): the first after one interval, or, when `immediate`, at
 * the next running of the timers — this frame's when they have not run yet (a battle's setup, a command), else the next
 * frame's.
 * @param {World} w @param {number} frames @param {(w: World, t: Timer) => void} fn @param {{ owner?: unknown, immediate?: boolean }} [o] @returns {Timer}
 */
export function every(w, frames, fn, o = {}) {
  const interval = Math.max(1, Math.trunc(frames));
  return addTimer(w, w.frame + (o.immediate ? 0 : interval), interval, fn, o.owner);
}

/** @param {World} w @param {number} due @param {number} interval @param {(w: World, t: Timer) => void} fn @param {unknown} owner */
function addTimer(w, due, interval, fn, owner) {
  const bus = busOf(w), t = { due, interval, fn, owner: owner ?? null, seq: ++bus.seq, cancelled: false, cancel: () => { t.cancelled = true; } };
  bus.timers.push(t);
  return t;
}

/**
 * Runs the timers due at this frame's start (钩子-2): by due frame, then by when they were scheduled; a repeating one
 * runs once and is due again an interval later; cancelled ones are dropped.
 * @param {World} w
 */
export function runTimers(w) {
  const bus = w.bus;
  if (!bus || bus.timers.length === 0) return;
  const due = bus.timers.filter((t) => !t.cancelled && t.due <= w.frame).sort((a, b) => a.due - b.due || a.seq - b.seq);
  for (const t of due) {
    if (t.cancelled) continue;
    if (t.interval > 0) t.due += t.interval; else t.cancelled = true;
    t.fn(w, t);
  }
  bus.timers = bus.timers.filter((t) => !t.cancelled);
}
