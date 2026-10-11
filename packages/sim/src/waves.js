// Waves (docs/spec/waves.md 波次-1…波次-6, 结束-1): the level's waves one after another, a wave's fragments one after
// another, a fragment's actions side by side; hidden groups act only when enabled, random alternatives are drawn when
// their wave begins, predefined units come into effect and leave. The battle is won when the last wave is over and
// lost when every player is down.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { makeEnemy } from './units.js';
import { isDown } from './coop.js';
import { weightedPick } from './rng.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Wave} Wave @typedef {import('./types.js').WaveAction} WaveAction @typedef {import('./types.js').Schedule} Schedule */

/** The scheduler before the battle starts: the first wave begins in the first frame. @returns {Schedule} */
export const newSchedule = () => ({ wave: -1, step: 'post', at: 0, frag: 0, fragAt: -1, fired: [], chosen: [] });

/** The predefined units in effect from the start (波次-6): those not hidden. @param {Content} c @returns {string[]} */
export const visiblePredefines = (c) => (c.level.predefines ?? []).filter((p) => !p.hidden).map((p) => p.alias);

/** A wave's actions in order, fragment by fragment. @param {Wave} wave @returns {WaveAction[]} */
const actionsOf = (wave) => wave.fragments.flatMap((f) => f.actions);

/** Whether an action's hidden group lets it act (波次-4). @param {Content} c @param {WaveAction} a */
const groupEnabled = (c, a) => !a.hidden || (c.level.hiddenGroups ?? []).includes(a.hidden);

/**
 * The random alternatives of a wave (波次-5): for each group in order of first appearance, the indices (into the wave's
 * actions) of its candidates that their hidden group lets act.
 * @param {Content} c @param {Wave} wave @returns {number[][]}
 */
function groupsOf(c, wave) {
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  actionsOf(wave).forEach((a, i) => {
    if (a.group && groupEnabled(c, a)) groups.set(a.group, [...(groups.get(a.group) ?? []), i]);
  });
  return [...groups.values()];
}

/**
 * Which of the current wave's actions act (波次-4, 波次-5): those whose hidden group is enabled and that are not left
 * out by the draw — a candidate must be chosen, and a member of a candidate's pack acts only with that candidate.
 * @param {Content} c @param {Wave} wave @param {Schedule} s @returns {boolean[]} by index into the wave's actions
 */
function acting(c, wave, s) {
  const all = actionsOf(wave);
  const packs = new Set(all.filter((x) => x.group && x.pack).map((x) => x.pack));
  const chosen = new Set(s.chosen.map((j) => all[j].pack));
  return all.map((a, i) => {
    if (!groupEnabled(c, a)) return false;
    if (a.group) return s.chosen.includes(i);
    return !a.pack || !packs.has(a.pack) || chosen.has(a.pack);
  });
}

/** Frames of a time in seconds (时间-2), for any of the wave fields. @param {number} seconds */
const frames = (seconds) => secondsToFrames(Math.max(0, seconds));

/**
 * A wave begins (波次-2, 波次-5): its random alternatives are drawn and its preDelay starts. After the last wave: done.
 * @param {World} w @param {Content} c @param {number} at the frame it begins
 */
function beginWave(w, c, at) {
  const s = w.sched, next = s.wave + 1, wave = c.level.waves[next];
  if (!wave) { w.sched = { ...s, wave: next, step: 'done', at }; return; }
  const all = actionsOf(wave);
  const chosen = groupsOf(c, wave).map((ids) => ids[weightedPick(w, ids.map((i) => all[i].weight ?? 1))]);
  w.sched = { wave: next, step: 'pre', at, frag: 0, fragAt: -1, fired: [], chosen };
  w.events.push({ type: 'wave', index: next });
}

/**
 * One action acting once (波次-1, 波次-6): an enemy spawns, a predefined unit comes into effect or leaves.
 * @param {World} w @param {Content} c @param {WaveAction} a @param {number} fragAt @param {number} wave
 */
function act(w, c, a, fragAt, wave) {
  if (a.type === 'SPAWN') {
    const u = makeEnemy(w, c, { key: a.key, route: a.route, frag: fragAt, wave: a.dontBlockWave ? -1 : wave });
    w.units.push(u);
    w.events.push({ type: 'spawn', id: u.id, key: u.key });
  } else if (a.type === 'ACTIVATE' && !w.predefined.includes(a.key)) {
    w.predefined.push(a.key);
    w.events.push({ type: 'predefine', key: a.key, on: 1 });
  } else if (a.type === 'WITHDRAW' && w.predefined.includes(a.key)) {
    w.predefined = w.predefined.filter((k) => k !== a.key);
    w.events.push({ type: 'predefine', key: a.key, on: 0 });
  }
}

/**
 * The current fragment (波次-2): it starts when its preDelay is over; every action acting this frame acts, in order;
 * when all of them have acted their count, it ends and the next fragment's preDelay starts. Returns whether the
 * schedule moved on (and may move again this frame).
 * @param {World} w @param {Content} c @param {Wave} wave
 */
function runFragment(w, c, wave) {
  const s = w.sched, frag = wave.fragments[s.frag];
  if (!frag) { s.step = 'hold'; return true; }
  if (s.fragAt < 0) {
    if (w.frame < s.at + frames(frag.preDelay)) return false;
    s.fragAt = s.at + frames(frag.preDelay);
    s.fired = frag.actions.map(() => 0);
  }
  const base = wave.fragments.slice(0, s.frag).reduce((n, f) => n + f.actions.length, 0), on = acting(c, wave, s);
  let end = s.fragAt, open = false;
  frag.actions.forEach((a, i) => {
    if (!on[base + i]) return;
    const due = (/** @type {number} */ k) => s.fragAt + frames(a.preDelay + k * a.interval);
    while (s.fired[i] < a.count && w.frame >= due(s.fired[i])) { act(w, c, a, s.fragAt, s.wave); s.fired[i]++; }
    if (s.fired[i] < a.count) open = true;
    else if (a.count > 0) end = Math.max(end, due(a.count - 1));
  });
  if (open) return false;
  w.sched = { ...s, frag: s.frag + 1, fragAt: -1, at: end };
  return true;
}

/** Whether an enemy of the current wave is still to be handled (波次-3). @param {World} w */
const waiting = (w) => w.units.some((u) => u.kind === KIND.ENEMY && u.hp > 0 && u.wave === w.sched.wave);

/**
 * One step of the schedule at this frame; returns whether it moved on (and may move again this frame).
 * @param {World} w @param {Content} c
 */
function advance(w, c) {
  const s = w.sched, wave = c.level.waves[s.wave];
  if (s.step === 'done') return false;
  if (s.step === 'post') {
    const due = s.wave < 0 ? 0 : s.at + frames(wave.postDelay);
    if (w.frame < due) return false;
    beginWave(w, c, due);
    return true;
  }
  if (s.step === 'pre') {
    if (w.frame < s.at + frames(wave.preDelay)) return false;
    w.sched = { ...s, step: 'frags', at: s.at + frames(wave.preDelay) };
    return true;
  }
  if (s.step === 'frags') return runFragment(w, c, wave);
  const timeUp = wave.maxWait >= 0 && w.frame >= s.at + frames(wave.maxWait);
  if (waiting(w) && !timeUp) return false;
  w.sched = { ...s, step: 'post', at: timeUp && waiting(w) ? s.at + frames(wave.maxWait) : w.frame };
  return true;
}

/** This frame of the waves (帧-1 step 4): every step due now, in order. @param {World} w @param {Content} c */
export function tickWaves(w, c) {
  while (advance(w, c));
}

/**
 * Whether the battle has ended (结束-1), checked at the end of a frame: lost when every player is down, won when the
 * level's waves are all over. The first result stands.
 * @param {World} w @param {Content} c
 */
export function checkEnd(w, c) {
  if (w.result >= 0) return;
  const lost = w.players.length > 0 && w.players.every(isDown);
  const won = c.level.waves.length > 0 && w.sched.step === 'done';
  if (!lost && !won) return;
  w.result = lost ? 0 : 1;
  w.events.push({ type: 'end', result: w.result });
}
