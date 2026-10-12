// Clip playback (docs/spec/ui.md 界面-5): a clip played on a node binds its curves to the nodes at their paths; it runs
// on the UI's clock — once (holding its last frame) or looping, forwards or reversed, after a delay, at a rate — and its
// first frame applies at once, so a node does not flash in its prefab pose.
import { applyCurve } from './curves.js';
import { nodeAt } from './node.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/** @typedef {import('./curves.js').Clip} Clip */
/** @typedef {{ loop?: boolean, reverse?: boolean, delay?: number, rate?: number }} PlayOptions */
/**
 * @typedef {{ s: UiNode, clip: Clip, binds: [UiNode, import('./curves.js').Curve][], t: number, loop: boolean, rev: boolean,
 *   len: number, rate: number, done: () => void }} Playing
 */

/** Whether a clip loops: its wrap mode is Loop (2), or its name says so. @param {Clip} clip @param {string} name */
export const loops = (clip, name) => clip.wrap === 2 || /_loop/.test(name);

export class Animator {
  /** @param {Record<string, Clip>} clips */
  constructor(clips) {
    this.clips = clips;
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
      const p = { s, clip, binds, t: -(o.delay ?? 0), loop: o.loop ?? loops(clip, name), rev: !!o.reverse, len: clip.length || 1e-4, rate: o.rate ?? 1, done };
      this.playing.push(p);
      if (!o.delay) for (const [target, c] of binds) applyCurve(target, c, p.rev ? p.len : 0);
    });
  }

  /** Ends the clips matching a test (their promises resolve). @param {(p: Playing) => boolean} test */
  drop(test) {
    this.playing = this.playing.filter((p) => { if (test(p)) { p.done(); return false; } return true; });
  }

  /** Advances every clip by dt seconds; a clip played once ends after its last frame. @param {number} dt */
  tick(dt) {
    for (const p of this.playing) {
      if (p.s.scr.dead) continue;
      p.t += dt * p.rate;
      if (p.t < 0) continue;
      let t = p.loop ? p.t % p.len : Math.min(p.t, p.len);
      if (p.rev) t = p.len - t;
      for (const [target, c] of p.binds) applyCurve(target, c, t);
    }
    this.drop((p) => p.s.scr.dead || (!p.loop && p.t > p.len));
  }
}
