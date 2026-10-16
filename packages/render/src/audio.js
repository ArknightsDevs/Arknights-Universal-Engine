// The battle's audio player (docs/spec/audio.md): sound banks played as audio-1 says — a sound picked by weight, its
// pitch and volume, its delay, at most so many of a bank at once — the level's music, intro then loop, faded out at
// the end (音频-3), and the operators' voices, one at a time (音频-4…6). Files come from the assets' audio and voice
// directories; what the indexes do not have is not played. A browser lets a page sound only after the player touched
// it: `resume` on the first gesture.
import { pickSound, roomFor, soundsOf, musicOf } from './sounds.js';
import { admit, dubOf, linesOf, newGate, voicesOf, LINE_TYPES } from './voices.js';

/** @typedef {import('./sounds.js').AudioIndex} AudioIndex @typedef {import('./sounds.js').SoundContext} SoundContext */
/** @typedef {import('./voices.js').VoiceIndex} VoiceIndex @typedef {import('./voices.js').Voice} Voice */
/**
 * @typedef {object} AudioOptions
 * @property {string} base the URL of the audio directory (index.json and the files)
 * @property {string} [voiceBase] the URL of the voice directory (index.json and the dubs' files); none: no voices
 * @property {AudioContext} [context] the Web Audio context (default: a new one)
 * @property {() => number} [random] the page's chance (default Math.random; not the battle's)
 */
/**
 * The voices' state (音频-4…6): the index, the directory, the volume, the chosen dub (null: each one's default), the
 * gate, the units that met an enemy since their deployment, the voice playing, the last voices said (their files and
 * lengths in seconds).
 * @typedef {{ index: VoiceIndex, base: string, gain: GainNode, chosen: string | null, gate: import('./voices.js').VoiceGate, met: Set<number>,
 *   now: { src: AudioBufferSourceNode, gain: GainNode } | null, said: (Voice & { file: string, length: number })[] }} Voices
 */
/**
 * The player's state: the index, the context and its volumes, the decoded files, each bank's sounds now, the music,
 * the voices.
 * @typedef {{ index: AudioIndex, base: string, ctx: AudioContext, random: () => number, sfx: GainNode, musicGain: GainNode,
 *   buffers: Map<string, Promise<AudioBuffer | null>>, playing: Map<string, AudioBufferSourceNode[]>,
 *   music: { sources: AudioBufferSourceNode[], gain: GainNode, fade: number } | null, voice: Voices | null }} Player
 */

/** A file's decoded audio, loaded once; null when it cannot be had. @param {Player} P @param {string} file @param {string} [base] */
function buffer(P, file, base = P.base) {
  const url = new URL(file, base).href;
  if (!P.buffers.has(url)) {
    P.buffers.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? P.ctx.decodeAudioData(b) : null)).catch(() => null));
  }
  return /** @type {Promise<AudioBuffer | null>} */ (P.buffers.get(url));
}

/** Plays a sound bank (音频-1): at its limit the oldest goes or this one does not play. @param {Player} P @param {string} name */
async function play(P, name) {
  const bank = P.index.banks[name];
  if (!bank) return;
  const now = P.playing.get(name) ?? [], room = roomFor(bank, now.length);
  if (room === 'none') return;
  if (room === 'pop') now.shift()?.stop();
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

/** A character's dub now (音频-4). @param {Player} P @param {string} char */
const dubNow = (P, char) => (P.voice ? dubOf(P.voice.index, char, P.voice.chosen) : null);

/**
 * Says a voice (音频-5, 音频-6): one of the character's lines of its type in its dub, at random, when the gate lets
 * it; one taking over fades the other out and itself in over the crossfade. None while the browser keeps the page
 * silent: its clock stands still (音频-6). @param {Player} P @param {Voice} v
 */
async function say(P, v) {
  const V = P.voice;
  if (!V || P.ctx.state !== 'running') return;
  const files = linesOf(V.index, v.char, v.type, dubNow(P, v.char));
  if (!files.length) return;
  const file = files[Math.min(files.length - 1, Math.floor(P.random() * files.length))], buf = await buffer(P, file, V.base);
  if (!buf) return;
  const o = V.index.options, now = P.ctx.currentTime, { play, over } = admit(V.gate, o, v.type, now, buf.duration);
  if (!play) return;
  const at = now + (o.types[v.type]?.delay ?? 0), fade = o.crossfade;
  if (V.now) {
    const old = V.now;
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + fade);
    old.src.stop(now + fade);
  }
  const src = P.ctx.createBufferSource(), gain = P.ctx.createGain();
  src.buffer = buf;
  if (over) {
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + fade);
  }
  src.connect(gain).connect(V.gain);
  src.start(at);
  V.now = { src, gain };
  src.onended = () => { if (V.now?.src === src) V.now = null; };
  V.said.push({ ...v, file, length: buf.duration });
  if (V.said.length > 20) V.said.shift();
}

/** Loads the voice index, or null. @param {AudioContext} ctx @param {string | undefined} base @returns {Promise<Voices | null>} */
async function loadVoices(ctx, base) {
  const res = base ? await fetch(new URL('index.json', base)).catch(() => null) : null;
  if (!base || !res?.ok) return null;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  return { index: await res.json(), base, gain, chosen: null, gate: newGate(), met: new Set(), now: null, said: [] };
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
  const P = { index: await res.json(), base: o.base, ctx, random: o.random ?? Math.random, sfx: ctx.createGain(), musicGain: ctx.createGain(), buffers: new Map(), playing: new Map(), music: null,
    voice: await loadVoices(ctx, o.voiceBase).catch(() => null) };
  P.sfx.connect(ctx.destination);
  P.musicGain.connect(ctx.destination);
  return {
    index: P.index,
    /** The voice index, or null (音频-4). */
    voices: P.voice?.index ?? null,
    /** @param {string} name */
    play: (name) => play(P, name),
    /**
     * Plays the banks (音频-2, in each unit's dub: 音频-4) and says the voices (音频-5) a frame's events call for.
     * @param {readonly Record<string, any>[]} events @param {Omit<SoundContext, 'has' | 'voiceLang' | 'dubOf'>} x
     */
    frame: (events, x) => {
      const has = (/** @type {string} */ n) => Object.hasOwn(P.index.banks, n);
      for (const b of soundsOf(events, { ...x, has, voiceLang: P.index.voiceLang, dubOf: (c) => dubNow(P, c) })) void play(P, b);
      if (P.voice) for (const v of voicesOf(events, { ...x, importantSp: P.voice.index.options.importantSp }, P.voice.met)) void say(P, v);
    },
    /** Says a voice the page calls for: the battle's start, a player choosing an operator (音频-5). @param {string} char @param {string} type */
    say: (char, type) => say(P, { char, type }),
    /** Loads every line of these characters in their dubs now, so they speak on time. @param {readonly string[]} chars */
    prepare: (chars) => {
      const V = P.voice;
      return Promise.all(V ? chars.flatMap((c) => Object.keys(LINE_TYPES).flatMap((t) => linesOf(V.index, c, t, dubNow(P, c)).map((f) => buffer(P, f, V.base)))) : []);
    },
    /** The chosen dub, null for each one's default (音频-4). @param {string | null} dub */
    dub: (dub) => { if (P.voice) P.voice.chosen = dub; },
    /** The voices said lately, the last last (for the page's tests). */
    said: () => [...(P.voice?.said ?? [])],
    /** @param {string | undefined} bgm */
    startMusic: (bgm) => startMusic(P, bgm),
    stopMusic: () => stopMusic(P),
    /** The player's volumes, 0–1 (音频-1, 音频-4). @param {{ music: number, sfx: number, voice?: number }} v */
    volumes: (v) => {
      P.musicGain.gain.value = v.music;
      P.sfx.gain.value = v.sfx;
      if (P.voice && v.voice !== undefined) P.voice.gain.gain.value = v.voice;
    },
    /** After a gesture: the browser lets the page sound. */
    resume: () => (ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()),
  };
}
