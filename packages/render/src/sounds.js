// The sounds of a battle (docs/spec/audio.md): which sound banks a frame's presentation events call for (音频-2), the
// music of a level (音频-3), and one sound of a bank picked as the bank says (音频-1). Pure; audio.js plays them.
import { inDub } from './voices.js';

/**
 * A sound bank of the audio index (音频-1): its sounds — file, weight, delay in seconds, pitch and volume ranges — how
 * many may play at once, whether a new one pushes the oldest out, whether it loops.
 * @typedef {{ sounds: { file: string, weight: number, delay: number, pitch: [number, number], volume: [number, number] }[], max: number, popOldest: boolean, loop: boolean }} SoundBank
 */
/** A music bank (音频-3): its intro (none: the loop alone), its loop, its volume and crossfade seconds. @typedef {{ intro: string | null, loop: string, volume: number, crossfade: number }} MusicBank */
/**
 * The audio index the assets carry; `voiceLang`: a bank's copies by character and dub (音频-4).
 * @typedef {{ banks: Record<string, SoundBank>, music: Record<string, MusicBank>, voiceLang?: Record<string, Record<string, Record<string, string>>> }} AudioIndex
 */
/**
 * What the sound of a frame needs to know (音频-2): the content key of a unit by id (as the frame's keys gave them),
 * the content's records, this page's seat, how many stages the level has, and whether the index has a bank; for the
 * banks of a dub (音频-4), the index's copies and a character's dub.
 * @typedef {{ keyOf: (id: number) => string | undefined, operators: Record<string, { char?: string, look?: string, summoner?: string, profession?: string, skill?: { id: string, type?: string, cost?: number } }>,
 *   enemies: Record<string, unknown>, seat: number, stages: number, has: (bank: string) => boolean,
 *   voiceLang?: AudioIndex['voiceLang'], dubOf?: (char: string) => string | null }} SoundContext
 */

/** The music of a level (音频-3): its own when the index has it, else the default. @param {AudioIndex} index @param {string | undefined} bgm */
export function musicOf(index, bgm) {
  const own = bgm ? `battle.ON_GAME_READY.${bgm}` : null;
  if (own && Object.hasOwn(index.music, own)) return own;
  return Object.hasOwn(index.music, 'battle.ON_GAME_READY') ? 'battle.ON_GAME_READY' : null;
}

/** The first bank of a list the index has, or null. @param {SoundContext} x @param {string[]} names */
const first = (x, names) => names.find((n) => x.has(n)) ?? null;

/** A unit's bank in its character's dub (音频-4). @param {SoundContext} x @param {string | null} bank @param {string} char */
const dubbed = (x, bank, char) => (bank ? inDub(x.voiceLang, bank, char, x.dubOf?.(char) ?? null, x.has) : null);

/**
 * A unit's bank of a kind (ON_UNIT_BORN, ON_CHARACTER_WITHDRAW, ON_UNIT_DEAD): its own, else a summon's or a carried
 * unit's `token`, an operator's `char`, an enemy's `enemy` (音频-2). @param {SoundContext} x @param {string} kind @param {number} id
 */
function unitBank(x, kind, id) {
  const key = x.keyOf(id);
  if (key === undefined) return null;
  if (Object.hasOwn(x.enemies, key)) return first(x, [`battle.${kind}.${key}`, `battle.${kind}.enemy`]);
  const d = x.operators[key];
  if (!d) return null;
  const char = d.look ?? d.char ?? key.split('#')[0], small = d.summoner !== undefined || d.profession === 'TRAP';
  return dubbed(x, first(x, [`battle.${kind}.${char}`, `battle.${kind}.${small ? 'token' : 'char'}`]), char);
}

/** A skill starting: its bank (音频-2). @param {SoundContext} x @param {number} id */
function skillBank(x, id) {
  const key = x.keyOf(id), d = key === undefined ? undefined : x.operators[key], sk = d?.skill;
  return sk ? dubbed(x, first(x, [`battle.ON_SKILL_START.${sk.id}`]), d?.look ?? d?.char ?? /** @type {string} */ (key).split('#')[0]) : null;
}

/** @type {Record<string, (x: SoundContext, e: Record<string, any>) => (string | null)[]>} */
const BY_EVENT = {
  deploy: (x, e) => [unitBank(x, 'ON_UNIT_BORN', e.id)],
  retreat: (x, e) => [unitBank(x, 'ON_CHARACTER_WITHDRAW', e.id)],
  death: (x, e) => [unitBank(x, 'ON_UNIT_DEAD', e.id)],
  goal: (x) => [first(x, ['battle.ON_ENEMY_REACHED_EXIT'])],
  skill: (x, e) => [e.active ? skillBank(x, e.id) : null],
  down: (x, e) => [first(x, [e.owner === x.seat ? 'battle.ON_COOPERATE_DYING' : 'battle.ON_COOPERATE_MATE_DYING'])],
  revive: (x) => [first(x, ['battle.ON_COOPERATE_REVIVE'])],
  answer: (x, e) => [e.accept === 0 && e.owner === x.seat ? first(x, ['battle.ON_COOPERATE_COST_REJECT']) : null],
  // a stage settling (合作-6): its completion, then the rest (合作-8) when another stage follows
  stage: (x, e) => (e.on ? [] : [first(x, [`battle.ON_COOPERATE_STAGE_COMPLETE_${e.index + 1}`]), e.index + 1 < x.stages ? first(x, ['battle.ON_COOPERATE_REST_START']) : null]),
};

/**
 * The banks a frame's events call for (音频-2), in event order.
 * @param {readonly Record<string, any>[]} events @param {SoundContext} x @returns {string[]}
 */
export function soundsOf(events, x) {
  /** @type {string[]} */
  const out = [];
  for (const e of events) for (const b of BY_EVENT[e.type]?.(x, e) ?? []) if (b) out.push(b);
  return out;
}

/**
 * One sound of a bank (音频-1): by weight (all 0: alike), its pitch and volume each at random within its range.
 * @param {SoundBank} bank @param {() => number} random @returns {{ file: string, delay: number, pitch: number, volume: number }}
 */
export function pickSound(bank, random) {
  const total = bank.sounds.reduce((s, x) => s + Math.max(0, x.weight), 0);
  let r = random() * (total > 0 ? total : bank.sounds.length), i = 0;
  for (; i < bank.sounds.length - 1; i++) {
    r -= total > 0 ? Math.max(0, bank.sounds[i].weight) : 1;
    if (r < 0) break;
  }
  const s = bank.sounds[i], between = (/** @type {[number, number]} */ [lo, hi]) => lo + (hi - lo) * random();
  return { file: s.file, delay: s.delay, pitch: between(s.pitch), volume: between(s.volume) };
}

/**
 * Whether a bank has room for one more sound (音频-1): under its limit (0: none) it plays; at it, the oldest goes when
 * the bank says so, else this one does not play. @param {SoundBank} bank @param {number} playing how many play now
 * @returns {'play' | 'pop' | 'none'}
 */
export function roomFor(bank, playing) {
  if (bank.max <= 0 || playing < bank.max) return 'play';
  return bank.popOldest ? 'pop' : 'none';
}
