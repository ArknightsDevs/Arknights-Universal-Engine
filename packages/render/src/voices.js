// The battle voices (docs/spec/audio.md 音频-4…6): an operator's dub, the voices a frame's events call for, the files
// of a voice's lines, and whether a voice may play now. Pure; audio.js plays them.

/** A voice type's options (音频-4): its priority, whether it takes over one of the same priority, its cooldown and delay in seconds. @typedef {{ priority: number, overlap: boolean, cooldown: number, delay: number }} VoiceType */
/**
 * The voice index the assets carry (音频-4): the battle voice options; the dub of characters the data gives none; the
 * dubs the assets have and their names; each character's default dub, the dubs the assets have all its lines in, and
 * its lines by line type (the file names without the extension).
 * @typedef {{ options: { crossfade: number, encounterGap: number, importantSp: number, types: Record<string, VoiceType> }, fallback: string,
 *   dubs: string[], names: Record<string, string>, chars: Record<string, { default?: string, dubs: string[], lines: Record<string, string[]> }> }} VoiceIndex
 */
/**
 * What the voices of a frame need to know (音频-5): the content key of a unit by id, the content's records, the enemies,
 * this page's seat, and the SP cost from which an automatic skill is important.
 * @typedef {{ keyOf: (id: number) => string | undefined, operators: Record<string, { look?: string, summoner?: string, profession?: string, skill?: { type?: string, cost?: number } }>,
 *   enemies: Record<string, unknown>, seat: number, importantSp: number }} VoiceContext
 */
/** A voice to say: whose, of what type. @typedef {{ char: string, type: string }} Voice */
/** The one voice playing and when each type last played (音频-6), in seconds of the page's audio clock. @typedef {{ playing: { type: string, until: number } | null, last: Record<string, number> }} VoiceGate */

const SKILL = Object.freeze(['BATTLE_SKILL_1', 'BATTLE_SKILL_2', 'BATTLE_SKILL_3', 'BATTLE_SKILL_4']);
/** The line types of each voice type (音频-5); NORMAL_ATTACK has none. @type {Readonly<Record<string, readonly string[]>>} */
export const LINE_TYPES = Object.freeze({
  BATTLE_START: ['BATTLE_START'], ENCOUNTER_ENEMY: ['BATTLE_FACE_ENEMY'], PLACE_CHAR: ['BATTLE_PLACE'], FOCUS_CHAR: ['BATTLE_SELECT'],
  SKILL_ACTIVE: SKILL, SKILL_PASSIVE_IMP: SKILL, SKILL_PASSIVE_NOR: SKILL,
});

/**
 * A character's dub (音频-4): the chosen one when it has it, else its default, else the data's fallback, else the
 * first the assets have for it; null when it has none. @param {VoiceIndex} index @param {string} char @param {string | null} chosen
 */
export function dubOf(index, char, chosen) {
  const c = index.chars[char];
  if (!c) return null;
  for (const d of [chosen, c.default, index.fallback]) if (d && c.dubs.includes(d)) return d;
  return c.dubs[0] ?? null;
}

/**
 * The files of a character's lines of a voice type in a dub (音频-4, 音频-5), relative to the voice directory.
 * @param {VoiceIndex} index @param {string} char @param {string} type @param {string | null} dub @returns {string[]}
 */
export function linesOf(index, char, type, dub) {
  const c = index.chars[char], kinds = LINE_TYPES[type];
  if (!c || !kinds || !dub) return [];
  return kinds.flatMap((k) => (c.lines[k] ?? []).map((l) => `${dub}/${char}/${l}.mp3`));
}

/**
 * Who speaks for a unit (音频-5): an operator of this page's seat, its character id — an operator a mod adds, the one it
 * looks like (mod-11) —; summons, carried units, devices and enemies do not. @param {VoiceContext} x @param {number} id
 */
function speaker(x, id) {
  const key = x.keyOf(id);
  if (key === undefined || Object.hasOwn(x.enemies, key)) return null;
  const d = x.operators[key], [char, seat] = key.split('#');
  if (!d || d.summoner !== undefined || d.profession === 'TRAP' || Number(seat) !== x.seat) return null;
  return d.look ?? char;
}

/** A skill starting: its voice type (音频-5). @param {VoiceContext} x @param {{ type?: string, cost?: number }} sk */
const skillType = (x, sk) => (sk.type === 'MANUAL' ? 'SKILL_ACTIVE' : (sk.cost ?? 0) >= x.importantSp ? 'SKILL_PASSIVE_IMP' : 'SKILL_PASSIVE_NOR');

/**
 * The voice type an event calls for from its unit (音频-5), or null; `met` as voicesOf.
 * @param {Record<string, any>} e @param {VoiceContext} x @param {Set<number>} met @returns {string | null}
 */
function typeOf(e, x, met) {
  if (e.type === 'deploy') return 'PLACE_CHAR';
  if (e.type === 'attack') {
    const target = x.keyOf(e.target);
    if (met.has(e.id) || target === undefined || !Object.hasOwn(x.enemies, target)) return null;
    met.add(e.id);
    return 'ENCOUNTER_ENEMY';
  }
  const sk = e.type === 'skill' && e.active ? x.operators[/** @type {string} */ (x.keyOf(e.id))]?.skill : undefined;
  return sk ? skillType(x, sk) : null;
}

/**
 * The voices a frame's events call for (音频-5), in event order: an operator deployed; its first attack on an enemy
 * since it was deployed; its skill starting. `met` holds the units that met an enemy since their deployment (updated).
 * @param {readonly Record<string, any>[]} events @param {VoiceContext} x @param {Set<number>} met @returns {Voice[]}
 */
export function voicesOf(events, x, met) {
  /** @type {Voice[]} */
  const out = [];
  for (const e of events) {
    if (e.type === 'deploy' || e.type === 'retreat' || e.type === 'death') met.delete(e.id);
    if (e.type !== 'deploy' && e.type !== 'attack' && e.type !== 'skill') continue;
    const char = speaker(x, e.id), type = char === null ? null : typeOf(e, x, met);
    if (char !== null && type !== null) out.push({ char, type });
  }
  return out;
}

/**
 * Who says the battle's start (音频-5): the first operator of a deck with lines of it, or null.
 * @param {VoiceIndex} index @param {readonly string[]} deck content keys @returns {string | null}
 */
export function leaderOf(index, deck) {
  for (const key of deck) {
    const char = key.split('#')[0];
    if (index.chars[char]?.lines['BATTLE_START']?.length) return char;
  }
  return null;
}

/** A gate with nothing played yet (音频-6). @returns {VoiceGate} */
export const newGate = () => ({ playing: null, last: {} });

/**
 * Whether a voice of a type may play now (音频-6): not within its type's cooldown, an enemy encounter not within the
 * gap after the last one; over the voice playing only by a higher priority, or the same when the type takes over. When
 * it may, the gate takes it as playing for `length` seconds after its delay; returns whether another is taken over.
 * @param {VoiceGate} g @param {VoiceIndex['options']} o @param {string} type @param {number} now @param {number} length
 * @returns {{ play: boolean, over: boolean }}
 */
export function admit(g, o, type, now, length) {
  const t = o.types[type], last = g.last[type];
  if (!t || (last !== undefined && now - last < t.cooldown)) return { play: false, over: false };
  if (type === 'ENCOUNTER_ENEMY' && last !== undefined && now - last < o.encounterGap) return { play: false, over: false };
  const p = g.playing && now < g.playing.until ? o.types[g.playing.type] : null;
  if (p && (t.priority < p.priority || (t.priority === p.priority && !t.overlap))) return { play: false, over: false };
  g.last[type] = now;
  g.playing = { type, until: now + t.delay + length };
  return { play: true, over: p !== null };
}

/**
 * The bank of a dub (音频-4): the bank's copy for this character in this dub when the data has one and the assets
 * have it, else the bank. @param {Record<string, Record<string, Record<string, string>>> | undefined} voiceLang
 * @param {string} bank @param {string} char @param {string | null} dub @param {(bank: string) => boolean} has
 */
export function inDub(voiceLang, bank, char, dub, has) {
  const own = dub ? voiceLang?.[bank]?.[char]?.[dub] : undefined;
  return own && has(own) ? own : bank;
}
