// The battle voices (docs/spec/audio.md 音频-4…6): an operator's dub, the voices a frame's events call for, who says
// the start, whether a voice may play now, and the banks of a dub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dubOf, linesOf, voicesOf, leaderOf, admit, newGate, inDub } from '../src/voices.js';
import { soundsOf } from '../src/sounds.js';

const LINES = { BATTLE_START: ['cn_019'], BATTLE_FACE_ENEMY: ['cn_020'], BATTLE_SELECT: ['cn_021', 'cn_022'], BATTLE_PLACE: ['cn_023', 'cn_024'],
  BATTLE_SKILL_1: ['cn_025'], BATTLE_SKILL_2: ['cn_026'], BATTLE_SKILL_3: ['cn_027'], BATTLE_SKILL_4: ['cn_028'] };
/** the battle voice options as the data has them (audio_data.json battleVoice) */
const OPTIONS = { crossfade: 0.1, encounterGap: 3, importantSp: 10, types: {
  BATTLE_START: { priority: 100, overlap: true, cooldown: 0, delay: 0 }, ENCOUNTER_ENEMY: { priority: 90, overlap: false, cooldown: 0, delay: 0 },
  PLACE_CHAR: { priority: 20, overlap: true, cooldown: 0, delay: 0 }, FOCUS_CHAR: { priority: 10, overlap: true, cooldown: 0, delay: 0 },
  SKILL_ACTIVE: { priority: 70, overlap: true, cooldown: 0, delay: 0 }, SKILL_PASSIVE_IMP: { priority: 60, overlap: false, cooldown: 10, delay: 0 },
  SKILL_PASSIVE_NOR: { priority: 50, overlap: false, cooldown: 10, delay: 0 }, NORMAL_ATTACK: { priority: 5, overlap: false, cooldown: 36000, delay: 0 } } };
const INDEX = { options: OPTIONS, fallback: 'CN_MANDARIN', dubs: ['CN_MANDARIN', 'JP', 'LINKAGE'], names: {}, chars: {
  char_a: { default: 'JP', dubs: ['CN_MANDARIN', 'JP'], lines: LINES },
  char_b: { default: 'LINKAGE', dubs: ['LINKAGE'], lines: { BATTLE_PLACE: ['cn_023'] } },
  char_c: { dubs: ['CN_MANDARIN'], lines: LINES },
  char_d: { default: 'JP', dubs: ['EN'], lines: LINES },
  char_e: { default: 'JP', dubs: [], lines: LINES },
} };

test('[音频-4] the chosen dub when the operator has it, else its default, else the fallback, else the first the assets have; none without any', () => {
  assert.equal(dubOf(INDEX, 'char_a', 'CN_MANDARIN'), 'CN_MANDARIN');
  assert.equal(dubOf(INDEX, 'char_a', null), 'JP', 'the default: the data\'s JP');
  assert.equal(dubOf(INDEX, 'char_a', 'KR'), 'JP', 'no KR: its default');
  assert.equal(dubOf(INDEX, 'char_b', 'CN_MANDARIN'), 'LINKAGE', 'a collaboration operator: its own dub');
  assert.equal(dubOf(INDEX, 'char_c', 'JP'), 'CN_MANDARIN', 'no default in the data: the fallback');
  assert.equal(dubOf(INDEX, 'char_d', null), 'EN', 'neither its default nor the fallback in the assets: the one they have');
  assert.equal(dubOf(INDEX, 'char_e', null), null);
  assert.equal(dubOf(INDEX, 'nobody', null), null);
});

test('[音频-4] [音频-5] a voice type\'s lines: its line types\' files in the dub; the skill types all four 作战中 lines; NORMAL_ATTACK none', () => {
  assert.deepEqual(linesOf(INDEX, 'char_a', 'FOCUS_CHAR', 'JP'), ['JP/char_a/cn_021.mp3', 'JP/char_a/cn_022.mp3']);
  assert.deepEqual(linesOf(INDEX, 'char_a', 'BATTLE_START', 'CN_MANDARIN'), ['CN_MANDARIN/char_a/cn_019.mp3']);
  assert.deepEqual(linesOf(INDEX, 'char_a', 'ENCOUNTER_ENEMY', 'JP'), ['JP/char_a/cn_020.mp3']);
  for (const t of ['SKILL_ACTIVE', 'SKILL_PASSIVE_IMP', 'SKILL_PASSIVE_NOR']) assert.equal(linesOf(INDEX, 'char_a', t, 'JP').length, 4, t);
  assert.deepEqual(linesOf(INDEX, 'char_a', 'NORMAL_ATTACK', 'JP'), []);
  assert.deepEqual(linesOf(INDEX, 'char_b', 'FOCUS_CHAR', 'LINKAGE'), [], 'no lines of the type');
  assert.deepEqual(linesOf(INDEX, 'char_a', 'PLACE_CHAR', null), [], 'no dub');
});

const KEYS = { 1: 'char_a#0', 2: 'char_c#0', 3: 'slime', 4: 'tok#0', 5: 'trap_201_muulco#0', 6: 'char_a#1', 7: 'char_c#0' };
const X = {
  keyOf: (/** @type {number} */ id) => /** @type {Record<number, string>} */ (KEYS)[id], seat: 0, importantSp: 10, enemies: { slime: {} },
  operators: { 'char_a#0': { skill: { type: 'MANUAL', cost: 30 } }, 'char_c#0': { skill: { type: 'AUTO', cost: 10 } }, 'tok#0': { summoner: 'char_a#0' },
    'trap_201_muulco#0': { profession: 'TRAP' }, 'char_a#1': { skill: { type: 'MANUAL', cost: 30 } } },
};

test('[音频-5] a deployment, the first attack on an enemy after it, a skill starting: manual, important automatic, other automatic', () => {
  const met = new Set();
  assert.deepEqual(voicesOf([{ type: 'deploy', id: 1 }, { type: 'attack', id: 1, target: 3 }, { type: 'attack', id: 1, target: 3 }], X, met),
    [{ char: 'char_a', type: 'PLACE_CHAR' }, { char: 'char_a', type: 'ENCOUNTER_ENEMY' }], 'once a deployment');
  assert.deepEqual(voicesOf([{ type: 'attack', id: 1, target: 3 }], X, met), [], 'it met one already');
  assert.deepEqual(voicesOf([{ type: 'retreat', id: 1 }, { type: 'deploy', id: 1 }, { type: 'attack', id: 1, target: 3 }], X, met),
    [{ char: 'char_a', type: 'PLACE_CHAR' }, { char: 'char_a', type: 'ENCOUNTER_ENEMY' }], 'deployed again: again');
  assert.deepEqual(voicesOf([{ type: 'attack', id: 2, target: 1 }], X, met), [], 'an ally is no enemy (a healer\'s "attack")');
  assert.deepEqual(voicesOf([{ type: 'skill', id: 1, active: 1 }, { type: 'skill', id: 2, active: 1 }, { type: 'skill', id: 1, active: 0 }], X, met),
    [{ char: 'char_a', type: 'SKILL_ACTIVE' }, { char: 'char_c', type: 'SKILL_PASSIVE_IMP' }]);
  const cheap = { ...X, operators: { ...X.operators, 'char_c#0': { skill: { type: 'AUTO', cost: 9 } } } };
  assert.deepEqual(voicesOf([{ type: 'skill', id: 2, active: 1 }], cheap, met), [{ char: 'char_c', type: 'SKILL_PASSIVE_NOR' }], 'below the important SP cost');
});

test('[音频-5] only this seat\'s operators speak: no summon, carried unit or device, no enemy, not the mate\'s', () => {
  const met = new Set();
  assert.deepEqual(voicesOf([{ type: 'deploy', id: 4 }, { type: 'deploy', id: 5 }, { type: 'deploy', id: 6 }, { type: 'deploy', id: 3 }, { type: 'skill', id: 6, active: 1 }], X, met), []);
  assert.deepEqual(voicesOf([{ type: 'attack', id: 3, target: 1 }, { type: 'hit', id: 1, target: 3 }], X, met), []);
});

test('[音频-5] the start is said by the deck\'s first operator with the line', () => {
  assert.equal(leaderOf(INDEX, ['tok#0', 'char_b#0', 'char_a#0', 'char_c#0']), 'char_a', 'char_b has no 行动出发');
  assert.equal(leaderOf(INDEX, ['char_b#0']), null);
});

test('[音频-6] one at a time: a higher priority takes over; the same only when its type does; a lower one is not played', () => {
  const g = newGate();
  assert.deepEqual(admit(g, OPTIONS, 'PLACE_CHAR', 0, 2), { play: true, over: false });
  assert.deepEqual(admit(g, OPTIONS, 'FOCUS_CHAR', 0.5, 2), { play: false, over: false }, 'lower');
  assert.deepEqual(admit(g, OPTIONS, 'PLACE_CHAR', 1, 2), { play: true, over: true }, 'the same, PLACE_CHAR takes over');
  assert.deepEqual(admit(g, OPTIONS, 'ENCOUNTER_ENEMY', 1.5, 2), { play: true, over: true }, 'higher');
  assert.deepEqual(admit(g, OPTIONS, 'SKILL_ACTIVE', 2, 2), { play: false, over: false }, 'lower than the encounter');
  assert.deepEqual(admit(g, OPTIONS, 'FOCUS_CHAR', 3.5, 1), { play: true, over: false }, 'the encounter has ended');
  const h = newGate();
  admit(h, OPTIONS, 'SKILL_PASSIVE_IMP', 0, 3);
  assert.equal(admit(h, OPTIONS, 'SKILL_PASSIVE_IMP', 2, 3).play, false, 'the same priority, IMP does not take over (and it cools down)');
});

test('[音频-6] a type\'s cooldown; an encounter not within the gap after the last one', () => {
  const g = newGate();
  assert.equal(admit(g, OPTIONS, 'SKILL_PASSIVE_NOR', 0, 1).play, true);
  assert.equal(admit(g, OPTIONS, 'SKILL_PASSIVE_NOR', 9.9, 1).play, false, 'within its 10 s');
  assert.equal(admit(g, OPTIONS, 'SKILL_PASSIVE_NOR', 10, 1).play, true);
  assert.equal(admit(g, OPTIONS, 'ENCOUNTER_ENEMY', 20, 1).play, true);
  assert.equal(admit(g, OPTIONS, 'ENCOUNTER_ENEMY', 22.9, 0.5).play, false, 'within 3 s of the last');
  assert.equal(admit(g, OPTIONS, 'ENCOUNTER_ENEMY', 23, 0.5).play, true);
  assert.equal(admit(g, OPTIONS, 'NORMAL_ATTACK', 30, 1).play, true);
  assert.equal(admit(g, OPTIONS, 'NORMAL_ATTACK', 3600, 1).play, false, '36000 s');
  assert.equal(admit(g, OPTIONS, 'NOT_A_TYPE', 40000, 1).play, false);
});

test('[音频-4] a bank in the unit\'s dub when the data has its copy and the assets too; else the bank', () => {
  const voiceLang = { 'battle.ON_UNIT_BORN.char_101_sora': { char_101_sora: { JP: 'battle.ON_UNIT_BORN.char_101_sora@JP', KR: 'battle.ON_UNIT_BORN.char_101_sora@KR' } } };
  const banks = new Set(['battle.ON_UNIT_BORN.char_101_sora', 'battle.ON_UNIT_BORN.char_101_sora@JP']), has = (/** @type {string} */ b) => banks.has(b);
  assert.equal(inDub(voiceLang, 'battle.ON_UNIT_BORN.char_101_sora', 'char_101_sora', 'JP', has), 'battle.ON_UNIT_BORN.char_101_sora@JP');
  assert.equal(inDub(voiceLang, 'battle.ON_UNIT_BORN.char_101_sora', 'char_101_sora', 'KR', has), 'battle.ON_UNIT_BORN.char_101_sora', 'not in the assets');
  assert.equal(inDub(voiceLang, 'battle.ON_UNIT_BORN.char_101_sora', 'char_101_sora', null, has), 'battle.ON_UNIT_BORN.char_101_sora');
  const x = { keyOf: () => 'char_101_sora#0', operators: { 'char_101_sora#0': {} }, enemies: {}, seat: 0, stages: 1, has, voiceLang, dubOf: () => 'JP' };
  assert.deepEqual(soundsOf([{ type: 'deploy', id: 1 }], x), ['battle.ON_UNIT_BORN.char_101_sora@JP'], 'the frame\'s banks in the dub');
});

test('[音频-5] [mod-11] an operator a mod adds speaks with the voice of the operator it looks like', () => {
  const x = { ...X, keyOf: () => 'mine:alt#0', operators: { 'mine:alt#0': { look: 'char_a', skill: { type: 'MANUAL', cost: 30 } } } };
  assert.deepEqual(voicesOf([{ type: 'deploy', id: 1 }, { type: 'skill', id: 1, active: 1 }], x, new Set()), [{ char: 'char_a', type: 'PLACE_CHAR' }, { char: 'char_a', type: 'SKILL_ACTIVE' }]);
});
