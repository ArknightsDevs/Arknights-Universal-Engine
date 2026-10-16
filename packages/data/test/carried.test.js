// The units runes put into decks (docs/spec/runes.md 符文-6): found in the activity table, extracted as trainings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carriedIds, extractCarried } from '../src/index.js';

test('[符文-6] every token_key of an insert_token_card rune anywhere in the activity table, sorted, once', () => {
  const card = (/** @type {string} */ key) => ({ key: 'insert_token_card', selector: { professionMask: 384 }, blackboard: [{ key: 'token_key', value: 0, valueStr: key }, { key: 'count', value: 1 }] });
  const table = { activity: { A: { a1: { squadEffectList: [{ runeData: { runes: [card('trap_2'), { key: 'char_attribute_mul', blackboard: [] }] } }] } }, B: [card('trap_1'), card('trap_2')] } };
  assert.deepEqual(carriedIds(table), ['trap_1', 'trap_2']);
  assert.deepEqual(carriedIds(null), []);
});

test('[符文-6] a carried unit\'s training is extracted as an operator\'s; an id the character table lacks is left out', () => {
  const chars = { trap_1: { name: 'box', profession: 'TRAP', subProfessionId: 'notchar2', position: 'NONE', rarity: 'TIER_1', phases: [], skills: [], talents: null, trait: null, potentialRanks: [], favorKeyFrames: null } };
  const out = extractCarried(chars, ['trap_1', 'trap_9'], { }, {}, { uniequip: { equipDict: {}, charEquip: {} }, battle: {} });
  assert.deepEqual(Object.keys(out), ['trap_1']);
  assert.equal(/** @type {any} */ (out).trap_1.profession, 'TRAP');
});
