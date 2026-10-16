// The sounds of a battle (docs/spec/audio.md): a frame's events to sound banks, a level's music, one sound of a bank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundsOf, musicOf, pickSound, roomFor } from '../src/sounds.js';

const BANKS = new Set(['battle.ON_UNIT_BORN.char', 'battle.ON_UNIT_BORN.token', 'battle.ON_UNIT_BORN.char_special', 'battle.ON_CHARACTER_WITHDRAW.char', 'battle.ON_UNIT_DEAD.char',
  'battle.ON_UNIT_DEAD.enemy', 'battle.ON_UNIT_DEAD.token', 'battle.ON_ENEMY_REACHED_EXIT', 'battle.ON_SKILL_START.sk_a', 'battle.ON_COOPERATE_DYING', 'battle.ON_COOPERATE_MATE_DYING',
  'battle.ON_COOPERATE_REVIVE', 'battle.ON_COOPERATE_COST_REJECT', 'battle.ON_COOPERATE_STAGE_COMPLETE_1', 'battle.ON_COOPERATE_STAGE_COMPLETE_2', 'battle.ON_COOPERATE_REST_START']);
const KEYS = { 1: 'char_1#0', 2: 'tok#0', 3: 'slime', 4: 'char_special#1', 5: 'trap_201_muulco#0', 6: 'nobody#0' };
const X = {
  keyOf: (/** @type {number} */ id) => /** @type {Record<number, string>} */ (KEYS)[id], seat: 0, stages: 2, has: (/** @type {string} */ b) => BANKS.has(b),
  operators: { 'char_1#0': { char: 'char_1', skill: { id: 'sk_a' } }, 'tok#0': { char: 'tok', summoner: 'char_1#0' }, 'char_special#1': { char: 'char_special' }, 'trap_201_muulco#0': { char: 'trap_201_muulco', profession: 'TRAP' }, 'nobody#0': {} },
  enemies: { slime: {} },
};

test('[音频-2] a unit\'s own bank, else a summon\'s or carried unit\'s token, an operator\'s char, an enemy\'s enemy; none for a bank the assets lack', () => {
  assert.deepEqual(soundsOf([{ type: 'deploy', id: 1, key: 'char_1#0', owner: 0 }, { type: 'deploy', id: 2 }, { type: 'deploy', id: 4 }, { type: 'deploy', id: 5 }], X),
    ['battle.ON_UNIT_BORN.char', 'battle.ON_UNIT_BORN.token', 'battle.ON_UNIT_BORN.char_special', 'battle.ON_UNIT_BORN.token']);
  assert.deepEqual(soundsOf([{ type: 'retreat', id: 1 }, { type: 'retreat', id: 2 }], X), ['battle.ON_CHARACTER_WITHDRAW.char'], 'no withdraw bank for summons here');
  assert.deepEqual(soundsOf([{ type: 'death', id: 3 }, { type: 'death', id: 1 }, { type: 'death', id: 2 }, { type: 'death', id: 99 }], X),
    ['battle.ON_UNIT_DEAD.enemy', 'battle.ON_UNIT_DEAD.char', 'battle.ON_UNIT_DEAD.token']);
});

test('[音频-2] the goal, a skill starting, a player down (own, mate), a revive, a cost request refused to its asker, a stage settled and the rest', () => {
  assert.deepEqual(soundsOf([{ type: 'goal', id: 3, owner: 0 }, { type: 'skill', id: 1, active: 1 }, { type: 'skill', id: 1, active: 0 }, { type: 'skill', id: 6, active: 1 }], X),
    ['battle.ON_ENEMY_REACHED_EXIT', 'battle.ON_SKILL_START.sk_a']);
  assert.deepEqual(soundsOf([{ type: 'down', owner: 0 }, { type: 'down', owner: 1 }, { type: 'revive', owner: 1 }], X),
    ['battle.ON_COOPERATE_DYING', 'battle.ON_COOPERATE_MATE_DYING', 'battle.ON_COOPERATE_REVIVE']);
  assert.deepEqual(soundsOf([{ type: 'answer', owner: 0, accept: 0, amount: 0 }, { type: 'answer', owner: 1, accept: 0, amount: 0 }, { type: 'answer', owner: 0, accept: 1, amount: 5 }], X),
    ['battle.ON_COOPERATE_COST_REJECT']);
  assert.deepEqual(soundsOf([{ type: 'stage', index: 0, on: 1, stamps: 0 }, { type: 'stage', index: 0, on: 0, stamps: 1 }, { type: 'stage', index: 1, on: 0, stamps: 2 }], X),
    ['battle.ON_COOPERATE_STAGE_COMPLETE_1', 'battle.ON_COOPERATE_REST_START', 'battle.ON_COOPERATE_STAGE_COMPLETE_2']);
  assert.deepEqual(soundsOf([{ type: 'hit', id: 1, target: 3, damage: 9 }, { type: 'shout' }], X), []);
});

test('[音频-3] a level\'s own music when the assets have it, else the default, else none', () => {
  const loop = { intro: null, loop: 'l.ogg', volume: 1, crossfade: 1.5 };
  assert.equal(musicOf({ banks: {}, music: { 'battle.ON_GAME_READY': loop, 'battle.ON_GAME_READY.own': loop } }, 'own'), 'battle.ON_GAME_READY.own');
  assert.equal(musicOf({ banks: {}, music: { 'battle.ON_GAME_READY': loop } }, 'own'), 'battle.ON_GAME_READY');
  assert.equal(musicOf({ banks: {}, music: { 'battle.ON_GAME_READY': loop } }, undefined), 'battle.ON_GAME_READY');
  assert.equal(musicOf({ banks: {}, music: {} }, 'own'), null);
});

test('[音频-1] one sound of a bank: by weight (all 0: alike), pitch and volume within their ranges', () => {
  const s = (/** @type {string} */ file, /** @type {number} */ weight) => ({ file, weight, delay: 0.1, pitch: /** @type {[number, number]} */ ([0.9, 1.1]), volume: /** @type {[number, number]} */ ([0.5, 1]) });
  const bank = { sounds: [s('a', 1), s('b', 3)], max: 1, popOldest: true, loop: false };
  const seq = (/** @type {number[]} */ xs) => { let i = 0; return () => xs[i++]; };
  assert.deepEqual(pickSound(bank, seq([0.2, 0, 1])), { file: 'a', delay: 0.1, pitch: 0.9, volume: 1 });
  assert.equal(pickSound(bank, seq([0.3, 0.5, 0.5])).file, 'b', '0.3 × 4 = 1.2: past a\'s weight');
  const even = { ...bank, sounds: [s('a', 0), s('b', 0)] };
  assert.deepEqual([pickSound(even, seq([0.4, 0, 0])).file, pickSound(even, seq([0.6, 0, 0])).file], ['a', 'b']);
});

test('[音频-1] room for one more sound: under the limit it plays; at it the oldest goes or this one does not; a limit of 0 is none', () => {
  const bank = (/** @type {number} */ max, /** @type {boolean} */ popOldest) => ({ sounds: [], max, popOldest, loop: false });
  assert.deepEqual([roomFor(bank(2, false), 1), roomFor(bank(2, false), 2), roomFor(bank(2, true), 2)], ['play', 'none', 'pop']);
  assert.deepEqual([roomFor(bank(0, false), 0), roomFor(bank(0, false), 7), roomFor(bank(0, true), 3)], ['play', 'play', 'play'], 'battle.ON_UNIT_BORN.char: 0, no pop');
});
