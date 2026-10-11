// A level's waves, hidden groups and predefined units as the engine's (docs/spec/waves.md 波次-1, 波次-4, 波次-6).
import { asArray, asInt, asNumber, asObject, asString, field } from './validate.js';

/**
 * @typedef {{ type: 'SPAWN' | 'ACTIVATE' | 'WITHDRAW' | 'NONE', key: string, route: number, count: number, preDelay: number, interval: number,
 *   dontBlockWave?: boolean, hidden?: string, group?: string, pack?: string, weight?: number }} WaveAction
 */
/** @typedef {{ preDelay: number, actions: WaveAction[] }} Fragment */
/** @typedef {{ preDelay: number, postDelay: number, maxWait: number, fragments: Fragment[] }} Wave */

/** The data's action types the simulation acts on (波次-1); every other type is NONE. */
const ACTION_TYPES = Object.freeze({ SPAWN: 'SPAWN', ACTIVATE_PREDEFINED: 'ACTIVATE', TRIGGER_PREDEFINED: 'ACTIVATE', WITHDRAW_PREDEFINED: 'WITHDRAW' });

/** A difficulty's bit in a numeric difficultyMask (波次-4). */
const MASK_BITS = Object.freeze({ NORMAL: 1, FOUR_STAR: 2, EASY: 4, SIX_STAR: 8 });

/** @param {unknown} v @param {string} p @returns {string | undefined} a non-empty string, or nothing for null, undefined or '' */
function optString(v, p) {
  if (v === null || v === undefined || v === '') return undefined;
  return asString(v, p);
}

/**
 * One action (波次-1); null when the data marks it invalid. `routeOf` maps the data's route index to the content's;
 * actions that are not spawns keep route −1.
 * @param {unknown} raw @param {string} p @param {(index: number) => number} routeOf @returns {WaveAction | null}
 */
export function readAction(raw, p, routeOf) {
  const a = asObject(raw, p);
  if (a.isValid === false) return null;
  const kind = asString(field(a, 'actionType', p), `${p}.actionType`);
  const type = /** @type {Record<string, WaveAction['type']>} */ (ACTION_TYPES)[kind] ?? 'NONE';
  /** @type {WaveAction} */
  const out = {
    type,
    key: type === 'NONE' ? '' : asString(field(a, 'key', p), `${p}.key`),
    route: type === 'SPAWN' ? routeOf(asInt(field(a, 'routeIndex', p), `${p}.routeIndex`, 0, 100000)) : -1,
    count: asInt(a.count ?? 1, `${p}.count`, 0, 100000),
    preDelay: asNumber(a.preDelay ?? 0, `${p}.preDelay`, 0, 1e6),
    interval: asNumber(a.interval ?? 0, `${p}.interval`, 0, 1e6),
  };
  if (a.dontBlockWave === true) out.dontBlockWave = true;
  const hidden = optString(a.hiddenGroup, `${p}.hiddenGroup`), group = optString(a.randomSpawnGroupKey, `${p}.randomSpawnGroupKey`);
  const pack = optString(a.randomSpawnGroupPackKey, `${p}.randomSpawnGroupPackKey`);
  if (hidden) out.hidden = hidden;
  if (group) out.group = group;
  if (pack) out.pack = pack;
  if (group) out.weight = asNumber(a.weight ?? 1, `${p}.weight`, 0, 1e6);
  return out;
}

/**
 * A level's waves (波次-1…波次-3): every wave and fragment with its delays, every valid action.
 * @param {unknown} wavesRaw level.waves @param {(index: number) => number} routeOf @returns {Wave[]}
 */
export function extractWaves(wavesRaw, routeOf) {
  return asArray(wavesRaw, 'level.waves').map((wRaw, wi) => {
    const wp = `level.waves[${wi}]`, wave = asObject(wRaw, wp);
    return {
      preDelay: asNumber(wave.preDelay ?? 0, `${wp}.preDelay`, 0, 1e6),
      postDelay: asNumber(wave.postDelay ?? 0, `${wp}.postDelay`, 0, 1e6),
      maxWait: asNumber(wave.maxTimeWaitingForNextWave ?? -1, `${wp}.maxTimeWaitingForNextWave`, -1, 1e6),
      fragments: asArray(field(wave, 'fragments', wp), `${wp}.fragments`).map((fRaw, fi) => {
        const fp = `${wp}.fragments[${fi}]`, frag = asObject(fRaw, fp);
        const actions = asArray(field(frag, 'actions', fp), `${fp}.actions`).map((a, ai) => readAction(a, `${fp}.actions[${ai}]`, routeOf));
        return { preDelay: asNumber(frag.preDelay ?? 0, `${fp}.preDelay`, 0, 1e6), actions: /** @type {WaveAction[]} */ (actions.filter(Boolean)) };
      }),
    };
  });
}

/**
 * Whether a rune's difficultyMask covers a difficulty (波次-4): the difficulty's name, ALL, or a number whose bit for the
 * difficulty is set.
 * @param {unknown} mask @param {'NORMAL' | 'FOUR_STAR'} difficulty
 */
export function maskCovers(mask, difficulty) {
  if (typeof mask === 'number') return (mask & MASK_BITS[difficulty]) !== 0;
  return mask === 'ALL' || mask === difficulty;
}

/**
 * The hidden groups a level enables at a difficulty (波次-4): the `key` of each level_hidden_group_enable rune whose
 * mask covers it, in rune order.
 * @param {unknown} runesRaw level.runes @param {'NORMAL' | 'FOUR_STAR'} difficulty @returns {string[]}
 */
export function hiddenGroupsOf(runesRaw, difficulty) {
  if (!Array.isArray(runesRaw)) return [];
  /** @type {string[]} */
  const out = [];
  runesRaw.forEach((r, i) => {
    const rp = `level.runes[${i}]`, rune = asObject(r, rp);
    if (rune.key !== 'level_hidden_group_enable' || !maskCovers(rune.difficultyMask, difficulty)) return;
    const bb = asArray(field(rune, 'blackboard', rp), `${rp}.blackboard`).map((b, k) => asObject(b, `${rp}.blackboard[${k}]`));
    const key = bb.find((b) => b.key === 'key');
    if (key) out.push(asString(key.valueStr, `${rp}.blackboard.key`));
  });
  return out;
}

/**
 * The predefined units (波次-6): the character and token instances that have an alias, with their key and whether they
 * start hidden.
 * @param {unknown} raw level.predefines @returns {{ alias: string, key: string, hidden: boolean }[]}
 */
export function predefinesOf(raw) {
  if (raw === null || raw === undefined) return [];
  const pd = asObject(raw, 'level.predefines');
  return ['characterInsts', 'tokenInsts'].flatMap((k) => (Array.isArray(pd[k]) ? pd[k] : []).flatMap((x, i) => {
    const p = `level.predefines.${k}[${i}]`, o = asObject(x, p);
    if (!o.alias) return [];
    return [{ alias: asString(o.alias, `${p}.alias`), key: asString(field(asObject(field(o, 'inst', p), `${p}.inst`), 'characterKey', `${p}.inst`), `${p}.inst.characterKey`), hidden: o.hidden === true }];
  }));
}
