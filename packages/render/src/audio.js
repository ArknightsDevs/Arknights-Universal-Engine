// The battle's audio player (docs/spec/audio.md): sound banks played as audio-1 says — a sound picked by weight, its
// pitch and volume, its delay, at most so many of a bank at once — and the level's music, intro then loop, faded out
// at the end (音频-3). Files come from the assets' audio directory; what the index does not have is not played. A
// browser lets a page sound only after the player touched it: `resume` on the first gesture.
import { pickSound, soundsOf, musicOf } from './sounds.js';

/** @typedef {import('./sounds.js').AudioIndex} AudioIndex @typedef {import('./sounds.js').SoundContext} SoundContext */
/**
 * @typedef {object} AudioOptions
 * @property {string} base the URL of the audio directory (index.json and the files)
 * @property {AudioContext} [context] the Web Audio context (default: a new one)
 * @property {() => number} [random] the page's chance (default Math.random; not the battle's)
 */
/**
 * The player's state: the index, the context and its two volumes, the decoded files, each bank's sounds now, the music.
 * @typedef {{ index: AudioIndex, base: string, ctx: AudioContext, random: () => number, sfx: GainNode, musicGain: GainNode,
 *   buffers: Map<string, Promise<AudioBuffer | null>>, playing: Map<string, AudioBufferSourceNode[]>,
 *   music: { sources: AudioBufferSourceNode[], gain: GainNode, fade: number } | null }} Player
 */

/** A file's decoded audio, loaded once; null when it cannot be had. @param {Player} P @param {string} file */
function buffer(P, file) {
  if (!P.buffers.has(file)) {
    P.buffers.set(file, fetch(new URL(file, P.base)).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? P.ctx.decodeAudioData(b) : null)).catch(() => null));
  }
  return /** @type {Promise<AudioBuffer | null>} */ (P.buffers.get(file));
}

/** Plays a sound bank (音频-1): at its limit the oldest goes or this one does not play. @param {Player} P @param {string} name */
async function play(P, name) {
  const bank = P.index.banks[name];
  if (!bank) return;
  const now = P.playing.get(name) ?? [];
  if (now.length >= bank.max) {
    if (!bank.popOldest) return;
    now.shift()?.stop();
  }
  const s = pickSound(bank, P.random), buf = await buffer(P, s.file);
  if (!buf) return;
  const src = P.ctx.createBufferSource(), gain = P.ctx.createGain();
  src.buffer = buf;
  src.loop = bank.loop;
  src.playbackRate.value = s.pitch;
  gain.gain.value = s.volume;
  src.connect(gain).connect(P.sfx);
  now.push(src);
  P.playing.set(name, now);
  src.onended = () => { const list = P.playing.get(name) ?? []; list.splice(list.indexOf(src), 1); };
  src.start(P.ctx.currentTime + s.delay);
}

/** Starts the level's music (音频-3): the intro, then the loop from the intro's end. @param {Player} P @param {string | undefined} bgm */
async function startMusic(P, bgm) {
  const name = musicOf(P.index, bgm), m = name ? P.index.music[name] : null;
  if (!m || P.music) return;
  const [intro, loop] = await Promise.all([m.intro ? buffer(P, m.intro) : Promise.resolve(null), buffer(P, m.loop)]);
  if (!loop || P.music) return;
  const gain = P.ctx.createGain(), at = P.ctx.currentTime + 0.05, sources = [];
  gain.gain.value = m.volume;
  gain.connect(P.musicGain);
  if (intro) {
    const a = P.ctx.createBufferSource();
    a.buffer = intro;
    a.connect(gain);
    a.start(at);
    sources.push(a);
  }
  const b = P.ctx.createBufferSource();
  b.buffer = loop;
  b.loop = true;
  b.connect(gain);
  b.start(at + (intro ? intro.duration : 0));
  sources.push(b);
  P.music = { sources, gain, fade: m.crossfade };
}

/** Fades the music out over its crossfade seconds (音频-3). @param {Player} P */
function stopMusic(P) {
  if (!P.music) return;
  const { sources, gain, fade } = P.music, t = P.ctx.currentTime;
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + fade);
  for (const s of sources) s.stop(t + fade);
  P.music = null;
}

/**
 * The audio of a battle page, or null when the assets have no audio index.
 * @param {AudioOptions} o
 */
export async function createBattleAudio(o) {
  const res = await fetch(new URL('index.json', o.base)).catch(() => null);
  if (!res?.ok) return null;
  const ctx = o.context ?? new AudioContext();
  /** @type {Player} */
  const P = { index: await res.json(), base: o.base, ctx, random: o.random ?? Math.random, sfx: ctx.createGain(), musicGain: ctx.createGain(), buffers: new Map(), playing: new Map(), music: null };
  P.sfx.connect(ctx.destination);
  P.musicGain.connect(ctx.destination);
  return {
    index: P.index,
    /** @param {string} name */
    play: (name) => play(P, name),
    /** Plays the banks a frame's events call for (音频-2). @param {readonly Record<string, any>[]} events @param {Omit<SoundContext, 'has'>} x */
    frame: (events, x) => { for (const b of soundsOf(events, { ...x, has: (n) => Object.hasOwn(P.index.banks, n) })) void play(P, b); },
    /** @param {string | undefined} bgm */
    startMusic: (bgm) => startMusic(P, bgm),
    stopMusic: () => stopMusic(P),
    /** The player's volumes, 0–1 (音频-1). @param {{ music: number, sfx: number }} v */
    volumes: (v) => { P.musicGain.gain.value = v.music; P.sfx.gain.value = v.sfx; },
    /** After a gesture: the browser lets the page sound. */
    resume: () => (ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()),
  };
}
