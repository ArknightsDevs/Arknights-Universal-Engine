// Clip playback (docs/spec/ui.md 界面-5, 界面-32): a clip played on a node binds its curves to the nodes at their paths;
// it runs on the UI's clock — once (holding its last frame) or looping, forwards or reversed, after a delay, at a rate,
// from a time into it — and its first frame applies at once, so a node does not flash in its prefab pose. Its events fire as the playhead
// passes them: start and end call the page back, a sound event plays its bank, others name a call.
import { applyCurve } from './curves.js';
import { nodeAt } from './node.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {import('./curves.js').Clip} Clip */
/** @typedef {import('./curves.js').ClipEvent} ClipEvent */
/**
 * `from`: seconds of the clip's run skipped (its playhead starts there; their events do not fire).
 * @typedef {{ loop?: boolean, reverse?: boolean, delay?: number, rate?: number, from?: number, onStart?: () => void, onEnd?: () => void,
 *   onEvent?: (name: string) => void }} PlayOptions
 */
/**
 * @typedef {{ s: UiNode, clip: Clip, binds: [UiNode, import('./curves.js').Curve][], t: number, loop: boolean, rev: boolean,
 *   len: number, rate: number, done: () => void, o: PlayOptions }} Playing
 */

/** Whether a clip loops: its wrap mode is Loop (2), or its name says so. @param {Clip} clip @param {string} name */
export const loops = (clip, name) => clip.wrap === 2 || /_loop/.test(name);

/**
 * How many times an event at clip time `at` is passed while the playhead goes from `from` (excluded) to `to`
 * (included): once for a clip played once, once a loop for a looping one (界面-32).
 * @param {number} at @param {number} from @param {number} to @param {number} len @param {boolean} loop
 */
export function passes(at, from, to, len, loop) {
  const g = (/** @type {number} */ x) => (x < at ? 0 : loop ? Math.floor((x - at) / len) + 1 : 1);
  return Math.max(0, g(to) - g(from));
}

export class Animator {
  /** @param {Record<string, Clip>} clips @param {{ sound?: (bank: string) => void }} [o] the page's sound for sound events */
  constructor(clips, o = {}) {
    this.clips = clips;
    this.sound = o.sound;
    /** @type {Playing[]} */
    this.playing = [];
  }

  /**
   * Plays a clip on a node; resolves when a clip played once ends, or when it is replaced, stopped or its screen closes.
   * @param {UiNode | null} s @param {string} name @param {PlayOptions} [o] @returns {Promise<void>}
   */
  play(s, name, o = {}) {
    const clip = this.clips[name];
    if (!s || !clip) return Promise.resolve();
    /** @type {[UiNode, import('./curves.js').Curve][]} */
    const binds = [];
    for (const c of clip.curves) {
      const t = nodeAt(s, c.path);
      if (t) binds.push([t, c]);
    }
    this.drop((p) => p.s === s && p.clip === clip);
    return new Promise((done) => {
      const len = clip.length || 1e-4, at = Math.max(0, Math.min(len, o.from ?? 0));
      const p = { s, clip, binds, t: at - (o.delay ?? 0), loop: o.loop ?? loops(clip, name), rev: !!o.reverse, len, rate: o.rate ?? 1, done, o };
      this.playing.push(p);
      if (!o.delay) {
        for (const [target, c] of binds) applyCurve(target, c, p.rev ? p.len - at : at);
        this.events(p, at - 1e-9, at);
      }
    });
  }

  /**
   * The events a playhead passes between two times (界面-32), in the order it reaches them; reversed playback passes them
   * from the end.
   * @param {Playing} p @param {number} from @param {number} to
   */
  events(p, from, to) {
    const due = (p.clip.events ?? []).map((e) => ({ e, at: p.rev ? p.len - e.t : e.t })).filter((x) => passes(x.at, from, to, p.len, p.loop) > 0);
    for (const { e } of due.sort((a, b) => a.at - b.at)) this.fire(p, e);
  }

  /** One event: start and end call the page back, a sound plays its bank, others name a call. @param {Playing} p @param {ClipEvent} e */
  fire(p, e) {
    if (e.kind === 'start') p.o.onStart?.();
    else if (e.kind === 'end') p.o.onEnd?.();
    else if (e.kind === 'sound') { if (e.bank) this.sound?.(e.bank); }
    else p.o.onEvent?.(e.data ?? e.kind);
  }

  /** Stops a clip playing on a node (界面-5): it stays where it is, its promise resolves. @param {UiNode | null} s @param {string} name */
  stop(s, name) {
    const clip = this.clips[name];
    if (s && clip) this.drop((p) => p.s === s && p.clip === clip);
  }

  /** Ends the clips matching a test (their promises resolve). @param {(p: Playing) => boolean} test */
  drop(test) {
    this.playing = this.playing.filter((p) => { if (test(p)) { p.done(); return false; } return true; });
  }

  /** Advances every clip by dt seconds; a clip played once ends after its last frame. @param {number} dt */
  tick(dt) {
    for (const p of this.playing) {
      if (p.s.scr.dead) continue;
      const from = p.t;
      p.t += dt * p.rate;
      if (p.t < 0) continue;
      let t = p.loop ? p.t % p.len : Math.min(p.t, p.len);
      if (p.rev) t = p.len - t;
      for (const [target, c] of p.binds) applyCurve(target, c, t);
      this.events(p, from, p.loop ? p.t : Math.min(p.t, p.len));
    }
    this.drop((p) => p.s.scr.dead || (!p.loop && p.t > p.len));
  }
}
